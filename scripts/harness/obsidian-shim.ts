/* 浏览器测试用的 Obsidian API 替身：只实现插件用到的部分，用来在 Chromium 里跑真实界面 */
/* eslint-disable */

type Attrs = { cls?: string | string[]; text?: string; attr?: Record<string, string>; type?: string; value?: string; href?: string; placeholder?: string };

function applyAttrs(el: HTMLElement, o?: Attrs | string) {
	if (!o) return;
	if (typeof o === "string") {
		el.className = o;
		return;
	}
	if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
	if (o.text !== undefined) el.textContent = o.text;
	if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
	if (o.type) (el as HTMLInputElement).type = o.type;
	if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
	if (o.href) (el as HTMLAnchorElement).href = o.href;
	if (o.placeholder) (el as HTMLInputElement).placeholder = o.placeholder;
}

const P = Node.prototype as any;
P.createEl = function (tag: string, o?: Attrs, cb?: (e: HTMLElement) => void) {
	const el = document.createElement(tag);
	applyAttrs(el, o);
	this.appendChild(el);
	cb?.(el);
	return el;
};
P.createDiv = function (o?: Attrs) {
	return this.createEl("div", o);
};
P.createSpan = function (o?: Attrs) {
	return this.createEl("span", o);
};
P.empty = function () {
	while (this.firstChild) this.removeChild(this.firstChild);
};
P.setText = function (t: string) {
	this.textContent = t;
};
const E = HTMLElement.prototype as any;
E.addClass = function (...c: string[]) {
	this.classList.add(...c);
};
E.removeClass = function (...c: string[]) {
	this.classList.remove(...c);
};
E.toggleClass = function (c: string, v: boolean) {
	this.classList.toggle(c, v);
};
E.hasClass = function (c: string) {
	return this.classList.contains(c);
};
E.setAttr = function (k: string, v: string) {
	this.setAttribute(k, v);
};
E.setCssProps = function (p: Record<string, string>) {
	for (const [k, v] of Object.entries(p)) this.style.setProperty(k, v);
};
const W = window as any;
W.createEl = (tag: string, o?: Attrs) => {
	const el = document.createElement(tag);
	applyAttrs(el, o);
	return el;
};
W.createDiv = (o?: Attrs) => W.createEl("div", o);
W.createSpan = (o?: Attrs) => W.createEl("span", o);
W.createFragment = () => document.createDocumentFragment();

/* ----------------------------- 图标 / 提示 ----------------------------- */

import ICONS from "./icons.json";

export function setIcon(el: HTMLElement, name: string) {
	el.empty();
	const inner = (ICONS as Record<string, string>)[name];
	if (inner) {
		el.insertAdjacentHTML("beforeend", `<svg xmlns="http://www.w3.org/2000/svg" class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`);
		return;
	}
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("width", "16");
	svg.setAttribute("height", "16");
	svg.setAttribute("data-icon", name);
	svg.setAttribute("class", "svg-icon");
	const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	c.setAttribute("cx", "12");
	c.setAttribute("cy", "12");
	c.setAttribute("r", "7");
	c.setAttribute("fill", "none");
	c.setAttribute("stroke", "currentColor");
	c.setAttribute("stroke-width", "2");
	svg.appendChild(c);
	el.appendChild(svg);
}
export function setTooltip(el: HTMLElement, t: string) {
	el.setAttribute("title", t);
}

/* ----------------------------- 组件 ----------------------------- */

export class Component {
	_children: any[] = [];
	load() {}
	unload() {}
	addChild(c: any) {
		this._children.push(c);
		return c;
	}
	register(_f: () => void) {}
	registerEvent(_e: any) {}
	registerDomEvent(el: any, ev: string, fn: any) {
		el.addEventListener(ev, fn);
	}
}

export class Events {
	private h: Record<string, Function[]> = {};
	on(n: string, f: Function) {
		(this.h[n] ??= []).push(f);
		return { n, f };
	}
	trigger(n: string, ...a: any[]) {
		(this.h[n] ?? []).forEach((f) => f(...a));
	}
}

export class TFile {
	constructor(public path: string, public basename: string, public extension = "md") {}
}

export class Notice {
	static log: string[] = [];
	messageEl: HTMLElement;
	constructor(msg: string | DocumentFragment, _t?: number) {
		this.messageEl = document.body.createDiv({ cls: "notice" });
		if (typeof msg === "string") this.messageEl.setText(msg);
		else this.messageEl.appendChild(msg);
		let host = document.querySelector(".notice-container");
		if (!host) host = document.body.createDiv({ cls: "notice-container" });
		host.appendChild(this.messageEl);
		Notice.log.push(this.messageEl.textContent ?? "");
		setTimeout(() => this.hide(), 4000);
	}
	hide() {
		this.messageEl.remove();
	}
}

