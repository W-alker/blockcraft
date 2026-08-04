import {ScrollBlot, TextBlot, EmbedBlot, BlotType, IBlot} from "../blot";
import {EmbedConverterMap} from "../blot/scroll-blot";
import {InlinePositionMapper, PointAffinity, IDomPoint} from "../position/inline-position-mapper";
import {DeltaInsert, DeltaOperation, InlineModel} from "../../types";
import type {EmbedConverter} from "../index";
import {InlineFloatLayoutController} from './inline-float-layout'
import {
  InlinePaginationGap,
  InlinePaginationProjection,
} from './inline-pagination-projection'
import {InlineRangeMeasurer} from './inline-fragment-layout'
import {
  InlinePaginationLineStart,
  registerInlinePaginationAccess,
} from './inline-pagination-access'

/**
 * InlineRuntime is the per-block coordinator that owns a ScrollBlot tree
 * and an InlinePositionMapper.
 *
 * It serves as the single entry point for:
 * - Full render from delta snapshot
 * - Incremental delta patch
 * - Model offset <-> DOM point conversion (delegated to mapper)
 * - Embed lifecycle tracking
 *
 * Usage:
 * ```ts
 *   const rt = new InlineRuntime(container, embedConverters)
 *   rt.render(deltas)                    // full rebuild
 *   rt.applyDelta(ops)                   // incremental patch
 *   rt.mapper.modelPointToDomPoint(...)   // model->DOM
 *   rt.mapper.domPointToModelPoint(...)   // DOM->model
 * ```
 *
 * The runtime does NOT own the Y.Text or trigger Yjs transactions;
 * that remains the responsibility of EditableBlockComponent / DocCRUD.
 */
export class InlineRuntime {
  private _scrollBlot: ScrollBlot
  private readonly _mapper: InlinePositionMapper
  private readonly _inlineFloatLayout: InlineFloatLayoutController
  private readonly _paginationProjection: InlinePaginationProjection
  private _releaseFloatForPagination?: () => void
  private _releasePaginationAccess: () => void = () => undefined
  private readonly _paginationOptions?: {
    beginSelectionProjection?: () => (() => void)
  }

  constructor(
    readonly container: HTMLElement,
    embedConverters: EmbedConverterMap,
    options?: {
      /** @internal SelectionManager-backed DOM projection guard. */
      beginSelectionProjection?: () => (() => void)
    },
  ) {
    this._paginationOptions = options
    this._scrollBlot = new ScrollBlot(container, embedConverters)
    this._mapper = new InlinePositionMapper()
    this._mapper.setScrollBlot(this._scrollBlot)
    this._paginationProjection = new InlinePaginationProjection(this._scrollBlot)
    this._inlineFloatLayout = new InlineFloatLayoutController(
      container,
      this._scrollBlot,
      {beginProjection: this._paginationOptions?.beginSelectionProjection},
    )
    this._releasePaginationAccess = registerInlinePaginationAccess(this, {
      apply: gaps => this._applyPaginationGaps(gaps),
      clear: () => this._clearPaginationGaps(),
      measureLineStarts: limit => this._measurePaginationLineStarts(limit),
    })
  }

  get scrollBlot(): ScrollBlot {
    return this._scrollBlot
  }

  get mapper(): InlinePositionMapper {
    return this._mapper
  }

  get textLength(): number {
    return this._scrollBlot.textLength
  }

  /**
   * Full rebuild from a delta snapshot.
   * Replaces all existing blots and DOM.
   */
  render(deltas: InlineModel) {
    this._clearPaginationGaps()
    this._inlineFloatLayout.beforeMutation()
    this._scrollBlot.build(deltas)
    this._inlineFloatLayout.sync()
  }

  /**
   * Apply incremental delta operations.
   * Updates the blot tree and patches the DOM in-place.
   */
  applyDelta(ops: DeltaOperation[]) {
    this._clearPaginationGaps()
    this._inlineFloatLayout.beforeMutation()
    this._scrollBlot.applyDelta(ops)
    this._inlineFloatLayout.sync()
  }

  /** @internal Used by IME and wrapped-image pointer interactions. */
  acquireFloatLayoutFreeze(): () => void {
    return this._inlineFloatLayout.acquireFreeze()
  }

  /**
   * @internal Pagination view only. Apply zero-model-length gaps at Y.Text offsets.
   */
  private _applyPaginationGaps(gaps: readonly InlinePaginationGap[]): boolean {
    if (!gaps.length) {
      this._clearPaginationGaps()
      return true
    }
    const releaseSelectionGuard = this._beginSelectionProjection?.()
    try {
      if (!this._releaseFloatForPagination) {
        this._releaseFloatForPagination = this._inlineFloatLayout.acquireFreeze()
      }
      // Inline float projection and pagination projection both temporarily
      // rearrange real Blot nodes; pagination owns the visible projection while active.
      this._inlineFloatLayout.beforeMutation()
      const applied = this._paginationProjection.apply(gaps)
      if (!applied) this._clearPaginationGaps()
      return applied
    } finally {
      releaseSelectionGuard?.()
    }
  }

