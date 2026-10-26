/* ==========================================================================
   继承解析：主题 → 全局 → 元素
   ========================================================================== */

import { ElementKey, getElement, PropKey } from "./constants";
import { StyleProps, StyleSet } from "./schema";

export type Mode = "light" | "dark";

export type Source = { kind: "self" } | { kind: "element"; from: ElementKey } | { kind: "theme" };

/** 某元素在某模式下"自己"的属性（未开暗色独立时，暗色就用明色） */
export function ownProps(set: StyleSet, key: ElementKey, mode: Mode): StyleProps {
	const e = set.elements[key];
	if (mode === "dark" && e.separate) return e.dark;
	return e.light;
}

function has(p: StyleProps, k: PropKey): boolean {
	const v = p[k];
	return v !== undefined && v !== null && v !== ("" as unknown);
}

/** 行距是一对属性（倍数 / 固定值），按层整体解析 */
function hasLineHeight(p: StyleProps): boolean {
	return has(p, "lineHeight") || has(p, "lineHeightPt");
}

/** 继承链：元素自身之后依次查询的层 */
function chain(key: ElementKey): ElementKey[] {
	return getElement(key).inheritsFrom;
}

function canInherit(key: ElementKey, from: ElementKey, prop: PropKey): boolean {
	if (from === "global") return getElement(key).inheritGlobal.includes(prop);
	return true;
}

/** 解析后的有效属性（不含主题值） */
export function resolveProps(set: StyleSet, key: ElementKey, mode: Mode): StyleProps {
	const out: StyleProps = { ...ownProps(set, key, mode) };
	const layers = chain(key);
	const lhOwned = hasLineHeight(out);
	let lhDone = lhOwned;
	for (const from of layers) {
		const p = ownProps(set, from, mode);
		for (const k of Object.keys(p) as PropKey[]) {
			if (k === "lineHeight" || k === "lineHeightPt") continue;
			if (has(out, k) || !canInherit(key, from, k)) continue;
			(out as Record<string, unknown>)[k] = p[k];
		}
		if (!lhDone && hasLineHeight(p) && canInherit(key, from, "lineHeight")) {
			if (has(p, "lineHeightPt")) out.lineHeightPt = p.lineHeightPt;
			else out.lineHeight = p.lineHeight;
			lhDone = true;
		}
	}
	return out;
}

/** 某属性的值来自哪里（用于界面上标注"继承自全局 / 主题"） */
export function sourceOf(set: StyleSet, key: ElementKey, mode: Mode, prop: PropKey): Source {
	const isLh = prop === "lineHeight" || prop === "lineHeightPt";
	const test = (p: StyleProps) => (isLh ? hasLineHeight(p) : has(p, prop));
	if (test(ownProps(set, key, mode))) return { kind: "self" };
	for (const from of chain(key)) {
		if (!canInherit(key, from, isLh ? "lineHeight" : prop)) continue;
		if (test(ownProps(set, from, mode))) return { kind: "element", from };
	}
	return { kind: "theme" };
}
