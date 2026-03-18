import {ScrollBlot, TextBlot, EmbedBlot, BlotType, IBlot} from "../blot";
import {EmbedConverterMap} from "../blot/scroll-blot";
import {InlinePositionMapper, PointAffinity, IDomPoint} from "../position/inline-position-mapper";
import {DeltaInsert, DeltaOperation, InlineModel} from "../../types";
import type {EmbedConverter} from "../index";

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

  constructor(
    readonly container: HTMLElement,
    embedConverters: EmbedConverterMap
  ) {
    this._scrollBlot = new ScrollBlot(container, embedConverters)
    this._mapper = new InlinePositionMapper()
    this._mapper.setScrollBlot(this._scrollBlot)
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
    this._scrollBlot.build(deltas)
  }

  /**
   * Apply incremental delta operations.
   * Updates the blot tree and patches the DOM in-place.
   */
  applyDelta(ops: DeltaOperation[]) {
    this._scrollBlot.applyDelta(ops)
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
    this._scrollBlot.detachAll()
  }
}
