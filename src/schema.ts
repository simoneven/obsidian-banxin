/* ==========================================================================
   数据结构、默认值、清洗与版本迁移
   v1（0.1.x）：单一样式集，elements 只有 9 个，段间距为一个值
   v3（0.4.x）：多样式集 + 全局层 + 段前/段后 + 固定行距 + 选项
   ========================================================================== */

import { ALL_PROPS, ELEMENT_KEYS, ElementKey, PropKey } from "./constants";

export const SCHEMA_VERSION = 3;

export type FontWeight = "400" | "700";
export type TextAlign = "left" | "center" | "right" | "justify";

export interface StyleProps {
	fontFamilyCJK?: string;
	fontFamilyLatin?: string;
	/** 磅；12 磅 = Obsidian 正文字号 */
	fontSize?: number;
	fontWeight?: FontWeight;
	fontStyle?: "italic" | "normal";
	color?: string;
	textAlign?: TextAlign;
	/** 倍数行距 */
	lineHeight?: number;
	/** 固定行距（磅）；与 lineHeight 二选一 */
	lineHeightPt?: number;
	/** 段前（行） */
	spaceBefore?: number;
	/** 段后（行） */
	spaceAfter?: number;
	/** 首行缩进（字符）；0 = 显式不缩进 */
	firstLineIndent?: number;
	/** 字间距（em） */
	letterSpacing?: number;
	linkColor?: string;
	boldColor?: string;
}

export interface ElementStyle {
	separate: boolean;
	light: StyleProps;
	dark: StyleProps;
}

export type NumberingStyle = "none" | "gongwen" | "thesis";

export interface SetOptions {
	/** 中文引号、破折号、省略号用中文字体 */
	cjkPunctuation: boolean;
	/** 标题 1 的样式同时作用于文件名标题 */
	h1InlineTitle: boolean;
	/** 正文宽度（字数），null = 跟随主题 */
	contentWidth: number | null;
	numbering: { style: NumberingStyle; startLevel: number };
}

export interface StyleSet {
	id: string;
	name: string;
	/** 按笔记套用时写进 frontmatter cssclasses 的类名 */
	cssClass: string;
	elements: Record<ElementKey, ElementStyle>;
	options: SetOptions;
}

export interface FaceNames { regular: string[]; bold: string[] }

export interface PluginData {
	schemaVersion: number;
	activeSetId: string;
	sets: StyleSet[];
	/** 不输出 !important */
	reducePriority: boolean;
	onboarded: boolean;
	firstChangeTipShown: boolean;
	/** 已知字体的精确字面名（来自 queryLocalFonts），用于生成 local() */
	fontFaces: Record<string, FaceNames>;
	recentFonts: string[];
}

/* ----------------------------- 默认值 ----------------------------- */

export function emptyElement(): ElementStyle {
	return { separate: false, light: {}, dark: {} };
}

export function defaultOptions(): SetOptions {
	return { cjkPunctuation: true, h1InlineTitle: true, contentWidth: null, numbering: { style: "none", startLevel: 2 } };
}

export function emptyElements(): Record<ElementKey, ElementStyle> {
	const out = {} as Record<ElementKey, ElementStyle>;
	for (const k of ELEMENT_KEYS) out[k] = emptyElement();
	return out;
}

