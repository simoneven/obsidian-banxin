/* ==========================================================================
   样式编辑器：元素树 · 属性面板 · 预览
   只通过 Store 读写数据；弹窗、侧栏共用这一个组件
   ========================================================================== */

import { App, Component, Menu, Notice, setIcon, setTooltip } from "obsidian";
import {
	AUTHOR, ElementKey, ELEMENTS, elementName, FieldKey, getElement, HEADING_KEYS, isHeading, PropKey,
} from "../constants";
import { probeTheme, invalidateProbe } from "../probe";
import { resolveProps, sourceOf, Mode, ownProps } from "../resolve";
import { activeSet, isElementCustomized, PluginData, StyleProps, StyleSet, NumberingStyle } from "../schema";
import { Store } from "../store";
import { TEMPLATES } from "../templates";
import { contrastRatio } from "../units";
import { buildControl, Control, ControlCtx, switchControl } from "./controls";
import { editingNote, fieldFor } from "./fields";
import { CopyStyleModal, TemplateModal } from "./modals";
import { closeActivePopover } from "./popover";
import { Preview } from "./preview";

export interface EditorHost {
	app: App;
	store: Store;
	recentFonts(): string[];
	onFontPicked(name: string): void;
	applyTemplate(choice: import("./modals").TemplateChoice): void;
	switchSet(id: string): void;
	newSet(): Promise<void>;
	duplicateSet(): void;
	renameSet(): Promise<void>;
	deleteSet(): Promise<void>;
	importSet(): void;
	exportSet(): void;
	resetAll(): Promise<void>;
	applySetToActiveNote(): Promise<void>;
	undo(): void;
	redo(): void;
	notifyUndoable(message: string): void;
	openSettings(): void;
}

export interface EditorOptions {
	dockable?: boolean;
	onDock?: () => void;
	initialElement?: ElementKey;
}

type ModeTab = "shared" | "light" | "dark";

interface FieldRow {
	key: FieldKey;
	row: HTMLElement;
	control: Control;
	status: HTMLElement;
	reset: HTMLButtonElement;
}

interface Issue {
	key: ElementKey;
	mode: Mode;
	ratio: number;
	min: number;
	prop: string;
}

export class StyleEditor {
	readonly rootEl: HTMLElement;
	private current: ElementKey = "global";
	private modeTab: ModeTab = "shared";
	private localChange = false;
	private fieldRows: FieldRow[] = [];
	private unsub: () => void;
	private resizeObserver: ResizeObserver;
	private preview!: Preview;
	private renderTimer: number | null = null;

	private headEl!: HTMLElement;
	private treeList!: HTMLElement;
	private treeCount!: HTMLElement;
	private treeHint!: HTMLElement;
	private propsEl!: HTMLElement;
	private issuesEl!: HTMLElement;
	private noteEl!: HTMLElement;
	private footState!: HTMLElement;
	private undoBtn!: HTMLButtonElement;
	private redoBtn!: HTMLButtonElement;
	private previewCol!: HTMLElement;

	constructor(private host: EditorHost, private component: Component, private opts: EditorOptions = {}) {
		if (opts.initialElement) this.current = opts.initialElement;
		this.rootEl = createDiv({ cls: "doc-style-editor" });
		this.rootEl.setAttr("tabindex", "-1");
		this.build();
		this.unsub = host.store.subscribe((info) => this.onStoreChange(info.fromHistory === true));
		this.resizeObserver = new ResizeObserver(() => this.rootEl.toggleClass("is-narrow", this.rootEl.clientWidth < 720));
		this.resizeObserver.observe(this.rootEl);
		this.rootEl.addEventListener("keydown", (e) => this.onKey(e));
		this.rootEl.addEventListener("mousedown", (e) => closeActivePopover(e.target));
	}

	private get data(): PluginData {
		return this.host.store.state;
	}
	private get set(): StyleSet {
		return activeSet(this.data);
	}
	/** 正在编辑哪一组属性 */
	private get mode(): Mode {
		return this.modeTab === "dark" ? "dark" : "light";
	}

	/* ----------------------------- 结构 ----------------------------- */

