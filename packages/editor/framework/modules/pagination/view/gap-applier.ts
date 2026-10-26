// packages/editor/framework/modules/pagination/view/gap-applier.ts

interface AppliedGap {
  host: HTMLElement;
  spacer: HTMLElement;
}

/**
 * 在每页首块前插入独立的视图层 spacer。
 *
 * 不能用首块 margin-top 表示分页间距：它会与前一块的 margin-bottom
 * 折叠，而 PaginationResult 的 usedHeight 按两者相加。连续挂载跨多页时，
 * DOM 与投影的误差会逐页累积；独立 spacer 保证两套几何完全相同。
 */
export class GapApplier {
  private _applied = new Map<string, AppliedGap>();
  private _gaps = new Map<string, number>();
  private _mountedIds: ReadonlySet<string> | null = null;

  constructor(private doc: BlockCraft.Doc) {}

  apply(gaps: Map<string, number>): void {
    this._gaps = new Map(gaps);
    this._reconcile();
  }

  syncMounted(mountedRootIds: readonly string[]): void {
    this._mountedIds = new Set(mountedRootIds);
    this._reconcile();
  }

  private _reconcile(): void {
    for (const [id, applied] of this._applied) {
      if (this._gaps.has(id) && this._isMounted(id)) continue;
      applied.spacer.remove();
      this._applied.delete(id);
    }

    const candidates = this._mountedIds ?? this._gaps.keys();
    for (const id of candidates) {
      const gap = this._gaps.get(id);
      if (gap === undefined) continue;
      const host = safeBlockHost(this.doc, id);
      const previous = this._applied.get(id);
      if (!host?.parentElement) {
        previous?.spacer.remove();
        this._applied.delete(id);
        continue;
      }

      let spacer = previous?.host === host ? previous.spacer : null;
      if (!spacer) {
        previous?.spacer.remove();
        spacer = createGapSpacer(host.ownerDocument, id);
      }

      const height = `${gap}px`;
      if (spacer.style.height !== height) spacer.style.height = height;
      if (spacer.parentElement !== host.parentElement || spacer.nextSibling !== host) {
        host.parentElement.insertBefore(spacer, host);
      }
      this._applied.set(id, {host, spacer});
    }
  }

  clear(): void {
    for (const applied of this._applied.values()) applied.spacer.remove();
    this._applied.clear();
    this._gaps.clear();
  }

  private _isMounted(id: string): boolean {
    return this._mountedIds?.has(id) ?? true;
  }

  destroy(): void {
    this.clear();
  }
}

function createGapSpacer(ownerDocument: Document, blockId: string): HTMLElement {
  const spacer = ownerDocument.createElement('div');
  spacer.dataset['bcPageGapSpacer'] = blockId;
  spacer.contentEditable = 'false';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.width = '100%';
  spacer.style.flex = '0 0 auto';
  spacer.style.pointerEvents = 'none';
  spacer.style.userSelect = 'none';
  return spacer;
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
