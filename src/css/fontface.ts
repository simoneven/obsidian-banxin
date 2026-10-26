/* ==========================================================================
   中英文分字体：用 @font-face + unicode-range 合成一个字体族
   - 400 / 700 各一个字面，加粗时调用真正的粗体（v0.1 只有常规字面 → 假粗体）
   - local() 优先使用 queryLocalFonts 读到的精确全名 / PostScript 名
   - 可选：中文引号、破折号、省略号交给中文字体（全角字形）
   ========================================================================== */

import { fontNameVariants } from "../constants";
import { FaceNames } from "../schema";

const LATIN_BASE = ["U+0000-024F", "U+1E00-1EFF", "U+20A0-20CF", "U+2100-214F", "U+2190-21FF"];
/** 通用标点区：U+2000-206F */
const GENERAL_PUNCT_ALL = ["U+2000-206F"];
/** 去掉 — ― ‘ ’ “ ” … 之后的通用标点区 */
const GENERAL_PUNCT_LATIN = ["U+2000-2013", "U+2016-2017", "U+201A-201B", "U+201E-2025", "U+2027-206F"];
/** 交给中文字体的标点 */
const CJK_PUNCT = ["U+2014-2015", "U+2018-2019", "U+201C-201D", "U+2026"];
const CJK_BASE = [
	"U+2E80-2EFF", "U+3000-303F", "U+3040-30FF", "U+3100-312F", "U+31C0-31EF", "U+3200-32FF", "U+3300-33FF",
	"U+3400-4DBF", "U+4E00-9FFF", "U+F900-FAFF", "U+FE30-FE4F", "U+FF00-FFEF", "U+20000-2A6DF",
];

export function latinRange(cjkPunct: boolean): string {
	return [...LATIN_BASE, ...(cjkPunct ? GENERAL_PUNCT_LATIN : GENERAL_PUNCT_ALL)].join(", ");
}

export function cjkRange(cjkPunct: boolean): string {
	return [...CJK_BASE, ...(cjkPunct ? CJK_PUNCT : [])].join(", ");
}

function uniq(a: string[]): string[] {
	return Array.from(new Set(a.filter(Boolean)));
}

/** 常规字面的 local() 名单 */
export function regularNames(name: string, faces?: FaceNames): string[] {
	return uniq([...(faces?.regular ?? []), ...fontNameVariants(name)]);
}

/** 粗体字面的 local() 名单：精确名优先，再用"名称 + Bold"的常见写法兜底 */
export function boldNames(name: string, faces?: FaceNames): string[] {
	const guesses: string[] = [];
	for (const v of fontNameVariants(name)) {
		if (/[一-龥]/.test(v)) continue;
		guesses.push(`${v} Bold`, `${v.replace(/\s+/g, "")}-Bold`);
	}
	return uniq([...(faces?.bold ?? []), ...guesses]);
}

function src(names: string[]): string {
	return names.map((n) => `local("${n}")`).join(", ");
}

export interface FaceInput {
	family: string;
	latin?: string;
	cjk?: string;
	cjkPunct: boolean;
	faces: Record<string, FaceNames>;
}

export function fontFaceRules(input: FaceInput): string[] {
	const out: string[] = [];
	const { family, latin, cjk, cjkPunct, faces } = input;
	const emit = (name: string, range: string) => {
		const reg = regularNames(name, faces[name]);
		const bold = boldNames(name, faces[name]);
		out.push(`@font-face { font-family: "${family}"; font-weight: 400; src: ${src(reg)}; unicode-range: ${range}; }`);
		if (bold.length) out.push(`@font-face { font-family: "${family}"; font-weight: 700; src: ${src(bold)}; unicode-range: ${range}; }`);
	};
	if (latin) emit(latin, latinRange(cjkPunct));
	if (cjk) emit(cjk, cjkRange(cjkPunct));
	return out;
}
