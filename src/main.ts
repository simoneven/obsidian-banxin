/* ==========================================================================
   版心 · 中文排版 —— 插件入口
   ========================================================================== */

import {
	App, Component, ItemView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf,
	FuzzySuggestModal,
} from "obsidian";
import { AUTHOR, ElementKey, elementName, VIEW_TYPE } from "./constants";
import { anyIndent, generateCss } from "./css/generator";
import { disposeSheet, setSheetCss } from "./css/sheet";
import { facesFor, loadFonts, resetInstalledCache } from "./fonts";
import { applyIndent, applyIndentEverywhere, removeIndentSpans } from "./indent";
import { numberingEditorExtension, numberingPostProcessor } from "./numbering-runtime";
import { invalidateProbe } from "./probe";
import {
	activeSet, clone, cssClassFor, exportSetJson, importSetJson, isElementCustomized, loadData, newId, newStyleSet,
	PluginData, StyleSet,
} from "./schema";
import { Store } from "./store";
import { replaceFonts, templateElements, templateOptions, TEMPLATES } from "./templates";
import { EditorHost, StyleEditor } from "./ui/editor";
import { confirmDialog, promptText, TemplateChoice, TemplateModal } from "./ui/modals";
import { closeActivePopover } from "./ui/popover";

const SAVE_DELAY = 400;

export default class DocStylePlugin extends Plugin implements EditorHost {
	store!: Store;
	private currentCss = "";
	private editors = new Set<StyleEditor>();
	private saveTimer: number | null = null;
	private cssFrame: number | null = null;
	private indentOn = false;
	private numberingKey = "";
	private numberingVersion = 0;

	async onload() {
		this.store = new Store(loadData(await this.loadData()));
		this.indentOn = anyIndent(this.store.state);
		this.numberingKey = this.numberingSignature();
		this.injectCss(true);

		this.store.subscribe((info) => this.onChange(info.styleChanged, info.fromHistory === true));

		this.addRibbonIcon("pilcrow", "版心 · 中文排版", () => this.openModal());
		this.addCommand({ id: "open-style-editor", name: "打开样式编辑器", callback: () => this.openModal() });
		this.addCommand({ id: "open-style-editor-sidebar", name: "在右侧栏打开样式编辑器", callback: () => void this.activateView() });
		this.addCommand({
			id: "edit-style-at-cursor",
			name: "编辑光标所在元素的样式",
			editorCallback: (editor) => {
				const line = editor.getLine(editor.getCursor().line);
				void this.activateView(elementAtLine(line));
			},
		});
		this.addCommand({ id: "apply-template", name: "套用模板…", callback: () => new TemplateModal(this.app, TEMPLATES, (c) => c && this.applyTemplate(c)).open() });
		this.addCommand({ id: "switch-style-set", name: "切换样式集…", callback: () => new SetSuggest(this.app, this.store.state.sets, (s) => this.switchSet(s.id), "切换到哪个样式集？").open() });
		this.addCommand({ id: "apply-set-to-note", name: "给当前笔记指定样式集…", checkCallback: (checking) => this.noteCommand(checking, () => void this.applySetToActiveNote()) });
		this.addCommand({ id: "remove-set-from-note", name: "取消当前笔记的单独样式集", checkCallback: (checking) => this.noteCommand(checking, () => void this.clearNoteSet()) });
		this.addCommand({ id: "undo-style-change", name: "撤销上一次样式修改", callback: () => this.undo() });
		this.addCommand({ id: "redo-style-change", name: "重做样式修改", callback: () => this.redo() });
		this.addCommand({ id: "reset-all-styles", name: "重置全部样式（恢复跟随主题）", callback: () => void this.resetAll() });

		this.registerMarkdownPostProcessor((el) => {
			if (this.indentOn) applyIndent(el, true);
		});
		this.registerMarkdownPostProcessor(numberingPostProcessor((p) => this.setForPath(p)));
		this.registerEditorExtension(numberingEditorExtension((p) => this.setForPath(p), () => this.numberingVersion));

		this.registerView(VIEW_TYPE, (leaf) => new StyleView(leaf, this));
		this.registerEvent(
			this.app.workspace.on("css-change", () => {
				invalidateProbe();
				resetInstalledCache();
				this.editors.forEach((e) => e.onThemeChange());
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				// 笔记的 cssclasses 变化后，编号需要按新的样式集重算
				if (this.store.state.sets.length > 1 && this.app.workspace.getActiveFile()?.path === file.path) this.bumpNumbering();
			}),
		);
		this.registerDomEvent(document, "mousedown", (e) => closeActivePopover(e.target));
		this.registerDomEvent(document, "keydown", (e) => {
			if (e.key === "Escape") closeActivePopover();
		});
		this.addSettingTab(new DocStyleSettingTab(this.app, this));
	}

