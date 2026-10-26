/* ==========================================================================
   弹窗（替代 window.prompt / window.confirm —— 后者在 Obsidian 中不可用或风格不一致）
   ========================================================================== */

import { App, ButtonComponent, Modal, Setting, TextComponent } from "obsidian";
import { ElementKey, ELEMENTS, FieldKey, FONT_FALLBACKS, getElement, HEADING_KEYS } from "../constants";
import { isFontInstalled } from "../fonts";
import { Template, templateFonts } from "../templates";
import { FIELD_LABELS } from "./fields";

/* ----------------------------- 文本输入 ----------------------------- */

export class TextInputModal extends Modal {
	private value: string;
	private resolved = false;
	constructor(app: App, private opts: { title: string; desc?: string; placeholder?: string; value?: string; cta?: string }, private done: (v: string | null) => void) {
		super(app);
		this.value = opts.value ?? "";
	}
	onOpen() {
		this.modalEl.addClass("doc-style-dialog");
		this.titleEl.setText(this.opts.title);
		if (this.opts.desc) this.contentEl.createEl("p", { text: this.opts.desc, cls: "doc-style-dialog-desc" });
		const input = new TextComponent(this.contentEl);
		input.inputEl.addClass("doc-style-dialog-input");
		input.setPlaceholder(this.opts.placeholder ?? "").setValue(this.value).onChange((v) => (this.value = v));
		input.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.isComposing) {
				e.preventDefault();
				this.finish(this.value.trim() || null);
			}
		});
		const row = this.contentEl.createDiv({ cls: "doc-style-dialog-buttons" });
		new ButtonComponent(row).setButtonText("取消").onClick(() => this.finish(null));
		new ButtonComponent(row).setButtonText(this.opts.cta ?? "确定").setCta().onClick(() => this.finish(this.value.trim() || null));
		window.setTimeout(() => input.inputEl.select(), 0);
	}
	private finish(v: string | null) {
		this.resolved = true;
		this.done(v);
		this.close();
	}
	onClose() {
		if (!this.resolved) this.done(null);
		this.contentEl.empty();
	}
}

export function promptText(app: App, opts: ConstructorParameters<typeof TextInputModal>[1]): Promise<string | null> {
	return new Promise((res) => new TextInputModal(app, opts, res).open());
}

/* ----------------------------- 确认 ----------------------------- */

export class ConfirmModal extends Modal {
	private resolved = false;
	constructor(app: App, private opts: { title: string; message: string; cta?: string; danger?: boolean }, private done: (ok: boolean) => void) {
		super(app);
	}
	onOpen() {
		this.modalEl.addClass("doc-style-dialog");
		this.titleEl.setText(this.opts.title);
		this.contentEl.createEl("p", { text: this.opts.message, cls: "doc-style-dialog-desc" });
		const row = this.contentEl.createDiv({ cls: "doc-style-dialog-buttons" });
		new ButtonComponent(row).setButtonText("取消").onClick(() => this.finish(false));
		const ok = new ButtonComponent(row).setButtonText(this.opts.cta ?? "确定").onClick(() => this.finish(true));
		if (this.opts.danger) ok.setWarning();
		else ok.setCta();
	}
	private finish(v: boolean) {
		this.resolved = true;
		this.done(v);
		this.close();
	}
	onClose() {
		if (!this.resolved) this.done(false);
		this.contentEl.empty();
	}
}

export function confirmDialog(app: App, opts: ConstructorParameters<typeof ConfirmModal>[1]): Promise<boolean> {
	return new Promise((res) => new ConfirmModal(app, opts, res).open());
}

/* ----------------------------- 复制样式到…（R06） ----------------------------- */

export interface CopyChoice {
	targets: ElementKey[];
	fields: FieldKey[];
}

