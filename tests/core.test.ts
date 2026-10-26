import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { generateCss, scopeSelector } from "../src/css/generator";
import { cjkRange, latinRange } from "../src/css/fontface";
import { loadData, defaultData, cleanColor, cleanFontName, cleanProps, importSetJson, exportSetJson, activeSet, newStyleSet } from "../src/schema";
import { resolveProps, sourceOf } from "../src/resolve";
import { pxToPt, ptToPx, lineHeightFromPx, spacingLinesFromPx, weightFromComputed, contrastRatio } from "../src/units";
import { numbersForText, chineseNumber } from "../src/numbering";
import { TEMPLATES, templateElements, templateOptions } from "../src/templates";

const SNAP_DIR = path.join(__dirname, "__snapshots__");

function snapshot(name: string, value: string) {
	fs.mkdirSync(SNAP_DIR, { recursive: true });
	const file = path.join(SNAP_DIR, name + ".css");
	if (!fs.existsSync(file) || process.env.UPDATE_SNAPSHOTS) {
		fs.writeFileSync(file, value);
		return;
	}
	assert.equal(value, fs.readFileSync(file, "utf8"), `快照 ${name} 不一致；确认无误后用 UPDATE_SNAPSHOTS=1 更新`);
}

function dataWith(fn: (d: ReturnType<typeof defaultData>) => void) {
	const d = defaultData();
	fn(d);
	return d;
}

/* ----------------------------- 单位换算往返（R03） ----------------------------- */

test("字号：任意基准下 读取 → 写出 → 读取 不变", () => {
	for (const base of [14, 16, 18, 20]) {
		for (const px of [base, base * 1.2, base * 1.802, base * 0.875, 24, 32.4]) {
			const pt = pxToPt(px, base);
			const back = ptToPx(pt, base);
			assert.ok(Math.abs(back - px) < base * 0.01, `base ${base} px ${px} → ${pt}pt → ${back}`);
		}
	}
});

test("行距与段距：读取公式与写出公式互逆", () => {
	// 写出：段前 n 行 = n × 行高倍数 em；元素字号 fs，行高 lh 倍
	const fs = 18, lh = 1.6, lines = 0.75;
	const marginPx = lines * lh * fs;
	assert.equal(spacingLinesFromPx(marginPx, lh * fs), lines);
	assert.equal(lineHeightFromPx(lh * fs, fs), lh);
});

test("字重 600 视为加粗", () => {
	assert.equal(weightFromComputed("600"), "700");
	assert.equal(weightFromComputed("500"), "400");
	assert.equal(weightFromComputed("bold"), "700");
});

test("对比度", () => {
	assert.ok(Math.abs((contrastRatio("#000000", "#FFFFFF") ?? 0) - 21) < 0.01);
	assert.equal(contrastRatio("var(--text-normal)", "#fff"), null);
});

/* ----------------------------- 清洗（安全） ----------------------------- */

test("清洗：拒绝注入与越界值", () => {
	assert.equal(cleanColor("red;} body{display:none"), null);
	assert.equal(cleanColor("url(javascript:alert(1))"), null);
	assert.equal(cleanColor("#abc"), "#AABBCC");
	assert.equal(cleanColor("var(--text-accent)"), "var(--text-accent)");
	assert.equal(cleanFontName('Arial"; } h1 { color: red'), null);
	assert.equal(cleanFontName("仿宋_GB2312"), "仿宋_GB2312");
	const p = cleanProps({ fontSize: 200, lineHeight: 1.5, lineHeightPt: 28, fontWeight: "600", textAlign: "middle" });
	assert.deepEqual(p, { lineHeightPt: 28, fontWeight: "700" });
});

/* ----------------------------- 迁移 ----------------------------- */

test("0.1.x 数据无损迁移：段间距拆成段前/段后，元素保留", () => {
	const v1 = {
		schemaVersion: 1,
		name: "老样式",
		scope: "vault",
		reducePriority: true,
		elements: {
			h1: { separate: false, light: { fontSize: 22, fontFamilyCJK: "Microsoft YaHei" }, dark: {} },
			p: { separate: true, light: { paragraphSpacing: 1, firstLineIndent: 2, color: "#333" }, dark: { color: "#ddd" } },
		},
	};
	const d = loadData(v1);
	const s = activeSet(d);
	assert.equal(s.name, "老样式");
	assert.equal(d.reducePriority, true);
	assert.equal(d.onboarded, true, "老用户不再弹新手引导");
	assert.deepEqual(s.elements.p.light, { spaceBefore: 0.5, spaceAfter: 0.5, firstLineIndent: 2, color: "#333333" });
	assert.equal(s.elements.p.dark.color, "#DDDDDD");
	assert.equal(s.elements.h1.light.fontSize, 22);
	assert.ok(s.elements.global && s.elements.list, "新元素已补齐");
});

