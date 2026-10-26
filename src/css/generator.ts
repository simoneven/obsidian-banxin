/* ==========================================================================
   CSS 生成器（纯函数：数据 → CSS 文本）
   - 当前样式集作用于全库；其余样式集按笔记生效（frontmatter cssclasses）
   - 字号用 calc(var(--font-text-size) * k) 表示，嵌套也不会叠乘
   - 每个元素只在一层上设置属性，内层只写 inherit
   ========================================================================== */

import {
	ElementKey, FONT_PREFIX, FORCE_DARK, FORCE_LIGHT, getElement, INDENT_CLASS, PREVIEW_CLASS, PropKey,
	selectorsFor, STYLE_ELEMENT_KEYS, fontNameVariants, isHeading,
} from "../constants";
import { resolveProps, Mode } from "../resolve";
import { PluginData, StyleProps, StyleSet } from "../schema";
import { fixedLineHeightCss, fontSizeCss, round, spacingCss } from "../units";
import { fontFaceRules } from "./fontface";

type Decl = [string, string];
type Layer = "block" | "edit" | "inner" | "spacing";

export interface GenerateOptions {
	/** 不输出 !important */
	reducePriority?: boolean;
}

/* ----------------------------- 作用域 ----------------------------- */

/** 把全库选择器改写为"只对带 cssClass 的笔记生效"的选择器 */
export function scopeSelector(sel: string, cls: string): string[] {
	if (sel.startsWith(".markdown-rendered")) {
		const rest = sel.slice(".markdown-rendered".length);
		return [`.markdown-rendered.${cls}${rest}`, `.${cls} .markdown-rendered${rest}`];
	}
	if (sel.startsWith(".markdown-source-view")) {
		return [`.markdown-source-view.${cls}${sel.slice(".markdown-source-view".length)}`];
	}
	return [`.${cls} ${sel}`];
}

function themed(sels: string[], mode: Mode): string[] {
	if (mode === "dark") {
		return [...sels.map((s) => `body.theme-dark ${s}`), ...sels.map((s) => `.${PREVIEW_CLASS}.${FORCE_DARK} ${s}`)];
	}
	return [...sels, ...sels.map((s) => `.${PREVIEW_CLASS}.${FORCE_LIGHT} ${s}`)];
}

function rule(sels: string[], decls: Decl[], important: boolean): string {
	if (!sels.length || !decls.length) return "";
	const imp = important ? " !important" : "";
	return `${sels.join(",\n")} {\n${decls.map(([k, v]) => `  ${k}: ${v}${imp};`).join("\n")}\n}`;
}

/* ----------------------------- 字体族 ----------------------------- */

/** 字体族名只取决于"英文字体 + 中文字体 + 标点归属"，相同组合共用一组 @font-face */
export function familyName(p: StyleProps, cjkPunct: boolean): string {
	const key = `${p.fontFamilyLatin ?? ""}|${p.fontFamilyCJK ?? ""}|${cjkPunct ? 1 : 0}`;
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
	return `${FONT_PREFIX}_${h.toString(36)}`;
}

function quoteList(names: string[]): string {
	return names.map((n) => `"${n}"`).join(", ");
}

function fontFamilyValue(fam: string, p: StyleProps, fallbackVar: string): string {
	const parts = [`"${fam}"`];
	if (p.fontFamilyLatin) parts.push(quoteList(fontNameVariants(p.fontFamilyLatin)));
	if (p.fontFamilyCJK) parts.push(quoteList(fontNameVariants(p.fontFamilyCJK)));
	parts.push(fallbackVar);
	return parts.join(", ");
}

/* ----------------------------- 声明 ----------------------------- */

function allowed(key: ElementKey, prop: PropKey): boolean {
	const fields = getElement(key).fields as PropKey[];
	if (prop === "lineHeightPt") return fields.includes("lineHeight");
	return fields.includes(prop);
}

/** 只保留该元素界面上提供的属性（列表会从正文继承到缩进等不适用的属性） */
export function filterProps(key: ElementKey, p: StyleProps): StyleProps {
	const out: StyleProps = {};
	for (const k of Object.keys(p) as PropKey[]) if (allowed(key, k)) (out as Record<string, unknown>)[k] = p[k];
	return out;
}

const INHERITABLE = ["font-family", "font-size", "font-weight", "font-style", "color", "line-height", "letter-spacing", "text-align", "text-indent"];

