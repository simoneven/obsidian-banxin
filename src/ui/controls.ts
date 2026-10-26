/* ==========================================================================
   属性控件。每个控件返回 { el, set(value) }：
   - set() 只更新显示，不重建 DOM，拖动滑块时不会丢焦点
   - onChange(null) 表示"清除自定义，恢复继承"
   ========================================================================== */

import { App, setIcon, setTooltip } from "obsidian";
import { CJK_FONT_SUGGESTIONS, CN_SIZES, FONT_FALLBACKS, PALETTE, THEME_COLORS, cnSizeName, displayFontName, looksCJKFont } from "../constants";
import { cachedFonts, FontEntry, fontsLoaded, isFontInstalled, loadFonts } from "../fonts";
import { cleanColor, normalizeHex } from "../schema";
import { contrastRatio, round } from "../units";
import { FieldDef } from "./fields";
import { promptText } from "./modals";
import { Popover } from "./popover";

export interface Control {
	el: HTMLElement;
	/** hint：继承主题时的实际取值（目前用于字体，显示"跟随主题 · 思源黑体"） */
	set(value: unknown, hint?: string): void;
}

export interface ControlCtx {
	app: App;
	recentFonts(): string[];
	/** 当前背景色（对比度用） */
	background(): string;
	/** 文字颜色的最低对比度要求，0 = 不检查 */
	minContrast: number;
	/** 当前元素的有效字号（磅），用于倍数 / 固定行距互换 */
	fontSizePt(): number;
	basePx(): number;
	isHeading: boolean;
}

type OnChange = (v: unknown) => void;

function btn(parent: HTMLElement, cls: string, text?: string, icon?: string): HTMLButtonElement {
	const b = parent.createEl("button", { cls, attr: { type: "button" } });
	if (icon) setIcon(b, icon);
	if (text) b.createSpan({ text });
	return b;
}

function numInput(parent: HTMLElement, min: number, max: number, step: number, cls = "doc-style-num"): HTMLInputElement {
	const n = parent.createEl("input", { cls, type: "number" });
	n.min = String(min);
	n.max = String(max);
	n.step = String(step);
	return n;
}

/* ----------------------------- 开关 ----------------------------- */

export function switchControl(parent: HTMLElement, label: string, onToggle: (on: boolean) => void): { el: HTMLElement; input: HTMLInputElement } {
	const wrap = parent.createEl("label", { cls: "doc-style-switch" });
	const input = wrap.createEl("input", { type: "checkbox", cls: "doc-style-switch-input" });
	input.setAttr("aria-label", label);
	wrap.createSpan({ cls: "doc-style-switch-track" });
	input.addEventListener("change", () => onToggle(input.checked));
	return { el: wrap, input };
}

/* ----------------------------- 构建入口 ----------------------------- */

export function buildControl(def: FieldDef, ctx: ControlCtx, onChange: OnChange): Control {
	const root = createDiv({ cls: "doc-style-ctrl" });
	switch (def.type) {
		case "font":
			return fontControl(root, def, ctx, onChange);
		case "cnsize":
			return sizeControl(root, ctx, onChange);
		case "switch": {
			const sw = switchControl(root, def.label, (on) => onChange(on ? def.on : def.off));
			return { el: root, set: (v) => (sw.input.checked = v === def.on) };
		}
		case "color":
			return colorControl(root, ctx, onChange);
		case "align":
			return alignControl(root, ctx, onChange);
		case "lineheight":
			return lineHeightControl(root, ctx, onChange);
		case "range":
			return rangeControl(root, def, onChange);
		case "indent":
			return indentControl(root, def, onChange);
	}
}

/* ----------------------------- 字号 ----------------------------- */

function sizeControl(root: HTMLElement, ctx: ControlCtx, onChange: OnChange): Control {
	const sel = root.createEl("select", { cls: "dropdown doc-style-select" });
	sel.createEl("option", { text: "自定义", value: "" });
	for (const [name, pt] of CN_SIZES) sel.createEl("option", { text: `${name}（${pt} 磅）`, value: String(pt) });
	const num = numInput(root, 6, 72, 0.5);
	root.createSpan({ cls: "doc-style-unit", text: "磅" });
	const sync = (pt: number) => {
		sel.value = cnSizeName(pt) ? String(pt) : "";
		num.value = String(pt);
		setTooltip(num, `约 ${round((pt / 12) * ctx.basePx(), 1)} 像素`);
	};
	sel.addEventListener("change", () => {
		if (!sel.value) return;
		const pt = Number(sel.value);
		sync(pt);
		onChange(pt);
	});
	num.addEventListener("change", () => {
		const pt = Number(num.value);
		if (!Number.isFinite(pt) || pt < 6 || pt > 72) {
			num.addClass("is-invalid");
			window.setTimeout(() => num.removeClass("is-invalid"), 1200);
			return;
		}
		sync(pt);
		onChange(pt);
	});
	return { el: root, set: (v) => typeof v === "number" && sync(v) };
}

