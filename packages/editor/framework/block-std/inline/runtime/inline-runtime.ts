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
import {
  graphemeBoundaries,
  InlineRangeMeasurer,
} from './inline-fragment-layout'
import {
  InlinePaginationLineStart,
  registerInlinePaginationAccess,
} from './inline-pagination-access'

const PAGINATION_LINE_TOLERANCE = 0.75
const PAGINATION_EXACT_LINE_LIMIT = 64

/** Resolve layout-px line metrics into the same visual coordinate space as BCR. */
function visualScaleForLayout(
  element: HTMLElement,
  rect: DOMRect,
): number {
  const layoutHeight = element.offsetHeight
  if (
    layoutHeight > 0
    && Number.isFinite(rect.height)
    && rect.height > 0
  ) {
    return rect.height / layoutHeight
  }
  const layoutWidth = element.offsetWidth
  if (
    layoutWidth > 0
    && Number.isFinite(rect.width)
    && rect.width > 0
  ) {
    return rect.width / layoutWidth
  }
  return 1
}

/**
 * Collapse the client rects of rich inline runs into visual lines.
 *
 * A single line can contain text, emoji and differently formatted c-elements.
 * Their ink tops routinely differ by several pixels, so de-duplicating only by
 * `rect.top` turns one visual line into multiple pagination candidates. A cut
 * resolved from such a false candidate lands in the middle of the line and
 * leaves its leading text painted across the page gap.
 */
function visualLineTops(rects: readonly DOMRect[]): number[] {
  const visible = rects
    .filter(rect =>
      (rect.width > 0.01 || rect.height > 0.01)
      && Number.isFinite(rect.top)
      && Number.isFinite(rect.bottom),
    )
    .sort((left, right) => left.top - right.top || left.left - right.left)
  const lines: Array<{top: number; bottom: number}> = []

  for (const rect of visible) {
    const rectBottom = Math.max(rect.top, rect.bottom)
    let line = lines[lines.length - 1]
    const overlapsLastLine = line
      && (
        Math.min(line.bottom, rectBottom)
          - Math.max(line.top, rect.top)
          > PAGINATION_LINE_TOLERANCE
      )
    if (!overlapsLastLine) {
      line = {top: rect.top, bottom: rectBottom}
      lines.push(line)
      continue
    }
    line.top = Math.min(line.top, rect.top)
    line.bottom = Math.max(line.bottom, rectBottom)
  }

  return lines
    .sort((left, right) => left.top - right.top)
    .map(line => line.top)
}

/** Keep line candidates distributed across the full natural block height. */
function sampleLineTops(tops: readonly number[], limit: number): number[] {
  if (tops.length <= limit) return [...tops]
  const sampled: number[] = []
  for (let index = 1; index <= limit; index++) {
    const sourceIndex = Math.min(
      tops.length - 1,
      Math.floor(index * tops.length / (limit + 1)),
    )
    const top = tops[sourceIndex]
    if (sampled[sampled.length - 1] !== top) sampled.push(top)
  }
  return sampled
}

