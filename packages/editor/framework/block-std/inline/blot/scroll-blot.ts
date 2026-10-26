import {BlotType, IBlot, IScrollBlot} from "./blot";
import {TextBlot} from "./text-blot";
import {EmbedBlot} from "./embed-blot";
import {BreakBlot} from "./break-blot";
import {CursorBlot} from "./cursor-blot";
import {DeltaInsert, DeltaInsertEmbed, DeltaOperation, IInlineNodeAttrs, InlineModel} from "../../types";
import {createZeroSpace} from "../../../utils";
import type {EmbedConverter} from "../index";

export type EmbedConverterMap = Map<string, EmbedConverter>

/**
 * ScrollBlot is the root of an inline blot tree for a single editable block.
 *
 * It owns an ordered list of leaf blots and the container DOM element.
 * The container DOM layout is:
 * ```
 *   <div.edit-container>
 *     <span data-zero-space="true">​</span>   ← leading gap
 *     <c-element>…</c-element>                 ← TextBlot / EmbedBlot
 *     ...
 *     <c-element class="bc-end-break"><br></c-element>  ← BreakBlot
 *   </div>
 * ```
 *
 * Lifecycle:
 * - `build(deltas)` — full rebuild from delta array.
 * - `applyDelta(ops)` — incremental patch.
 * - `detach()` — tear down all children.
 */
export class ScrollBlot implements IScrollBlot {
  readonly type = BlotType.Scroll as const

  private _children: IBlot[] = []

  // ─── Cached index structures ───
  private _cachedLeaves: (TextBlot | EmbedBlot)[] | null = null
  private _prefixSums: number[] | null = null
  private _offsetByBlot: Map<IBlot, number> | null = null

  constructor(
    readonly domNode: HTMLElement,
    private _embedConverters: Map<string, EmbedConverter>
  ) {}

  /**
   * Invalidate the cached leaves, prefix-sum arrays, and child indices.
   * Must be called after any mutation to _children or leaf lengths.
   */
  private _invalidateIndex() {
    this._cachedLeaves = null
    this._prefixSums = null
    this._offsetByBlot = null
  }

  /**
   * Lazily rebuild the leaves cache, prefix-sum array, and _childIndex on each blot.
   */
  private _ensureIndex() {
    if (this._cachedLeaves !== null) return
    const leaves: (TextBlot | EmbedBlot)[] = []
    const offsetByBlot = new Map<IBlot, number>()
    let offset = 0
    for (let ci = 0; ci < this._children.length; ci++) {
      const b = this._children[ci]
      ;(b as any)._childIndex = ci
      offsetByBlot.set(b, offset)
      if (b.type === BlotType.Text || b.type === BlotType.Embed) {
        leaves.push(b as TextBlot | EmbedBlot)
        offset += b.length
      }
    }
    const sums = new Array<number>(leaves.length + 1)
    sums[0] = 0
    for (let i = 0; i < leaves.length; i++) {
      sums[i + 1] = sums[i] + leaves[i].length
    }
    this._cachedLeaves = leaves
    this._prefixSums = sums
    this._offsetByBlot = offsetByBlot
  }

  /**
   * Fresh filter of leaves from _children — for use inside mutation methods
   * that need a snapshot before modifying _children.
   */
  private _filterLeaves(): (TextBlot | EmbedBlot)[] {
    return this._children.filter(
      (b): b is TextBlot | EmbedBlot => b.type === BlotType.Text || b.type === BlotType.Embed
    )
  }

  /**
   * Get the index of a blot in _children.
   * Uses cached _childIndex if the index is still valid, falls back to indexOf.
   */
  private _childIndexOf(blot: IBlot): number {
    const ci = (blot as any)._childIndex
    if (ci >= 0 && ci < this._children.length && this._children[ci] === blot) {
      return ci
    }
    return this._children.indexOf(blot)
  }

  get children(): IBlot[] {
    return this._children
  }

  /**
   * Leaf blots only (excludes BreakBlot and CursorBlot).
   * Returns a cached array — do NOT mutate the returned array.
   */
  get leaves(): (TextBlot | EmbedBlot)[] {
    this._ensureIndex()
    return this._cachedLeaves!
  }

  /** O(1) via prefix-sum cache. */
  get textLength(): number {
    this._ensureIndex()
    const sums = this._prefixSums!
    return sums[sums.length - 1]
  }

