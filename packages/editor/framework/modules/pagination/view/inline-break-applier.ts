import {
  applyInlinePaginationGaps,
  clearInlinePaginationGaps,
} from '../../../block-std/inline/runtime/inline-pagination-access'
import type {InlinePaginationGap} from '../../../block-std/inline/runtime/inline-pagination-projection'
import type {PaginationResult} from '../engine'
import {
  inlineBreakPointAtLayoutOffset,
  type InlinePaginationBreakPlan,
} from './inline-break-plan'
import type {BlockMeta} from './item-builder'

export interface InlineBreakUpdate {
  /** Keep the most recently applied projection as the new stable view. */
  commit(): void
  /** Restore the projection that was active before the update began. */
  rollback(): void
}

/**
 * Translate engine continuation fragments back to Y.Text-anchored live gaps.
 * Only a page whose first slot is a continuation participates: a continuation
 * can never share its page top with another block in the pure engine.
 */
export function computeInlinePaginationGaps(
  blockId: string,
  plan: InlinePaginationBreakPlan,
  result: PaginationResult,
  sheetHeightPx: number,
  pageGap: number,
  contentTop = 0,
): InlinePaginationGap[] {
  const gaps: InlinePaginationGap[] = []
  for (let pageIndex = 1; pageIndex < result.pages.length; pageIndex++) {
    const first = result.pages[pageIndex].slots[0]
    const fragment = first?.id === blockId ? first.fragment : undefined
    if (!fragment || fragment.fromOffset <= 0) continue

    const point = inlineBreakPointAtLayoutOffset(plan, fragment.fromOffset)
    if (!point) continue
    const previousUsedHeight = result.pages[pageIndex - 1].usedHeight
    const height = sheetHeightPx + pageGap - previousUsedHeight
    if (!Number.isFinite(height) || height <= 0) continue
    gaps.push({
      offset: point.textOffset,
      height,
      backdropOffset: Math.max(
        0,
        Math.min(height, sheetHeightPx - contentTop - previousUsedHeight),
      ),
      backdropHeight: Math.max(0, Math.min(pageGap, height)),
    })
  }
  return gaps
}

function safeInlineRuntime(doc: BlockCraft.Doc, id: string): object | null {
  let missing = false
  try {
    const block = doc.getBlockById(id, () => { missing = true }) as any
    if (missing || !block) return null
    return block.runtime ?? null
  } catch {
    return null
  }
}

/**
 * Reversible top-level text pagination projection. It owns only zero-model-
 * length InlineRuntime markers; it never writes Yjs or changes block identity.
 */
export class InlineBreakApplier {
  private _applied = new Map<string, object>()
  private _gaps = new Map<string, InlinePaginationGap[]>()
  private _unmaterialized = new Set<string>()
  private _mountedIds: ReadonlySet<string> | null = null
  private _suspended = false
  private _revision = 0
  private _activeUpdate: number | null = null

  constructor(private readonly doc: BlockCraft.Doc) {}

  /** Defensive snapshot used by the controller's ResizeObserver echo filter. */
  get layoutOwnedIds(): ReadonlySet<string> {
    return new Set([...this._gaps.keys(), ...this._applied.keys()])
  }

  apply(
    metas: readonly BlockMeta[],
    result: PaginationResult,
    sheetHeightPx: number,
    pageGap: number,
    contentTop = 0,
  ): ReadonlySet<string> {
    // Outside an explicit update transaction, a freshly computed layout
    // supersedes every outstanding suspend restore. Inside one, rollback must
    // remain capable of restoring the previously published projection.
    if (this._activeUpdate === null) this._revision++
    this._suspended = false
    const next = new Map<string, InlinePaginationGap[]>()
    const unmaterialized = new Set<string>()
    const failed = new Set<string>()
    for (const meta of metas) {
      const continuationCount = countInlineContinuations(meta.id, result)
      if (!meta.inlineBreakPlan) {
        // Sparse estimated geometry may temporarily retain old fragments without
        // current text anchors. That is valid for offscreen extent only; once the
        // root is mounted it cannot be published as a materialized live layout.
        if (
          hasInlineFragment(meta.id, result)
          && meta.flavour !== 'table'
          && !meta.tableRows
        ) {
          unmaterialized.add(meta.id)
          if (this._isMounted(meta.id)) failed.add(meta.id)
        }
        continue
      }
      const gaps = computeInlinePaginationGaps(
        meta.id,
        meta.inlineBreakPlan,
        result,
        sheetHeightPx,
        pageGap,
        contentTop,
      )
      if (gaps.length !== continuationCount) {
        failed.add(meta.id)
        continue
      }
      if (gaps.length) next.set(meta.id, gaps)
    }
    this._gaps = next
    this._unmaterialized = unmaterialized
    for (const id of this._reconcile()) failed.add(id)
    return failed
  }