function estimatedLineTops(
  containerTop: number,
  containerHeight: number,
  lineHeight: number,
  estimatedLineCount: number,
  limit: number,
): number[] {
  const sampleCount = Math.min(limit, Math.max(0, estimatedLineCount - 1))
  const tops: number[] = []
  for (let index = 1; index <= sampleCount; index++) {
    const lineIndex = Math.max(
      1,
      Math.min(
        estimatedLineCount - 1,
        Math.floor(index * estimatedLineCount / (sampleCount + 1)),
      ),
    )
    const top = containerTop
      + lineIndex * containerHeight / estimatedLineCount
    if (tops[tops.length - 1] !== top) tops.push(top)
  }
  return tops
}

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
      projectionWritable: () =>
        this._inlineFloatLayout.paginationProjectionWritable,
      whenProjectionWritable: listener =>
        this._inlineFloatLayout.whenPaginationProjectionWritable(listener),
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
    this._prepareForMutation()
    this._scrollBlot.build(deltas)
    this._inlineFloatLayout.sync()
  }

  /**
   * Apply incremental delta operations.
   * Updates the blot tree and patches the DOM in-place.
   */
  applyDelta(ops: DeltaOperation[]) {
    this._prepareForMutation()
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
      if (this._inlineFloatLayout.hasFloatOwner) {
        return this._inlineFloatLayout.applyPaginationGaps(gaps)
      }
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
      || this._inlineFloatLayout.hasPaginationGaps
    if (!hadProjection) return

    const releaseSelectionGuard = this._beginSelectionProjection?.()
    try {
      this._inlineFloatLayout.clearPaginationGaps()
      this._paginationProjection.revoke()
      const releaseFloat = this._releaseFloatForPagination
      this._releaseFloatForPagination = undefined
      // Mark the float layout dirty while its lease is still held, then let
      // release coalesce one canonical refresh into the next animation frame.
      if (releaseFloat) {
        this._inlineFloatLayout.sync()
        releaseFloat()
      }
    } finally {
      releaseSelectionGuard?.()
    }
  }

  /** Restore one canonical DOM once before a model-owned Blot mutation. */
  private _prepareForMutation(): void {
    const hasProjection = this._paginationProjection.active
      || !!this._releaseFloatForPagination
      || this._inlineFloatLayout.hasProjection
    const releaseSelectionGuard = hasProjection
      ? this._beginSelectionProjection?.()
      : undefined
    try {
      this._paginationProjection.revoke()
      this._inlineFloatLayout.beforeMutation(hasProjection)
      const releaseFloat = this._releaseFloatForPagination
      this._releaseFloatForPagination = undefined
      releaseFloat?.()
    } finally {
      releaseSelectionGuard?.()
    }
  }

  /**
   * 测出自然行盒的续排锚点。每一项都指向“下一行行首”，因此投影页缝不会切开字素或视觉行。
   * 环绕对象及其占用的视觉行带保持原子；带外行首仍可作为分页锚点。
   *
   * @internal Pagination measurement only.
   */
  private _measurePaginationLineStarts(limit = 2048): InlinePaginationLineStart[] {
    const safeLimit = Math.max(0, Math.floor(limit))
    if (
      safeLimit === 0
      || !this.container.isConnected
      || this.textLength <= 0
    ) {
      return []
    }

    const measurer = new InlineRangeMeasurer(
      this.container,
      this._scrollBlot,
      (start, end) => this.modelRangeToDomRange(start, end),
    )
    const containerRect = this.container.getBoundingClientRect()
    const containerTop = containerRect.top
    const lineHeight = measurer.lineHeight()
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return []
    const visualScale = visualScaleForLayout(this.container, containerRect)
    const computedLineHeight = Number.parseFloat(
      getComputedStyle(this.container).lineHeight,
    )
    // A numeric computed line-height is layout px, while
    // InlineRangeMeasurer's `normal` fallback comes from a Range BCR and is
    // already visual px under CSS zoom. Keep this distinction explicit to
    // avoid applying zoom twice. Embed-only content has no glyph BCR fallback,
    // so its font-size fallback remains layout px and still needs scaling.
    const normalUsesGlyphBcr = !Number.isFinite(computedLineHeight)
      && this._scrollBlot.leaves.some(
        leaf => leaf instanceof TextBlot && leaf.length > 0,
      )
    const visualLineHeight = normalUsesGlyphBcr
      ? lineHeight
      : lineHeight * visualScale
    const isBoundarySafe = this._inlineFloatLayout.paginationBoundaryGuard()
    const estimatedLineCount = Math.max(
      1,
      Math.round(containerRect.height / visualLineHeight),
    )
    // Exact native Range rect enumeration is cheap for ordinary paragraphs,
    // but becomes a main-thread trap when repeated across many rich cells.
    // Large blocks resolve a bounded set of vertical targets instead.
    const sampledTops = estimatedLineCount <= PAGINATION_EXACT_LINE_LIMIT
      ? sampleLineTops(
        visualLineTops(
          this._inlineFloatLayout.hasFloatOwner
            ? this._paginationTextClientRects()
            : this.modelRangeToClientRects(0, this.textLength),
        ).slice(1),
        safeLimit,
      )
      : estimatedLineTops(
        containerTop,
        containerRect.height,
        visualLineHeight,
        estimatedLineCount,
        safeLimit,
      )
    if (!sampledTops.length) return []

    const points: InlinePaginationLineStart[] = []
    let minimumOffset = 1

    measurer.beginLayoutPass()
    try {
      for (const targetTop of sampledTops) {
        const offset = this._findPaginationOffsetAtTop(
          targetTop,
          minimumOffset,
          measurer,
        )
        if (offset === null || offset >= this.textLength) continue
        const rect = this._paginationRectAt(offset, measurer)
        if (!rect) continue
        // Range rects describe glyph ink, not the CSS line box. Using the ink
        // top as consumed height lets the preceding fragment extend into the
        // page backdrop when line-height contains leading. Project against the
        // estimated line-box top so the entire next line moves as one unit.
        const top = rect.top
          - Math.max(0, (visualLineHeight - rect.height) / 2)
          - containerTop
        if (!isBoundarySafe(offset, top)) {
          continue
        }
        const previous = points[points.length - 1]
        if (
          offset <= (previous?.offset ?? 0)
          || top <= (previous?.top ?? Number.NEGATIVE_INFINITY) + PAGINATION_LINE_TOLERANCE
        ) {
          continue
        }
        const splitCandidate = this._scrollBlot.findByOffset(offset)
        const requiresSplitGuard = splitCandidate?.blot instanceof TextBlot
          && splitCandidate.localOffset > 0
          && splitCandidate.localOffset < splitCandidate.blot.length
        points.push({
          offset,
          top,
          // WebKit can keep the split TextBlot's last painted glyph in this
          // line even though the measured model boundary starts the line.
          // Existing Blot boundaries need no split and therefore no spare
          // line; reserving one there would only reduce page utilization.
          visualGuardHeight: requiresSplitGuard
            ? Math.max(visualLineHeight, rect.height)
                + PAGINATION_LINE_TOLERANCE
            : 0,
        })
        minimumOffset = offset + 1
      }
    } catch {
      return []
    } finally {
      measurer.endLayoutPass()
    }
    return points
  }

  private _paginationTextClientRects(): DOMRect[] {
    const rects: DOMRect[] = []
    for (const leaf of this._scrollBlot.leaves) {
      if (!(leaf instanceof TextBlot) || !leaf.length) continue
      try {
        const range = document.createRange()
        range.selectNodeContents(leaf.textNode)
        rects.push(...Array.from(range.getClientRects()))
      } catch {
        return []
      }
    }
    return rects
  }

  private _findPaginationOffsetAtTop(
    targetTop: number,
    minimumOffset: number,
    measurer: InlineRangeMeasurer,
  ): number | null {
    let low = Math.max(1, minimumOffset)
    let high = this.textLength - 1
    let best = -1

    // Natural inline y is monotonic in model order. Resolve only the sampled
    // sheet-scale targets, rather than cloning and fitting once per visual line.
    while (low <= high) {
      const middle = (low + high) >>> 1
      const rect = this._paginationRectAt(middle, measurer)
      if (!rect) {
        low = middle + 1
        continue
      }
      if (rect.top >= targetTop - PAGINATION_LINE_TOLERANCE) {
        best = middle
        high = middle - 1
      } else {
        low = middle + 1
      }
    }
    if (best < 0) return null

    return this._graphemeStartAtOrBefore(best)
  }

  private _paginationRectAt(
    offset: number,
    measurer: InlineRangeMeasurer,
  ): DOMRect | undefined {
    if (offset < 0 || offset >= this.textLength) return undefined
    const end = measurer.nextOffset(offset, this.textLength)
    if (end <= offset) return undefined
    return this.modelRangeToClientRects(offset, end).find(
      candidate => candidate.width > 0.01 || candidate.height > 0.01,
    )
  }

  private _graphemeStartAtOrBefore(offset: number): number {
    const info = this._scrollBlot.findByOffset(offset)
    if (!(info?.blot instanceof TextBlot)) return offset
    if (info.localOffset <= 0 || info.localOffset >= info.blot.length) return offset

    const leafStart = this._scrollBlot.offsetOf(info.blot)
    const windowStart = Math.max(0, info.localOffset - 128)
    const text = info.blot.text.slice(windowStart, info.localOffset + 128)
    const localBoundary = graphemeBoundaries(text)
      .filter(boundary => boundary <= info.localOffset - windowStart)
      .pop()
    return leafStart + windowStart + (localBoundary ?? 0)
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