/* ----------------------------- 对齐 ----------------------------- */

function alignControl(root: HTMLElement, ctx: ControlCtx, onChange: OnChange): Control {
	const opts: [string, string, string][] = [
		["left", "左对齐", "align-left"],
		["center", "居中", "align-center"],
		["right", "右对齐", "align-right"],
	];
	if (!ctx.isHeading) opts.push(["justify", "两端对齐", "align-justify"]);
	const seg = root.createDiv({ cls: "doc-style-seg", attr: { role: "radiogroup" } });
	const buttons = opts.map(([v, label, icon]) => {
		const b = btn(seg, "doc-style-seg-btn", undefined, icon);
		b.setAttr("aria-label", label);
		setTooltip(b, label);
		b.addEventListener("click", () => {
			set(v);
			onChange(v);
		});
		return [v, b] as const;
	});
	const set = (v: unknown) => buttons.forEach(([k, b]) => b.toggleClass("is-active", k === v));
	return { el: root, set };
}

/* ----------------------------- 滑块 + 数字 ----------------------------- */

function rangeControl(root: HTMLElement, def: FieldDef, onChange: OnChange): Control {
	const scale = def.scale ?? 1;
	const range = root.createEl("input", { cls: "doc-style-range", type: "range" });
	range.min = String(def.min ?? 0);
	range.max = String(def.max ?? 1);
	range.step = String(def.step ?? 0.1);
	const num = numInput(root, def.min ?? 0, def.max ?? 1, def.step ?? 0.1);
	if (def.unit) root.createSpan({ cls: "doc-style-unit", text: def.unit });
	const emit = (shown: number) => onChange(round(shown / scale, 4));
	range.addEventListener("input", () => {
		num.value = range.value;
		emit(Number(range.value));
	});
	num.addEventListener("change", () => {
		const v = Number(num.value);
		if (!Number.isFinite(v)) return;
		const c = Math.min(def.max ?? v, Math.max(def.min ?? v, v));
		range.value = String(c);
		num.value = String(c);
		emit(c);
	});
	return {
		el: root,
		set: (v) => {
			if (typeof v !== "number") return;
			const shown = round(v * scale, 2);
			range.value = String(shown);
			num.value = String(shown);
		},
	};
}

/* ----------------------------- 行距 ----------------------------- */

function lineHeightControl(root: HTMLElement, ctx: ControlCtx, onChange: OnChange): Control {
	let mode: "multiple" | "fixed" = "multiple";
	let multiple = 1.5;
	let fixed = 20;
	const seg = root.createDiv({ cls: "doc-style-seg is-text" });
	const bMul = btn(seg, "doc-style-seg-btn", "倍数");
	const bFix = btn(seg, "doc-style-seg-btn", "固定值");
	const mulBox = root.createDiv({ cls: "doc-style-inline" });
	const range = mulBox.createEl("input", { cls: "doc-style-range", type: "range" });
	range.min = "1";
	range.max = "3";
	range.step = "0.05";
	const mulNum = numInput(mulBox, 1, 3, 0.05);
	mulBox.createSpan({ cls: "doc-style-unit", text: "倍" });
	const fixBox = root.createDiv({ cls: "doc-style-inline" });
	const fixNum = numInput(fixBox, 6, 72, 0.5);
	fixBox.createSpan({ cls: "doc-style-unit", text: "磅" });

	const show = () => {
		bMul.toggleClass("is-active", mode === "multiple");
		bFix.toggleClass("is-active", mode === "fixed");
		mulBox.toggleClass("is-hidden", mode !== "multiple");
		fixBox.toggleClass("is-hidden", mode !== "fixed");
		range.value = String(multiple);
		mulNum.value = String(multiple);
		fixNum.value = String(fixed);
	};
	bMul.addEventListener("click", () => {
		if (mode === "multiple") return;
		mode = "multiple";
		multiple = round(Math.min(3, Math.max(1, fixed / ctx.fontSizePt())), 2);
		show();
		onChange({ lineHeight: multiple });
	});
	bFix.addEventListener("click", () => {
		if (mode === "fixed") return;
		mode = "fixed";
		fixed = round(multiple * ctx.fontSizePt(), 1);
		show();
		onChange({ lineHeightPt: fixed });
	});
	range.addEventListener("input", () => {
		multiple = Number(range.value);
		mulNum.value = range.value;
		onChange({ lineHeight: multiple });
	});
	mulNum.addEventListener("change", () => {
		const v = Number(mulNum.value);
		if (!Number.isFinite(v)) return;
		multiple = Math.min(3, Math.max(1, v));
		show();
		onChange({ lineHeight: multiple });
	});
	fixNum.addEventListener("change", () => {
		const v = Number(fixNum.value);
		if (!Number.isFinite(v)) return;
		fixed = Math.min(72, Math.max(6, v));
		show();
		onChange({ lineHeightPt: fixed });
	});
	show();
	return {
		el: root,
		set: (v) => {
			const o = (v ?? {}) as { lineHeight?: number; lineHeightPt?: number };
			if (typeof o.lineHeightPt === "number") {
				mode = "fixed";
				fixed = o.lineHeightPt;
				multiple = round(Math.min(3, Math.max(1, fixed / ctx.fontSizePt())), 2);
			} else if (typeof o.lineHeight === "number") {
				mode = "multiple";
				multiple = o.lineHeight;
				fixed = round(multiple * ctx.fontSizePt(), 1);
			}
			show();
		},
	};
}