test("空数据与损坏数据得到默认值", () => {
	assert.equal(loadData(null).sets.length, 1);
	assert.equal(loadData({ schemaVersion: 3, sets: "x" }).sets.length, 1);
});

/* ----------------------------- 继承 ----------------------------- */

test("全局层：只设全局中文字体，标题与正文都继承；元素自己设置后覆盖", () => {
	const d = dataWith((d) => {
		const s = activeSet(d);
		s.elements.global.light = { fontFamilyCJK: "宋体", lineHeight: 1.8 };
		s.elements.h2.light = { fontFamilyCJK: "黑体" };
	});
	const s = activeSet(d);
	assert.equal(resolveProps(s, "p", "light").fontFamilyCJK, "宋体");
	assert.equal(resolveProps(s, "h3", "light").fontFamilyCJK, "宋体");
	assert.equal(resolveProps(s, "h2", "light").fontFamilyCJK, "黑体");
	assert.equal(resolveProps(s, "p", "light").lineHeight, 1.8);
	assert.equal(resolveProps(s, "h3", "light").lineHeight, undefined, "标题不继承全局行距");
	assert.equal(resolveProps(s, "code", "light").fontFamilyCJK, undefined, "代码不继承全局字体");
	assert.deepEqual(sourceOf(s, "h3", "light", "fontFamilyCJK"), { kind: "element", from: "global" });
});

test("列表跟随正文；固定行距优先于上层倍数行距", () => {
	const d = dataWith((d) => {
		const s = activeSet(d);
		s.elements.global.light = { lineHeight: 1.6 };
		s.elements.p.light = { fontSize: 14, lineHeightPt: 28, firstLineIndent: 2 };
	});
	const s = activeSet(d);
	const li = resolveProps(s, "list", "light");
	assert.equal(li.fontSize, 14);
	assert.equal(li.lineHeightPt, 28);
	assert.equal(li.lineHeight, undefined);
	const css = generateCss(d);
	assert.ok(!/\.markdown-rendered li \{[^}]*text-indent/.test(css), "列表不应带上正文的首行缩进");
});

/* ----------------------------- 生成器（R02） ----------------------------- */

test("字号以正文基准的绝对值输出，引用块内层与编辑视图标题内层只继承", () => {
	const d = dataWith((d) => {
		const s = activeSet(d);
		s.elements.blockquote.light = { fontSize: 14, spaceBefore: 1, firstLineIndent: 2 };
		s.elements.h1.light = { fontSize: 24 };
	});
	const css = generateCss(d);
	assert.ok(css.includes("font-size: calc(var(--font-text-size) * 1.1667) !important"));
	assert.ok(!/font-size: [\d.]+em/.test(css), "不应再出现相对父元素的 em 字号");
	const inner = css.match(/\.markdown-rendered blockquote p[^{]*\{([^}]*)\}/);
	assert.ok(inner, "引用块内层规则存在");
	assert.ok(/font-size: inherit/.test(inner![1]) && !/margin/.test(inner![1]), "内层只继承，不重复外边距");
	const hdr = css.match(/HyperMD-header-1 \.cm-header[^{]*\{([^}]*)\}/);
	assert.ok(hdr && /font-size: inherit/.test(hdr[1]), "编辑视图标题内层 span 只继承字号");
});