	private build() {
		this.headEl = this.rootEl.createDiv({ cls: "doc-style-head" });
		const body = this.rootEl.createDiv({ cls: "doc-style-body" });

		const treeCol = body.createDiv({ cls: "doc-style-col-tree" });
		const th = treeCol.createDiv({ cls: "doc-style-tree-head" });
		th.createSpan({ text: "文档元素" });
		this.treeCount = th.createSpan({ cls: "doc-style-count" });
		this.treeList = treeCol.createDiv({ cls: "doc-style-tree", attr: { role: "listbox", "aria-label": "文档元素" } });
		this.treeHint = treeCol.createDiv({ cls: "doc-style-tree-hint" });

		this.propsEl = body.createDiv({ cls: "doc-style-col-props" });

		this.previewCol = body.createDiv({ cls: "doc-style-col-preview" });
		const ph = this.previewCol.createDiv({ cls: "doc-style-pv-head" });
		const phTitle = ph.createEl("button", { cls: "doc-style-pv-title", attr: { type: "button" } });
		setIcon(phTitle.createSpan({ cls: "doc-style-pv-chevron" }), "chevron-down");
		phTitle.createSpan({ text: "预览" });
		phTitle.addEventListener("click", () => this.previewCol.toggleClass("is-collapsed", !this.previewCol.hasClass("is-collapsed")));
		const toggles = this.previewCol.createDiv({ cls: "doc-style-pv-toggles" });
		const stageHost = this.previewCol.createDiv({ cls: "doc-style-pv-host" });
		this.noteEl = this.previewCol.createDiv({ cls: "doc-style-pv-note" });
		this.issuesEl = this.previewCol.createDiv({ cls: "doc-style-issues" });
		this.preview = new Preview(this.host.app, this.component, stageHost, () => ({ set: this.set, isActive: true }), probeTheme().isDark);
		this.themeSeg = this.segmented(toggles, [["light", "明"], ["dark", "暗"]], this.preview.theme, (v) => {
			this.preview.theme = v as "light" | "dark";
			void this.renderPreview();
		});
		this.segmented(toggles, [["reading", "阅读"], ["editing", "编辑"]], "reading", (v) => {
			this.preview.view = v as "reading" | "editing";
			void this.renderPreview();
		});
		this.segmented(toggles, [["sample", "样稿"], ["note", "当前笔记"]], "sample", (v) => {
			this.preview.source = v as "sample" | "note";
			void this.renderPreview();
		});

		const foot = this.rootEl.createDiv({ cls: "doc-style-foot" });
		foot.createSpan({ cls: "doc-style-dot" });
		this.footState = foot.createSpan({ text: "已自动保存 · 全库生效" });
		foot.createDiv({ cls: "doc-style-spacer" });
		foot.createSpan({ cls: "doc-style-foot-tip", text: "Ctrl/⌘ + Z 撤销" });

		this.renderAll();
	}

	private themeSeg: HTMLElement | null = null;

	private segmented(parent: HTMLElement, opts: [string, string][], initial: string, on: (v: string) => void) {
		const seg = parent.createDiv({ cls: "doc-style-seg is-text is-small" });
		const btns = opts.map(([v, label]) => {
			const b = seg.createEl("button", { cls: "doc-style-seg-btn" + (v === initial ? " is-active" : ""), text: label, attr: { type: "button" } });
			b.addEventListener("click", () => {
				btns.forEach((x) => x.toggleClass("is-active", x === b));
				on(v);
			});
			return b;
		});
		return seg;
	}

	/* ----------------------------- 渲染 ----------------------------- */

	renderAll() {
		const e = this.set.elements[this.current];
		if (!e.separate) this.modeTab = "shared";
		else if (this.modeTab === "shared") this.modeTab = "light";
		this.renderHead();
		this.renderTree();
		this.renderProps();
		this.renderIssues();
		void this.renderPreview();
	}

	private renderHead() {
		const h = this.headEl;
		h.empty();
		h.createSpan({ cls: "doc-style-title", text: "版心" });
		const setBtn = h.createEl("button", { cls: "doc-style-set-btn", attr: { type: "button", "aria-label": "切换样式集" } });
		setIcon(setBtn.createSpan(), "layers");
		setBtn.createSpan({ cls: "doc-style-set-name", text: this.set.name });
		setIcon(setBtn.createSpan({ cls: "doc-style-font-caret" }), "chevron-down");
		setTooltip(setBtn, "切换、新建、导入或导出样式集");
		setBtn.addEventListener("click", (ev) => this.setMenu(ev));

		const tpl = h.createEl("button", { cls: "doc-style-btn", attr: { type: "button" } });
		setIcon(tpl.createSpan(), "layout-template");
		tpl.createSpan({ text: "模板" });
		tpl.addEventListener("click", () => this.openTemplates());

		h.createDiv({ cls: "doc-style-spacer" });
		this.undoBtn = this.iconButton(h, "undo-2", "撤销（Ctrl/⌘ + Z）", () => this.host.undo());
		this.redoBtn = this.iconButton(h, "redo-2", "重做（Ctrl/⌘ + Shift + Z）", () => this.host.redo());
		this.updateHistoryButtons();
		const more = this.iconButton(h, "more-horizontal", "更多", (ev) => this.moreMenu(ev));
		more.addClass("doc-style-more");
		if (this.opts.dockable) {
			const dock = h.createEl("button", { cls: "doc-style-btn", attr: { type: "button" } });
			setIcon(dock.createSpan(), "panel-right");
			dock.createSpan({ text: "停靠侧栏" });
			setTooltip(dock, "在右侧栏打开，可以边改边看真实笔记");
			dock.addEventListener("click", () => this.opts.onDock?.());
		}
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, on: (ev: MouseEvent) => void): HTMLButtonElement {
		const b = parent.createEl("button", { cls: "doc-style-icon-btn clickable-icon", attr: { type: "button", "aria-label": label } });
		setIcon(b, icon);
		setTooltip(b, label);
		b.addEventListener("click", on);
		return b;
	}