function decls(key: ElementKey, p: StyleProps, fam: string, layer: Layer): Decl[] {
	const out: Decl[] = [];
	const isCode = key === "code";
	if (layer === "spacing") {
		const lh = { multiple: p.lineHeight, fixedPt: p.lineHeightPt };
		if (p.spaceBefore !== undefined) out.push(["padding-top", spacingCss(p.spaceBefore, lh)]);
		if (p.spaceAfter !== undefined) out.push(["padding-bottom", spacingCss(p.spaceAfter, lh)]);
		return out;
	}
	if (p.fontFamilyCJK || p.fontFamilyLatin) out.push(["font-family", fontFamilyValue(fam, p, isCode ? "var(--font-monospace)" : "var(--font-text)")]);
	if (p.fontSize !== undefined && !isCode) out.push(["font-size", fontSizeCss(p.fontSize)]);
	if (p.fontWeight) out.push(["font-weight", p.fontWeight]);
	if (p.fontStyle) out.push(["font-style", p.fontStyle]);
	if (p.color) out.push(["color", p.color]);
	if (p.textAlign) out.push(["text-align", p.textAlign]);
	if (p.lineHeightPt !== undefined) out.push(["line-height", fixedLineHeightCss(p.lineHeightPt)]);
	else if (p.lineHeight !== undefined) out.push(["line-height", String(round(p.lineHeight, 3))]);
	if (layer === "block") {
		const lh = { multiple: p.lineHeight, fixedPt: p.lineHeightPt };
		if (p.spaceBefore !== undefined) out.push(["margin-top", spacingCss(p.spaceBefore, lh)]);
		if (p.spaceAfter !== undefined) out.push(["margin-bottom", spacingCss(p.spaceAfter, lh)]);
	}
	if (p.firstLineIndent !== undefined) out.push(["text-indent", p.firstLineIndent > 0 ? `${round(p.firstLineIndent, 2)}em` : "0"]);
	if (p.letterSpacing !== undefined) out.push(["letter-spacing", p.letterSpacing > 0 ? `${round(p.letterSpacing, 3)}em` : "normal"]);
	return out;
}

function innerDecls(block: Decl[]): Decl[] {
	return block.filter(([k]) => INHERITABLE.includes(k)).map(([k]) => [k, "inherit"] as Decl);
}