test("编辑视图支持首行缩进与段距（空行除外）", () => {
	const d = dataWith((d) => {
		activeSet(d).elements.p.light = { firstLineIndent: 2, spaceAfter: 0.5, lineHeight: 1.6 };
	});
	const css = generateCss(d);
	assert.ok(/\.cm-line:not\(\[class\*="HyperMD-"\]\)[^{]*\{[^}]*text-indent: 2em/.test(css));
	assert.ok(css.includes(':not(:has(> br:only-child))'));
	assert.ok(/padding-bottom: 0\.8em/.test(css));
});

test("降低优先级时不输出 !important", () => {
	const d = dataWith((d) => {
		d.reducePriority = true;
		activeSet(d).elements.p.light = { color: "#333333" };
	});
	assert.ok(!generateCss(d).includes("!important"));
});

test("中文标点开关：引号与破折号在中文字体范围内", () => {
	assert.ok(cjkRange(true).includes("U+201C-201D") && !latinRange(true).includes("U+2000-206F"));
	assert.ok(!cjkRange(false).includes("U+201C") && latinRange(false).includes("U+2000-206F"));
});

test("字体合成：400 / 700 两个字面", () => {
	const d = dataWith((d) => {
		activeSet(d).elements.p.light = { fontFamilyCJK: "微软雅黑" };
		d.fontFaces["微软雅黑"] = { regular: ["Microsoft YaHei"], bold: ["Microsoft YaHei Bold"] };
	});
	const css = generateCss(d);
	assert.ok(/font-weight: 400; src: local\("Microsoft YaHei"\)/.test(css));
	assert.ok(/font-weight: 700; src: local\("Microsoft YaHei Bold"\)/.test(css));
});

test("按笔记套用：非当前样式集只作用于带类名的笔记，且优先级更高", () => {
	const d = defaultData();
	const other = newStyleSet("公文");
	other.elements.h2.light = { color: "#952E3A" };
	d.sets.push(other);
	const css = generateCss(d);
	assert.ok(css.includes(`.markdown-rendered.${other.cssClass} h2`));
	assert.ok(css.includes(`.markdown-source-view.${other.cssClass}.mod-cm6 .cm-line.HyperMD-header-2`));
	assert.deepEqual(scopeSelector(".inline-title", "ds-x"), [".ds-x .inline-title"]);
});

test("加粗与链接颜色用主题变量实现", () => {
	const d = dataWith((d) => {
		activeSet(d).elements.inline.light = { boldColor: "#952E3A", linkColor: "#4B5CC4" };
	});
	const css = generateCss(d);
	assert.ok(/body,\n\.doc-style-preview\.doc-style-force-light \{\n  --bold-color: #952E3A/.test(css));
});

test("快照：三套模板的生成结果", () => {
	for (const t of TEMPLATES) {
		const d = defaultData();
		const s = activeSet(d);
		s.elements = templateElements(t);
		s.options = templateOptions(t);
		snapshot("template-" + t.id, generateCss(d));
	}
});

/* ----------------------------- 导入导出 ----------------------------- */

test("样式集 JSON 导出后导入一致，并拒绝非法字段", () => {
	const s = newStyleSet("论文");
	s.elements.p.light = { fontSize: 12, lineHeight: 1.5 };
	const back = importSetJson(exportSetJson(s));
	assert.equal(back.name, "论文");
	assert.deepEqual(back.elements.p.light, { fontSize: 12, lineHeight: 1.5 });
	assert.notEqual(back.id, s.id, "导入时生成新 id，避免与本库冲突");
	const evil = importSetJson(JSON.stringify({ format: "doc-style-set", name: "x", elements: { p: { light: { color: "red;}*{x:y" } } } }));
	assert.deepEqual(evil.elements.p.light, {});
	assert.throws(() => importSetJson("not json"));
});

/* ----------------------------- 标题编号 ----------------------------- */

test("公文式编号：一、（一）1.（1），跳过代码块与 frontmatter", () => {
	const md = ["---", "title: x", "---", "# 标题", "## 总体要求", "### 指导思想", "### 基本原则", "```", "## 不是标题", "```", "#### 细则", "##### 条目", "## 主要任务"].join("\n");
	const nums = numbersForText(md, "gongwen", 2);
	assert.deepEqual(Array.from(nums.values()), ["一、", "（一）", "（二）", "1. ", "（1）", "二、"]);
	assert.equal(nums.get(3), undefined, "起始级别以上的标题不编号");
});

test("论文式编号与中文数字", () => {
	const nums = numbersForText("# 绪论\n## 背景\n## 意义\n### 小节\n# 方法", "thesis", 1);
	assert.deepEqual(Array.from(nums.values()), ["1 ", "1.1 ", "1.2 ", "1.2.1 ", "2 "]);
	assert.equal(chineseNumber(11), "十一");
	assert.equal(chineseNumber(23), "二十三");
});