	private updateHistoryButtons() {
		this.undoBtn?.toggleClass("is-disabled", !this.host.store.canUndo());
		this.redoBtn?.toggleClass("is-disabled", !this.host.store.canRedo());
	}

	private setMenu(ev: MouseEvent) {
		const m = new Menu();
		for (const s of this.data.sets) {
			m.addItem((i) => i.setTitle(s.name).setChecked(s.id === this.data.activeSetId).onClick(() => this.host.switchSet(s.id)));
		}
		m.addSeparator();
		m.addItem((i) => i.setTitle("新建空白样式集…").setIcon("plus").onClick(() => void this.host.newSet()));
		m.addItem((i) => i.setTitle("从模板新建…").setIcon("layout-template").onClick(() => this.openTemplates()));
		m.addItem((i) => i.setTitle("复制当前样式集").setIcon("copy").onClick(() => this.host.duplicateSet()));
		m.addItem((i) => i.setTitle("重命名…").setIcon("pencil").onClick(() => void this.host.renameSet()));
		if (this.data.sets.length > 1) m.addItem((i) => i.setTitle("删除当前样式集…").setIcon("trash-2").onClick(() => void this.host.deleteSet()));
		m.addSeparator();
		m.addItem((i) => i.setTitle("导入样式集（JSON）…").setIcon("download").onClick(() => this.host.importSet()));
		m.addItem((i) => i.setTitle("导出当前样式集…").setIcon("upload").onClick(() => this.host.exportSet()));
		m.addSeparator();
		m.addItem((i) => i.setTitle("只给当前笔记用这个样式集…").setIcon("file-check").onClick(() => void this.host.applySetToActiveNote()));
		m.showAtMouseEvent(ev);
	}

	private moreMenu(ev: MouseEvent) {
		const m = new Menu();
		m.addItem((i) => i.setTitle(`复制「${elementName(this.current)}」的样式到…`).setIcon("copy").onClick(() => this.copyStyle()));
		m.addItem((i) => i.setTitle(`重置「${elementName(this.current)}」`).setIcon("rotate-ccw").onClick(() => this.resetElement()));
		m.addSeparator();
		m.addItem((i) => i.setTitle("重置全部元素…").setIcon("trash-2").onClick(() => void this.host.resetAll()));
		m.addSeparator();
		m.addItem((i) => i.setTitle("插件设置").setIcon("settings").onClick(() => this.host.openSettings()));
		m.showAtMouseEvent(ev);
	}

	private openTemplates() {
		new TemplateModal(this.host.app, TEMPLATES, (c) => c && this.host.applyTemplate(c)).open();
	}

	/* ----------------------------- 元素树（R18 / R19） ----------------------------- */

	private renderTree() {
		const list = this.treeList;
		list.empty();
		let custom = 0;
		let lastGroup = "";
		const issues = new Set(this.issues().map((i) => i.key));
		for (const def of ELEMENTS) {
			if (def.group !== lastGroup && def.group !== "全局") {
				lastGroup = def.group;
				list.createDiv({ cls: "doc-style-tree-group", text: def.group });
			} else if (def.group === "全局") lastGroup = "全局";
			const customized = isElementCustomized(this.set.elements[def.key]);
			if (customized && def.key !== "global") custom++;
			const item = list.createEl("button", {
				cls: "doc-style-tree-item" + (def.key === this.current ? " is-active" : "") + (def.key === "global" ? " is-global" : ""),
				attr: { type: "button", role: "option", "aria-selected": String(def.key === this.current), "data-key": def.key },
			});
			const name = item.createSpan({ cls: "doc-style-tree-name", text: def.name });
			this.styleTreeName(name, def.key);
			if (issues.has(def.key)) {
				const w = item.createSpan({ cls: "doc-style-tree-warn" });
				setIcon(w, "alert-triangle");
				setTooltip(w, "文字颜色与背景对比度不足");
			}
			if (customized) item.createSpan({ cls: "doc-style-tree-mark", attr: { "aria-label": "已自定义" } });
			item.addEventListener("click", () => this.select(def.key));
		}
		this.treeCount.setText(`已自定义 ${custom}/${ELEMENTS.length - 1}`);
		const globalCustom = isElementCustomized(this.set.elements.global);
		this.treeHint.toggleClass("is-hidden", custom > 0 || globalCustom);
		this.treeHint.setText("还没有任何自定义。建议从「全局」开始：先选中文字体，所有标题和正文会一起变化；再按需调整各级标题。");
	}

