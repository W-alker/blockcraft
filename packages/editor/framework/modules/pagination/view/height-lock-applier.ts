import {applyPageMediaFit, clearPageMediaFit, resolvePageMediaSurface} from './page-media-fit'

interface AppliedHeightState {
  readonly element: HTMLElement
  readonly locked: boolean
  readonly fitScale: number | undefined
}

export class HeightLockApplier {
  private _applied = new Map<string, AppliedHeightState>();
  private _locks = new Set<string>();
  private _fitScales = new Map<string, number>();
  private _mountedIds: ReadonlySet<string> | null = null;

  constructor(private doc: BlockCraft.Doc) {}

  /**
   * 增量同步超页块的视图锁定状态。稳定状态只做集合比较和 host 查询，
   * 不重复写 class；同一 block id 换宿主时会把 class 转移到新节点。
   */
  apply(locks: ReadonlySet<string>, fitScales: ReadonlyMap<string, number> = new Map()): void {
    this._locks = new Set(locks);
    this._fitScales = new Map(fitScales);
    this._reconcile();
  }

  syncMounted(mountedRootIds: readonly string[]): void {
    this._mountedIds = new Set(mountedRootIds);
    this._reconcile();
  }

  private _reconcile(): void {
    const desiredIds = new Set([...this._locks, ...this._fitScales.keys()])
    for (const [id, state] of this._applied) {
      if (desiredIds.has(id) && this._isMounted(id)) continue;
      this._clearHost(state.element);
      this._applied.delete(id);
    }

    for (const id of desiredIds) {
      if (!this._isMounted(id)) continue;
      const el = safeBlockHost(this.doc, id);
      const previous = this._applied.get(id);
      const locked = this._locks.has(id);
      const fitScale = this._fitScales.get(id);
      if (
        previous?.element === el
        && previous.locked === locked
        && previous.fitScale === fitScale
      ) {
        continue;
      }

      if (previous && previous.element !== el) this._clearHost(previous.element);
      if (!el) {
        this._applied.delete(id);
        continue;
      }

      this._applyHost(el, locked, fitScale);
      this._applied.set(id, {element: el, locked, fitScale});
    }
  }

  clear(): void {
    for (const state of this._applied.values()) {
      this._clearHost(state.element);
    }
    this._applied.clear();
    this._locks.clear();
    this._fitScales.clear();
  }

  destroy(): void {
    this.clear();
  }

  private _isMounted(id: string): boolean {
    return this._mountedIds?.has(id) ?? true;
  }

  private _applyHost(element: HTMLElement, locked: boolean, scale: number | undefined): void {
    const fitted = Number.isFinite(scale) && scale! > 0 && scale! < 1
      && element.getAttribute('data-bc-placement') !== 'absolute'
      && !!resolvePageMediaSurface(element)
    // 图片/视频通过主体 wrapper 的 max-size 进入一页，不再锁高或 zoom 整个块。
    element.classList.toggle('bc-page-height-locked', locked && !fitted)
    applyPageMediaFit(element, fitted ? scale : undefined)
  }

  private _clearHost(element: HTMLElement): void {
    element.classList.remove('bc-page-height-locked')
    clearPageMediaFit(element)
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
