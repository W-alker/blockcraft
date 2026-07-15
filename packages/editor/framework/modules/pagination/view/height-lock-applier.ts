// packages/editor/framework/modules/pagination/view/height-lock-applier.ts

/**
 * 给超高的 capHeight 块（图片/视频/嵌入等原子块 + 代码块）锁定最大高度到 ≤ 一页：
 * `max-height: <一页内容高>px` + `overflow: hidden`——**裁剪**超出部分，**不缩放**、不溢出页框。
 *
 * 注意：max-height 会裁剪 `offsetHeight`，故高度源（LiveHeightSource）改用 `scrollHeight`（未裁剪的完整内容高，
 * 对已锁定状态不变）来判定 oversized，避免「锁 → offsetHeight 变小 → 判定不 oversized → 解锁 → 变大 → 再锁」的反馈抖动。
 * 视图层、可逆、不碰 Yjs。
 */
export class HeightLockApplier {
  private _applied = new Map<string, HTMLElement>();

  constructor(private doc: BlockCraft.Doc) {}

  /** @param locks blockId → 锁定最大高度（px）。 */
  apply(locks: Map<string, number>): void {
    this.clear();
    for (const [id, h] of locks) {
      const el = this.doc.getBlockById(id)?.hostElement;
      if (!el || !(h > 0)) continue;
      el.style.maxHeight = `${h}px`;
      el.style.overflow = 'hidden';
      el.classList.add('bc-page-height-locked');
      this._applied.set(id, el);
    }
  }

  clear(): void {
    for (const el of this._applied.values()) {
      el.style.maxHeight = '';
      el.style.overflow = '';
      el.classList.remove('bc-page-height-locked');
    }
    this._applied.clear();
  }

  destroy(): void {
    this.clear();
  }
}
