/* ==========================================================================
   标题自动编号（只在显示层生成，不改 Markdown 原文）
   公文式：一、 （一） 1. （1）
   论文式：1  1.1  1.1.1 …
   ========================================================================== */

import { NumberingStyle } from "./schema";

const DIGITS = "零一二三四五六七八九";

export function chineseNumber(n: number): string {
	if (n <= 0) return String(n);
	if (n < 10) return DIGITS[n];
	if (n < 20) return "十" + (n % 10 ? DIGITS[n % 10] : "");
	if (n < 100) return DIGITS[Math.floor(n / 10)] + "十" + (n % 10 ? DIGITS[n % 10] : "");
	return String(n);
}

export function formatNumber(style: NumberingStyle, depth: number, counters: number[]): string {
	if (style === "gongwen") {
		const n = counters[depth];
		switch (depth) {
			case 0: return `${chineseNumber(n)}、`;
			case 1: return `（${chineseNumber(n)}）`;
			case 2: return `${n}. `;
			case 3: return `（${n}）`;
			default: return "";
		}
	}
	if (style === "thesis") return counters.slice(0, depth + 1).join(".") + " ";
	return "";
}

/** 有编号的最深层数 */
export function maxDepth(style: NumberingStyle): number {
	return style === "gongwen" ? 4 : style === "thesis" ? 6 : 0;
}

export interface HeadingLine {
	/** 0 起的行号 */
	line: number;
	level: number;
}

/** 从 Markdown 文本中找出标题行（跳过 frontmatter 与代码块） */
export function scanHeadings(lines: string[]): HeadingLine[] {
	const out: HeadingLine[] = [];
	let i = 0;
	if (lines[0]?.trim() === "---") {
		for (i = 1; i < lines.length; i++) if (/^(---|\.\.\.)\s*$/.test(lines[i])) { i++; break; }
		if (i >= lines.length) i = 0;
	}
	let fence: string | null = null;
	for (; i < lines.length; i++) {
		const t = lines[i];
		const f = t.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (f) {
			if (!fence) fence = f[1][0];
			else if (f[1][0] === fence) fence = null;
			continue;
		}
		if (fence) continue;
		const m = t.match(/^\s{0,3}(#{1,6})\s+\S/);
		if (m) out.push({ line: i, level: m[1].length });
	}
	return out;
}

/** 计算每个标题行的编号文本 */
export function computeNumbers(headings: HeadingLine[], style: NumberingStyle, startLevel: number): Map<number, string> {
	const res = new Map<number, string>();
	if (style === "none") return res;
	const depthMax = maxDepth(style);
	const counters: number[] = [];
	for (const h of headings) {
		if (h.level < startLevel) {
			counters.length = 0;
			continue;
		}
		const depth = h.level - startLevel;
		if (depth >= depthMax) continue;
		// 跳级（如 ## 后直接 ####）时，中间层按 1 补齐
		for (let d = 0; d < depth; d++) if (!counters[d]) counters[d] = 1;
		counters[depth] = (counters[depth] ?? 0) + 1;
		counters.length = depth + 1;
		const text = formatNumber(style, depth, counters);
		if (text) res.set(h.line, text);
	}
	return res;
}

export function numbersForText(text: string, style: NumberingStyle, startLevel: number): Map<number, string> {
	return computeNumbers(scanHeadings(text.split("\n")), style, startLevel);
}