  /**
   * Full rebuild: clear existing children and build from a delta snapshot.
   */
  build(deltas: InlineModel) {
    this._invalidateIndex()
    this.detachAll()
    const leadingGap = createZeroSpace()
    const endBreak = new BreakBlot()
    endBreak.parent = this

    const nodes: Node[] = [leadingGap]
    for (const delta of deltas) {
      const blot = this._createLeafBlot(delta)
      blot.parent = this
      this._children.push(blot)
      nodes.push(blot.domNode)
    }
    this._children.push(endBreak)
    nodes.push(endBreak.domNode)

    this.domNode.replaceChildren(...nodes)
  }

  /**
   * Apply incremental delta operations to the blot tree and its DOM.
   *
   * This mirrors the semantics of `InlineManager.applyDeltaToView()` but
   * operates through the blot abstraction.
   */
  applyDelta(ops: DeltaOperation[]) {
    let cursor = 0  // model offset cursor

    const getLeafAtCursor = (): { leaf: TextBlot | EmbedBlot; localOffset: number; leafIndex: number } | null => {
      const leaves = this._filterLeaves()
      let offset = 0
      for (let i = 0; i < leaves.length; i++) {
        if (offset + leaves[i].length > cursor || (offset + leaves[i].length === cursor && i === leaves.length - 1)) {
          return {leaf: leaves[i], localOffset: cursor - offset, leafIndex: i}
        }
        if (offset + leaves[i].length === cursor) {
          return leaves[i + 1]
            ? {leaf: leaves[i + 1], localOffset: 0, leafIndex: i + 1}
            : {leaf: leaves[i], localOffset: leaves[i].length, leafIndex: i}
        }
        offset += leaves[i].length
      }
      return null
    }

    for (const op of ops) {
      if (op.retain != null) {
        if (op.attributes) {
          this._formatRange(cursor, op.retain, op.attributes)
        }
        cursor += op.retain
        continue
      }

      if (op.delete != null) {
        this._deleteRange(cursor, op.delete)
        continue
      }

      if (op.insert != null) {
        // Optimization: for text inserts, reuse existing TextBlot with matching attrs
        if (typeof op.insert === 'string') {
          const info = getLeafAtCursor()
          if (info && info.leaf instanceof TextBlot && this._attrsMatch(info.leaf.attrs, op.attributes)) {
            info.leaf.insertAt(info.localOffset, op.insert)
            cursor += op.insert.length
            continue
          }
          // At boundary, check previous leaf
          if (info && info.localOffset === 0 && info.leafIndex > 0) {
            const prevLeaf = this._filterLeaves()[info.leafIndex - 1]
            if (prevLeaf instanceof TextBlot && this._attrsMatch(prevLeaf.attrs, op.attributes)) {
              prevLeaf.insertAt(prevLeaf.length, op.insert)
              cursor += op.insert.length
              continue
            }
          }
        }
        // Fallback: create new blot (embeds, mismatched attrs, or empty container)
        const delta: DeltaInsert = {insert: op.insert, attributes: op.attributes} as DeltaInsert
        const blot = this._createLeafBlot(delta)
        this._insertBlotAt(cursor, blot)
        cursor += blot.length
      }
    }

    this._cleanupEmptyLeaves()
    this._invalidateIndex()
  }

  /**
   * Find the leaf blot and local offset at the given model character offset.
   * O(log n) via binary search on prefix sums.
   */
  findByOffset(offset: number): { blot: TextBlot | EmbedBlot; localOffset: number } | null {
    this._ensureIndex()
    const leaves = this._cachedLeaves!
    const sums = this._prefixSums!
    if (leaves.length === 0) return null

    // Binary search: find the first leaf whose cumulative end >= offset
    let lo = 0, hi = leaves.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (sums[mid + 1] < offset) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    // sums[lo] is the start of leaves[lo]
    return { blot: leaves[lo], localOffset: offset - sums[lo] }
  }

  /**
   * Get the model offset of a given blot.
   * O(1) through the same lazily rebuilt index used by `findByOffset()`.
   *
   * Zero-length blots (CursorBlot, BreakBlot) occupy no model characters;
   * their offset is the cumulative length of the leaves preceding them in
   * _children — i.e. their insertion point in model coordinates.
   * Returns -1 only for blots that are not children of this scroll.
   */
  offsetOf(blot: IBlot): number {
    this._ensureIndex()
    return this._offsetByBlot!.get(blot) ?? -1
  }

  /**
   * Remove all children and clear the container DOM.
   */
  detachAll() {
    const children = this._children
    this._children = []
    this._invalidateIndex()
    for (const child of children) {
      child.detach()
    }
    this.domNode.replaceChildren()
  }

  // ─── Public blot management APIs ───

  /**
   * Create a leaf blot from a delta insert.
   * Exposed for subclasses (e.g. CodeInlineRuntime) that need to create blots externally.
   */
  createLeafBlot(delta: DeltaInsert): TextBlot | EmbedBlot {
    return this._createLeafBlot(delta)
  }

