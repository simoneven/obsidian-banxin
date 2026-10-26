/* ==========================================================================
   内置模板
   公文参照 GB/T 9704-2012《党政机关公文格式》：
     标题 二号小标宋，正文 三号仿宋，一级标题 黑体，二级标题 楷体，
     三级标题 仿宋加粗；每行 28 字，行距约 28 磅；首行缩进 2 字符
   ========================================================================== */

import { ElementKey } from "./constants";
import { emptyElements, ElementStyle, SetOptions, StyleProps, StyleSet, defaultOptions } from "./schema";

export interface Template {
	id: string;
	name: string;
	desc: string;
	elements: Partial<Record<ElementKey, StyleProps>>;
	options: Partial<SetOptions>;
}

const GONGWEN_BODY: StyleProps = { fontFamilyCJK: "仿宋_GB2312", fontSize: 16, fontWeight: "400", lineHeightPt: 28, firstLineIndent: 2, spaceBefore: 0, spaceAfter: 0 };

export const TEMPLATES: Template[] = [
	{
		id: "gongwen",
		name: "国标公文",
		desc: "参照 GB/T 9704：标题二号小标宋居中，正文三号仿宋，层级标题黑体 / 楷体 / 仿宋加粗，行距 28 磅，每行约 28 字，标题自动编号（一、（一）1.（1））。",
		elements: {
			global: { fontFamilyCJK: "仿宋_GB2312", fontFamilyLatin: "Times New Roman" },
			h1: { fontFamilyCJK: "方正小标宋简体", fontSize: 22, fontWeight: "400", textAlign: "center", lineHeightPt: 36, spaceBefore: 0, spaceAfter: 1 },
			h2: { fontFamilyCJK: "黑体", fontSize: 16, fontWeight: "400", textAlign: "left", lineHeightPt: 28, firstLineIndent: 2, spaceBefore: 0, spaceAfter: 0 },
			h3: { fontFamilyCJK: "楷体_GB2312", fontSize: 16, fontWeight: "400", textAlign: "left", lineHeightPt: 28, firstLineIndent: 2, spaceBefore: 0, spaceAfter: 0 },
			h4: { fontFamilyCJK: "仿宋_GB2312", fontSize: 16, fontWeight: "700", textAlign: "left", lineHeightPt: 28, firstLineIndent: 2, spaceBefore: 0, spaceAfter: 0 },
			h5: { fontFamilyCJK: "仿宋_GB2312", fontSize: 16, fontWeight: "400", textAlign: "left", lineHeightPt: 28, firstLineIndent: 2, spaceBefore: 0, spaceAfter: 0 },
			h6: { fontFamilyCJK: "仿宋_GB2312", fontSize: 16, fontWeight: "400", textAlign: "left", lineHeightPt: 28, firstLineIndent: 2, spaceBefore: 0, spaceAfter: 0 },
			p: { ...GONGWEN_BODY, textAlign: "justify" },
			blockquote: { fontFamilyCJK: "楷体_GB2312", fontSize: 16, lineHeightPt: 28 },
			table: { fontSize: 14, lineHeight: 1.5 },
		},
		options: { numbering: { style: "gongwen", startLevel: 2 }, contentWidth: 28, cjkPunctuation: true, h1InlineTitle: false },
	},
	{
		id: "thesis",
		name: "学术论文",
		desc: "常见学位论文格式：正文宋体小四、英文 Times New Roman、1.5 倍行距、首行缩进 2 字符；章节标题黑体，按 1 / 1.1 / 1.1.1 自动编号（从标题 1 开始）。",
		elements: {
			global: { fontFamilyCJK: "宋体", fontFamilyLatin: "Times New Roman" },
			h1: { fontFamilyCJK: "黑体", fontSize: 16, fontWeight: "400", textAlign: "center", lineHeight: 1.5, spaceBefore: 1, spaceAfter: 1 },
			h2: { fontFamilyCJK: "黑体", fontSize: 14, fontWeight: "400", textAlign: "left", lineHeight: 1.5, spaceBefore: 0.5, spaceAfter: 0.5 },
			h3: { fontFamilyCJK: "黑体", fontSize: 12, fontWeight: "400", textAlign: "left", lineHeight: 1.5, spaceBefore: 0.5, spaceAfter: 0.5 },
			h4: { fontFamilyCJK: "黑体", fontSize: 12, fontWeight: "400", lineHeight: 1.5 },
			h5: { fontFamilyCJK: "黑体", fontSize: 12, fontWeight: "400", lineHeight: 1.5 },
			h6: { fontFamilyCJK: "黑体", fontSize: 12, fontWeight: "400", lineHeight: 1.5 },
			p: { fontSize: 12, lineHeight: 1.5, firstLineIndent: 2, textAlign: "justify", spaceBefore: 0, spaceAfter: 0 },
			blockquote: { fontFamilyCJK: "楷体", fontSize: 12 },
			table: { fontSize: 10.5, lineHeight: 1.25 },
		},
		options: { numbering: { style: "thesis", startLevel: 1 }, cjkPunctuation: true, h1InlineTitle: false },
	},
	{
		id: "reading",
		name: "舒适阅读",
		desc: "适合长文与读书笔记：正文霞鹜文楷、1.8 倍行距、略宽的字间距，标题思源宋体，每行约 36 字；颜色跟随主题，明暗模式都清晰。",
		elements: {
			global: { fontFamilyCJK: "霞鹜文楷", lineHeight: 1.8, letterSpacing: 0.02 },
			h1: { fontFamilyCJK: "思源宋体", fontWeight: "700", spaceBefore: 1, spaceAfter: 0.5 },
			h2: { fontFamilyCJK: "思源宋体", fontWeight: "700", spaceBefore: 1, spaceAfter: 0.5 },
			h3: { fontFamilyCJK: "思源宋体", fontWeight: "700", spaceBefore: 0.5, spaceAfter: 0.25 },
			h4: { fontFamilyCJK: "思源宋体", fontWeight: "700" },
			h5: { fontFamilyCJK: "思源宋体", fontWeight: "700" },
			h6: { fontFamilyCJK: "思源宋体", fontWeight: "700" },
			p: { textAlign: "justify", spaceBefore: 0, spaceAfter: 0.5 },
			blockquote: { color: "var(--text-muted)" },
		},
		options: { contentWidth: 36, cjkPunctuation: true },
	},
];

