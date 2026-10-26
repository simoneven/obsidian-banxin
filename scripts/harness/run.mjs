// 在 Chromium 中加载插件真实界面，逐项验证需求并截图
import { createRequire } from "module";
import path from "path";
import fs from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/npm-tools/node_modules/playwright");

const OUT = process.argv[2] ?? "/tmp/shots";
fs.mkdirSync(OUT, { recursive: true });
const url = "file://" + path.resolve("scripts/harness/index.html");
const results = [];
const check = (name, ok, detail = "") => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "✔" : "✘"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(url);
await page.evaluate(() => window.bootPlugin(null));
await page.evaluate(() => {
	const md = ["# 一级标题", "## 二级标题", "正文段落，中英文混排 English 2026，“引号”——破折号……", "第二行（段内换行）", "", "> 引用的文字", "", "- 列表项", "", "| 项目 | 数值 |", "| --- | --- |", "| 行一 | 1 |"].join("\n");
	document.getElementById("note").insertAdjacentHTML("beforeend", window.renderMd(md));
});

const px = (sel, prop = "font-size") => page.evaluate(([s, p]) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e)[p === "font-size" ? "fontSize" : p]) : null; }, [sel, prop]);
const css = () => page.evaluate(() => document.getElementById("doc-style-generated")?.textContent ?? "");

/* ---------- 欢迎页 ---------- */
await page.evaluate(() => window.__plugin.openModal());
await page.waitForSelector(".doc-style-welcome");
await page.screenshot({ path: `${OUT}/01-welcome.png` });
check("首次打开显示欢迎页与模板选择（R21/R23）", await page.locator(".doc-style-template-card").count() === 4);
await page.locator(".doc-style-template-card.is-plain").click();
await page.waitForSelector(".doc-style-props-title");
check("选择「保持主题」后进入全局层", (await page.locator(".doc-style-props-title").textContent()) === "全局");
await page.screenshot({ path: `${OUT}/02-global.png` });