	onunload() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			void this.saveData(this.store.state);
		}
		if (this.cssFrame !== null) window.cancelAnimationFrame(this.cssFrame);
		closeActivePopover();
		removeIndentSpans();
		disposeSheet();
	}

	/* ----------------------------- 变更处理 ----------------------------- */

	private onChange(styleChanged: boolean, fromHistory: boolean) {
		this.scheduleSave();
		if (!styleChanged) return;
		this.scheduleCss();
		const indent = anyIndent(this.store.state);
		if (indent !== this.indentOn) {
			// R20：只有缩进开关真正变化时才重新扫描全部段落
			this.indentOn = indent;
			applyIndentEverywhere(indent);
		}
		const sig = this.numberingSignature();
		if (sig !== this.numberingKey) {
			this.numberingKey = sig;
			this.bumpNumbering();
		}
		if (!fromHistory && !this.store.state.firstChangeTipShown) {
			this.store.update("首次修改提示", (d) => (d.firstChangeTipShown = true), { undoable: false, styleChanged: false });
			this.notifyUndoable("已应用到整个笔记库。随时可以撤销，或在设置里重置。");
		}
	}

	private numberingSignature(): string {
		return JSON.stringify(this.store.state.sets.map((s) => [s.id, s.cssClass, s.options.numbering])) + this.store.state.activeSetId;
	}

	private bumpNumbering() {
		this.numberingVersion++;
		this.app.workspace.updateOptions();
		// 阅读视图：重新渲染打开的笔记
		this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			const v = leaf.view;
			if (v instanceof MarkdownView && v.getMode() === "preview") v.previewMode.rerender(true);
		});
	}

	private scheduleSave() {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.saveData(this.store.state);
		}, SAVE_DELAY);
	}

	/** R20：拖动滑块时每帧最多生成一次 CSS */
	private scheduleCss() {
		if (this.cssFrame !== null) return;
		this.cssFrame = window.requestAnimationFrame(() => {
			this.cssFrame = null;
			this.injectCss();
		});
	}

	injectCss(force = false) {
		let css = "";
		try {
			css = generateCss(this.store.state);
		} catch (e) {
			console.error("[版心] 生成样式失败", e);
			return;
		}
		if (!force && css === this.currentCss) return;
		this.currentCss = css;
		setSheetCss(css);
	}

	/* ----------------------------- 样式集 ----------------------------- */

	/** 某篇笔记适用的样式集：frontmatter cssclasses 指定的优先，否则为当前样式集 */
	setForPath(path: string): StyleSet {
		const d = this.store.state;
		if (path && d.sets.length > 1) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				const raw = this.app.metadataCache.getFileCache(file)?.frontmatter?.cssclasses ?? this.app.metadataCache.getFileCache(file)?.frontmatter?.cssclass;
				const classes: string[] = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
				const hit = d.sets.find((s) => s.id !== d.activeSetId && classes.includes(s.cssClass));
				if (hit) return hit;
			}
		}
		return activeSet(d);
	}

	switchSet(id: string) {
		if (id === this.store.state.activeSetId) return;
		const name = this.store.state.sets.find((s) => s.id === id)?.name ?? "";
		this.store.update(`切换到「${name}」`, (d) => (d.activeSetId = id));
		this.notifyUndoable(`已切换到「${name}」，全库生效`);
	}

	async newSet() {
		const name = await promptText(this.app, { title: "新建样式集", placeholder: "样式集名称", value: "新样式" });
		if (!name) return;
		const s = newStyleSet(name);
		this.store.update(`新建「${name}」`, (d) => {
			d.sets.push(s);
			d.activeSetId = s.id;
		});
	}

	duplicateSet() {
		const src = activeSet(this.store.state);
		const copy = clone(src);
		copy.id = newId();
		copy.cssClass = cssClassFor(copy.id);
		copy.name = `${src.name} 副本`;
		this.store.update(`复制「${src.name}」`, (d) => {
			d.sets.push(copy);
			d.activeSetId = copy.id;
		});
		this.notifyUndoable(`已复制为「${copy.name}」`);
	}

	async renameSet() {
		const s = activeSet(this.store.state);
		const name = await promptText(this.app, { title: "重命名样式集", value: s.name });
		if (!name || name === s.name) return;
		this.store.update("重命名样式集", (d) => (activeSet(d).name = name.slice(0, 40)));
	}

	async deleteSet() {
		const d0 = this.store.state;
		if (d0.sets.length <= 1) return;
		const s = activeSet(d0);
		const ok = await confirmDialog(this.app, { title: "删除样式集", message: `删除「${s.name}」？指定了这个样式集的笔记会改用全库样式。可以撤销。`, cta: "删除", danger: true });
		if (!ok) return;
		this.store.update(`删除「${s.name}」`, (d) => {
			d.sets = d.sets.filter((x) => x.id !== s.id);
			d.activeSetId = d.sets[0].id;
		});
		this.notifyUndoable(`已删除「${s.name}」`);
	}

	applyTemplate(c: TemplateChoice) {
		const t = c.template;
		this.store.update(c.mode === "new" ? `从模板新建「${t.name}」` : `套用模板「${t.name}」`, (d) => {
			let target: StyleSet;
			if (c.mode === "new") {
				target = newStyleSet(t.name);
				d.sets.push(target);
				d.activeSetId = target.id;
			} else target = activeSet(d);
			target.elements = templateElements(t);
			target.options = templateOptions(t);
			replaceFonts(target, c.replacements);
			d.onboarded = true;
		});
		this.notifyUndoable(`已套用「${t.name}」模板`);
	}

	exportSet() {
		const s = activeSet(this.store.state);
		const blob = new Blob([exportSetJson(s)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.body.createEl("a", { href: url, attr: { download: `版心-${s.name}.json` } });
		a.click();
		a.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 2000);
		new Notice(`已导出「${s.name}」`);
	}

	importSet() {
		const input = document.body.createEl("input", { type: "file", attr: { accept: ".json,application/json" } });
		input.addClass("doc-style-hidden-input");
		input.addEventListener("change", async () => {
			const file = input.files?.[0];
			input.remove();
			if (!file) return;
			try {
				const s = importSetJson(await file.text());
				if (this.store.state.sets.some((x) => x.name === s.name)) s.name += "（导入）";
				this.store.update(`导入「${s.name}」`, (d) => {
					d.sets.push(s);
					d.activeSetId = s.id;
				});
				this.notifyUndoable(`已导入并切换到「${s.name}」`);
			} catch (e) {
				new Notice(`导入失败：${(e as Error).message}`);
			}
		});
		input.click();
	}

	async resetAll() {
		const ok = await confirmDialog(this.app, {
			title: "重置全部样式",
			message: `清空「${activeSet(this.store.state).name}」的全部自定义，恢复跟随主题？可以撤销。`,
			cta: "重置",
			danger: true,
		});
		if (!ok) return;
		this.store.update("重置全部样式", (d) => {
			const s = activeSet(d);
			const fresh = newStyleSet(s.name);
			s.elements = fresh.elements;
			s.options = fresh.options;
		});
		this.notifyUndoable("已重置全部样式，恢复跟随主题");
	}

	/* ----------------------------- 按笔记套用（R24） ----------------------------- */

	private noteCommand(checking: boolean, run: () => void): boolean {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") return false;
		if (!checking) run();
		return true;
	}

	async applySetToActiveNote() {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("请先打开一篇笔记");
			return;
		}
		const sets = this.store.state.sets;
		if (sets.length < 2) {
			new Notice("只有一个样式集。先新建或从模板新建一个样式集，再把它指定给这篇笔记。");
			return;
		}
		new SetSuggest(this.app, sets.filter((s) => s.id !== this.store.state.activeSetId), async (s) => {
			await this.writeNoteClass(file, s.cssClass);
			new Notice(`「${file.basename}」改用「${s.name}」样式`);
		}, `「${file.basename}」使用哪个样式集？（其余笔记不受影响）`).open();
	}

	private async clearNoteSet() {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		await this.writeNoteClass(file, null);
		new Notice(`「${file.basename}」恢复使用全库样式`);
	}

	private async writeNoteClass(file: TFile, cls: string | null) {
		const ours = new Set(this.store.state.sets.map((s) => s.cssClass));
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const raw = fm.cssclasses;
			let list: string[] = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,]+/).filter(Boolean) : [];
			list = list.filter((c) => !ours.has(c));
			if (cls) list.push(cls);
			if (list.length) fm.cssclasses = list;
			else delete fm.cssclasses;
		});
		this.bumpNumbering();
	}

	/* ----------------------------- EditorHost ----------------------------- */

	recentFonts(): string[] {
		return this.store.state.recentFonts;
	}

	onFontPicked(name: string) {
		this.store.update("记录字体", (d) => {
			d.recentFonts = [name, ...d.recentFonts.filter((n) => n !== name)].slice(0, 8);
			const f = facesFor(name);
			if (f && (f.regular.length || f.bold.length)) d.fontFaces[name] = f;
		}, { undoable: false, styleChanged: !!facesFor(name) });
	}

	/** 打开字体菜单读到本机字体后，为已在使用的字体补全精确字面名 */
	async refreshFontFaces() {
		await loadFonts();
		const used = new Set<string>();
		for (const s of this.store.state.sets) for (const e of Object.values(s.elements)) for (const p of [e.light, e.dark]) {
			if (p.fontFamilyCJK) used.add(p.fontFamilyCJK);
			if (p.fontFamilyLatin) used.add(p.fontFamilyLatin);
		}
		const updates: Record<string, { regular: string[]; bold: string[] }> = {};
		for (const n of used) {
			const f = facesFor(n);
			if (f && JSON.stringify(f) !== JSON.stringify(this.store.state.fontFaces[n])) updates[n] = f;
		}
		if (Object.keys(updates).length) this.store.update("更新字体信息", (d) => Object.assign(d.fontFaces, updates), { undoable: false });
	}

	undo() {
		const label = this.store.undo();
		new Notice(label ? `已撤销：${label}` : "没有可以撤销的修改");
	}

	redo() {
		const label = this.store.redo();
		new Notice(label ? `已重做：${label}` : "没有可以重做的修改");
	}

	notifyUndoable(message: string) {
		const frag = createFragment();
		frag.createSpan({ text: message + " " });
		const btn = frag.createEl("button", { cls: "doc-style-notice-undo", text: "撤销" });
		const n = new Notice(frag, 6000);
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.undo();
			n.hide();
		});
	}

	openSettings() {
		const setting = (this.app as App & { setting?: { open(): void; openTabById(id: string): void } }).setting;
		setting?.open();
		setting?.openTabById(this.manifest.id);
	}

	/* ----------------------------- 编辑器入口 ----------------------------- */

	openModal(initial?: ElementKey) {
		new StyleModal(this.app, this, initial).open();
	}

	async activateView(initial?: ElementKey) {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		if (!leaf) return;
		await workspace.revealLeaf(leaf);
		if (initial && leaf.view instanceof StyleView) leaf.view.editor?.selectElement(initial);
	}

	registerEditor(e: StyleEditor) {
		this.editors.add(e);
		void this.refreshFontFaces().catch(() => {});
	}

	unregisterEditor(e: StyleEditor) {
		this.editors.delete(e);
	}
}