export function templateElements(t: Template): Record<ElementKey, ElementStyle> {
	const els = emptyElements();
	for (const [k, p] of Object.entries(t.elements)) els[k as ElementKey] = { separate: false, light: { ...p }, dark: {} };
	return els;
}

export function templateOptions(t: Template): SetOptions {
	const o = defaultOptions();
	return { ...o, ...t.options, numbering: { ...o.numbering, ...(t.options.numbering ?? {}) } };
}

/** 模板里用到的全部字体 */
export function templateFonts(t: Template): string[] {
	const s = new Set<string>();
	for (const p of Object.values(t.elements)) {
		if (p?.fontFamilyCJK) s.add(p.fontFamilyCJK);
		if (p?.fontFamilyLatin) s.add(p.fontFamilyLatin);
	}
	return Array.from(s);
}

/** 用替代字体替换缺失字体 */
export function replaceFonts(set: StyleSet, map: Record<string, string>): void {
	for (const e of Object.values(set.elements)) {
		for (const p of [e.light, e.dark]) {
			if (p.fontFamilyCJK && map[p.fontFamilyCJK]) p.fontFamilyCJK = map[p.fontFamilyCJK];
			if (p.fontFamilyLatin && map[p.fontFamilyLatin]) p.fontFamilyLatin = map[p.fontFamilyLatin];
		}
	}
}