	/** 元素名用它自己的字体与相对字号显示，像 Word 的样式库 */
	private styleTreeName(el: HTMLElement, key: ElementKey) {
		if (key === "global" || key === "inline" || key === "code") return;
		const p = resolveProps(this.set, key, "light");
		if (p.fontFamilyCJK || p.fontFamilyLatin) el.style.setProperty("--ds-font", [p.fontFamilyLatin, p.fontFamilyCJK].filter(Boolean).map((f) => `"${f}"`).join(", "));
		const pt = p.fontSize ?? (probeTheme().elements[key]?.fontSize as number | undefined);
		if (pt) el.style.setProperty("--ds-tree-size", `${Math.min(17, Math.max(11.5, 9 + pt * 0.32))}px`);
		const w = p.fontWeight ?? probeTheme().elements[key]?.fontWeight;
		if (w) el.style.setProperty("--ds-tree-weight", w === "700" ? "650" : "400");
	}

	select(key: ElementKey) {
		this.current = key;
		const e = this.set.elements[key];
		this.modeTab = e.separate ? (this.modeTab === "dark" ? "dark" : "light") : "shared";
		this.renderTree();
		this.renderProps();
		(this.treeList.querySelector(`[data-key="${key}"]`) as HTMLElement | null)?.focus();
	}

	/* ----------------------------- 属性面板 ----------------------------- */

	private renderProps() {
		const c = this.propsEl;
		c.empty();
		this.fieldRows = [];
		if (!this.data.onboarded) {
			this.renderWelcome(c);
			return;
		}
		const def = getElement(this.current);
		const head = c.createDiv({ cls: "doc-style-props-head" });
		head.createDiv({ cls: "doc-style-props-title", text: def.name });
		this.renderModeTabs(head);
		const scroll = c.createDiv({ cls: "doc-style-props-scroll" });
		if (def.desc) scroll.createDiv({ cls: "doc-style-props-desc", text: def.desc });
		if (this.modeTab !== "shared") {
			scroll.createDiv({ cls: "doc-style-props-desc is-mode", text: this.modeTab === "dark" ? "正在编辑暗色模式下的样式。" : "正在编辑明色模式下的样式；暗色模式有单独的一套。" });
		}

		let group = "";
		let groupEl: HTMLElement | null = null;
		for (const key of def.fields) {
			const f = fieldFor(this.current, key);
			if (f.group !== group) {
				group = f.group;
				groupEl = scroll.createDiv({ cls: "doc-style-group" });
				groupEl.createDiv({ cls: "doc-style-group-name", text: group });
			}
			this.fieldRows.push(this.renderField(groupEl!, key));
		}
		if (this.current === "global") this.renderSetOptions(scroll);

		const actions = c.createDiv({ cls: "doc-style-props-actions" });
		if (this.current !== "global" && this.current !== "inline") {
			const copy = actions.createEl("button", { cls: "doc-style-btn", attr: { type: "button" } });
			setIcon(copy.createSpan(), "copy");
			copy.createSpan({ text: "复制样式到…" });
			copy.addEventListener("click", () => this.copyStyle());
		}
		const reset = actions.createEl("button", { cls: "doc-style-btn", attr: { type: "button" } });
		setIcon(reset.createSpan(), "rotate-ccw");
		reset.createSpan({ text: "重置此元素" });
		reset.addEventListener("click", () => this.resetElement());
		this.refreshFields();
	}

	private renderModeTabs(parent: HTMLElement) {
		const seg = parent.createDiv({ cls: "doc-style-seg is-text is-small doc-style-mode-tabs" });
		const opts: [ModeTab, string, string][] = [
			["shared", "明暗共用", "明色、暗色模式用同一套设置"],
			["light", "明", "分别设置：明色模式"],
			["dark", "暗", "分别设置：暗色模式"],
		];
		for (const [v, label, tip] of opts) {
			const b = seg.createEl("button", { cls: "doc-style-seg-btn" + (v === this.modeTab ? " is-active" : ""), text: label, attr: { type: "button" } });
			setTooltip(b, tip);
			b.addEventListener("click", () => this.setModeTab(v));
		}
	}