/* ---------- 全局字体（R11） ---------- */
await page.locator(".doc-style-field").filter({ hasText: "中文字体" }).locator(".doc-style-font-btn").click();
await page.waitForSelector(".doc-style-font-menu.is-open .doc-style-font-item");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/03-font-menu.png` });
await page.locator(".doc-style-font-menu .doc-style-font-search").fill("思源宋");
await page.locator(".doc-style-font-menu .doc-style-font-item").filter({ hasText: "思源宋体" }).first().click();
let c = await css();
check("全局中文字体 → 所有元素继承（R11）", /\.markdown-rendered h3[^{]*\{[^}]*Source Han Serif SC/.test(c) && /\.markdown-rendered p:not[^{]*\{[^}]*Source Han Serif SC/.test(c));
const famOk = await page.evaluate(() => getComputedStyle(document.querySelector("#note p")).fontFamily);
check("笔记正文实际字体族已切换", famOk.includes("DocStyleFont_"), famOk.slice(0, 60));

/* ---------- 标题字号（R02/R03） ---------- */
await page.locator('.doc-style-tree-item[data-key="h2"]').click();
await page.locator(".doc-style-field").filter({ hasText: "字号" }).locator("select").selectOption("16");
await page.waitForTimeout(50);
check("H2 设三号（16 磅）→ 阅读视图 21.33px", Math.abs((await px("#note h2")) - 21.333) < 0.1, String(await px("#note h2")));
check("编辑视图 H2 行 21.33px", Math.abs((await px("#live .HyperMD-header-2")) - 21.333) < 0.1, String(await px("#live .HyperMD-header-2")));
check("编辑视图 H2 内层 span 不叠乘（R02）", Math.abs((await px("#live .HyperMD-header-2 .cm-header:last-child")) - 21.333) < 0.1, String(await px("#live .HyperMD-header-2 .cm-header:last-child")));

await page.locator('.doc-style-tree-item[data-key="blockquote"]').click();
await page.locator(".doc-style-field").filter({ hasText: "字号" }).locator("input.doc-style-num").fill("14");
await page.locator(".doc-style-field").filter({ hasText: "字号" }).locator("input.doc-style-num").press("Enter");
await page.waitForTimeout(50);
check("引用块 14 磅 → 内层段落 18.67px，不叠乘（R02）", Math.abs((await px("#note blockquote p")) - 18.667) < 0.1, String(await px("#note blockquote p")));

/* 换基准字号：12 磅始终等于正文字号（R03） */
await page.evaluate(() => document.body.style.setProperty("--font-text-size", "18px"));
check("正文基准改为 18px 后，14 磅引用 = 21px", Math.abs((await px("#note blockquote p")) - 21) < 0.1, String(await px("#note blockquote p")));
await page.evaluate(() => document.body.style.removeProperty("--font-text-size"));

/* ---------- 首行缩进开关（R04） ---------- */
await page.locator('.doc-style-tree-item[data-key="p"]').click();
const indentRow = page.locator(".doc-style-field").filter({ hasText: "首行缩进" });
const hiddenBefore = await indentRow.locator(".doc-style-inline").evaluate((e) => e.classList.contains("is-hidden"));
await indentRow.locator(".doc-style-switch").click();
const hiddenAfter = await indentRow.locator(".doc-style-inline").evaluate((e) => e.classList.contains("is-hidden"));
check("首行缩进开关打开后数字框立即出现（R04）", hiddenBefore && !hiddenAfter);
check("阅读视图首行缩进 2 字符", Math.abs((await px("#note p", "textIndent")) - 32) < 0.5, String(await px("#note p", "textIndent")));
check("编辑视图首行缩进生效（R15）", Math.abs((await px("#live .cm-line:not([class*=HyperMD-])", "textIndent")) - 32) < 0.5);
check("段内换行补偿 span 已插入", (await page.locator("#note p .doc-style-indent").count()) >= 1);
await page.screenshot({ path: `${OUT}/04-paragraph.png` });

/* ---------- 撤销（R10） ---------- */
await page.locator(".doc-style-editor").focus();
await page.keyboard.press("Control+z");
await page.waitForTimeout(50);
check("Ctrl+Z 撤销首行缩进", (await px("#note p", "textIndent")) === 0);
await page.keyboard.press("Control+Shift+z");
await page.waitForTimeout(50);
check("Ctrl+Shift+Z 重做", Math.abs((await px("#note p", "textIndent")) - 32) < 0.5);

/* ---------- 继承显示（R12） ---------- */
const status = await page.locator(".doc-style-field").filter({ hasText: "中文字体" }).locator(".doc-style-field-status").textContent();
check("继承来的值标注来源（R12）", status === "继承自全局", status);

/* ---------- 明暗分开（R13） ---------- */
await page.locator(".doc-style-mode-tabs").getByRole("button", { name: "暗", exact: true }).click();
check("切到「暗」自动开启分开设置并以明色为初值（R13）", await page.evaluate(() => { const s = window.__plugin.store.state; const p = s.sets[0].elements.p; return p.separate && p.dark.firstLineIndent === 2; }));
await page.locator(".doc-style-mode-tabs").getByRole("button", { name: "明暗共用", exact: true }).click();

/* ---------- 对比度（R09） ---------- */
await page.locator(".doc-style-field").filter({ hasText: "文字颜色" }).locator(".doc-style-color-hex").fill("#121212");
await page.locator(".doc-style-field").filter({ hasText: "文字颜色" }).locator(".doc-style-color-hex").press("Enter");
await page.waitForTimeout(50);
const issues = await page.locator(".doc-style-issue").allTextContents();
check("深色正文未分开设置时提示暗色模式看不清（R09）", issues.some((t) => t.includes("暗色模式下")), issues.join(" | "));
await page.locator(".doc-style-field").filter({ hasText: "文字颜色" }).locator(".doc-style-btn").click();
await page.waitForSelector(".doc-style-palette.is-open");
await page.screenshot({ path: `${OUT}/05-palette.png` });
check("色板按用途分组，低对比度色块禁用（R27）", (await page.locator(".doc-style-palette .doc-style-palette-chip.is-disabled").count()) > 0);
await page.keyboard.press("Escape");
await page.locator(".doc-style-field").filter({ hasText: "文字颜色" }).locator(".doc-style-reset").click();

/* ---------- 复制样式（R06） ---------- */
await page.locator('.doc-style-tree-item[data-key="h2"]').click();
await page.locator(".doc-style-props-actions .doc-style-btn", { hasText: "复制样式到" }).click();
await page.waitForSelector(".doc-style-copy-dialog");
await page.screenshot({ path: `${OUT}/06-copy.png` });
const sizeChecked = await page.locator(".doc-style-copy-dialog .doc-style-check").filter({ hasText: "字号" }).locator("input").isChecked();
check("复制样式默认不勾选字号（R06）", !sizeChecked);
await page.locator(".doc-style-copy-dialog button", { hasText: "复制" }).last().click();

/* ---------- 模板 + 编号（R23/R26） ---------- */
await page.locator(".doc-style-head .doc-style-btn", { hasText: "模板" }).click();
await page.locator(".doc-style-template-card", { hasText: "国标公文" }).click();
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/07-template-fonts.png` });
await page.locator(".doc-style-template-dialog button", { hasText: "套用到当前样式集" }).click();
await page.waitForTimeout(300);
c = await css();
check("公文模板：正文固定行距 28 磅", c.includes("line-height: calc(var(--font-text-size) * 2.3333)"));
const pvNums = await page.locator(".doc-style-preview .doc-style-num").allTextContents();
check("预览出现公文式编号（R26）", pvNums.join("") .includes("一、"), pvNums.join(" "));
await page.screenshot({ path: `${OUT}/08-gongwen.png` });

