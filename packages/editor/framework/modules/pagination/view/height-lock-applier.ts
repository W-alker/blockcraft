export class HeightLockApplier {
  private _applied = new Map<string, HTMLElement>();

  constructor(private doc: BlockCraft.Doc) {}

  /**
   * 增量同步超页块的视图锁定状态。稳定状态只做集合比较和 host 查询，
   * 不重复写 class；同一 block id 换宿主时会把 class 转移到新节点。
   */
  apply(locks: ReadonlySet<string>): void {
    for (const [id, el] of this._applied) {
      if (locks.has(id)) continue;
      el.classList.remove('bc-page-height-locked');
      this._applied.delete(id);
    }

    for (const id of locks) {
      const el = this.doc.getBlockById(id)?.hostElement ?? null;
      const previous = this._applied.get(id);
      if (previous === el) continue;

      if (previous) previous.classList.remove('bc-page-height-locked');
      if (!el) {
        this._applied.delete(id);
        continue;
      }

      el.classList.add('bc-page-height-locked');
      this._applied.set(id, el);
    }
  }

  clear(): void {
    for (const el of this._applied.values()) {
      el.classList.remove('bc-page-height-locked');
    }
    this._applied.clear();
  }

  destroy(): void {
    this.clear();
  }
}