	private setModeTab(v: ModeTab) {
		if (v === this.modeTab) return;
		const key = this.current;
		const e = this.set.elements[key];
		if (v === "shared" && e.separate) {
			this.host.store.update(`合并「${elementName(key)}」的明暗设置`, (d) => {
				const el = activeSet(d).elements[key];
				el.separate = false;
				el.dark = {};
			});
			this.host.notifyUndoable(`「${elementName(key)}」改为明暗共用，暗色的单独设置已删除`);
		} else if (v !== "shared" && !e.separate) {
			this.host.store.update(`分开设置「${elementName(key)}」的明暗`, (d) => {
				const el = activeSet(d).elements[key];
				el.separate = true;
				el.dark = JSON.parse(JSON.stringify(el.light));
			});
		}
		this.modeTab = v;
		this.renderProps();
	}

	private controlCtx(): ControlCtx {
		const heading = isHeading(this.current);
		const minContrast = this.current === "code" || this.current === "global" ? 4.5 : heading || this.current === "inline" ? 3 : 4.5;
		return {
			app: this.host.app,
			recentFonts: () => this.host.recentFonts(),
			background: () => {
				const t = probeTheme();
				const wantDark = this.mode === "dark" || (this.modeTab === "shared" && t.isDark);
				return wantDark === t.isDark ? t.background : t.otherBackground;
			},
			minContrast,
			fontSizePt: () => (resolveProps(this.set, this.current, this.mode).fontSize ?? (probeTheme().elements[this.current]?.fontSize as number | undefined) ?? 12),
			basePx: () => probeTheme().basePx,
			isHeading: heading,
		};
	}

	private renderField(parent: HTMLElement, key: FieldKey): FieldRow {
		const f = fieldFor(this.current, key);
		const row = parent.createDiv({ cls: "doc-style-field" });
		const labelBox = row.createDiv({ cls: "doc-style-field-label" });
		labelBox.createSpan({ text: f.label });
		const help = labelBox.createEl("button", { cls: "doc-style-help", attr: { type: "button", "aria-label": `${f.label}说明` } });
		setIcon(help, "help-circle");
		const body = row.createDiv({ cls: "doc-style-field-body" });
		const control = buildControl(f, this.controlCtx(), (v) => this.onFieldChange(key, v));
		body.appendChild(control.el);
		const status = row.createDiv({ cls: "doc-style-field-status" });
		const reset = row.createEl("button", { cls: "doc-style-reset clickable-icon", attr: { type: "button", "aria-label": "恢复继承" } });
		setIcon(reset, "rotate-ccw");
		reset.addEventListener("click", () => this.clearField(key));
		const note = editingNote(this.current, key);
		if (note) body.createSpan({ cls: "doc-style-tag is-quiet", text: note });
		const helpText = parent.createDiv({ cls: "doc-style-help-text is-hidden", text: f.help });
		help.addEventListener("click", () => helpText.toggleClass("is-hidden", !helpText.hasClass("is-hidden")));
		return { key, row, control, status, reset };
	}

	/** 有效显示值：自身 → 继承 → 主题 */
	private displayValue(key: FieldKey): unknown {
		const r = resolveProps(this.set, this.current, this.mode);
		const theme = probeTheme().elements[this.current] ?? {};
		if (key === "lineHeight") {
			if (r.lineHeightPt !== undefined) return { lineHeightPt: r.lineHeightPt };
			if (r.lineHeight !== undefined) return { lineHeight: r.lineHeight };
			return { lineHeight: theme.lineHeight ?? 1.5 };
		}
		const v = (r as Record<string, unknown>)[key];
		if (v !== undefined) return v;
		if (key === "fontFamilyCJK" || key === "fontFamilyLatin") return "";
		return (theme as Record<string, unknown>)[key];
	}

	private refreshFields() {
		for (const fr of this.fieldRows) {
			const src = sourceOf(this.set, this.current, this.mode, fr.key as PropKey);
			const own = src.kind === "self";
			fr.row.toggleClass("is-custom", own);
			fr.row.toggleClass("is-inherited", !own);
			fr.reset.toggleClass("is-hidden", !own);
			fr.status.setText(own ? "" : src.kind === "element" ? `继承自${elementName(src.from)}` : "主题默认");
			const theme = probeTheme().elements[this.current] as Record<string, unknown> | undefined;
			const hint = (fr.key === "fontFamilyCJK" || fr.key === "fontFamilyLatin") && typeof theme?.[fr.key] === "string" ? (theme[fr.key] as string) : undefined;
			fr.control.set(this.displayValue(fr.key), hint);
		}
	}