export class CopyStyleModal extends Modal {
	private targets = new Set<ElementKey>();
	private fields = new Set<FieldKey>();
	constructor(app: App, private source: ElementKey, private done: (c: CopyChoice | null) => void) {
		super(app);
		const def = getElement(source);
		// 默认：同组的其它元素；属性默认全选，但不含字号（避免各级标题变成一样大）
		const pool = HEADING_KEYS.includes(source) ? HEADING_KEYS : [];
		pool.filter((k) => k !== source).forEach((k) => this.targets.add(k));
		def.fields.filter((f) => f !== "fontSize").forEach((f) => this.fields.add(f));
	}
	onOpen() {
		this.modalEl.addClass("doc-style-dialog", "doc-style-copy-dialog");
		this.titleEl.setText(`复制「${getElement(this.source).name}」的样式到…`);
		this.contentEl.createEl("p", { cls: "doc-style-dialog-desc", text: "明色、暗色设置分别复制。目标元素没有的属性会自动跳过。" });
		const cols = this.contentEl.createDiv({ cls: "doc-style-copy-cols" });

		const left = cols.createDiv();
		left.createEl("h4", { text: "复制到" });
		for (const e of ELEMENTS) {
			if (e.key === this.source || e.key === "inline") continue;
			this.checkbox(left, e.name, this.targets.has(e.key), (v) => (v ? this.targets.add(e.key) : this.targets.delete(e.key)));
		}
		const right = cols.createDiv();
		right.createEl("h4", { text: "复制哪些属性" });
		for (const f of getElement(this.source).fields) {
			this.checkbox(right, FIELD_LABELS[f] + (f === "fontSize" ? "（默认不复制）" : ""), this.fields.has(f), (v) => (v ? this.fields.add(f) : this.fields.delete(f)));
		}
		const row = this.contentEl.createDiv({ cls: "doc-style-dialog-buttons" });
		new ButtonComponent(row).setButtonText("取消").onClick(() => this.close());
		new ButtonComponent(row).setButtonText("复制").setCta().onClick(() => {
			this.done({ targets: Array.from(this.targets), fields: Array.from(this.fields) });
			this.done = () => {};
			this.close();
		});
	}
	private checkbox(parent: HTMLElement, label: string, checked: boolean, on: (v: boolean) => void) {
		const l = parent.createEl("label", { cls: "doc-style-check" });
		const cb = l.createEl("input", { type: "checkbox" });
		cb.checked = checked;
		cb.addEventListener("change", () => on(cb.checked));
		l.createSpan({ text: label });
	}
	onClose() {
		this.done(null);
		this.contentEl.empty();
	}
}

/* ----------------------------- 模板（R23） ----------------------------- */

export interface TemplateChoice {
	template: Template;
	mode: "apply" | "new";
	replacements: Record<string, string>;
}

export class TemplateModal extends Modal {
	private picked: Template | null = null;
	constructor(app: App, private templates: Template[], private done: (c: TemplateChoice | null) => void, private opts: { title?: string; allowNew?: boolean } = {}) {
		super(app);
	}
	onOpen() {
		this.modalEl.addClass("doc-style-dialog", "doc-style-template-dialog");
		this.titleEl.setText(this.opts.title ?? "套用模板");
		this.render();
	}
	private render() {
		const c = this.contentEl;
		c.empty();
		if (!this.picked) {
			c.createEl("p", { cls: "doc-style-dialog-desc", text: "选一个起点，之后可以随意微调。套用后可以撤销。" });
			const grid = c.createDiv({ cls: "doc-style-template-grid" });
			for (const t of this.templates) {
				const card = grid.createEl("button", { cls: "doc-style-template-card" });
				card.createDiv({ cls: "doc-style-template-name", text: t.name });
				card.createDiv({ cls: "doc-style-template-desc", text: t.desc });
				card.addEventListener("click", () => {
					this.picked = t;
					this.render();
				});
			}
			return;
		}
		const t = this.picked;
		c.createEl("h4", { text: t.name });
		const missing = templateFonts(t).filter((f) => !isFontInstalled(f));
		const replacements: Record<string, string> = {};
		if (missing.length) {
			const box = c.createDiv({ cls: "doc-style-callout is-warn" });
			box.createDiv({ text: `本机缺少 ${missing.length} 个模板字体，未安装的字体会回退到主题字体：` });
			for (const f of missing) {
				const alt = (FONT_FALLBACKS[f] ?? []).find((a) => isFontInstalled(a));
				if (alt) replacements[f] = alt;
				box.createDiv({ cls: "doc-style-missing-row", text: alt ? `· ${f} → 可用替代：${alt}` : `· ${f}（没有找到可用的替代字体）` });
			}
		} else {
			c.createDiv({ cls: "doc-style-callout is-ok", text: "模板用到的字体本机都已安装。" });
		}
		let useAlt = Object.keys(replacements).length > 0;
		if (useAlt) {
			new Setting(c).setName("用替代字体顶上").setDesc("推荐开启。以后装好原字体，可在字体菜单里换回。").addToggle((tg) => tg.setValue(true).onChange((v) => (useAlt = v)));
		}
		const row = c.createDiv({ cls: "doc-style-dialog-buttons" });
		new ButtonComponent(row).setButtonText("返回").onClick(() => {
			this.picked = null;
			this.render();
		});
		if (this.opts.allowNew !== false) {
			new ButtonComponent(row).setButtonText("另存为新样式集").onClick(() => this.finish({ template: t, mode: "new", replacements: useAlt ? replacements : {} }));
		}
		new ButtonComponent(row).setButtonText("套用到当前样式集").setCta().onClick(() => this.finish({ template: t, mode: "apply", replacements: useAlt ? replacements : {} }));
	}
	private finish(c: TemplateChoice) {
		this.done(c);
		this.done = () => {};
		this.close();
	}
	onClose() {
		this.done(null);
		this.contentEl.empty();
	}
}