  /**
   * Insert a new leaf blot before the given reference blot.
   * If ref is null, inserts before the BreakBlot (end of content).
   */
  insertLeafBefore(newBlot: TextBlot | EmbedBlot, ref: IBlot | null) {
    this._invalidateIndex()
    newBlot.parent = this

    if (!ref) {
      const breakIdx = this._children.findIndex(b => b.type === BlotType.Break)
      const insertIdx = breakIdx >= 0 ? breakIdx : this._children.length
      this._children.splice(insertIdx, 0, newBlot)
      const refNode = breakIdx >= 0 ? this._children[insertIdx + 1].domNode : null
      this.domNode.insertBefore(newBlot.domNode, refNode)
      return
    }

    const refIdx = this._childIndexOf(ref)
    if (refIdx < 0) {
      // ref not found, append before break
      this.insertLeafBefore(newBlot, null)
      return
    }
    this._children.splice(refIdx, 0, newBlot)
    ref.domNode.parentNode!.insertBefore(newBlot.domNode, ref.domNode)
  }

  /**
   * Remove a leaf blot from the tree and detach its DOM.
   */
  removeLeaf(blot: TextBlot | EmbedBlot) {
    const idx = this._childIndexOf(blot)
    if (idx >= 0) {
      this._children.splice(idx, 1)
      blot.detach()
      this._invalidateIndex()
    }
  }

  /**
   * Split a TextBlot at an absolute model offset for a reversible view-only
   * layout projection.
   *
   * @internal InlineFragmentProjection only. This does not mutate Y.Text and
   * callers must pair every successful split with `mergeLayoutTextSplit()`.
   */
  splitTextForLayout(modelOffset: number): [TextBlot, TextBlot] | null {
    if (modelOffset <= 0 || modelOffset >= this.textLength) return null
    const info = this.findByOffset(modelOffset)
    if (
      !info ||
      !(info.blot instanceof TextBlot) ||
      info.localOffset <= 0 ||
      info.localOffset >= info.blot.length
    ) {
      return null
    }

    const left = info.blot
    const right = left.split(info.localOffset)
    const childIndex = this._childIndexOf(left)
    const parentNode = left.domNode.parentNode
    if (childIndex < 0 || !parentNode) {
      // `split()` already changed the left blot. Restore it before failing so
      // a disconnected/stale layout pass cannot alter the canonical view.
      left.mergeWith(right)
      return null
    }

    right.parent = this
    parentNode.insertBefore(right.domNode, left.domNode.nextSibling)
    this._children.splice(childIndex + 1, 0, right)
    this._invalidateIndex()
    return [left, right]
  }

  /**
   * Reverse one split created by `splitTextForLayout()`.
   *
   * @internal InlineFragmentProjection only. The identity and adjacency
   * checks deliberately prevent this from merging unrelated semantic runs.
   */
  mergeLayoutTextSplit(split: readonly [TextBlot, TextBlot]): boolean {
    const [left, right] = split
    const leftIndex = this._childIndexOf(left)
    if (
      leftIndex < 0 ||
      this._children[leftIndex + 1] !== right ||
      left.parent !== this ||
      right.parent !== this
    ) {
      return false
    }
    if (!left.mergeWith(right)) return false
    this._children.splice(leftIndex + 1, 1)
    this._invalidateIndex()
    return true
  }

  /**
   * Put every Blot DOM node back under the canonical editable container in
   * `_children` order. Zero-length layout wrappers are intentionally not
   * represented in `_children` and can then be removed by their owner.
   *
   * @internal InlineFragmentProjection only.
   */
  restoreCanonicalDomOrder(): void {
    // Do not use BreakBlot as insertBefore's reference. Firefox may detach the
    // trailing <br> while committing a native contenteditable mutation; using
    // that disconnected node as a reference throws before InputTransformer can
    // restore the model-owned view. appendChild reparents every retained Blot
    // and deterministically restores `_children` order in one pass.
    for (const child of this._children) {
      this.domNode.appendChild(child.domNode)
    }
    this._invalidateIndex()
  }

