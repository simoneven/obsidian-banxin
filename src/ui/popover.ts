/* ==========================================================================
   浮层：挂在 body 上、按锚点定位，不会被滚动容器裁掉
   同一时间只有一个浮层；点外面 / 按 Esc 关闭
   ========================================================================== */

let active: Popover | null = null;

export class Popover {
	readonly el: HTMLElement;
	private onClose?: () => void;

	constructor(cls: string, onClose?: () => void) {
		this.el = document.body.createDiv({ cls: `doc-style-popover ${cls}` });
		this.onClose = onClose;
	}

	open(anchor: HTMLElement) {
		if (active && active !== this) active.close();
		active = this;
		this.el.addClass("is-open");
		this.position(anchor);
	}

	position(anchor: HTMLElement) {
		const r = anchor.getBoundingClientRect();
		const w = this.el.offsetWidth || 280;
		const h = this.el.offsetHeight || 300;
		let left = r.left;
		let top = r.bottom + 4;
		if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
		if (top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
		this.el.style.setProperty("--ds-pop-left", `${Math.round(left)}px`);
		this.el.style.setProperty("--ds-pop-top", `${Math.round(top)}px`);
	}

	contains(node: Node | null): boolean {
		return !!node && this.el.contains(node);
	}

	close() {
		if (active === this) active = null;
		this.el.remove();
		this.onClose?.();
	}
}

export function closeActivePopover(target?: EventTarget | null) {
	if (!active) return;
	if (target instanceof Node && (active.contains(target) || (target as HTMLElement).closest?.(".doc-style-popover-anchor.is-open-anchor"))) return;
	active.close();
}

export function hasActivePopover(): boolean {
	return active !== null;
}