function sameProps(a: StyleProps, b: StyleProps): boolean {
	return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
function sortKeys(o: StyleProps): Record<string, unknown> {
	const r: Record<string, unknown> = {};
	for (const k of Object.keys(o).sort()) r[k] = (o as Record<string, unknown>)[k];
	return r;
}

/* ----------------------------- 单个样式集 ----------------------------- */

interface SetOutput {
	faces: string[];
	rules: string[];
	print: string[];
}

function generateSet(set: StyleSet, scopeCls: string | null, data: PluginData, important: boolean, seenFamilies: Set<string>): SetOutput {
	const out: SetOutput = { faces: [], rules: [], print: [] };
	const sc = (sels: string[]) => (scopeCls ? sels.flatMap((s) => scopeSelector(s, scopeCls)) : sels);
	const scPrint = (sels: string[]) => (scopeCls ? sels.map((s) => `.${scopeCls} ${s}`) : sels);
	const opts = { h1InlineTitle: set.options.h1InlineTitle };

	for (const key of STYLE_ELEMENT_KEYS) {
		if (key === "inline") continue;
		const light = filterProps(key, resolveProps(set, key, "light"));
		const darkRaw = filterProps(key, resolveProps(set, key, "dark"));
		const modes: [Mode, StyleProps][] = [["light", light]];
		if (!sameProps(light, darkRaw)) modes.push(["dark", darkRaw]);
		const S = selectorsFor(key, opts);

		for (const [mode, p] of modes) {
			if (!Object.keys(p).length) {
				if (mode === "dark") {
					// 暗色把明色的设置"撤回"到主题：没有办法表达"主题值"，退而用 inherit/unset 不可靠，这里不输出
				}
				continue;
			}
			const fam = familyName(p, set.options.cjkPunctuation);
			if ((p.fontFamilyLatin || p.fontFamilyCJK) && !seenFamilies.has(fam)) {
				seenFamilies.add(fam);
				out.faces.push(...fontFaceRules({ family: fam, latin: p.fontFamilyLatin, cjk: p.fontFamilyCJK, cjkPunct: set.options.cjkPunctuation, faces: data.fontFaces }));
			}

			if (key === "code") {
				const famDecl = decls(key, p, fam, "edit").filter(([k]) => k === "font-family");
				out.rules.push(rule(themed(sc([...S.read, ...S.edit]), mode), famDecl, important));
				if (p.fontSize !== undefined) {
					const size: Decl[] = [["font-size", fontSizeCss(p.fontSize)]];
					out.rules.push(rule(themed(sc([".markdown-rendered pre", ".markdown-source-view.mod-cm6 .HyperMD-codeblock"]), mode), size, important));
					out.rules.push(rule(themed(sc([".markdown-rendered pre code"]), mode), [["font-size", "inherit"]], important));
				}
				if (mode === "light") {
					out.print.push(rule(scPrint(S.print), famDecl, important));
					if (p.fontSize !== undefined) out.print.push(rule(scPrint(["pre"]), [["font-size", fontSizeCss(p.fontSize)]], important));
				}
				continue;
			}

			const block = decls(key, p, fam, "block");
			const edit = decls(key, p, fam, "edit");
			const inner = innerDecls(block);
			out.rules.push(rule(themed(sc(S.read), mode), block, important));
			if (S.readInner.length) out.rules.push(rule(themed(sc(S.readInner), mode), inner, important));
			out.rules.push(rule(themed(sc(S.edit), mode), edit, important));
			if (S.editInner.length) out.rules.push(rule(themed(sc(S.editInner), mode), innerDecls(edit), important));
			if (S.editSpacing.length) out.rules.push(rule(themed(sc(S.editSpacing), mode), decls(key, p, fam, "spacing"), important));
			if (mode === "light") {
				out.print.push(rule(scPrint(S.print), block, important));
				if (S.printInner.length) out.print.push(rule(scPrint(S.printInner), inner, important));
			}
		}
	}

	// 首行缩进的段内换行补偿（<br> 之后插入的占位 span）
	for (const mode of ["light", "dark"] as Mode[]) {
		const p = resolveProps(set, "p", mode);
		if (mode === "dark" && sameProps(p, resolveProps(set, "p", "light"))) continue;
		if (typeof p.firstLineIndent === "number") {
			out.rules.push(rule(themed(sc([`.markdown-rendered .${INDENT_CLASS}`]), mode), [["width", `${round(p.firstLineIndent, 2)}em`]], important));
		}
	}

	// 变量类：加粗 / 链接颜色、正文宽度
	const varScope = (mode: Mode): string[] => {
		if (scopeCls) {
			return mode === "dark"
				? [`body.theme-dark .${scopeCls}`, `.${PREVIEW_CLASS}.${FORCE_DARK} .${scopeCls}`]
				: [`.${scopeCls}`, `.${PREVIEW_CLASS}.${FORCE_LIGHT} .${scopeCls}`];
		}
		return mode === "dark" ? ["body.theme-dark", `.${PREVIEW_CLASS}.${FORCE_DARK}`] : ["body", `.${PREVIEW_CLASS}.${FORCE_LIGHT}`];
	};
	const inlineLight = set.elements.inline.light;
	const inlineDark = set.elements.inline.separate ? set.elements.inline.dark : inlineLight;
	for (const [mode, p] of [["light", inlineLight], ["dark", inlineDark]] as [Mode, StyleProps][]) {
		if (mode === "dark" && !set.elements.inline.separate) continue;
		const v: Decl[] = [];
		if (p.boldColor) v.push(["--bold-color", p.boldColor]);
		if (p.linkColor) v.push(["--link-color", p.linkColor], ["--link-color-hover", p.linkColor], ["--link-external-color", p.linkColor], ["--link-external-color-hover", p.linkColor]);
		if (v.length) out.rules.push(rule(varScope(mode), v, important));
	}
	if (set.options.contentWidth) {
		// "每行字数"按正文字号计算：28 字 × 三号（16 磅）= 28 × 16/12 个基准字宽
		const body = resolveProps(set, "p", "light");
		const k = set.options.contentWidth * ((body.fontSize ?? 12) / 12) * (1 + (body.letterSpacing ?? 0));
		out.rules.push(rule(varScope("light"), [["--file-line-width", `calc(var(--font-text-size) * ${round(k, 3)})`]], important));
	}
	return out;
}

/* ----------------------------- 入口 ----------------------------- */

export function generateCss(data: PluginData, options: GenerateOptions = {}): string {
	const important = !(options.reducePriority ?? data.reducePriority);
	const faces: string[] = [];
	const rules: string[] = [];
	const print: string[] = [];
	const seenFamilies = new Set<string>();
	const ordered = [...data.sets].sort((a, b) => Number(b.id === data.activeSetId) - Number(a.id === data.activeSetId));
	ordered.forEach((set) => {
		const isActive = set.id === data.activeSetId;
		const r = generateSet(set, isActive ? null : set.cssClass, data, important, seenFamilies);
		// 当前样式集在前，按笔记生效的样式集在后（选择器多一个类，优先级更高）
		faces.push(...r.faces);
		rules.push(...r.rules);
		print.push(...r.print);
	});
	const parts: string[] = [];
	const f = faces.filter(Boolean);
	const r = rules.filter(Boolean);
	const p = print.filter(Boolean);
	if (f.length) parts.push("/* 中英文分字体（自动生成） */\n" + f.join("\n"));
	if (r.length) parts.push(r.join("\n\n"));
	if (p.length) parts.push("@media print {\n" + p.join("\n\n").split("\n").map((l) => (l ? "\t" + l : l)).join("\n") + "\n}");
	return parts.join("\n\n");
}

/** 是否有任何样式集用到首行缩进（决定是否运行段内换行补偿） */
export function anyIndent(data: PluginData): boolean {
	return data.sets.some((s) => ["light", "dark"].some((m) => typeof resolveProps(s, "p", m as Mode).firstLineIndent === "number"));
}

export { isHeading };