  /** @internal Pagination view only. */
  private _clearPaginationGaps(): void {
    const hadProjection = this._paginationProjection.active
      || !!this._releaseFloatForPagination
    if (!hadProjection) return

    const releaseSelectionGuard = this._beginSelectionProjection?.()
    try {
      this._paginationProjection.revoke()
      const releaseFloat = this._releaseFloatForPagination
      this._releaseFloatForPagination = undefined
      // Mark the float layout dirty while its lease is still held, then let
      // release coalesce one canonical refresh into the next animation frame.
      this._inlineFloatLayout.sync()
      releaseFloat?.()
    } finally {
      releaseSelectionGuard?.()
    }
  }

  /**
   * 测出自然行盒的续排锚点。每一项都指向“下一行行首”，因此投影页缝不会切开字素或视觉行。
   * 带双侧环绕投影的段落暂不混合两套 DOM 投影，调用方应把该块当作原子内容降级。
   *
   * @internal Pagination measurement only.
   */
  private _measurePaginationLineStarts(limit = 2048): InlinePaginationLineStart[] {
    if (
      !this.container.isConnected
      || this.textLength <= 0
      || this.container.hasAttribute('data-bc-inline-float-owner')
    ) {
      return []
    }

    const width = this.container.clientWidth
      || this.container.getBoundingClientRect().width
    if (!Number.isFinite(width) || width <= 0) return []

    const measurer = new InlineRangeMeasurer(
      this.container,
      this._scrollBlot,
      (start, end) => this.modelRangeToDomRange(start, end),
    )
    const containerTop = this.container.getBoundingClientRect().top
    const points: InlinePaginationLineStart[] = []
    let cursor = 0

    measurer.beginLayoutPass()
    try {
      while (cursor < this.textLength && points.length < limit) {
        const fitted = measurer.fitFragment(
          cursor,
          this.textLength,
          width,
          false,
        )
        const next = fitted.end > cursor
          ? fitted.end
          : measurer.nextOffset(cursor, this.textLength)
        if (next <= cursor || next >= this.textLength) break

        const nextAfter = measurer.nextOffset(next, this.textLength)
        const rect = this.modelRangeToClientRects(next, nextAfter).find(
          candidate => candidate.width > 0.01 || candidate.height > 0.01,
        )
        if (!rect) break
        points.push({offset: next, top: rect.top - containerTop})
        cursor = next
      }
    } catch {
      return []
    } finally {
      measurer.endLayoutPass()
    }
    return points
  }

  /**
   * Convert a model character index to a DOM point.
   */
  modelPointToDom(index: number, affinity?: PointAffinity): IDomPoint {
    return this._mapper.modelPointToDomPoint(this.container, index, affinity)
  }

  /**
   * Convert a DOM point to a model character index.
   */
  domPointToModel(node: Node, offset: number, options?: { isComposing?: boolean }): number {
    return this._mapper.domPointToModelPoint(this.container, node, offset, options)
  }

  /**
   * Create a DOM Range spanning [startIndex, endIndex).
   */
  modelRangeToDomRange(startIndex: number, endIndex?: number): Range {
    return this._mapper.modelRangeToDomRange(this.container, startIndex, endIndex)
  }

  /**
   * Get DOMRect list for a model range.
   */
  modelRangeToClientRects(startIndex: number, endIndex: number): DOMRect[] {
    return this._mapper.modelRangeToClientRects(this.container, startIndex, endIndex)
  }

  /**
   * Find the leaf blot at a given model offset.
   */
  findBlotByOffset(offset: number): { blot: TextBlot | EmbedBlot; localOffset: number } | null {
    return this._scrollBlot.findByOffset(offset)
  }

  /**
   * Get the model offset of a leaf blot.
   */
  offsetOf(blot: IBlot): number {
    return this._scrollBlot.offsetOf(blot)
  }

  /**
   * Tear down and clean up.
   */
  destroy() {
    this._clearPaginationGaps()
    this._releasePaginationAccess()
    this._releasePaginationAccess = () => undefined
    this._inlineFloatLayout.destroy()
    this._scrollBlot.detachAll()
  }

  private get _beginSelectionProjection(): (() => (() => void)) | undefined {
    return this._paginationOptions?.beginSelectionProjection
  }
}
