/* ==========================================================================
   常量与元素注册表
   —— 所有"元素 → 选择器"的知识集中在这里（评审：选择器散落三处的问题）
   ========================================================================== */

export const PLUGIN_ID = "banxin";
export const PRODUCT_NAME = "版心";

/** 作者信息：账号改名时只需改这里 */
export const AUTHOR = {
	name: "Simon 老陈",
	wechat: "数字化流程再造",
	xiaohongshu: "数字化流程再造",
};
export const STYLE_EL_ID = "doc-style-generated";
export const FONT_PREFIX = "DocStyleFont";
export const INDENT_CLASS = "doc-style-indent";
export const NUM_CLASS = "doc-style-num";
export const PREVIEW_CLASS = "doc-style-preview";
export const FORCE_LIGHT = "doc-style-force-light";
export const FORCE_DARK = "doc-style-force-dark";
export const VIEW_TYPE = "banxin-view";

export type ElementKey =
	| "global"
	| "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
	| "p" | "list" | "blockquote" | "table" | "callout" | "code" | "inline";

export type PropKey =
	| "fontFamilyCJK"
	| "fontFamilyLatin"
	| "fontSize"
	| "fontWeight"
	| "fontStyle"
	| "color"
	| "textAlign"
	| "lineHeight"
	| "lineHeightPt"
	| "spaceBefore"
	| "spaceAfter"
	| "firstLineIndent"
	| "letterSpacing"
	| "linkColor"
	| "boldColor";

export const ALL_PROPS: PropKey[] = [
	"fontFamilyCJK", "fontFamilyLatin", "fontSize", "fontWeight", "fontStyle", "color",
	"textAlign", "lineHeight", "lineHeightPt", "spaceBefore", "spaceAfter", "firstLineIndent",
	"letterSpacing", "linkColor", "boldColor",
];

/** 字段（界面上的一行）。lineHeight 字段同时管理 lineHeight / lineHeightPt 两个属性 */
export type FieldKey = Exclude<PropKey, "lineHeightPt">;

export interface ElementDef {
	key: ElementKey;
	name: string;
	group: "全局" | "标题" | "正文" | "其他";
	level?: number;
	/** 该元素在界面上显示哪些字段（顺序即显示顺序） */
	fields: FieldKey[];
	/** 未设置时向哪些层继承（按顺序），最终回落到主题 */
	inheritsFrom: ElementKey[];
	/** 从全局层继承哪些属性 */
	inheritGlobal: PropKey[];
	/** 编辑器 / 预览里显示的说明 */
	desc?: string;
}

const HEADING_FIELDS: FieldKey[] = [
	"fontFamilyCJK", "fontFamilyLatin", "fontSize", "fontWeight", "fontStyle", "color",
	"textAlign", "lineHeight", "spaceBefore", "spaceAfter", "firstLineIndent", "letterSpacing",
];
const TEXT_INHERIT: PropKey[] = ["fontFamilyCJK", "fontFamilyLatin", "color", "lineHeight", "lineHeightPt", "letterSpacing"];

function heading(level: number): ElementDef {
	return {
		key: ("h" + level) as ElementKey,
		name: `标题 ${level}`,
		group: "标题",
		level,
		fields: HEADING_FIELDS,
		inheritsFrom: ["global"],
		// 标题的行距不从全局继承：正文行距通常远大于标题适合的行距
		inheritGlobal: ["fontFamilyCJK", "fontFamilyLatin", "color", "letterSpacing"],
	};
}

