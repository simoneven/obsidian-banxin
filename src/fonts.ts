/* ==========================================================================
   字体服务：读取本机字体列表、记录精确字面名、判断字体是否已安装
   ========================================================================== */

import { displayFontName, fontNameVariants, looksCJKFont } from "./constants";
import { FaceNames } from "./schema";

export interface FontEntry {
	/** 显示名（有中文名时用中文名） */
	name: string;
	/** 系统里的族名 */
	family: string;
	cjk: boolean;
	faces: FaceNames;
}

const JUNK = /^(Wingdings|Webdings|Symbol|Marlett|Bookshelf Symbol|MS Reference|MT Extra|Segoe MDL2 Assets|Segoe Fluent Icons|Segoe UI Emoji|Segoe UI Symbol|Segoe UI Historic|HoloLens MDL2 Assets|SimSun-ExtB|SimSun-ExtG|MingLiU-ExtB|PMingLiU-ExtB|MingLiU_HKSCS-ExtB|Terminal|Fixedsys|Modern|Roman|Script|Small Fonts|System|Apple Color Emoji|Noto Color Emoji)$/i;
const REGULAR = /^(regular|normal|book|roman|medium|w3|w4|light)$/i;
const BOLD = /^(bold|w6|w7|semibold|demibold|heavy)$/i;

interface RawFace {
	family: string;
	fullName?: string;
	postscriptName?: string;
	style?: string;
}

let cache: FontEntry[] | null = null;
let pending: Promise<FontEntry[]> | null = null;

async function queryFaces(): Promise<RawFace[]> {
	const w = window as unknown as { queryLocalFonts?: () => Promise<RawFace[]> };
	if (typeof w.queryLocalFonts !== "function") return [];
	try {
		const faces = await w.queryLocalFonts();
		return Array.isArray(faces) ? faces : [];
	} catch (e) {
		console.warn("[版心] 读取本机字体失败", e);
		return [];
	}
}

function group(raw: RawFace[]): FontEntry[] {
	const map = new Map<string, { family: string; reg: RawFace[]; bold: RawFace[]; all: RawFace[] }>();
	for (const f of raw) {
		const family = (f.family ?? "").trim();
		if (!family || family.startsWith("@") || JUNK.test(family)) continue;
		let g = map.get(family);
		if (!g) map.set(family, (g = { family, reg: [], bold: [], all: [] }));
		g.all.push(f);
		const st = (f.style ?? "").trim();
		if (REGULAR.test(st)) g.reg.push(f);
		else if (BOLD.test(st)) g.bold.push(f);
	}
	const names = (faces: RawFace[]) => Array.from(new Set(faces.flatMap((f) => [f.fullName, f.postscriptName]).filter((x): x is string => !!x && !/["'\\;{}<>]/.test(x)))).slice(0, 4);
	const out: FontEntry[] = [];
	for (const g of map.values()) {
		// "Regular" 优先，其次 Normal / Medium …
		g.reg.sort((a, b) => Number(!/^regular$/i.test(a.style ?? "")) - Number(!/^regular$/i.test(b.style ?? "")));
		g.bold.sort((a, b) => Number(!/^bold$/i.test(a.style ?? "")) - Number(!/^bold$/i.test(b.style ?? "")));
		const reg = g.reg.length ? g.reg : g.all.slice(0, 1);
		out.push({ family: g.family, name: displayFontName(g.family), cjk: looksCJKFont(g.family), faces: { regular: names(reg), bold: names(g.bold) } });
	}
	out.sort((a, b) => (a.cjk === b.cjk ? a.name.localeCompare(b.name, "zh-CN") : a.cjk ? -1 : 1));
	return out;
}

/** 读取本机字体（只在用户打开字体菜单时调用；结果缓存） */
export function loadFonts(): Promise<FontEntry[]> {
	if (cache) return Promise.resolve(cache);
	if (!pending) {
		pending = queryFaces().then((raw) => {
			cache = group(raw);
			pending = null;
			return cache;
		});
	}
	return pending;
}

export function fontsLoaded(): boolean {
	return cache !== null;
}

export function cachedFonts(): FontEntry[] {
	return cache ?? [];
}

export function findFont(name: string): FontEntry | undefined {
	if (!cache) return undefined;
	const vs = fontNameVariants(name).map((v) => v.toLowerCase());
	return cache.find((f) => vs.includes(f.family.toLowerCase()) || vs.includes(f.name.toLowerCase()));
}

export function facesFor(name: string): FaceNames | null {
	return findFont(name)?.faces ?? null;
}

/* ---------- 是否已安装：优先查字体列表，否则用画布测宽 ---------- */

let canvas: HTMLCanvasElement | null = null;
const installedCache = new Map<string, boolean>();

function measure(font: string): number {
	if (!canvas) canvas = createEl("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return 0;
	ctx.font = font;
	return ctx.measureText("永和九年 Hamburgefonstiv 0123").width;
}

export function isFontInstalled(name: string): boolean {
	if (cache && cache.length) return !!findFont(name);
	if (installedCache.has(name)) return installedCache.get(name)!;
	let ok = false;
	try {
		for (const v of fontNameVariants(name)) {
			for (const base of ["monospace", "serif", "sans-serif"]) {
				if (Math.abs(measure(`32px "${v}", ${base}`) - measure(`32px ${base}`)) > 0.5) {
					ok = true;
					break;
				}
			}
			if (ok) break;
		}
	} catch {
		ok = true;
	}
	installedCache.set(name, ok);
	return ok;
}

export function resetInstalledCache() {
	installedCache.clear();
}