let idSeq = 0;
export function newId(): string {
	idSeq = (idSeq + 1) % 1000;
	return Date.now().toString(36) + idSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

export function cssClassFor(id: string): string {
	return "ds-" + id.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function newStyleSet(name: string): StyleSet {
	const id = newId();
	return { id, name, cssClass: cssClassFor(id), elements: emptyElements(), options: defaultOptions() };
}

export function defaultData(): PluginData {
	const set = newStyleSet("我的样式");
	return {
		schemaVersion: SCHEMA_VERSION,
		activeSetId: set.id,
		sets: [set],
		reducePriority: false,
		onboarded: false,
		firstChangeTipShown: false,
		fontFaces: {},
		recentFonts: [],
	};
}

/* ----------------------------- 清洗 ----------------------------- */

const RANGES: Partial<Record<PropKey, [number, number]>> = {
	fontSize: [6, 72],
	lineHeight: [1, 3],
	lineHeightPt: [6, 72],
	spaceBefore: [0, 5],
	spaceAfter: [0, 5],
	firstLineIndent: [0, 4],
	letterSpacing: [0, 0.3],
};
const ENUMS: Partial<Record<PropKey, string[]>> = {
	fontWeight: ["400", "700"],
	fontStyle: ["italic", "normal"],
	textAlign: ["left", "center", "right", "justify"],
};
const WEIGHT_MAP: Record<string, string> = { "100": "400", "200": "400", "300": "400", "500": "400", "600": "700", "800": "700", "900": "700" };
const COLOR_PROPS: PropKey[] = ["color", "linkColor", "boldColor"];
const FONT_PROPS: PropKey[] = ["fontFamilyCJK", "fontFamilyLatin"];

export function isObj(v: unknown): v is Record<string, any> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 字体名：只允许常见字符，去掉引号、分号、花括号等可注入 CSS 的字符 */
export function cleanFontName(v: unknown): string | null {
	if (typeof v !== "string") return null;
	const s = v.replace(/["'\\;{}<>]/g, "").trim();
	if (!s || s.length > 64) return null;
	if (!/^[\w\u4e00-\u9fa5\u3400-\u4dbf][\w \u4e00-\u9fa5\u3400-\u4dbf\-.,+()（）_]*$/.test(s)) return null;
	return s;
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 颜色：HEX、rgb()/hsl()、或主题变量 var(--xxx) */
export function cleanColor(v: unknown): string | null {
	if (typeof v !== "string") return null;
	const s = v.trim();
	if (!s || s.length > 64) return null;
	if (/[;{}<>]/.test(s) || /url\s*\(|expression\s*\(|javascript:|@import/i.test(s)) return null;
	if (HEX.test(s)) return normalizeHex(s);
	if (/^var\(--[a-z0-9-]+\)$/i.test(s)) return s;
	if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/]+\)$/i.test(s)) return s;
	return null;
}

export function normalizeHex(s: string): string {
	const e = s.trim();
	if (!HEX.test(e)) return e;
	return (e.length === 4 ? "#" + e[1] + e[1] + e[2] + e[2] + e[3] + e[3] : e).toUpperCase();
}

export function cleanProps(raw: unknown): StyleProps {
	const out: Record<string, unknown> = {};
	if (!isObj(raw)) return out as StyleProps;
	for (const key of ALL_PROPS) {
		const v = raw[key];
		if (v === undefined || v === null || v === "") continue;
		const range = RANGES[key];
		if (range) {
			const n = typeof v === "number" ? v : Number(v);
			if (Number.isFinite(n) && n >= range[0] && n <= range[1]) out[key] = Math.round(n * 1000) / 1000;
			continue;
		}
		const en = ENUMS[key];
		if (en) {
			let s = String(v);
			if (key === "fontWeight") s = WEIGHT_MAP[s] ?? s;
			if (en.includes(s)) out[key] = s;
			continue;
		}
		if (COLOR_PROPS.includes(key)) {
			const c = cleanColor(v);
			if (c) out[key] = c;
			continue;
		}
		if (FONT_PROPS.includes(key)) {
			const f = cleanFontName(v);
			if (f) out[key] = f;
		}
	}
	// 倍数与固定值二选一：固定值优先
	if (out.lineHeightPt !== undefined) delete out.lineHeight;
	return out as StyleProps;
}

function cleanElement(raw: unknown): ElementStyle {
	const e = emptyElement();
	if (!isObj(raw)) return e;
	e.separate = raw.separate === true;
	e.light = cleanProps(raw.light);
	e.dark = e.separate ? cleanProps(raw.dark) : {};
	return e;
}

function cleanOptions(raw: unknown): SetOptions {
	const o = defaultOptions();
	if (!isObj(raw)) return o;
	if (typeof raw.cjkPunctuation === "boolean") o.cjkPunctuation = raw.cjkPunctuation;
	if (typeof raw.h1InlineTitle === "boolean") o.h1InlineTitle = raw.h1InlineTitle;
	const w = Number(raw.contentWidth);
	if (raw.contentWidth !== null && raw.contentWidth !== undefined && Number.isFinite(w) && w >= 20 && w <= 80) o.contentWidth = Math.round(w);
	if (isObj(raw.numbering)) {
		const st = raw.numbering.style;
		if (st === "none" || st === "gongwen" || st === "thesis") o.numbering.style = st;
		const lv = Number(raw.numbering.startLevel);
		if (Number.isInteger(lv) && lv >= 1 && lv <= 3) o.numbering.startLevel = lv;
	}
	return o;
}

export function cleanStyleSet(raw: unknown, fallbackName = "导入的样式"): StyleSet {
	const s = newStyleSet(fallbackName);
	if (!isObj(raw)) return s;
	if (typeof raw.id === "string" && /^[a-z0-9]{4,32}$/i.test(raw.id)) {
		s.id = raw.id;
		s.cssClass = cssClassFor(raw.id);
	}
	if (typeof raw.name === "string" && raw.name.trim()) s.name = raw.name.trim().slice(0, 40);
	if (typeof raw.cssClass === "string" && /^[a-z][a-z0-9-]{1,40}$/.test(raw.cssClass)) s.cssClass = raw.cssClass;
	const els = isObj(raw.elements) ? raw.elements : {};
	for (const k of ELEMENT_KEYS) s.elements[k] = cleanElement(els[k]);
	s.options = cleanOptions(raw.options);
	return s;
}

/* ----------------------------- 迁移 ----------------------------- */

/** 0.1.x 的单元素数据：paragraphSpacing（行，上下各一半）→ spaceBefore / spaceAfter */
function migrateV1Props(raw: unknown): unknown {
	if (!isObj(raw)) return raw;
	const out: Record<string, unknown> = { ...raw };
	const ps = Number(raw.paragraphSpacing);
	if (raw.paragraphSpacing !== undefined && Number.isFinite(ps)) {
		out.spaceBefore = ps / 2;
		out.spaceAfter = ps / 2;
	}
	delete out.paragraphSpacing;
	return out;
}

function migrateV1(raw: Record<string, any>): Record<string, any> {
	const set: Record<string, any> = {
		name: typeof raw.name === "string" ? raw.name : "我的样式",
		elements: {},
		options: {},
	};
	const els = isObj(raw.elements) ? raw.elements : {};
	for (const k of Object.keys(els)) {
		const e = els[k];
		if (!isObj(e)) continue;
		set.elements[k] = { separate: e.separate, light: migrateV1Props(e.light), dark: migrateV1Props(e.dark) };
	}
	return { schemaVersion: SCHEMA_VERSION, reducePriority: raw.reducePriority === true, sets: [set], onboarded: true };
}

/** 读入任意版本的数据，返回干净的当前版本数据 */
export function loadData(raw: unknown): PluginData {
	const d = defaultData();
	if (!isObj(raw)) return d;
	let src: Record<string, any> = raw;
	const ver = Number(raw.schemaVersion) || 1;
	if (ver < 2 || !Array.isArray(raw.sets)) src = migrateV1(raw);

	const sets: StyleSet[] = [];
	const seen = new Set<string>();
	for (const r of Array.isArray(src.sets) ? src.sets : []) {
		const s = cleanStyleSet(r);
		if (seen.has(s.id)) {
			s.id = newId();
			s.cssClass = cssClassFor(s.id);
		}
		seen.add(s.id);
		sets.push(s);
	}
	if (sets.length) d.sets = sets;
	d.activeSetId = typeof src.activeSetId === "string" && d.sets.some((s) => s.id === src.activeSetId) ? src.activeSetId : d.sets[0].id;
	d.reducePriority = src.reducePriority === true;
	d.onboarded = src.onboarded === true;
	d.firstChangeTipShown = src.firstChangeTipShown === true;
	if (isObj(src.fontFaces)) {
		for (const [fam, f] of Object.entries(src.fontFaces)) {
			const name = cleanFontName(fam);
			if (!name || !isObj(f)) continue;
			const pick = (a: unknown) => (Array.isArray(a) ? a.map(cleanFontName).filter((x): x is string => !!x).slice(0, 6) : []);
			d.fontFaces[name] = { regular: pick(f.regular), bold: pick(f.bold) };
		}
	}
	if (Array.isArray(src.recentFonts)) d.recentFonts = src.recentFonts.map(cleanFontName).filter((x: string | null): x is string => !!x).slice(0, 8);
	return d;
}

export function activeSet(d: PluginData): StyleSet {
	return d.sets.find((s) => s.id === d.activeSetId) ?? d.sets[0];
}

export function hasAnyValue(p: StyleProps): boolean {
	return Object.values(p).some((v) => v !== undefined && v !== null && v !== "");
}

export function isElementCustomized(e: ElementStyle): boolean {
	return hasAnyValue(e.light) || (e.separate && hasAnyValue(e.dark));
}

export function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

/** 导出给用户的 JSON（不含内部 id，以免在别的库里冲突） */
export function exportSetJson(s: StyleSet): string {
	return JSON.stringify({ format: "doc-style-set", version: SCHEMA_VERSION, name: s.name, elements: s.elements, options: s.options }, null, 2);
}

export function importSetJson(text: string): StyleSet {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("不是有效的 JSON 文件");
	}
	if (!isObj(raw) || (raw.format !== "doc-style-set" && !isObj(raw.elements))) throw new Error("文件里没有找到样式集数据");
	const { id: _ignore, ...rest } = raw as Record<string, unknown>;
	const s = cleanStyleSet(rest, typeof raw.name === "string" ? raw.name : "导入的样式");
	return s;
}