export const ELEMENTS: ElementDef[] = [
	{
		key: "global",
		name: "全局",
		group: "全局",
		fields: ["fontFamilyCJK", "fontFamilyLatin", "color", "lineHeight", "letterSpacing"],
		inheritsFrom: [],
		inheritGlobal: [],
		desc: "这里的设置会被所有元素继承；某个元素单独设置后，以元素自己的为准。",
	},
	heading(1), heading(2), heading(3), heading(4), heading(5), heading(6),
	{
		key: "p",
		name: "正文段落",
		group: "正文",
		fields: [
			"fontFamilyCJK", "fontFamilyLatin", "fontSize", "fontWeight", "fontStyle", "color",
			"textAlign", "lineHeight", "spaceBefore", "spaceAfter", "firstLineIndent", "letterSpacing",
		],
		inheritsFrom: ["global"],
		inheritGlobal: TEXT_INHERIT,
	},
	{
		key: "list",
		name: "列表",
		group: "正文",
		fields: ["fontFamilyCJK", "fontFamilyLatin", "fontSize", "color", "lineHeight", "letterSpacing"],
		// 列表默认跟随正文段落（v0.1 中列表就是按正文处理的，升级后外观不变）
		inheritsFrom: ["p", "global"],
		inheritGlobal: TEXT_INHERIT,
	},
	{
		key: "blockquote",
		name: "引用块",
		group: "正文",
		fields: [
			"fontFamilyCJK", "fontFamilyLatin", "fontSize", "fontWeight", "fontStyle", "color",
			"textAlign", "lineHeight", "spaceBefore", "spaceAfter", "firstLineIndent", "letterSpacing",
		],
		inheritsFrom: ["global"],
		inheritGlobal: TEXT_INHERIT,
	},
	{
		key: "table",
		name: "表格",
		group: "正文",
		fields: ["fontFamilyCJK", "fontFamilyLatin", "fontSize", "fontWeight", "color", "textAlign", "lineHeight", "letterSpacing"],
		inheritsFrom: ["global"],
		inheritGlobal: TEXT_INHERIT,
	},
	{
		key: "callout",
		name: "标注框",
		group: "其他",
		fields: ["fontFamilyCJK", "fontFamilyLatin", "fontSize", "color", "lineHeight"],
		inheritsFrom: ["global"],
		inheritGlobal: TEXT_INHERIT,
		desc: "Obsidian 的 Callout（> [!note] 这类彩色提示框）。",
	},
	{
		key: "code",
		name: "代码",
		group: "其他",
		fields: ["fontFamilyLatin", "fontFamilyCJK", "fontSize"],
		inheritsFrom: [],
		inheritGlobal: [],
		desc: "代码块与行内代码。字号只作用于代码块。",
	},
	{
		key: "inline",
		name: "加粗与链接",
		group: "其他",
		fields: ["boldColor", "linkColor"],
		inheritsFrom: [],
		inheritGlobal: [],
	},
];

export const ELEMENT_KEYS: ElementKey[] = ELEMENTS.map((e) => e.key);
export const STYLE_ELEMENT_KEYS: ElementKey[] = ELEMENT_KEYS.filter((k) => k !== "global");
export const HEADING_KEYS: ElementKey[] = ["h1", "h2", "h3", "h4", "h5", "h6"];

export function getElement(key: ElementKey): ElementDef {
	const def = ELEMENTS.find((e) => e.key === key);
	if (!def) throw new Error("unknown element " + key);
	return def;
}

export function elementName(key: ElementKey): string {
	return ELEMENTS.find((e) => e.key === key)?.name ?? key;
}

export function isHeading(key: ElementKey): boolean {
	return key.length === 2 && key[0] === "h";
}

/* ----------------------------- 选择器注册表 ----------------------------- */

export interface ElementSelectors {
	/** 阅读视图：承载属性的块元素 */
	read: string[];
	/** 阅读视图：内层元素，自定义的可继承属性在这里写 inherit，防止主题在内层重新设置 */
	readInner: string[];
	/** 编辑视图（实时预览 / 源码）：承载属性的行 */
	edit: string[];
	editInner: string[];
	/** 编辑视图里可以加上下间距（padding）的行；空行排除，避免空行也被撑开 */
	editSpacing: string[];
	/** 导出 PDF / 打印 */
	print: string[];
	printInner: string[];
}

const SRC = ".markdown-source-view.mod-cm6";
const NOT_EMPTY = ":not(:has(> br:only-child))";