/* ---------- 预览暗色 + 编辑模式（R16） ---------- */
await page.locator(".doc-style-pv-toggles").getByRole("button", { name: "暗", exact: true }).click();
await page.waitForTimeout(200);
const pvBg = await page.evaluate(() => getComputedStyle(document.querySelector(".doc-style-preview")).backgroundColor);
check("预览切暗色后使用暗色主题背景（R16）", pvBg === "rgb(30, 30, 30)", pvBg);
await page.screenshot({ path: `${OUT}/09-preview-dark.png` });
await page.locator(".doc-style-pv-toggles").getByRole("button", { name: "编辑", exact: true }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/10-preview-editing.png` });
await page.locator(".doc-style-pv-toggles").getByRole("button", { name: "明", exact: true }).click();
await page.locator(".doc-style-pv-toggles").getByRole("button", { name: "阅读", exact: true }).click();

/* ---------- 全局选项 ---------- */
await page.locator('.doc-style-tree-item[data-key="global"]').click();
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/11-global-options.png`, fullPage: false });

/* ---------- 样式集（R22） ---------- */
await page.locator(".doc-style-set-btn").click();
await page.screenshot({ path: `${OUT}/12-set-menu.png` });
await page.locator(".menu-item", { hasText: "复制当前样式集" }).click();
await page.waitForTimeout(100);
check("复制样式集并切换（R22）", await page.evaluate(() => window.__plugin.store.state.sets.length === 2 && window.__plugin.store.state.sets[1].id === window.__plugin.store.state.activeSetId));
c = await css();
check("非当前样式集生成按笔记生效的规则（R24）", await page.evaluate(() => { const s = window.__plugin.store.state.sets[0]; return document.getElementById("doc-style-generated").textContent.includes(`.markdown-rendered.${s.cssClass} h2`); }));

/* ---------- 重置 + 撤销提示 ---------- */
await page.locator(".doc-style-more").click();
await page.locator(".menu-item", { hasText: "重置全部元素" }).click();
await page.waitForSelector(".doc-style-dialog");
await page.locator(".doc-style-dialog button.mod-warning").click();
await page.waitForTimeout(100);
const noticeHasUndo = await page.locator(".notice .doc-style-notice-undo").count();
check("重置后的通知带「撤销」按钮（R10）", noticeHasUndo > 0);
await page.locator(".notice .doc-style-notice-undo").last().click();
await page.waitForTimeout(100);
check("通知里撤销重置后，公文样式回来", (await css()).includes("2.3333"));