export class Modal {
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	containerEl: HTMLElement;
	constructor(public app: any) {
		this.containerEl = createDiv({ cls: "modal-container" });
		this.containerEl.createDiv({ cls: "modal-bg" });
		this.modalEl = this.containerEl.createDiv({ cls: "modal" });
		const close = this.modalEl.createDiv({ cls: "modal-close-button" });
		close.addEventListener("click", () => this.close());
		this.titleEl = this.modalEl.createDiv({ cls: "modal-title" });
		this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
	}
	open() {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}
	close() {
		this.containerEl.remove();
		this.onClose();
	}
	onOpen() {}
	onClose() {}
}

export class FuzzySuggestModal<T> extends Modal {
	setPlaceholder(_p: string) {}
	getItems(): T[] {
		return [];
	}
	getItemText(_t: T): string {
		return "";
	}
	onChooseItem(_t: T) {}
	onOpen() {
		for (const it of this.getItems()) {
			const b = this.contentEl.createEl("button", { cls: "suggestion-item", text: this.getItemText(it) });
			b.addEventListener("click", () => {
				this.close();
				this.onChooseItem(it);
			});
		}
	}
}

export class ButtonComponent {
	buttonEl: HTMLButtonElement;
	constructor(parent: HTMLElement) {
		this.buttonEl = parent.createEl("button") as HTMLButtonElement;
	}
	setButtonText(t: string) {
		this.buttonEl.textContent = t;
		return this;
	}
	setCta() {
		this.buttonEl.addClass("mod-cta");
		return this;
	}
	setWarning() {
		this.buttonEl.addClass("mod-warning");
		return this;
	}
	onClick(f: () => void) {
		this.buttonEl.addEventListener("click", f);
		return this;
	}
}

export class TextComponent {
	inputEl: HTMLInputElement;
	constructor(parent: HTMLElement) {
		this.inputEl = parent.createEl("input", { type: "text" }) as HTMLInputElement;
	}
	setPlaceholder(p: string) {
		this.inputEl.placeholder = p;
		return this;
	}
	setValue(v: string) {
		this.inputEl.value = v;
		return this;
	}
	onChange(f: (v: string) => void) {
		this.inputEl.addEventListener("input", () => f(this.inputEl.value));
		return this;
	}
}

export class ToggleComponent {
	toggleEl: HTMLInputElement;
	constructor(parent: HTMLElement) {
		this.toggleEl = parent.createEl("input", { type: "checkbox" }) as HTMLInputElement;
	}
	setValue(v: boolean) {
		this.toggleEl.checked = v;
		return this;
	}
	onChange(f: (v: boolean) => void) {
		this.toggleEl.addEventListener("change", () => f(this.toggleEl.checked));
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	controlEl: HTMLElement;
	constructor(parent: HTMLElement) {
		this.settingEl = parent.createDiv({ cls: "setting-item" });
		this.settingEl.createDiv({ cls: "setting-item-info" });
		this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
	}
	setName(n: string) {
		this.settingEl.querySelector(".setting-item-info")!.createDiv({ cls: "setting-item-name", text: n });
		return this;
	}
	setDesc(d: string) {
		this.settingEl.querySelector(".setting-item-info")!.createDiv({ cls: "setting-item-description", text: d });
		return this;
	}
	setHeading() {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}
	addButton(f: (b: ButtonComponent) => void) {
		f(new ButtonComponent(this.controlEl));
		return this;
	}
	addToggle(f: (t: ToggleComponent) => void) {
		f(new ToggleComponent(this.controlEl));
		return this;
	}
}

export class Menu {
	private items: { title: string; checked?: boolean; cb?: () => void }[] = [];
	addItem(f: (i: any) => void) {
		const item: any = { title: "" };
		const api = {
			setTitle: (t: string) => ((item.title = t), api),
			setIcon: () => api,
			setChecked: (c: boolean) => ((item.checked = c), api),
			onClick: (cb: () => void) => ((item.cb = cb), api),
		};
		f(api);
		this.items.push(item);
		return this;
	}
	addSeparator() {
		this.items.push({ title: "---" });
		return this;
	}
	showAtMouseEvent(e: MouseEvent) {
		document.querySelectorAll(".menu").forEach((m) => m.remove());
		const m = document.body.createDiv({ cls: "menu" });
		m.style.left = e.clientX + "px";
		m.style.top = e.clientY + "px";
		for (const it of this.items) {
			if (it.title === "---") {
				m.createDiv({ cls: "menu-separator" });
				continue;
			}
			const d = m.createDiv({ cls: "menu-item" + (it.checked ? " mod-checked" : ""), text: (it.checked ? "✓ " : "") + it.title });
			d.addEventListener("click", () => {
				m.remove();
				it.cb?.();
			});
		}
	}
}

/* ----------------------------- Markdown 渲染（极简） ----------------------------- */

function inline(t: string): string {
	return t
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\[\[(.+?)\]\]/g, '<a class="internal-link" href="#">$1</a>')
		.replace(/`(.+?)`/g, "<code>$1</code>");
}

