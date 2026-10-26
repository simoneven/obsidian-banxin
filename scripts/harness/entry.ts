import "./obsidian-shim";
import { App, renderMarkdownToHtml } from "./obsidian-shim";
import DocStylePlugin from "../../src/main";

(window as any).bootPlugin = async (data: unknown) => {
	const app = new App();
	const plugin = new (DocStylePlugin as any)(app, { id: "doc-style" });
	plugin._data = data ?? null;
	await plugin.onload();
	(window as any).__app = app;
	(window as any).__plugin = plugin;
	return true;
};
(window as any).renderMd = renderMarkdownToHtml;

import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
(window as any).makeEditor = (doc: string) => {
	const host = document.body.createDiv({ cls: "markdown-source-view mod-cm6", attr: { id: "cm-test" } });
	return new EditorView({ state: EditorState.create({ doc, extensions: (window as any).__editorExt }), parent: host });
};

import { numbersForText } from "../../src/numbering";
(window as any).__numbersFor = (md: string, set: any) => numbersForText(md, set.options.numbering.style, set.options.numbering.startLevel);
