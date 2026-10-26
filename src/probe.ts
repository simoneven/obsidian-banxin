/* ==========================================================================
   读取主题的实际取值（用于界面上显示"跟随主题"时的值）
   不依赖页面上恰好打开的笔记：在隐藏容器里渲染一份样稿，
   测量时临时停用插件自己的样式，保证读到的是主题值。
   ========================================================================== */

import { ElementKey, looksCJKFont, displayFontName, STYLE_EL_ID } from "./constants";
import { StyleProps } from "./schema";
import { emFromPx, lineHeightFromPx, pxToPt, rgbToHex, spacingLinesFromPx, weightFromComputed } from "./units";

export interface ThemeValues {
	basePx: number;
	background: string;
	elements: Partial<Record<ElementKey, StyleProps>>;
	/** 另一种明暗模式下的背景色（用于对比度检查） */
	otherBackground: string;
	isDark: boolean;
}

const GENERIC = /^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-\w+|inherit|initial|unset|revert|-apple-system|BlinkMacSystemFont|emoji|math)$/i;

export function parseFamilies(v: string): string[] {
	return v
		.split(",")
		.map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
		.filter((s) => s && !GENERIC.test(s) && !s.startsWith("var(") && !/^DocStyleFont_/i.test(s) && !/emoji/i.test(s));
}

function isMac(): boolean {
	return /Mac/i.test(navigator.platform || navigator.userAgent);
}

export function defaultCJKFont(): string {
	return isMac() ? "苹方-简" : "微软雅黑";
}
export function defaultLatinFont(): string {
	return isMac() ? "Helvetica Neue" : "Segoe UI";
}

/** 用 DOM API 搭一份最小样稿（不用 innerHTML） */
function buildSample(view: HTMLElement) {
	for (let i = 1; i <= 6; i++) view.createEl(("h" + i) as keyof HTMLElementTagNameMap, { text: "H" });
	view.createEl("p", { text: "P", attr: { "data-k": "p" } });
	view.createEl("ul").createEl("li", { text: "L" });
	view.createEl("blockquote").createEl("p", { text: "Q" });
	view.createEl("table").createEl("tbody").createEl("tr").createEl("td", { text: "T" });
	view.createDiv({ cls: "callout" }).createDiv({ cls: "callout-content" }).createEl("p", { text: "C" });
	view.createEl("pre").createEl("code", { text: "c" });
	const last = view.createEl("p");
	last.createEl("strong", { text: "B" });
	last.createEl("a", { cls: "internal-link", text: "A", href: "#" });
}

function read(el: Element | null, basePx: number, key: ElementKey): StyleProps {
	if (!el) return {};
	const cs = getComputedStyle(el);
	const fs = parseFloat(cs.fontSize) || basePx;
	const lhPx = parseFloat(cs.lineHeight);
	const lh = Number.isFinite(lhPx) ? lineHeightFromPx(lhPx, fs) : 1.5;
	const fams = parseFamilies(cs.fontFamily);
	const out: StyleProps = {
		fontSize: pxToPt(fs, basePx),
		fontWeight: weightFromComputed(cs.fontWeight),
		fontStyle: cs.fontStyle === "italic" ? "italic" : "normal",
		color: rgbToHex(cs.color) ?? undefined,
		textAlign: (["left", "center", "right", "justify"].includes(cs.textAlign) ? cs.textAlign : "left") as StyleProps["textAlign"],
		lineHeight: lh,
		spaceBefore: spacingLinesFromPx(parseFloat(cs.marginTop) || 0, Number.isFinite(lhPx) ? lhPx : fs * lh),
		spaceAfter: spacingLinesFromPx(parseFloat(cs.marginBottom) || 0, Number.isFinite(lhPx) ? lhPx : fs * lh),
		firstLineIndent: emFromPx(parseFloat(cs.textIndent) || 0, fs),
		letterSpacing: cs.letterSpacing === "normal" ? 0 : emFromPx(parseFloat(cs.letterSpacing) || 0, fs, 3),
	};
	const cjk = fams.find(looksCJKFont);
	const latin = fams.find((f) => !looksCJKFont(f));
	out.fontFamilyCJK = cjk ? displayFontName(cjk) : key === "code" ? undefined : defaultCJKFont();
	out.fontFamilyLatin = latin ? displayFontName(latin) : defaultLatinFont();
	return out;
}

function cssVar(el: Element, name: string): string {
	return getComputedStyle(el).getPropertyValue(name).trim();
}

function toHex(c: string): string {
	if (!c) return "";
	if (c.startsWith("#")) return c.toUpperCase();
	return rgbToHex(c) ?? c;
}

let cached: ThemeValues | null = null;

export function invalidateProbe() {
	cached = null;
}

export function probeTheme(): ThemeValues {
	if (cached) return cached;
	const ours = document.getElementById(STYLE_EL_ID) as HTMLStyleElement | null;
	const prevMedia = ours?.media ?? "";
	if (ours) ours.media = "not all";
	const host = document.body.createDiv();
	host.addClass("doc-style-probe");
	host.setAttr("aria-hidden", "true");
	const view = host.createDiv({ cls: "markdown-preview-view markdown-rendered" });
	buildSample(view);
	try {
		const basePx = parseFloat(cssVar(document.body, "--font-text-size")) || parseFloat(getComputedStyle(view).fontSize) || 16;
		const els: Partial<Record<ElementKey, StyleProps>> = {};
		for (let i = 1; i <= 6; i++) els[("h" + i) as ElementKey] = read(view.querySelector("h" + i), basePx, "h" + i as ElementKey);
		els.p = read(view.querySelector('p[data-k="p"]'), basePx, "p");
		els.list = read(view.querySelector("li"), basePx, "list");
		els.blockquote = read(view.querySelector("blockquote"), basePx, "blockquote");
		els.table = read(view.querySelector("table"), basePx, "table");
		els.callout = read(view.querySelector(".callout"), basePx, "callout");
		els.code = read(view.querySelector("pre"), basePx, "code");
		els.global = { ...els.p, fontSize: undefined };
		const strong = view.querySelector("strong");
		const link = view.querySelector("a");
		els.inline = {
			boldColor: strong ? rgbToHex(getComputedStyle(strong).color) ?? undefined : undefined,
			linkColor: link ? rgbToHex(getComputedStyle(link).color) ?? undefined : undefined,
		};
		const isDark = document.body.hasClass("theme-dark");
		const background = toHex(cssVar(document.body, "--background-primary")) || (isDark ? "#1E1E1E" : "#FFFFFF");
		// 另一种模式的背景：在带 theme-light / theme-dark 类的元素上读取主题变量
		const other = host.createDiv({ cls: isDark ? "theme-light" : "theme-dark" });
		const otherBg = toHex(cssVar(other, "--background-primary"));
		const otherBackground = otherBg && otherBg !== background ? otherBg : isDark ? "#FFFFFF" : "#1E1E1E";
		cached = { basePx, background, otherBackground, elements: els, isDark };
		return cached;
	} finally {
		host.remove();
		if (ours) ours.media = prevMedia;
	}
}

export function themeValue(key: ElementKey, prop: keyof StyleProps): unknown {
	const t = probeTheme();
	return t.elements[key]?.[prop];
}
