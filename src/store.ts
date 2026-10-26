/* ==========================================================================
   样式仓库 Store：唯一数据源 · 撤销栈 · 变更广播
   所有入口（弹窗、侧栏、设置页、命令）都只通过 store.update() 修改数据
   ========================================================================== */

import { clone, PluginData } from "./schema";

export interface ChangeInfo {
	/** 本次修改的说明，用于撤销提示 */
	label: string;
	/** 是否影响样式（仅界面状态变化时为 false） */
	styleChanged: boolean;
	/** 由撤销 / 重做触发 */
	fromHistory?: boolean;
}

type Listener = (info: ChangeInfo) => void;

const MAX_HISTORY = 50;
const COALESCE_MS = 700;

export class Store {
	private data: PluginData;
	private undoStack: { snapshot: string; label: string }[] = [];
	private redoStack: { snapshot: string; label: string }[] = [];
	private listeners = new Set<Listener>();
	private lastKey: string | null = null;
	private lastTime = 0;

	constructor(data: PluginData) {
		this.data = data;
	}

	get state(): PluginData {
		return this.data;
	}

	subscribe(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emit(info: ChangeInfo) {
		for (const fn of Array.from(this.listeners)) {
			try {
				fn(info);
			} catch (e) {
				console.error("[版心] 刷新失败", e);
			}
		}
	}

	/**
	 * 修改数据。
	 * @param coalesceKey 相同 key 在短时间内的连续修改（如拖动滑块）合并为一步撤销
	 */
	update(label: string, fn: (d: PluginData) => void, opts: { coalesceKey?: string; undoable?: boolean; styleChanged?: boolean } = {}) {
		const undoable = opts.undoable ?? true;
		const now = Date.now();
		if (undoable) {
			const merge = opts.coalesceKey && opts.coalesceKey === this.lastKey && now - this.lastTime < COALESCE_MS;
			if (!merge) {
				this.undoStack.push({ snapshot: JSON.stringify(this.data), label });
				if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
			}
			this.redoStack = [];
			this.lastKey = opts.coalesceKey ?? null;
			this.lastTime = now;
		}
		fn(this.data);
		this.emit({ label, styleChanged: opts.styleChanged ?? true });
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}
	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	undo(): string | null {
		const prev = this.undoStack.pop();
		if (!prev) return null;
		this.redoStack.push({ snapshot: JSON.stringify(this.data), label: prev.label });
		this.restore(prev.snapshot);
		this.lastKey = null;
		this.emit({ label: prev.label, styleChanged: true, fromHistory: true });
		return prev.label;
	}

	redo(): string | null {
		const next = this.redoStack.pop();
		if (!next) return null;
		this.undoStack.push({ snapshot: JSON.stringify(this.data), label: next.label });
		this.restore(next.snapshot);
		this.lastKey = null;
		this.emit({ label: next.label, styleChanged: true, fromHistory: true });
		return next.label;
	}

	/** 撤销时保留不属于"样式"的状态（引导是否看过、字体缓存等） */
	private restore(snapshot: string) {
		const restored = JSON.parse(snapshot) as PluginData;
		restored.onboarded = this.data.onboarded;
		restored.firstChangeTipShown = this.data.firstChangeTipShown;
		restored.fontFaces = this.data.fontFaces;
		restored.recentFonts = this.data.recentFonts;
		this.data = restored;
	}

	snapshot(): PluginData {
		return clone(this.data);
	}
}