/** 根据光标所在行判断元素（R17） */
export function elementAtLine(line: string): ElementKey {
	const h = line.match(/^\s{0,3}(#{1,6})\s/);
	if (h) return ("h" + h[1].length) as ElementKey;
	if (/^\s*>\s*\[!/.test(line)) return "callout";
	if (/^\s*>/.test(line)) return "blockquote";
	if (/^\s*\|/.test(line)) return "table";
	if (/^\s*([-*+]|\d+[.)])\s/.test(line)) return "list";
	if (/^\s*(```|~~~)/.test(line)) return "code";
	return "p";
}

/* ----------------------------- 弹窗与侧栏 ----------------------------- */

class StyleModal extends Modal {
	private editor: StyleEditor | null = null;
	private comp = new Component();
	constructor(app: App, private plugin: DocStylePlugin, private initial?: ElementKey) {
		super(app);
	}
	onOpen() {
		this.modalEl.addClass("doc-style-modal");
		this.titleEl.setText("版心");
		this.titleEl.addClass("doc-style-visually-hidden");
		this.comp.load();
		this.editor = new StyleEditor(this.plugin, this.comp, {
			dockable: true,
			initialElement: this.initial,
			onDock: () => {
				this.close();
				void this.plugin.activateView();
			},
		});
		this.contentEl.addClass("doc-style-modal-content");
		this.contentEl.appendChild(this.editor.rootEl);
		this.plugin.registerEditor(this.editor);
	}
	onClose() {
		if (this.editor) {
			this.plugin.unregisterEditor(this.editor);
			this.editor.destroy();
			this.editor = null;
		}
		this.comp.unload();
		this.contentEl.empty();
	}
}

class StyleView extends ItemView {
	editor: StyleEditor | null = null;
	constructor(leaf: WorkspaceLeaf, private plugin: DocStylePlugin) {
		super(leaf);
	}
	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return "版心";
	}
	getIcon() {
		return "pilcrow";
	}
	async onOpen() {
		this.contentEl.addClass("doc-style-view-content");
		this.editor = new StyleEditor(this.plugin, this);
		this.contentEl.appendChild(this.editor.rootEl);
		this.plugin.registerEditor(this.editor);
	}
	async onClose() {
		if (this.editor) {
			this.plugin.unregisterEditor(this.editor);
			this.editor.destroy();
			this.editor = null;
		}
		this.contentEl.empty();
	}
}

class SetSuggest extends FuzzySuggestModal<StyleSet> {
	constructor(app: App, private sets: StyleSet[], private onPick: (s: StyleSet) => void, placeholder: string) {
		super(app);
		this.setPlaceholder(placeholder);
	}
	getItems() {
		return this.sets;
	}
	getItemText(s: StyleSet) {
		return s.name;
	}
	onChooseItem(s: StyleSet) {
		this.onPick(s);
	}
}

/* ----------------------------- 设置页（R21：说明书） ----------------------------- */

class DocStyleSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: DocStylePlugin) {
		super(app, plugin);
	}
	display() {
		const { containerEl } = this;
		containerEl.empty();
		const d: PluginData = this.plugin.store.state;
		const s = activeSet(d);

		containerEl.createEl("p", {
			cls: "doc-style-setting-intro",
			text: "像 Word 一样用图形界面设置标题、正文、引用等样式。所有属性默认跟随主题，只有改过的才会生效；修改立即对整个笔记库生效，可以撤销。",
		});

		const summary = containerEl.createDiv({ cls: "doc-style-setting-summary" });
		const customized = Object.entries(s.elements).filter(([, e]) => isElementCustomized(e)).map(([k]) => elementName(k as ElementKey));
		summary.createDiv({ text: `当前样式集：「${s.name}」（共 ${d.sets.length} 个样式集）` });
		summary.createDiv({ cls: "setting-item-description", text: customized.length ? `已自定义：${customized.join("、")}` : "还没有任何自定义，全部跟随主题。" });
		if (s.options.numbering.style !== "none") summary.createDiv({ cls: "setting-item-description", text: `标题编号：${s.options.numbering.style === "gongwen" ? "公文式" : "论文式"}，从标题 ${s.options.numbering.startLevel} 开始` });

		new Setting(containerEl).setName("打开样式编辑器").setDesc("在弹窗中编辑").addButton((b) => b.setButtonText("打开").setCta().onClick(() => this.plugin.openModal()));
		new Setting(containerEl).setName("在右侧栏打开").setDesc("边改边看真实笔记，不会被弹窗遮挡").addButton((b) => b.setButtonText("打开").onClick(() => void this.plugin.activateView()));
		new Setting(containerEl).setName("套用模板").setDesc("国标公文 · 学术论文 · 舒适阅读").addButton((b) =>
			b.setButtonText("选择模板").onClick(() => new TemplateModal(this.app, TEMPLATES, (c) => {
				if (c) {
					this.plugin.applyTemplate(c);
					this.display();
				}
			}).open()),
		);

		new Setting(containerEl).setName("按笔记使用不同样式").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "打开一篇笔记，运行命令「给当前笔记指定样式集」，这篇笔记就会改用选中的样式集，其余笔记不受影响。也可以在样式编辑器顶部的样式集菜单里操作。",
		});

		new Setting(containerEl).setName("高级").setHeading();
		new Setting(containerEl)
			.setName("降低优先级以兼容主题")
			.setDesc("开启后，主题自带的排版细节会优先于这里的设置。只有在样式与主题冲突、显示异常时才需要开启。")
			.addToggle((t) =>
				t.setValue(d.reducePriority).onChange((v) => this.plugin.store.update("切换优先级", (x) => (x.reducePriority = v))),
			);
		new Setting(containerEl)
			.setName("重新显示新手引导")
			.setDesc("下次打开样式编辑器时显示欢迎页和模板选择")
			.addButton((b) => b.setButtonText("重新显示").onClick(() => {
				this.plugin.store.update("重新显示引导", (x) => (x.onboarded = false), { undoable: false, styleChanged: false });
				new Notice("下次打开样式编辑器时会显示欢迎页");
			}));
		new Setting(containerEl)
			.setName("重置全部样式")
			.setDesc("清空当前样式集的所有自定义，恢复跟随主题（可以撤销）")
			.addButton((b) => b.setButtonText("重置").setWarning().onClick(async () => {
				await this.plugin.resetAll();
				this.display();
			}));
		containerEl.createEl("p", { cls: "setting-item-description", text: "说明：样式通过插件生效，停用插件后笔记恢复主题原样；设置会保留，重新启用即恢复。" });

		new Setting(containerEl).setName("关于作者").setHeading();
		const about = containerEl.createDiv({ cls: "doc-style-about" });
		about.createDiv({ text: `版心由 ${AUTHOR.name} 制作。` });
		about.createDiv({ cls: "setting-item-description", text: `更多排版模板、使用技巧和更新预告，欢迎关注公众号「${AUTHOR.wechat}」和小红书「${AUTHOR.xiaohongshu}」。使用中遇到问题、想要新模板，也可以在那里留言。` });
	}
}