export function selectorsFor(key: ElementKey, opts: { h1InlineTitle: boolean }): ElementSelectors {
	const empty: ElementSelectors = { read: [], readInner: [], edit: [], editInner: [], editSpacing: [], print: [], printInner: [] };
	if (isHeading(key)) {
		const n = key[1];
		const read = [`.markdown-rendered h${n}`];
		if (n === "1" && opts.h1InlineTitle) read.unshift(".inline-title");
		return {
			read,
			readInner: [],
			edit: [`${SRC} .cm-line.HyperMD-header-${n}`],
			// 行内的 .cm-header span 只继承，不再自己设字号——这是 v0.1 编辑视图标题字号叠乘的根源
			editInner: [`${SRC} .cm-line.HyperMD-header-${n} .cm-header`],
			editSpacing: [`${SRC} .cm-line.HyperMD-header-${n}`],
			print: [`h${n}`],
			printInner: [],
		};
	}
	switch (key) {
		case "p":
			return {
				read: [".markdown-rendered p:not(li p):not(blockquote p):not(.callout p):not(td p):not(th p)"],
				readInner: [],
				edit: [`${SRC} .cm-line:not([class*="HyperMD-"])`],
				editInner: [],
				editSpacing: [`${SRC} .cm-line:not([class*="HyperMD-"])${NOT_EMPTY}`],
				print: ["p:not(li p):not(blockquote p):not(.callout p)"],
				printInner: [],
			};
		case "list":
			return {
				read: [".markdown-rendered li"],
				readInner: [".markdown-rendered li li", ".markdown-rendered li p"],
				edit: [`${SRC} .cm-line.HyperMD-list-line`],
				editInner: [],
				editSpacing: [],
				print: ["li"],
				printInner: ["li li", "li p"],
			};
		case "blockquote":
			return {
				read: [".markdown-rendered blockquote"],
				readInner: [".markdown-rendered blockquote p"],
				edit: [`${SRC} .cm-line.HyperMD-quote`],
				editInner: [],
				editSpacing: [],
				print: ["blockquote"],
				printInner: ["blockquote p"],
			};
		case "table":
			return {
				read: [".markdown-rendered table"],
				readInner: [".markdown-rendered table th", ".markdown-rendered table td"],
				edit: [`${SRC} .cm-table-widget table`],
				editInner: [`${SRC} .cm-table-widget table th`, `${SRC} .cm-table-widget table td`],
				editSpacing: [],
				print: ["table"],
				printInner: ["table th", "table td"],
			};
		case "callout":
			return {
				read: [".markdown-rendered .callout"],
				readInner: [".markdown-rendered .callout p", ".markdown-rendered .callout li"],
				edit: [`${SRC} .cm-callout .callout`],
				editInner: [`${SRC} .cm-callout .callout p`, `${SRC} .cm-callout .callout li`],
				editSpacing: [],
				print: [".callout"],
				printInner: [".callout p", ".callout li"],
			};
		case "code":
			return {
				read: [".markdown-rendered pre", ".markdown-rendered code"],
				readInner: [".markdown-rendered pre code"],
				edit: [`${SRC} .HyperMD-codeblock`, `${SRC} .cm-inline-code`],
				editInner: [],
				editSpacing: [],
				print: ["pre", "code"],
				printInner: ["pre code"],
			};
		default:
			return empty;
	}
}

/* ----------------------------- 中文字号 ----------------------------- */

export const CN_SIZES: [string, number][] = [
	["初号", 42], ["小初", 36], ["一号", 26], ["小一", 24], ["二号", 22], ["小二", 18],
	["三号", 16], ["小三", 15], ["四号", 14], ["小四", 12], ["五号", 10.5], ["小五", 9], ["六号", 7.5],
];

export function cnSizeName(pt: number): string | null {
	const hit = CN_SIZES.find(([, v]) => v === pt);
	return hit ? hit[0] : null;
}

/* ----------------------------- 色板（按用途分组） ----------------------------- */

export interface Swatch { name: string; hex: string }
export interface SwatchGroup { name: string; role: "text" | "heading" | "accent" | "light"; tones: Swatch[] }