  syncMounted(mountedRootIds: readonly string[]): ReadonlySet<string> {
    this._mountedIds = new Set(mountedRootIds)
    if (this._suspended) return new Set()
    const failed = new Set(this._reconcile())
    for (const id of this._unmaterialized) {
      if (this._isMounted(id)) failed.add(id)
    }
    return failed
  }

  /** Drop cached anchors for roots whose model content is no longer current. */
  invalidate(rootIds: Iterable<string>): void {
    this._revision++
    this._activeUpdate = null
    this._suspended = false
    for (const id of new Set(rootIds)) {
      this._gaps.delete(id)
      this._unmaterialized.delete(id)
      const runtime = this._applied.get(id)
      if (!runtime) continue
      clearInlinePaginationGaps(runtime)
      this._applied.delete(id)
    }
  }

  /**
   * Temporarily revoke live markers so natural line geometry can be measured.
   * The returned restore is idempotent. Any newer apply/clear/suspend invalidates
   * it, so a stale finally block cannot overwrite a newer projection.
   */
  suspend(): () => void {
    const token = ++this._revision
    this._activeUpdate = null
    this._suspended = true
    this._clearApplied()
    let restored = false
    return () => {
      if (restored) return
      restored = true
      if (token !== this._revision) return
      this._suspended = false
      this._reconcile()
    }
  }

  /**
   * Suspend the published projection while natural geometry is measured, but
   * retain a rollback snapshot until the controller commits the entire DOM
   * publication. This keeps stable layout data and live markers transactional
   * when another view applier throws after measurement.
   */
  beginUpdate(): InlineBreakUpdate {
    const token = ++this._revision
    const previousGaps = cloneGapMap(this._gaps)
    const previousUnmaterialized = new Set(this._unmaterialized)
    this._activeUpdate = token
    this._suspended = true
    this._clearApplied()
    let settled = false

    return {
      commit: () => {
        if (settled) return
        settled = true
        if (this._activeUpdate !== token) return
        this._activeUpdate = null
        this._suspended = false
        this._revision++
      },
      rollback: () => {
        if (settled) return
        settled = true
        if (this._activeUpdate !== token) return
        this._activeUpdate = null
        this._revision++
        this._suspended = false
        this._clearApplied()
        this._gaps = previousGaps
        this._unmaterialized = previousUnmaterialized
        this._reconcile()
      },
    }
  }

  clear(): void {
    this._revision++
    this._activeUpdate = null
    this._suspended = false
    this._clearApplied()
    this._gaps.clear()
    this._unmaterialized.clear()
  }

  destroy(): void {
    this.clear()
  }

  private _reconcile(): ReadonlySet<string> {
    const failed = new Set<string>()
    if (this._suspended) return failed

    for (const [id, runtime] of this._applied) {
      if (this._gaps.has(id) && this._isMounted(id)) continue
      clearInlinePaginationGaps(runtime)
      this._applied.delete(id)
    }

    for (const [id, gaps] of this._gaps) {
      if (!this._isMounted(id)) continue
      const runtime = safeInlineRuntime(this.doc, id)
      const previous = this._applied.get(id)
      if (previous && previous !== runtime) {
        clearInlinePaginationGaps(previous)
        this._applied.delete(id)
      }
      if (!runtime) {
        failed.add(id)
        continue
      }
      if (!applyInlinePaginationGaps(runtime, gaps)) {
        clearInlinePaginationGaps(runtime)
        this._applied.delete(id)
        failed.add(id)
        continue
      }
      this._applied.set(id, runtime)
    }
    return failed
  }

  private _clearApplied(): void {
    for (const runtime of this._applied.values()) {
      clearInlinePaginationGaps(runtime)
    }
    this._applied.clear()
  }

  private _isMounted(id: string): boolean {
    return this._mountedIds?.has(id) ?? true
  }
}

function cloneGapMap(
  source: ReadonlyMap<string, readonly InlinePaginationGap[]>,
): Map<string, InlinePaginationGap[]> {
  return new Map(Array.from(source, ([id, gaps]) => [
    id,
    gaps.map(gap => ({...gap})),
  ]))
}

function countInlineContinuations(
  blockId: string,
  result: PaginationResult,
): number {
  let count = 0
  for (let pageIndex = 1; pageIndex < result.pages.length; pageIndex++) {
    const first = result.pages[pageIndex].slots[0]
    if (
      first?.id === blockId
      && first.fragment
      && first.fragment.fromOffset > 0
    ) {
      count++
    }
  }
  return count
}

function hasInlineFragment(
  blockId: string,
  result: PaginationResult,
): boolean {
  return result.pages.some(page => page.slots.some(slot =>
    slot.id === blockId && !!slot.fragment,
  ))
}