  /**
   * Batch replace: remove leaves in [startIdx, startIdx+deleteCount),
   * then insert newBlots at that position.
   * Indices are relative to `this.leaves` (not `this._children`).
   */
  spliceLeaves(
    startIdx: number,
    deleteCount: number,
    newBlots: (TextBlot | EmbedBlot)[]
  ) {
    const currentLeaves = this._filterLeaves()
    const toRemove = currentLeaves.slice(startIdx, startIdx + deleteCount)

    // Find the DOM insertion anchor: the first blot after the removed range
    const afterBlot = currentLeaves[startIdx + deleteCount] ?? null
    const refNode = afterBlot?.domNode
      ?? this._children.find(b => b.type === BlotType.Break)?.domNode
      ?? null

    // Remove old blots
    for (const blot of toRemove) {
      const idx = this._childIndexOf(blot)
      if (idx >= 0) this._children.splice(idx, 1)
      blot.detach()
    }

    // Compute insert position in _children
    const insertPos = afterBlot
      ? this._childIndexOf(afterBlot)
      : this._children.findIndex(b => b.type === BlotType.Break)

    // Insert new blots (in order)
    for (let i = 0; i < newBlots.length; i++) {
      const nb = newBlots[i]
      nb.parent = this
      this._children.splice(insertPos + i, 0, nb)
      this.domNode.insertBefore(nb.domNode, refNode)
    }
    this._invalidateIndex()
  }

  // ─── CursorBlot management ───

  /**
   * Insert a CursorBlot at the given model offset.
   * If the offset falls inside a TextBlot, the TextBlot is split.
   */
  insertCursorBlot(modelOffset: number, cursor: CursorBlot) {
    this._invalidateIndex()
    cursor.parent = this
    const info = this.findByOffset(modelOffset)

    if (!info) {
      // Empty container — insert before break
      const breakBlot = this._children.find(b => b.type === BlotType.Break)
      if (breakBlot) {
        const idx = this._childIndexOf(breakBlot)
        this._children.splice(idx, 0, cursor)
        breakBlot.domNode.parentNode!.insertBefore(cursor.domNode, breakBlot.domNode)
      } else {
        this._children.push(cursor)
        this.domNode.appendChild(cursor.domNode)
      }
      this._invalidateIndex()
      return
    }

    const {blot, localOffset} = info
    if (blot.type === BlotType.Text && localOffset > 0 && localOffset < blot.length) {
      // Split the TextBlot
      const right = (blot as TextBlot).split(localOffset)
      right.parent = this
      const blotIdx = this._childIndexOf(blot)
      blot.domNode.parentNode!.insertBefore(cursor.domNode, blot.domNode.nextSibling)
      blot.domNode.parentNode!.insertBefore(right.domNode, cursor.domNode.nextSibling)
      this._children.splice(blotIdx + 1, 0, cursor, right)
    } else {
      // At boundary — insert before or after
      const blotIdx = this._childIndexOf(blot)
      if (localOffset === 0) {
        this._children.splice(blotIdx, 0, cursor)
        blot.domNode.parentNode!.insertBefore(cursor.domNode, blot.domNode)
      } else {
        this._children.splice(blotIdx + 1, 0, cursor)
        blot.domNode.parentNode!.insertBefore(cursor.domNode, blot.domNode.nextSibling)
      }
    }
    this._invalidateIndex()
  }

  /**
   * Remove a CursorBlot from the tree.
   */
  removeCursorBlot(cursor: CursorBlot) {
    const idx = this._childIndexOf(cursor)
    if (idx >= 0) {
      this._children.splice(idx, 1)
      cursor.detach()
      this._invalidateIndex()
    }
  }

  // ─── Internal helpers ───

  private _createLeafBlot(delta: DeltaInsert): TextBlot | EmbedBlot {
    if (typeof delta.insert === 'string') {
      return new TextBlot(delta.insert, delta.attributes)
    }

    const embedKey = Object.keys(delta.insert)[0]
    const converter = this._embedConverters.get(embedKey)
    if (!converter) {
      throw new Error(`No embed converter registered for: ${embedKey}`)
    }
    const embedView = converter.toView(delta as DeltaInsertEmbed)
    return new EmbedBlot(embedView, delta.attributes, converter, delta as DeltaInsertEmbed)
  }

