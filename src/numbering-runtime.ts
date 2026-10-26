/* ==========================================================================
   标题编号的运行时部分
   - 阅读视图 / 导出 PDF：Markdown 后处理器，根据整篇原文计算编号后插入 span
   - 编辑视图：CodeMirror 装饰（行首小部件），不改动原文
   ========================================================================== */

import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { editorInfoField, MarkdownPostProcessorContext } from "obsidian";
import { NUM_CLASS, PREVIEW_CLASS } from "./constants";
import { numbersForText, scanHeadings, computeNumbers } from "./numbering";
import { StyleSet } from "./schema";

export type SetResolver = (sourcePath: string) => StyleSet;

/* ----------------------------- 阅读视图 ----------------------------- */

const textCache = new Map<string, { text: string; style: string; nums: Map<number, string> }>();

function numbersCached(path: string, text: string, set: StyleSet): Map<number, string> {
	const { style, startLevel } = set.options.numbering;
	const key = `${style}:${startLevel}`;
	const hit = textCache.get(path);
	if (hit && hit.text === text && hit.style === key) return hit.nums;
	const nums = numbersForText(text, style, startLevel);
	textCache.set(path, { text, style: key, nums });
	if (textCache.size > 50) textCache.delete(textCache.keys().next().value as string);
	return nums;
}

export function setNumberSpan(h: HTMLElement, text: string | undefined) {
	h.querySelectorAll(`:scope > .${NUM_CLASS}`).forEach((s) => s.remove());
	if (!text) return;
	const span = document.createElement("span");
	span.className = NUM_CLASS;
	span.textContent = text;
	span.setAttribute("aria-hidden", "true");
	h.prepend(span);
}

export function numberingPostProcessor(resolve: SetResolver) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		if (el.closest(`.${PREVIEW_CLASS}`)) return; // 插件自己的预览单独处理
		const heads = el.matches("h1,h2,h3,h4,h5,h6") ? [el] : Array.from(el.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"));
		if (!heads.length) return;
		const set = resolve(ctx.sourcePath);
		if (set.options.numbering.style === "none") {
			heads.forEach((h) => setNumberSpan(h, undefined));
			return;
		}
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const nums = numbersCached(ctx.sourcePath, info.text, set);
		// 一个分节里通常只有一个标题，位于分节第一行
		if (heads.length === 1) {
			setNumberSpan(heads[0], nums.get(info.lineStart));
			return;
		}
		const lines = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1);
		const local = scanHeadings(lines).map((h) => h.line + info.lineStart);
		heads.forEach((h, i) => setNumberSpan(h, local[i] !== undefined ? nums.get(local[i]) : undefined));
	};
}

/** 预览里直接按样稿原文编号 */
export function numberRendered(root: HTMLElement, markdown: string, set: StyleSet) {
	const { style, startLevel } = set.options.numbering;
	const heads = scanHeadings(markdown.split("\n"));
	const nums = computeNumbers(heads, style, startLevel);
	const els = Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"));
	els.forEach((h, i) => setNumberSpan(h, heads[i] ? nums.get(heads[i].line) : undefined));
}

/* ----------------------------- 编辑视图 ----------------------------- */

class NumWidget extends WidgetType {
	constructor(readonly text: string) {
		super();
	}
	eq(other: NumWidget) {
		return other.text === this.text;
	}
	toDOM() {
		const span = document.createElement("span");
		span.className = `${NUM_CLASS} cm-${NUM_CLASS}`;
		span.textContent = this.text;
		span.setAttribute("aria-hidden", "true");
		return span;
	}
	ignoreEvent() {
		return false;
	}
}

export function numberingEditorExtension(resolve: SetResolver, version: () => number) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			private ver = -1;
			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}
			update(u: ViewUpdate) {
				if (u.docChanged || u.viewportChanged || this.ver !== version()) this.decorations = this.build(u.view);
			}
			build(view: EditorView): DecorationSet {
				this.ver = version();
				const b = new RangeSetBuilder<Decoration>();
				let path = "";
				try {
					path = view.state.field(editorInfoField)?.file?.path ?? "";
				} catch {
					/* 非笔记编辑器（如设置里的输入框） */
				}
				const set = resolve(path);
				const { style, startLevel } = set.options.numbering;
				if (style === "none") return b.finish();
				const doc = view.state.doc;
				const lines: string[] = [];
				for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
				const nums = computeNumbers(scanHeadings(lines), style, startLevel);
				const sorted = Array.from(nums.entries()).sort((a, b) => a[0] - b[0]);
				for (const [lineIdx, text] of sorted) {
					const line = doc.line(lineIdx + 1);
					const m = line.text.match(/^\s{0,3}#{1,6}\s+/);
					const pos = line.from + (m ? m[0].length : 0);
					b.add(pos, pos, Decoration.widget({ widget: new NumWidget(text), side: -1 }));
				}
				return b.finish();
			}
		},
		{ decorations: (v) => v.decorations },
	);
}