/* ---------- 保存 ---------- */
await page.waitForTimeout(600);
check("自动保存（防抖）", await page.evaluate(() => !!window.__saved && window.__saved.schemaVersion === 3));

/* ---------- 窄屏（侧栏） ---------- */
await page.evaluate(() => document.querySelector(".modal-container")?.remove());
await page.evaluate(() => {
	const host = document.body.createDiv();
	host.style.cssText = "position:fixed;right:0;top:0;bottom:0;width:380px;background:var(--background-primary);border-left:1px solid #ddd;display:flex;z-index:40";
	const Ed = window.__plugin.editors.values().next().value?.constructor;
	const ed = new Ed(window.__plugin, { load() {}, unload() {} }, {});
	host.appendChild(ed.rootEl);
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/13-sidebar.png` });
check("侧栏宽度下切换为窄布局，预览折叠在下方", await page.evaluate(() => [...document.querySelectorAll(".doc-style-editor")].some((e) => e.classList.contains("is-narrow"))));

/* ---------- 设置页 ---------- */
await page.evaluate(() => {
	document.querySelectorAll(".doc-style-editor").forEach((e) => e.parentElement.remove());
	const tab = window.__plugin.settingTabs[0];
	tab.display();
	const host = document.body.createDiv();
	host.style.cssText = "position:fixed;inset:40px 200px;background:var(--background-primary);padding:24px;overflow:auto;border:1px solid #ddd;z-index:45";
	host.appendChild(tab.containerEl);
});
await page.screenshot({ path: `${OUT}/14-settings.png` });

/* ---------- 迁移 0.1.x 数据 ---------- */
const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
p2.on("pageerror", (e) => errors.push("[migrate] " + e));
await p2.goto(url);
await p2.evaluate(() => window.bootPlugin({ schemaVersion: 1, name: "我的样式", scope: "vault", reducePriority: false, elements: { h1: { separate: false, light: { fontSize: 22 }, dark: {} }, p: { separate: false, light: { paragraphSpacing: 1, firstLineIndent: 2 }, dark: {} } } }));
const mig = await p2.evaluate(() => { const s = window.__plugin.store.state; return { ver: s.schemaVersion, p: s.sets[0].elements.p.light, onboarded: s.onboarded }; });
check("0.1.x 数据迁移：段间距→段前段后，老用户不弹引导", mig.ver === 3 && mig.p.spaceBefore === 0.5 && mig.onboarded, JSON.stringify(mig));
await p2.evaluate(() => window.__plugin.openModal());
await p2.waitForTimeout(300);
await p2.screenshot({ path: `${OUT}/15-migrated.png` });

/* ---------- 暗色应用整体 ---------- */
await p2.evaluate(() => { document.body.classList.replace("theme-light", "theme-dark"); window.__app.workspace.trigger("css-change"); });
await p2.waitForTimeout(300);
await p2.screenshot({ path: `${OUT}/16-dark-app.png` });

/* ---------- 编辑器内标题编号（CodeMirror 装饰） ---------- */
await p2.evaluate(() => {
	const st = window.__plugin.store;
	st.update("test", (d) => { d.sets[0].options.numbering = { style: "thesis", startLevel: 1 }; });
	window.__ed = window.makeEditor("# 绪论\n正文\n## 背景\n```\n# 不是标题\n```\n## 意义\n# 方法");
});
await p2.waitForTimeout(100);
const cmNums = await p2.evaluate(() => [...document.querySelectorAll("#cm-test .doc-style-num")].map((e) => e.textContent));
check("编辑视图标题编号（不改原文，跳过代码块）（R26）", cmNums.join("|") === "1 |1.1 |1.2 |2 ", cmNums.join("|"));
const docUnchanged = await p2.evaluate(() => window.__ed.state.doc.toString().startsWith("# 绪论"));
check("编号不改动 Markdown 原文", docUnchanged);

check("全程无运行时错误", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