	private onFieldChange(key: FieldKey, v: unknown) {
		const el = this.current;
		const mode = this.mode;
		const setId = this.set.id;
		this.localChange = true;
		this.host.store.update(
			`修改「${elementName(el)}」的${fieldFor(el, key).label}`,
			(d) => {
				const s = d.sets.find((x) => x.id === setId);
				if (!s) return;
				const p = ownProps(s, el, mode) as Record<string, unknown>;
				if (key === "lineHeight") {
					const o = v as StyleProps;
					delete p.lineHeight;
					delete p.lineHeightPt;
					if (o.lineHeightPt !== undefined) p.lineHeightPt = o.lineHeightPt;
					else if (o.lineHeight !== undefined) p.lineHeight = o.lineHeight;
					return;
				}
				if (v === null || v === undefined || v === "") delete p[key];
				else p[key] = v;
			},
			{ coalesceKey: `${setId}.${el}.${mode}.${key}` },
		);
		if ((key === "fontFamilyCJK" || key === "fontFamilyLatin") && typeof v === "string" && v) this.host.onFontPicked(v);
		this.localChange = false;
	}

	private clearField(key: FieldKey) {
		const el = this.current;
		const mode = this.mode;
		this.host.store.update(`恢复「${elementName(el)}」的${fieldFor(el, key).label}`, (d) => {
			const p = ownProps(activeSet(d), el, mode) as Record<string, unknown>;
			delete p[key];
			if (key === "lineHeight") delete p.lineHeightPt;
		});
	}

	/* ----------------------------- 全局选项 ----------------------------- */

	private renderSetOptions(parent: HTMLElement) {
		const g = parent.createDiv({ cls: "doc-style-group" });
		g.createDiv({ cls: "doc-style-group-name", text: "全局选项" });
		const o = this.set.options;
		const optRow = (label: string, help: string) => {
			const row = g.createDiv({ cls: "doc-style-field is-option" });
			const lb = row.createDiv({ cls: "doc-style-field-label" });
			lb.createSpan({ text: label });
			const helpBtn = lb.createEl("button", { cls: "doc-style-help", attr: { type: "button", "aria-label": `${label}说明` } });
			setIcon(helpBtn, "help-circle");
			const body = row.createDiv({ cls: "doc-style-field-body" });
			const helpText = g.createDiv({ cls: "doc-style-help-text is-hidden", text: help });
			helpBtn.addEventListener("click", () => helpText.toggleClass("is-hidden", !helpText.hasClass("is-hidden")));
			return body;
		};
		const setOpt = (label: string, fn: (s: StyleSet) => void, rerenderPreview = false) => {
			this.localChange = true;
			this.host.store.update(label, (d) => fn(activeSet(d)));
			this.localChange = false;
			if (rerenderPreview) this.schedulePreview();
		};

		const punct = switchControl(optRow("中文标点", "开启后，中文里的引号“”、破折号——、省略号……使用中文字体显示（全角字形）。如果你的笔记里英文句子很多，英文引号也会变成全角，可关闭。"), "中文标点", (on) => setOpt("切换中文标点字体", (s) => (s.options.cjkPunctuation = on)));
		punct.input.checked = o.cjkPunctuation;

		const inline = switchControl(optRow("文件名标题", "开启后，「标题 1」的样式同时用于笔记顶部显示的文件名。"), "文件名标题", (on) => setOpt("切换文件名标题样式", (s) => (s.options.h1InlineTitle = on)));
		inline.input.checked = o.h1InlineTitle;

		const widthBody = optRow("每行字数", "限制正文宽度，按正文字号计算每行大约多少个汉字。公文为每行 28 字。需要在 Obsidian 设置里开启「缩减栏宽」。");
		const ws = switchControl(widthBody, "每行字数", (on) => {
			wBox.toggleClass("is-hidden", !on);
			setOpt("设置每行字数", (s) => (s.options.contentWidth = on ? Number(wNum.value) || 36 : null));
		});
		ws.input.checked = o.contentWidth !== null;
		const wBox = widthBody.createDiv({ cls: "doc-style-inline" + (o.contentWidth === null ? " is-hidden" : "") });
		const wNum = wBox.createEl("input", { cls: "doc-style-num", type: "number" });
		wNum.min = "20";
		wNum.max = "80";
		wNum.value = String(o.contentWidth ?? 36);
		wBox.createSpan({ cls: "doc-style-unit", text: "字" });
		wNum.addEventListener("change", () => {
			const v = Math.round(Number(wNum.value));
			if (!Number.isFinite(v) || v < 20 || v > 80) return;
			setOpt("设置每行字数", (s) => (s.options.contentWidth = v));
		});

		const numBody = optRow("标题编号", "自动给标题加编号，只在显示时生成，不会改动笔记原文。公文式：一、（一）1.（1）；论文式：1、1.1、1.1.1。");
		const sel = numBody.createEl("select", { cls: "dropdown doc-style-select" });
		([["none", "不编号"], ["gongwen", "公文式 一、（一）1.（1）"], ["thesis", "论文式 1 / 1.1 / 1.1.1"]] as [NumberingStyle, string][]).forEach(([v, t]) => sel.createEl("option", { value: v, text: t }));
		sel.value = o.numbering.style;
		const lv = numBody.createEl("select", { cls: "dropdown doc-style-select" });
		[1, 2, 3].forEach((n) => lv.createEl("option", { value: String(n), text: `从标题 ${n} 开始` }));
		lv.value = String(o.numbering.startLevel);
		lv.toggleClass("is-hidden", o.numbering.style === "none");
		sel.addEventListener("change", () => {
			lv.toggleClass("is-hidden", sel.value === "none");
			setOpt("设置标题编号", (s) => (s.options.numbering.style = sel.value as NumberingStyle), true);
		});
		lv.addEventListener("change", () => setOpt("设置编号起始级别", (s) => (s.options.numbering.startLevel = Number(lv.value)), true));
	}