  private _insertBlotAt(modelOffset: number, newBlot: TextBlot | EmbedBlot) {
    newBlot.parent = this
    const leaves = this._filterLeaves()

    if (leaves.length === 0) {
      const breakIdx = this._children.findIndex(b => b.type === BlotType.Break)
      if (breakIdx >= 0) {
        this._children.splice(breakIdx, 0, newBlot)
        this._children[breakIdx + 1].domNode.parentNode!.insertBefore(newBlot.domNode, this._children[breakIdx + 1].domNode)
      } else {
        this._children.push(newBlot)
        this.domNode.appendChild(newBlot.domNode)
      }
      return
    }

    let pos = 0
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]
      if (modelOffset <= pos + leaf.length) {
        const localOffset = modelOffset - pos
        if (localOffset === 0) {
          leaf.domNode.parentNode!.insertBefore(newBlot.domNode, leaf.domNode)
          const childIdx = this._childIndexOf(leaf)
          this._children.splice(childIdx, 0, newBlot)
          return
        }

        if (leaf.type === BlotType.Text && localOffset < leaf.length) {
          const right = leaf.split(localOffset)
          right.parent = this
          const childIdx = this._childIndexOf(leaf)
          leaf.domNode.parentNode!.insertBefore(newBlot.domNode, leaf.domNode.nextSibling)
          leaf.domNode.parentNode!.insertBefore(right.domNode, newBlot.domNode.nextSibling)
          this._children.splice(childIdx + 1, 0, newBlot, right)
          return
        }

        leaf.domNode.parentNode!.insertBefore(newBlot.domNode, leaf.domNode.nextSibling)
        const childIdx = this._childIndexOf(leaf)
        this._children.splice(childIdx + 1, 0, newBlot)
        return
      }
      pos += leaf.length
    }

    const lastLeaf = leaves[leaves.length - 1]
    lastLeaf.domNode.parentNode!.insertBefore(newBlot.domNode, lastLeaf.domNode.nextSibling)
    const childIdx = this._childIndexOf(lastLeaf)
    this._children.splice(childIdx + 1, 0, newBlot)
  }

  private _deleteRange(startOffset: number, length: number) {
    let remaining = length
    let pos = 0
    const leaves = this._filterLeaves()

    for (let i = 0; i < leaves.length && remaining > 0; i++) {
      const leaf = leaves[i]
      if (pos + leaf.length <= startOffset) {
        pos += leaf.length
        continue
      }

      const localStart = Math.max(0, startOffset - pos)
      const canDelete = Math.min(remaining, leaf.length - localStart)

      if (localStart === 0 && canDelete >= leaf.length) {
        remaining -= leaf.length
        pos += leaf.length
        const childIdx = this._childIndexOf(leaf)
        if (childIdx >= 0) {
          this._children.splice(childIdx, 1)
          leaf.detach()
        }
        continue
      }

      if (leaf instanceof TextBlot) {
        leaf.deleteAt(localStart, canDelete)
        remaining -= canDelete
        pos += leaf.length + canDelete
      }
    }
  }

  private _formatRange(startOffset: number, length: number, attrs: IInlineNodeAttrs) {
    let remaining = length
    let pos = 0
    for (const leaf of this._filterLeaves()) {
      const origLen = leaf.length // capture before potential split
      if (pos + origLen <= startOffset) {
        pos += origLen
        continue
      }

      const localStart = Math.max(0, startOffset - pos)
      const canFormat = Math.min(remaining, origLen - localStart)

      if (localStart === 0 && canFormat >= origLen) {
        if (leaf instanceof TextBlot) leaf.format(attrs)
        else if (leaf instanceof EmbedBlot) leaf.format(attrs)
        remaining -= canFormat
      } else if (leaf instanceof TextBlot) {
        const right = leaf.split(localStart)
        right.parent = this
        const childIdx = this._childIndexOf(leaf)
        leaf.domNode.parentNode!.insertBefore(right.domNode, leaf.domNode.nextSibling)
        this._children.splice(childIdx + 1, 0, right)

        if (canFormat >= right.length) {
          right.format(attrs)
          remaining -= canFormat
        } else {
          const tail = right.split(canFormat)
          tail.parent = this
          const rightIdx = this._childIndexOf(right)
          right.domNode.parentNode!.insertBefore(tail.domNode, right.domNode.nextSibling)
          this._children.splice(rightIdx + 1, 0, tail)
          right.format(attrs)
          remaining -= canFormat
        }
      }

      pos += origLen
      if (remaining <= 0) break
    }
  }

  private _attrsMatch(a: IInlineNodeAttrs | undefined, b: IInlineNodeAttrs | undefined): boolean {
    if (!a && !b) return true
    if (!a || !b) return false
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every(k => (a as any)[k] === (b as any)[k])
  }

  private _cleanupEmptyLeaves() {
    for (let i = this._children.length - 1; i >= 0; i--) {
      const child = this._children[i]
      if (child.type === BlotType.Text && child.length === 0) {
        child.detach()
        this._children.splice(i, 1)
      }
    }
    // Merge adjacent TextBlots with matching attributes
    for (let i = 0; i < this._children.length - 1; i++) {
      const cur = this._children[i]
      const next = this._children[i + 1]
      if (cur instanceof TextBlot && next instanceof TextBlot && (cur as TextBlot).mergeWith(next as TextBlot)) {
        this._children.splice(i + 1, 1)
        i--
      }
    }
  }
}
