/* ==========================================================================
   动态样式表
   用户配置生成的 CSS 由 CSSStyleSheet + adoptedStyleSheets 承载。
   社区目录审核明确禁止创建 / 挂载 <style> 元素，要求走 styles.css；
   但这里的规则完全由用户设置决定，无法预置，因此改用标准 CSSOM 构造式样式表
   （不产生任何 DOM 节点）。
   ========================================================================== */

let sheet: CSSStyleSheet | null = null;

function attach(s: CSSStyleSheet) {
	if (!document.adoptedStyleSheets.includes(s)) {
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
	}
}

function ensure(): CSSStyleSheet {
	if (!sheet) sheet = new CSSStyleSheet();
	attach(sheet);
	return sheet;
}

/** 写入（或更新）插件生成的全部样式 */
export function setSheetCss(css: string) {
	const s = ensure();
	s.replaceSync(css);
}

/**
 * 临时把插件自己的样式摘下来，让 fn 读到主题的原始取值。
 * 返回恢复函数；即使 fn 抛错也应在 finally 里调用。
 */
export function detachSheet(): () => void {
	const s = sheet;
	if (!s || !document.adoptedStyleSheets.includes(s)) return () => {};
	document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== s);
	return () => attach(s);
}

/** 卸载时彻底移除 */
export function disposeSheet() {
	if (!sheet) return;
	document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== sheet);
	sheet = null;
}