	/* ----------------------------- 欢迎页（R21 / R23） ----------------------------- */

	private renderWelcome(c: HTMLElement) {
		const w = c.createDiv({ cls: "doc-style-welcome" });
		w.createEl("h3", { text: "欢迎使用版心" });
		const steps = w.createEl("ol", { cls: "doc-style-welcome-steps" });
		steps.createEl("li", { text: "所有属性默认跟随主题，只有你改过的才会生效，随时可以恢复。" });
		steps.createEl("li", { text: "修改立即对整个笔记库生效并自动保存；改错了按 Ctrl/⌘ + Z 撤销。" });
		steps.createEl("li", { text: "说明文字点每一行旁边的问号查看。少数属性只在阅读视图和导出 PDF 时生效，会有标注。" });
		w.createEl("p", { cls: "doc-style-welcome-q", text: "从哪里开始？" });
		const grid = w.createDiv({ cls: "doc-style-template-grid" });
		for (const t of TEMPLATES) {
			const card = grid.createEl("button", { cls: "doc-style-template-card", attr: { type: "button" } });
			card.createDiv({ cls: "doc-style-template-name", text: `从「${t.name}」开始` });
			card.createDiv({ cls: "doc-style-template-desc", text: t.desc });
			card.addEventListener("click", () => {
				this.host.store.update("完成引导", (d) => (d.onboarded = true), { undoable: false, styleChanged: false });
				new TemplateModal(this.host.app, [t], (ch) => ch && this.host.applyTemplate(ch), { title: "套用模板" }).open();
			});
		}
		const own = grid.createEl("button", { cls: "doc-style-template-card is-plain", attr: { type: "button" } });
		own.createDiv({ cls: "doc-style-template-name", text: "保持主题，自己调" });
		own.createDiv({ cls: "doc-style-template-desc", text: "从「全局」开始，先选中文字体，再逐项调整。" });
		w.createDiv({ cls: "doc-style-welcome-author", text: `版心 · 作者 ${AUTHOR.name} 公众号 / 小红书「${AUTHOR.wechat}」` });
		own.addEventListener("click", () => {
			this.host.store.update("完成引导", (d) => (d.onboarded = true), { undoable: false, styleChanged: false });
			this.select("global");
		});
	}

	/* ----------------------------- 动作 ----------------------------- */

	private copyStyle() {
		const src = this.current;
		new CopyStyleModal(this.host.app, src, (choice) => {
			if (!choice || !choice.targets.length || !choice.fields.length) return;
			this.host.store.update(`复制「${elementName(src)}」的样式`, (d) => {
				const s = activeSet(d);
				const from = s.elements[src];
				for (const t of choice.targets) {
					const to = s.elements[t];
					const allowed = getElement(t).fields;
					const copy = (a: StyleProps, b: StyleProps) => {
						for (const f of choice.fields) {
							if (!allowed.includes(f)) continue;
							const keys: PropKey[] = f === "lineHeight" ? ["lineHeight", "lineHeightPt"] : [f];
							for (const k of keys) {
								const v = (a as Record<string, unknown>)[k];
								if (v === undefined) delete (b as Record<string, unknown>)[k];
								else (b as Record<string, unknown>)[k] = v;
							}
						}
					};
					copy(from.light, to.light);
					if (from.separate) {
						if (!to.separate) {
							to.separate = true;
							to.dark = JSON.parse(JSON.stringify(to.light));
						}
						copy(from.dark, to.dark);
					} else if (to.separate) copy(from.light, to.dark);
				}
			});
			this.host.notifyUndoable(`已复制到 ${choice.targets.map(elementName).join("、")}`);
		}).open();
	}

	private resetElement() {
		const key = this.current;
		if (!isElementCustomized(this.set.elements[key])) {
			new Notice(`「${elementName(key)}」本来就跟随${key === "global" ? "主题" : "全局与主题"}`);
			return;
		}
		this.host.store.update(`重置「${elementName(key)}」`, (d) => {
			activeSet(d).elements[key] = { separate: false, light: {}, dark: {} };
		});
		this.host.notifyUndoable(`已重置「${elementName(key)}」`);
	}