export const PALETTE: SwatchGroup[] = [
	{
		name: "正文色", role: "text", tones: [
			{ name: "乌金", hex: "#121212" }, { name: "玄色", hex: "#28272C" }, { name: "黛蓝", hex: "#425065" },
			{ name: "墨黪", hex: "#585248" }, { name: "椒褐", hex: "#72453A" }, { name: "石青", hex: "#1F4E79" },
		],
	},
	{
		name: "标题色", role: "heading", tones: [
			{ name: "胭脂", hex: "#952E3A" }, { name: "绛紫", hex: "#8C4356" }, { name: "石绿", hex: "#478868" },
			{ name: "宝蓝", hex: "#4B5CC4" }, { name: "檀褐", hex: "#945635" }, { name: "魏紫", hex: "#7E1671" },
		],
	},
	{
		name: "强调色", role: "accent", tones: [
			{ name: "朱砂", hex: "#FF461F" }, { name: "栀子黄", hex: "#E6B86C" }, { name: "肉红", hex: "#C17886" },
			{ name: "雪青", hex: "#B0A4E3" }, { name: "艾绿", hex: "#B4C4A8" }, { name: "珠子褐", hex: "#BEA89D" },
		],
	},
	{
		name: "浅色（适合深色背景）", role: "light", tones: [
			{ name: "月白", hex: "#D6ECF0" }, { name: "缃色", hex: "#F0E6C2" }, { name: "乳白", hex: "#F9F4DC" },
			{ name: "霜色", hex: "#F4F7F9" }, { name: "柳绿", hex: "#AFDD22" }, { name: "明黄", hex: "#FFD33D" },
		],
	},
];

/** "使用主题色"：存成 CSS 变量，换主题时跟着变 */
export const THEME_COLORS: { name: string; value: string }[] = [
	{ name: "主题正文色", value: "var(--text-normal)" },
	{ name: "主题次要色", value: "var(--text-muted)" },
	{ name: "主题强调色", value: "var(--text-accent)" },
];

/* ----------------------------- 字体 ----------------------------- */

/** 推荐字体（读不到本机字体列表时也能选） */
export const CJK_FONT_SUGGESTIONS = [
	"思源宋体", "思源黑体", "霞鹜文楷", "霞鹜新晰黑", "更纱黑体 SC", "微软雅黑", "宋体", "黑体", "仿宋", "楷体",
	"等线", "方正小标宋简体", "仿宋_GB2312", "楷体_GB2312", "华文中宋", "华文仿宋", "苹方-简", "宋体-简",
];

/** 中文名 ↔ 英文名（含 PostScript / 全名常见写法），用于 local() 匹配与显示 */
export const FONT_ALIASES: { cn: string; en: string[] }[] = [
	{ cn: "宋体", en: ["SimSun"] },
	{ cn: "新宋体", en: ["NSimSun"] },
	{ cn: "黑体", en: ["SimHei"] },
	{ cn: "仿宋", en: ["FangSong", "FangSong_GB2312"] },
	{ cn: "仿宋_GB2312", en: ["FangSong_GB2312", "仿宋", "FangSong"] },
	{ cn: "楷体", en: ["KaiTi", "KaiTi_GB2312"] },
	{ cn: "楷体_GB2312", en: ["KaiTi_GB2312", "楷体", "KaiTi"] },
	{ cn: "微软雅黑", en: ["Microsoft YaHei", "Microsoft YaHei UI"] },
	{ cn: "微软雅黑 UI", en: ["Microsoft YaHei UI"] },
	{ cn: "微软正黑体", en: ["Microsoft JhengHei"] },
	{ cn: "等线", en: ["DengXian"] },
	{ cn: "隶书", en: ["LiSu"] },
	{ cn: "幼圆", en: ["YouYuan"] },
	{ cn: "方正小标宋简体", en: ["FZXiaoBiaoSong-B05S", "方正小标宋_GBK", "FZXiaoBiaoSong-B05"] },
	{ cn: "方正仿宋_GBK", en: ["FZFangSong-Z02"] },
	{ cn: "方正楷体_GBK", en: ["FZKai-Z03"] },
	{ cn: "方正黑体_GBK", en: ["FZHei-B01"] },
	{ cn: "方正书宋_GBK", en: ["FZShuSong-Z01"] },
	{ cn: "华文仿宋", en: ["STFangsong"] },
	{ cn: "华文楷体", en: ["STKaiti"] },
	{ cn: "华文宋体", en: ["STSong"] },
	{ cn: "华文中宋", en: ["STZhongsong"] },
	{ cn: "华文细黑", en: ["STXihei"] },
	{ cn: "华文黑体", en: ["STHeiti"] },
	{ cn: "苹方-简", en: ["PingFang SC"] },
	{ cn: "苹方-繁", en: ["PingFang TC"] },
	{ cn: "冬青黑体简体中文", en: ["Hiragino Sans GB"] },
	{ cn: "宋体-简", en: ["Songti SC"] },
	{ cn: "黑体-简", en: ["Heiti SC"] },
	{ cn: "楷体-简", en: ["Kaiti SC"] },
	{ cn: "思源黑体", en: ["Source Han Sans SC", "Source Han Sans CN", "Noto Sans CJK SC", "Noto Sans SC"] },
	{ cn: "思源宋体", en: ["Source Han Serif SC", "Source Han Serif CN", "Noto Serif CJK SC", "Noto Serif SC"] },
	{ cn: "霞鹜文楷", en: ["LXGW WenKai", "LXGW WenKai Lite", "LXGW WenKai Screen"] },
	{ cn: "霞鹜新晰黑", en: ["LXGW Neo XiHei"] },
	{ cn: "更纱黑体 SC", en: ["Sarasa Gothic SC", "Sarasa UI SC"] },
	{ cn: "文泉驿微米黑", en: ["WenQuanYi Micro Hei"] },
	{ cn: "文泉驿正黑", en: ["WenQuanYi Zen Hei"] },
];