/* ----------------------------- 首行缩进（R04：开关即时显隐） ----------------------------- */

function indentControl(root: HTMLElement, def: FieldDef, onChange: OnChange): Control {
	let value = 2;
	const sw = switchControl(root, def.label, (on) => {
		box.toggleClass("is-hidden", !on);
		if (on) {
			if (!value) value = 2;
			num.value = String(value);
			onChange(value);
		} else onChange(0);
	});
	const box = root.createDiv({ cls: "doc-style-inline" });
	const num = numInput(box, def.min ?? 0, def.max ?? 4, def.step ?? 0.5);
	box.createSpan({ cls: "doc-style-unit", text: def.unit ?? "" });
	num.addEventListener("change", () => {
		const v = Number(num.value);
		if (!Number.isFinite(v) || v <= 0) return;
		value = Math.min(def.max ?? 4, v);
		num.value = String(value);
		onChange(value);
	});
	return {
		el: root,
		set: (v) => {
			const n = typeof v === "number" ? v : 0;
			sw.input.checked = n > 0;
			box.toggleClass("is-hidden", n <= 0);
			if (n > 0) value = n;
			num.value = String(value);
		},
	};
}

/* ----------------------------- 颜色（R27：按用途分组 + 对比度） ----------------------------- */

function colorLabel(v: string): string {
	return THEME_COLORS.find((t) => t.value === v)?.name ?? v;
}

