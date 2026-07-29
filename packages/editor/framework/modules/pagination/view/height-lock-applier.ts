export class HeightLockApplier {
  private _applied = new Map<string, HTMLElement>();
  private _locks = new Set<string>();
  private _mountedIds: ReadonlySet<string> | null = null;

  constructor(private doc: BlockCraft.Doc) {}

  /**
   * 增量同步超页块的视图锁定状态。稳定状态只做集合比较和 host 查询，
   * 不重复写 class；同一 block id 换宿主时会把 class 转移到新节点。
   */
  apply(locks: ReadonlySet<string>): void {
    this._locks = new Set(locks);
    this._reconcile();
  }

  syncMounted(mountedRootIds: readonly string[]): void {
    this._mountedIds = new Set(mountedRootIds);
    this._reconcile();
  }

  private _reconcile(): void {
    for (const [id, el] of this._applied) {
      if (this._locks.has(id) && this._isMounted(id)) continue;
      el.classList.remove('bc-page-height-locked');
      this._applied.delete(id);
    }

    for (const id of this._locks) {
      if (!this._isMounted(id)) continue;
      const el = safeBlockHost(this.doc, id);
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
    this._locks.clear();
  }

  destroy(): void {
    this.clear();
  }

  private _isMounted(id: string): boolean {
    return this._mountedIds?.has(id) ?? true;
  }
}

function safeBlockHost(doc: BlockCraft.Doc, id: string): HTMLElement | null {
  let missing = false;
  try {
    const block = doc.getBlockById(id, () => { missing = true; });
    return missing ? null : block?.hostElement ?? null;
  } catch {
    return null;
  }
}