/** 缺字体时的替代建议（公文字体常缺） */
export const FONT_FALLBACKS: Record<string, string[]> = {
	"方正小标宋简体": ["华文中宋", "思源宋体", "宋体"],
	"仿宋_GB2312": ["仿宋", "华文仿宋", "思源宋体"],
	"楷体_GB2312": ["楷体", "华文楷体", "霞鹜文楷"],
	"仿宋": ["华文仿宋", "仿宋_GB2312", "思源宋体"],
	"楷体": ["华文楷体", "楷体_GB2312", "霞鹜文楷"],
	"黑体": ["思源黑体", "微软雅黑", "苹方-简"],
	"宋体": ["思源宋体", "宋体-简", "华文宋体"],
	"霞鹜文楷": ["楷体", "思源宋体"],
	"思源宋体": ["宋体", "宋体-简"],
	"思源黑体": ["微软雅黑", "苹方-简", "黑体"],
};

const ALIAS_LOWER = new Map<string, string>();
for (const { cn, en } of FONT_ALIASES) for (const e of en) if (!ALIAS_LOWER.has(e.toLowerCase())) ALIAS_LOWER.set(e.toLowerCase(), cn);

/** 英文名 → 中文显示名（没有对应关系则原样返回） */
export function displayFontName(name: string): string {
	return ALIAS_LOWER.get(name.toLowerCase()) ?? name;
}

/** 一个字体的全部已知名称（中文名在前） */
export function fontNameVariants(name: string): string[] {
	const out = [name];
	const hit = FONT_ALIASES.find((a) => a.cn === name);
	if (hit) out.push(...hit.en);
	const cn = ALIAS_LOWER.get(name.toLowerCase());
	if (cn && !out.includes(cn)) {
		out.push(cn);
		const h2 = FONT_ALIASES.find((a) => a.cn === cn);
		if (h2) for (const e of h2.en) if (!out.includes(e)) out.push(e);
	}
	return out;
}

export function looksCJKFont(name: string): boolean {
	if (/[一-龥]/.test(name)) return true;
	return /(CJK|Source Han|Noto (Sans|Serif) (SC|TC|JP|CJK)|Hei|Song|Kai|Ming|YaHei|PingFang|Hiragino|SimSun|SimHei|FangSong|KaiTi|DengXian|WenQuanYi|LXGW|Sarasa|FZ)/i.test(name);
}