function colorControl(root: HTMLElement, ctx: ControlCtx, onChange: OnChange): Control {
	let current = "";
	const swatch = root.createEl("label", { cls: "doc-style-color-swatch" });
	const picker = swatch.createEl("input", { type: "color" });
	picker.setAttr("aria-label", "取色器");
	const hex = root.createEl("input", { cls: "doc-style-color-hex", type: "text" });
	hex.setAttr("aria-label", "色号");
	const presetBtn = btn(root, "doc-style-btn is-small doc-style-popover-anchor", "色板", "palette");

	const show = (v: string) => {
		current = v;
		swatch.style.setProperty("--ds-swatch", v || "transparent");
		hex.value = colorLabel(v);
		if (/^#[0-9A-F]{6}$/i.test(v)) picker.value = v.toLowerCase();
	};
	const commit = (v: string) => {
		show(v);
		onChange(v);
	};
	picker.addEventListener("input", () => commit(picker.value.toUpperCase()));
	hex.addEventListener("change", () => {
		const t = hex.value.trim();
		const theme = THEME_COLORS.find((c) => c.name === t);
		const c = theme ? theme.value : cleanColor(t.startsWith("#") || /^(rgb|hsl|var)/i.test(t) ? t : "#" + t);
		if (!c) {
			hex.addClass("is-invalid");
			hex.value = colorLabel(current);
			window.setTimeout(() => hex.removeClass("is-invalid"), 1200);
			return;
		}
		commit(c);
	});

	presetBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		if (presetBtn.hasClass("is-open-anchor")) {
			pop?.close();
			return;
		}
		pop = new Popover("doc-style-palette", () => presetBtn.removeClass("is-open-anchor"));
		const bg = ctx.background();
		const themeRow = pop.el.createDiv({ cls: "doc-style-palette-row" });
		themeRow.createDiv({ cls: "doc-style-palette-name", text: "主题色（随主题变化）" });
		const tr = themeRow.createDiv({ cls: "doc-style-palette-tones" });
		for (const t of THEME_COLORS) {
			const chip = btn(tr, "doc-style-palette-chip is-theme");
			chip.createSpan({ cls: "doc-style-palette-dot" }).style.setProperty("--ds-swatch", t.value);
			chip.createSpan({ text: t.name });
			chip.addEventListener("click", () => {
				commit(t.value);
				pop?.close();
			});
		}
		for (const g of PALETTE) {
			const row = pop.el.createDiv({ cls: "doc-style-palette-row" });
			row.createDiv({ cls: "doc-style-palette-name", text: g.name });
			const tones = row.createDiv({ cls: "doc-style-palette-tones" });
			for (const t of g.tones) {
				const ratio = contrastRatio(t.hex, bg);
				const tooLow = ctx.minContrast > 0 && ratio !== null && ratio < ctx.minContrast;
				const chip = btn(tones, "doc-style-palette-chip" + (tooLow ? " is-disabled" : ""));
				chip.createSpan({ cls: "doc-style-palette-dot" }).style.setProperty("--ds-swatch", t.hex);
				chip.createSpan({ text: t.name });
				const tip = `${t.name} ${t.hex}` + (ratio !== null ? ` · 对比度 ${ratio.toFixed(1)}:1` : "") + (tooLow ? `（低于 ${ctx.minContrast}:1，在当前背景上看不清）` : "");
				setTooltip(chip, tip);
				if (tooLow) {
					chip.setAttr("aria-disabled", "true");
					continue;
				}
				chip.addEventListener("click", () => {
					commit(t.hex);
					pop?.close();
				});
			}
		}
		pop.el.createDiv({ cls: "doc-style-palette-foot", text: "灰色的颜色与当前背景对比度不足，不能直接用作文字颜色。" });
		presetBtn.addClass("is-open-anchor");
		pop.open(presetBtn);
	});
	let pop: Popover | null = null;
	return { el: root, set: (v) => typeof v === "string" && show(normalizeHex(v)) };
}

/* ----------------------------- 字体（R18：分类、样字、最近使用、懒加载） ----------------------------- */

const CHUNK = 60;

function fontControl(root: HTMLElement, def: FieldDef, ctx: ControlCtx, onChange: OnChange): Control {
	let current = "";
	const kind = def.fontKind ?? "latin";
	const button = btn(root, "doc-style-font-btn doc-style-popover-anchor");
	const label = button.createSpan({ cls: "doc-style-font-label" });
	const missingTag = button.createSpan({ cls: "doc-style-tag is-warn is-hidden", text: "未安装" });
	const caret = button.createSpan({ cls: "doc-style-font-caret" });
	setIcon(caret, "chevron-down");

	const show = (v: string, hint?: string) => {
		current = v;
		label.setText(v ? displayFontName(v) : hint ? `跟随主题 · ${displayFontName(hint)}` : "跟随主题");
		label.style.setProperty("--ds-font", v ? `"${v}"` : hint ? `"${hint}"` : "inherit");
		const missing = !!v && !isFontInstalled(v);
		missingTag.toggleClass("is-hidden", !missing);
		setTooltip(button, missing ? `本机没有安装「${v}」，会回退到主题字体` : v || "跟随主题");
	};
	const pick = (name: string) => {
		show(name);
		onChange(name);
	};

	let pop: Popover | null = null;
	button.addEventListener("click", (e) => {
		e.stopPropagation();
		if (button.hasClass("is-open-anchor")) {
			pop?.close();
			return;
		}
		pop = new Popover("doc-style-font-menu", () => button.removeClass("is-open-anchor"));
		button.addClass("is-open-anchor");
		buildFontMenu(pop, kind, current, ctx, (n) => {
			pick(n);
			pop?.close();
		});
		pop.open(button);
		void loadFonts().then(() => {
			if (pop && document.body.contains(pop.el)) {
				pop.el.empty();
				buildFontMenu(pop, kind, current, ctx, (n) => {
					pick(n);
					pop?.close();
				});
				pop.position(button);
			}
		});
	});
	return { el: root, set: (v, hint) => show(typeof v === "string" ? v : "", hint) };
}

function fontItem(parent: HTMLElement, name: string, current: string, onPick: (n: string) => void, extra?: string) {
	const item = parent.createEl("button", { cls: "doc-style-font-item", attr: { type: "button" } });
	const n = item.createSpan({ cls: "doc-style-font-item-name", text: displayFontName(name) });
	n.style.setProperty("--ds-font", `"${name}"`);
	const sample = item.createSpan({ cls: "doc-style-font-sample", text: "永远 Aa 123" });
	sample.style.setProperty("--ds-font", `"${name}"`);
	if (name === current) item.createSpan({ cls: "doc-style-tag", text: "当前" });
	if (extra) item.createSpan({ cls: "doc-style-tag", text: extra });
	item.addEventListener("click", () => onPick(name));
}

