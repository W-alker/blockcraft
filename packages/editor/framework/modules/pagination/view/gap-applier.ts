// packages/editor/framework/modules/pagination/view/gap-applier.ts

/**
 * 给每页首块 host 加 margin-top 实现「整块下推」。视图层、可逆、不碰 Yjs（同 selected-manager 的 classList 模式）。
 * clear() 必须在每次重算「测量之前」调用，避免 gap 的 margin 被算进块高度。
 */
export class GapApplier {
  private _applied = new Map<string, HTMLElement>();

  constructor(private doc: BlockCraft.Doc) {}

  apply(gaps: Map<string, number>): void {
    this.clear();
    for (const [id, gap] of gaps) {
      const el = this.doc.getBlockById(id)?.hostElement;
      if (!el) continue;
      el.style.marginTop = `${gap}px`;
      el.classList.add('bc-page-first');
      this._applied.set(id, el);
    }
  }

  clear(): void {
    for (const el of this._applied.values()) {
      el.style.marginTop = '';
      el.classList.remove('bc-page-first');
    }
    this._applied.clear();
  }

  destroy(): void {
    this.clear();
  }
}
