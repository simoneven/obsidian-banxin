/* ==========================================================================
   字段定义：界面上每一行属性的名称、控件、分组与说明
   说明文字一律使用 Word 用户熟悉的说法，不出现 CSS / px / em
   ========================================================================== */

import { ElementKey, FieldKey, isHeading } from "../constants";

export type ControlType = "font" | "cnsize" | "switch" | "color" | "align" | "lineheight" | "range" | "indent";

export interface FieldDef {
	key: FieldKey;
	label: string;
	type: ControlType;
	group: "字体" | "颜色" | "段落";
	help: string;
	fontKind?: "cjk" | "latin";
	on?: string;
	off?: string;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	/** 显示值 = 存储值 × scale */
	scale?: number;
}

export const FIELDS: Record<FieldKey, FieldDef> = {
	fontFamilyCJK: { key: "fontFamilyCJK", label: "中文字体", type: "font", group: "字体", fontKind: "cjk", help: "只作用于汉字和中文标点；英文和数字由「英文字体」负责，两者自动拼在一起。" },
	fontFamilyLatin: { key: "fontFamilyLatin", label: "英文字体", type: "font", group: "字体", fontKind: "latin", help: "只作用于英文字母和数字。不设置时，英文跟随中文字体或主题。" },
	fontSize: { key: "fontSize", label: "字号", type: "cnsize", group: "字体", help: "和 Word 一样，可以选「三号」「小四」这类中文字号，也可以直接填磅值。12 磅（小四）等于 Obsidian 设置里的正文字号。" },
	fontWeight: { key: "fontWeight", label: "加粗", type: "switch", group: "字体", on: "700", off: "400", help: "大多数中文字体只有常规和加粗两档，所以这里只给一个开关。" },
	fontStyle: { key: "fontStyle", label: "倾斜", type: "switch", group: "字体", on: "italic", off: "normal", help: "中文字体通常没有真正的斜体，打开后是电脑算出来的倾斜效果。" },
	color: { key: "color", label: "文字颜色", type: "color", group: "颜色", help: "可以从预设色板选，也可以填色号。选「主题色」时，换主题后颜色会跟着变。" },
	boldColor: { key: "boldColor", label: "加粗文字", type: "color", group: "颜色", help: "正文里 **加粗** 文字的颜色。" },
	linkColor: { key: "linkColor", label: "链接", type: "color", group: "颜色", help: "内部链接和网页链接的颜色。" },
	textAlign: { key: "textAlign", label: "对齐", type: "align", group: "段落", help: "「两端」即 Word 的两端对齐，中文正文推荐使用。" },
	lineHeight: { key: "lineHeight", label: "行距", type: "lineheight", group: "段落", help: "「倍数」同 Word 的多倍行距；「固定值」同 Word 的固定值（磅），公文常用 28 磅。" },
	spaceBefore: { key: "spaceBefore", label: "段前", type: "range", group: "段落", min: 0, max: 3, step: 0.25, unit: "行", help: "同 Word 的段前间距，以行为单位。" },
	spaceAfter: { key: "spaceAfter", label: "段后", type: "range", group: "段落", min: 0, max: 3, step: 0.25, unit: "行", help: "同 Word 的段后间距，以行为单位。" },
	firstLineIndent: { key: "firstLineIndent", label: "首行缩进", type: "indent", group: "段落", min: 0, max: 4, step: 0.5, unit: "字符", help: "同 Word 的首行缩进。段落中间手动换行后的那一行也会对齐。" },
	letterSpacing: { key: "letterSpacing", label: "字间距", type: "range", group: "段落", min: 0, max: 20, step: 1, unit: "%", scale: 100, help: "在每个字之间额外加宽的距离，按一个字宽的百分比计算。" },
};

export const FIELD_LABELS: Record<FieldKey, string> = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.label])) as Record<FieldKey, string>;

/** 个别元素上字段的名称 / 说明需要调整 */
export function fieldFor(element: ElementKey, key: FieldKey): FieldDef {
	const f = FIELDS[key];
	if (element === "code" && key === "fontFamilyLatin") return { ...f, label: "等宽字体", help: "代码里的英文、数字和符号用的字体，建议选等宽字体（如 Consolas、JetBrains Mono）。" };
	if (element === "code" && key === "fontFamilyCJK") return { ...f, help: "代码注释里的中文用的字体。" };
	if (element === "code" && key === "fontSize") return { ...f, help: "只作用于代码块，行内代码跟随所在段落。" };
	if (isHeading(element) && key === "firstLineIndent") return { ...f, help: "公文的层级标题需要缩进 2 字符；一般笔记不用设置。" };
	return f;
}

/** 编辑视图下不生效的属性提示 */
export function editingNote(element: ElementKey, key: FieldKey): string | null {
	if ((key === "spaceBefore" || key === "spaceAfter") && !(isHeading(element) || element === "p")) return "编辑视图中不生效";
	return null;
}