	/* ----------------------------- 对比度检查（R09） ----------------------------- */

	private issues(): Issue[] {
		const out: Issue[] = [];
		const t = probeTheme();
		const lightBg = t.isDark ? t.otherBackground : t.background;
		const darkBg = t.isDark ? t.background : t.otherBackground;
		for (const def of ELEMENTS) {
			if (def.key === "global" || def.key === "code") continue;
			const min = isHeading(def.key) || def.key === "inline" ? 3 : 4.5;
			for (const mode of ["light", "dark"] as Mode[]) {
				const p = resolveProps(this.set, def.key, mode);
				const bg = mode === "dark" ? darkBg : lightBg;
				for (const prop of ["color", "boldColor", "linkColor"] as const) {
					const c = p[prop];
					if (!c || !def.fields.includes(prop)) continue;
					const r = contrastRatio(c, bg);
					if (r !== null && r < min) out.push({ key: def.key, mode, ratio: r, min, prop });
				}
			}
		}
		return out;
	}

	private renderIssues() {
		const list = this.issues();
		this.issuesEl.empty();
		this.issuesEl.toggleClass("is-hidden", !list.length);
		if (!list.length) return;
		const head = this.issuesEl.createDiv({ cls: "doc-style-issues-head" });
		setIcon(head.createSpan(), "alert-triangle");
		head.createSpan({ text: `${list.length} 处颜色可能看不清` });
		for (const i of list) {
			const shared = !this.set.elements[i.key].separate && !(i.key === "list" && this.set.elements.p.separate);
			const where = i.mode === "dark" ? (shared ? "暗色模式下（明暗共用此颜色）" : "暗色模式下") : "明色模式下";
			const row = this.issuesEl.createEl("button", { cls: "doc-style-issue", attr: { type: "button" } });
			row.setText(`「${elementName(i.key)}」${where}对比度 ${i.ratio.toFixed(1)}:1，低于 ${i.min}:1`);
			row.addEventListener("click", () => this.select(i.key));
		}
	}

	/* ----------------------------- 预览 ----------------------------- */

	private schedulePreview() {
		if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			void this.renderPreview();
		}, 120);
	}

	private async renderPreview() {
		await this.preview.render();
		this.noteEl.setText(this.preview.note);
		this.noteEl.toggleClass("is-hidden", !this.preview.note);
	}

	/* ----------------------------- 事件 ----------------------------- */

	private onStoreChange(fromHistory: boolean) {
		this.updateHistoryButtons();
		if (this.localChange && !fromHistory) {
			// 本编辑器自己的修改：只刷新状态，不重建控件（拖动滑块时不丢焦点）
			this.refreshFields();
			this.renderTree();
			this.renderIssues();
			this.flashSaved();
			return;
		}
		if (this.headEl.querySelector(".doc-style-set-name")?.textContent !== this.set.name) this.renderHead();
		this.renderAll();
		this.flashSaved();
	}

	private flashSaved() {
		this.footState.setText("正在保存…");
		window.setTimeout(() => this.footState.setText("已自动保存 · 全库生效"), 450);
	}

	onThemeChange() {
		invalidateProbe();
		// 应用切换明暗后，预览默认跟着切换
		const dark = probeTheme().isDark;
		this.preview.theme = dark ? "dark" : "light";
		this.themeSeg?.querySelectorAll(".doc-style-seg-btn").forEach((b, i) => b.toggleClass("is-active", (i === 1) === dark));
		this.renderAll();
	}

	private onKey(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey;
		const target = e.target as HTMLElement;
		const typing = target.tagName === "INPUT" && !["checkbox", "range", "color"].includes((target as HTMLInputElement).type);
		if (mod && !typing && e.key.toLowerCase() === "z") {
			e.preventDefault();
			e.stopPropagation();
			if (e.shiftKey) this.host.redo();
			else this.host.undo();
			return;
		}
		if (mod && !typing && e.key.toLowerCase() === "y") {
			e.preventDefault();
			this.host.redo();
			return;
		}
		if (e.key === "Escape") closeActivePopover();
		// 元素树：上下键切换
		if ((e.key === "ArrowDown" || e.key === "ArrowUp") && target.closest(".doc-style-tree")) {
			e.preventDefault();
			const keys = ELEMENTS.map((x) => x.key);
			const i = keys.indexOf(this.current);
			const next = keys[(i + (e.key === "ArrowDown" ? 1 : -1) + keys.length) % keys.length];
			this.select(next);
		}
	}

	selectElement(key: ElementKey) {
		this.select(key);
	}

	destroy() {
		this.unsub();
		this.resizeObserver.disconnect();
		if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
		this.preview.destroy();
		closeActivePopover();
		this.rootEl.remove();
	}
}

export { HEADING_KEYS };
