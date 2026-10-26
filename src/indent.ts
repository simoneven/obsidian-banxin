/* ==========================================================================
   首行缩进的段内换行补偿
   段落里的软换行（<br>）后面那一行本应和段首对齐缩进；
   在 <br> 后插入一个不可选中的占位 span，宽度由生成的 CSS 决定。
   ========================================================================== */

import { INDENT_CLASS } from "./constants";

const P_SELECTOR = "p:not(li p):not(blockquote p):not(.callout p)";

function hasTextSibling(node: Node, dir: "before" | "after"): boolean {
	let n = dir === "before" ? node.previousSibling : node.nextSibling;
	while (n) {
		if (n.nodeType === Node.TEXT_NODE) {
			if ((n.textContent ?? "").trim()) return true;
		} else if (n.nodeType === Node.ELEMENT_NODE) {
			const el = n as HTMLElement;
			if (!el.classList.contains(INDENT_CLASS) && el.tagName !== "BR" && (el.textContent ?? "").trim()) return true;
		}
		n = dir === "before" ? n.previousSibling : n.nextSibling;
	}
	return false;
}

export function applyIndent(root: HTMLElement, enabled: boolean) {
	const ps: HTMLElement[] = [];
	if (root.tagName === "P" && root.matches(P_SELECTOR)) ps.push(root);
	root.querySelectorAll<HTMLElement>(P_SELECTOR).forEach((p) => ps.push(p));
	for (const p of ps) {
		p.querySelectorAll(`span.${INDENT_CLASS}`).forEach((s) => s.remove());
		if (!enabled) continue;
		for (const br of Array.from(p.querySelectorAll("br"))) {
			if (!hasTextSibling(br, "before") || !hasTextSibling(br, "after")) continue;
			const span = createEl("span");
			span.className = INDENT_CLASS;
			br.after(span);
		}
	}
}

export function applyIndentEverywhere(enabled: boolean) {
	document.querySelectorAll<HTMLElement>(".markdown-rendered").forEach((el) => applyIndent(el, enabled));
}

export function removeIndentSpans() {
	document.querySelectorAll(`span.${INDENT_CLASS}`).forEach((s) => s.remove());
}
