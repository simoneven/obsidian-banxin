/* ==========================================================================
   预览（R16）
   - 样稿 / 当前笔记 两种内容
   - 预览容器套上 theme-light / theme-dark 类，主题变量按所选模式重新计算
   - 编辑视图模拟包含 .cm-header 内层 span，与真实编辑器结构一致
   ========================================================================== */

import { App, Component, MarkdownRenderer, MarkdownView, TFile } from "obsidian";
import { FORCE_DARK, FORCE_LIGHT, NUM_CLASS, PREVIEW_CLASS } from "../constants";
import { applyIndent } from "../indent";
import { computeNumbers, scanHeadings } from "../numbering";
import { numberRendered } from "../numbering-runtime";
import { StyleSet } from "../schema";

export const SAMPLE_MD = [
	"# 关于加强文档排版规范的通知",
	"",
	"## 总体要求",
	"",
	"为进一步提升文档质量，现就排版有关事项通知如下。正文段落中英文混排时，如 Obsidian 2026、PDF 导出与“引号”——破折号……都应当清晰、整齐。",
	"",
	"中文正文推荐两端对齐与首行缩进两个字符；段落较长时，行距与段间距决定了阅读的舒适程度。The quick brown fox jumps over the lazy dog.",
	"",
	"### 具体措施",
	"",
	"- 统一字号与字体，**重点内容加粗**",
	"- 参考[[排版规范]]，按层级设置标题",
	"",
	"> 引用：用于摘录原文或补充说明，通常比正文弱化一些。",
	"",
	"| 项目 | 说明 | 数值 |",
	"| --- | --- | --- |",
	"| 正文 | 三号仿宋 | 16 磅 |",
	"| 行距 | 固定值 | 28 磅 |",
	"",
	"> [!note] 提示",
	"> 标注框里的文字也可以单独设置。",
	"",
	"```",
	"const 示例 = \"代码字体\";",
	"```",
].join("\n");

interface SimLine {
	cls: string;
	level?: number;
	mark?: string;
	text: string;
}

const SIM_LINES: SimLine[] = [
	{ cls: "HyperMD-header HyperMD-header-1", level: 1, mark: "# ", text: "关于加强文档排版规范的通知" },
	{ cls: "", text: "" },
	{ cls: "HyperMD-header HyperMD-header-2", level: 2, mark: "## ", text: "总体要求" },
	{ cls: "", text: "为进一步提升文档质量，现就排版有关事项通知如下。中英文混排如 Obsidian 2026、“引号”——破折号……" },
	{ cls: "", text: "" },
	{ cls: "", text: "中文正文推荐两端对齐与首行缩进两个字符。The quick brown fox jumps over the lazy dog." },
	{ cls: "HyperMD-header HyperMD-header-3", level: 3, mark: "### ", text: "具体措施" },
	{ cls: "HyperMD-list-line HyperMD-list-line-1", mark: "- ", text: "统一字号与字体" },
	{ cls: "HyperMD-quote HyperMD-quote-1", mark: "> ", text: "引用：用于摘录原文或补充说明。" },
];

export type PreviewTheme = "light" | "dark";
export type PreviewView = "reading" | "editing";
export type PreviewSource = "sample" | "note";

export class Preview {
	readonly wrapper: HTMLElement;
	private scope: HTMLElement;
	private stage: HTMLElement;
	private token = 0;
	theme: PreviewTheme;
	view: PreviewView = "reading";
	source: PreviewSource = "sample";
	/** 当前笔记无法预览时的说明 */
	note = "";

	constructor(private app: App, private component: Component, host: HTMLElement, private getSet: () => { set: StyleSet; isActive: boolean }, isDark: boolean) {
		this.theme = isDark ? "dark" : "light";
		this.wrapper = host.createDiv({ cls: PREVIEW_CLASS });
		this.scope = this.wrapper.createDiv({ cls: "doc-style-preview-scope" });
		this.stage = this.scope.createDiv({ cls: "doc-style-preview-stage" });
	}

	private applyScope() {
		const { set, isActive } = this.getSet();
		this.wrapper.toggleClass(FORCE_LIGHT, this.theme === "light");
		this.wrapper.toggleClass(FORCE_DARK, this.theme === "dark");
		this.wrapper.toggleClass("theme-light", this.theme === "light");
		this.wrapper.toggleClass("theme-dark", this.theme === "dark");
		// 正在编辑的若不是当前样式集，让预览也带上它的类名，模拟"按笔记套用"的效果
		this.scope.className = "doc-style-preview-scope" + (isActive ? "" : " " + set.cssClass);
	}

	private async noteMarkdown(): Promise<string | null> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView) ?? this.app.workspace.getMostRecentLeaf()?.view;
		const file = view instanceof MarkdownView ? view.file : null;
		if (!(file instanceof TFile)) {
			this.note = "没有打开的笔记，显示样稿";
			return null;
		}
		const text = await this.app.vault.cachedRead(file);
		this.note = `预览：${file.basename}（前 4000 字）`;
		return text.slice(0, 4000);
	}

	async render() {
		const t = ++this.token;
		this.applyScope();
		const { set } = this.getSet();
		this.stage.className = "doc-style-preview-stage";
		this.stage.empty();
		let md = SAMPLE_MD;
		this.note = "";
		if (this.source === "note") md = (await this.noteMarkdown()) ?? SAMPLE_MD;
		if (t !== this.token) return;
		if (this.view === "reading") {
			this.stage.addClass("markdown-rendered", "markdown-preview-view");
			await MarkdownRenderer.render(this.app, md, this.stage, "", this.component);
			if (t !== this.token) return;
			applyIndent(this.stage, true);
			numberRendered(this.stage, md, set);
		} else {
			this.stage.addClass("markdown-source-view", "mod-cm6");
			this.buildEditorSim(set);
		}
	}

	private buildEditorSim(set: StyleSet) {
		const editor = this.stage.createDiv({ cls: "cm-editor" });
		const content = editor.createDiv({ cls: "cm-scroller" }).createDiv({ cls: "cm-content" });
		const { style, startLevel } = set.options.numbering;
		const md = SIM_LINES.map((l) => (l.mark ?? "") + l.text);
		const nums = computeNumbers(scanHeadings(md), style, startLevel);
		SIM_LINES.forEach((l, i) => {
			const line = content.createDiv({ cls: "cm-line" + (l.cls ? " " + l.cls : "") });
			if (!l.text) {
				line.createEl("br");
				return;
			}
			if (l.level) {
				const num = nums.get(i);
				line.createSpan({ cls: `cm-formatting cm-formatting-header cm-formatting-header-${l.level} cm-header cm-header-${l.level} doc-style-sim-mark`, text: l.mark });
				if (num) line.createSpan({ cls: NUM_CLASS, text: num });
				line.createSpan({ cls: `cm-header cm-header-${l.level}`, text: l.text });
			} else {
				if (l.mark) line.createSpan({ cls: "cm-formatting doc-style-sim-mark", text: l.mark });
				line.createSpan({ text: l.text });
			}
		});
		const table = content.createDiv({ cls: "cm-embed-block cm-table-widget markdown-rendered" }).createEl("table");
		const head = table.createEl("thead").createEl("tr");
		["项目", "说明", "数值"].forEach((h) => head.createEl("th", { text: h }));
		const body = table.createEl("tbody");
		[["正文", "三号仿宋", "16 磅"], ["行距", "固定值", "28 磅"]].forEach((r) => {
			const tr = body.createEl("tr");
			r.forEach((c) => tr.createEl("td", { text: c }));
		});
	}

	destroy() {
		this.token++;
		this.wrapper.remove();
	}
}
