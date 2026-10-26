/* ==========================================================================
   单位换算 —— 读取（主题像素 → 界面值）与写出（界面值 → CSS）用同一套互逆公式
   基准：12 磅 = Obsidian 正文字号（--font-text-size，默认 16px）
   ========================================================================== */

export const BASE_PT = 12;

export function round(n: number, digits = 2): number {
	const p = Math.pow(10, digits);
	return Math.round(n * p) / p;
}

/* ---------- 写出 ---------- */

/** 字号：相对正文基准的绝对值，不受父元素影响，嵌套不会叠乘 */
export function fontSizeCss(pt: number): string {
	return `calc(var(--font-text-size) * ${round(pt / BASE_PT, 4)})`;
}

/** 固定行距（磅）同样以正文基准换算 */
export function fixedLineHeightCss(pt: number): string {
	return `calc(var(--font-text-size) * ${round(pt / BASE_PT, 4)})`;
}

/** 段前 / 段后：以"行"为单位，一行 = 该元素的行高 */
export function spacingCss(lines: number, lh: { multiple?: number; fixedPt?: number }): string {
	if (lines === 0) return "0";
	if (lh.fixedPt !== undefined) return `calc(var(--font-text-size) * ${round((lines * lh.fixedPt) / BASE_PT, 4)})`;
	const m = lh.multiple ?? 1.5;
	return `${round(lines * m, 4)}em`;
}

/* ---------- 读取 ---------- */

export function pxToPt(px: number, basePx: number): number {
	if (!basePx) basePx = 16;
	return round((px / basePx) * BASE_PT, 1);
}

export function ptToPx(pt: number, basePx: number): number {
	return (pt / BASE_PT) * basePx;
}

/** 行距：行高像素 / 字号像素 = 倍数 */
export function lineHeightFromPx(lineHeightPx: number, fontSizePx: number): number {
	if (!fontSizePx) return 1.5;
	return round(lineHeightPx / fontSizePx, 2);
}

/** 段距：外边距像素 / 行高像素 = 行数 */
export function spacingLinesFromPx(marginPx: number, lineHeightPx: number): number {
	if (!lineHeightPx) return 0;
	return round(marginPx / lineHeightPx, 2);
}

export function emFromPx(px: number, fontSizePx: number, digits = 2): number {
	if (!fontSizePx) return 0;
	return round(px / fontSizePx, digits);
}

/** 600 及以上视为加粗 */
export function weightFromComputed(w: string): "400" | "700" {
	const n = Number(w);
	if (Number.isFinite(n)) return n >= 600 ? "700" : "400";
	return w === "bold" || w === "bolder" ? "700" : "400";
}

/* ---------- 颜色 ---------- */

export function rgbToHex(s: string): string | null {
	const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
	if (!m) return null;
	const h = (v: string) => Math.max(0, Math.min(255, Math.round(parseFloat(v)))).toString(16).padStart(2, "0");
	return ("#" + h(m[1]) + h(m[2]) + h(m[3])).toUpperCase();
}

export function toRgb(c: string): [number, number, number] | null {
	const s = c.trim();
	const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hex) {
		let h = hex[1];
		if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
		return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
	}
	const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
	if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
	return null;
}

function luminance([r, g, b]: [number, number, number]): number {
	const f = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number | null {
	const x = toRgb(a);
	const y = toRgb(b);
	if (!x || !y) return null;
	const l1 = luminance(x);
	const l2 = luminance(y);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