export function renderMarkdownToHtml(md: string): string {
	const lines = md.split("\n");
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const l = lines[i];
		if (!l.trim()) {
			i++;
			continue;
		}
		const h = l.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			out.push(`<div><h${h[1].length}>${inline(h[2])}</h${h[1].length}></div>`);
			i++;
			continue;
		}
		if (l.startsWith("```")) {
			const code: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
			i++;
			out.push(`<div><pre><code>${code.join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre></div>`);
			continue;
		}
		if (l.startsWith(">")) {
			const q: string[] = [];
			while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
			const c = q[0].match(/^\[!(\w+)\]\s*(.*)$/);
			if (c) out.push(`<div><div class="callout" data-callout="${c[1]}"><div class="callout-title">${inline(c[2])}</div><div class="callout-content"><p>${inline(q.slice(1).join(" "))}</p></div></div></div>`);
			else out.push(`<div><blockquote><p>${inline(q.join(" "))}</p></blockquote></div>`);
			continue;
		}
		if (/^\s*[-*]\s/.test(l)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s/, ""))}</li>`);
			out.push(`<div><ul>${items.join("")}</ul></div>`);
			continue;
		}
		if (l.startsWith("|")) {
			const rows: string[] = [];
			while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
			const cells = (r: string) => r.split("|").slice(1, -1).map((c) => c.trim());
			const head = cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join("");
			const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
			out.push(`<div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
			continue;
		}
		const para: string[] = [];
		while (i < lines.length && lines[i].trim() && !/^(#|>|```|\||\s*[-*]\s)/.test(lines[i])) para.push(inline(lines[i++]));
		out.push(`<div><p>${para.join("<br>")}</p></div>`);
	}
	return out.join("\n");
}

export class MarkdownRenderer {
	static async render(_app: any, md: string, el: HTMLElement, _p: string, _c: any) {
		el.insertAdjacentHTML("beforeend", renderMarkdownToHtml(md));
		for (const pp of (window as any).__postProcessors ?? []) {
			el.querySelectorAll(":scope > div").forEach((d: Element) => pp(d, { sourcePath: "", getSectionInfo: () => null }));
		}
	}
}

export class MarkdownView {
	file: TFile | null = null;
	getMode() {
		return "source";
	}
	previewMode = { rerender() {} };
}

export class ItemView extends Component {
	contentEl: HTMLElement;
	containerEl: HTMLElement;
	constructor(public leaf: any) {
		super();
		this.containerEl = createDiv({ cls: "workspace-leaf-content", attr: { "data-type": "doc-style-view" } });
		this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
	}
}

export class PluginSettingTab {
	containerEl: HTMLElement;
	constructor(public app: any, public plugin: any) {
		this.containerEl = createDiv({ cls: "vertical-tab-content" });
	}
	display() {}
}

export class Plugin extends Component {
	manifest = { id: "doc-style" };
	_data: any = null;
	commands: any[] = [];
	settingTabs: any[] = [];
	views: Record<string, any> = {};
	constructor(public app: any) {
		super();
	}
	async loadData() {
		return this._data;
	}
	async saveData(d: any) {
		this._data = JSON.parse(JSON.stringify(d));
		(window as any).__saved = this._data;
	}
	addRibbonIcon(_i: string, _t: string, _f: () => void) {
		return createDiv();
	}
	addCommand(c: any) {
		this.commands.push(c);
		return c;
	}
	addSettingTab(t: any) {
		this.settingTabs.push(t);
	}
	registerView(type: string, f: any) {
		this.views[type] = f;
	}
	registerMarkdownPostProcessor(f: any) {
		((window as any).__postProcessors ??= []).push(f);
	}
	registerEditorExtension(e: any) {
		((window as any).__editorExt ??= []).push(e);
	}
}

export class WorkspaceLeaf {}
export const editorInfoField = {} as any;
export function normalizePath(p: string) {
	return p;
}

export class App {
	workspace: any;
	vault: any;
	metadataCache: any;
	fileManager: any;
	constructor() {
		const ev = new Events();
		this.workspace = Object.assign(ev, {
			getActiveViewOfType: () => null,
			getMostRecentLeaf: () => null,
			getLeavesOfType: () => [],
			getActiveFile: () => null,
			updateOptions: () => {},
			getRightLeaf: () => null,
			revealLeaf: async () => {},
		});
		this.vault = { cachedRead: async () => "", getAbstractFileByPath: () => null };
		this.metadataCache = Object.assign(new Events(), { getFileCache: () => null });
		this.fileManager = { processFrontMatter: async () => {} };
	}
}