function buildFontMenu(pop: Popover, kind: "cjk" | "latin", current: string, ctx: ControlCtx, onPick: (n: string) => void) {
	const el = pop.el;
	const search = el.createEl("input", { cls: "doc-style-font-search", type: "search", attr: { placeholder: "搜索字体…" } });
	let showAll = kind === "latin";
	const toggleRow = el.createDiv({ cls: "doc-style-font-toggle" });
	const list = el.createDiv({ cls: "doc-style-font-list" });

	if (kind === "cjk") {
		const cb = toggleRow.createEl("label", { cls: "doc-style-check" });
		const input = cb.createEl("input", { type: "checkbox" });
		cb.createSpan({ text: "也显示英文字体" });
		input.addEventListener("change", () => {
			showAll = input.checked;
			render();
		});
	}

	const render = () => {
		list.empty();
		const q = search.value.trim().toLowerCase();
		const loaded = fontsLoaded();
		const all: FontEntry[] = cachedFonts();
		const matches = (name: string) => !q || name.toLowerCase().includes(q) || displayFontName(name).toLowerCase().includes(q);

		// 当前字体缺失 → 置顶给出替代
		if (current && !isFontInstalled(current)) {
			const alts = (FONT_FALLBACKS[current] ?? []).filter(isFontInstalled);
			if (alts.length) {
				list.createDiv({ cls: "doc-style-font-section is-warn", text: `「${current}」未安装，可用替代` });
				alts.forEach((a) => fontItem(list, a, current, onPick, "替代"));
			}
		}
		const recent = ctx.recentFonts().filter(matches).filter((n) => showAll || (kind === "cjk" ? looksCJKFont(n) : true));
		if (recent.length && !q) {
			list.createDiv({ cls: "doc-style-font-section", text: "最近使用" });
			recent.forEach((n) => fontItem(list, n, current, onPick));
		}

		let names: string[];
		if (loaded && all.length) {
			names = all.filter((f) => showAll || (kind === "cjk" ? f.cjk : true)).map((f) => f.family).filter(matches);
			if (kind === "latin") names.sort((a, b) => Number(looksCJKFont(a)) - Number(looksCJKFont(b)));
			list.createDiv({ cls: "doc-style-font-section", text: q ? `匹配 ${names.length} 个` : `本机字体 ${names.length} 个` });
		} else {
			names = (kind === "cjk" ? CJK_FONT_SUGGESTIONS : ["Times New Roman", "Georgia", "Arial", "Segoe UI", "Helvetica Neue", "Inter", "Consolas", "JetBrains Mono"]).filter(matches);
			list.createDiv({ cls: "doc-style-font-section" + (loaded ? " is-warn" : ""), text: loaded ? "没能读取本机字体列表，以下为常用字体（灰色为未安装）" : "正在读取本机字体…" });
		}
		// 懒加载：先渲染一屏，滚到底再加
		let shown = 0;
		const more = () => {
			const slice = names.slice(shown, shown + CHUNK);
			slice.forEach((n) => {
				fontItem(list, n, current, onPick);
				if (!loaded || !all.length) {
					const last = list.lastElementChild as HTMLElement | null;
					if (last && !isFontInstalled(n)) last.addClass("is-missing");
				}
			});
			shown += slice.length;
			sentinel.remove();
			if (shown < names.length) {
				list.appendChild(sentinel);
				io.observe(sentinel);
			}
		};
		const sentinel = createDiv({ cls: "doc-style-font-sentinel" });
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				io.disconnect();
				more();
			}
		}, { root: list });
		more();
	};
	const foot = el.createDiv({ cls: "doc-style-font-foot" });
	const manual = foot.createEl("button", { cls: "doc-style-font-item is-manual", attr: { type: "button" } });
	setIcon(manual.createSpan(), "pencil");
	manual.createSpan({ text: "手动输入字体名…" });
	manual.addEventListener("click", async () => {
		const v = await promptText(ctx.app, { title: "输入字体名", desc: "中文名或英文名都可以，例如「方正小标宋简体」或「Times New Roman」。未安装时会回退到主题字体。", placeholder: "字体名" });
		if (v) onPick(v);
	});
	search.addEventListener("input", render);
	render();
	window.setTimeout(() => search.focus(), 0);
}
