import {BlotType, IBlot, IScrollBlot} from "./blot";
import {TextBlot} from "./text-blot";
import {EmbedBlot} from "./embed-blot";
import {BreakBlot} from "./break-blot";
import {CursorBlot} from "./cursor-blot";
import {DeltaInsert, DeltaInsertEmbed, DeltaOperation, IInlineNodeAttrs, InlineModel} from "../../types";
import {createZeroSpace} from "../../../utils";
import type {EmbedConverter} from "../index";
import {LogicalLineDom} from './logical-line-dom';
import {LogicalLineIndex} from './logical-line-index';
import {registerLogicalLineAccess, type LogicalLineAccess, type LogicalSourceLine} from './logical-line-access';

export type EmbedConverterMap = Map<string, EmbedConverter>

type TextMutationRecovery = {
  index: LogicalLineIndex
  leaves: Map<TextBlot, {node: Text; text: string}>
}

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
  private readonly _lineDom?: LogicalLineDom
  private _leadingGap: HTMLElement | null = null
  private _leadingGapText: string | null = null
  private _lineIndex?: LogicalLineIndex
  // Untrusted offsets are kept separate and are never published to the mapper.
  private _textRecovery?: TextMutationRecovery
  private _lineTrusted = false
  private _lineIndexNeedsRebuild = true
  private _mutationDepth = 0
  private _controlledMutationFailed = false
  private _cursorAnchors = new WeakMap<CursorBlot, Text>()
  private readonly _lineObserver?: MutationObserver
  private readonly _lineAccess?: LogicalLineAccess

  constructor(
    readonly domNode: HTMLElement,
    private _embedConverters: Map<string, EmbedConverter>,
    options?: {lineContainerTag?: 'c-line'},
  ) {
    if (options?.lineContainerTag) {
      this._lineDom = new LogicalLineDom(domNode, options.lineContainerTag)
      this._lineObserver = new MutationObserver(records => this._invalidateExternalMutations(records))
      this._lineAccess = {
        sourceLines: () => this._lineIndex!.sourceLines(),
        locate: line => this._lineIndex?.locate(line),
        blotFromDom: node => this.domNode.contains(node) ? this._lineIndex?.blotFromDom(node) : undefined,
        nextLeaf: leaf => this._lineIndex?.nextLeaf(leaf),
        trustedPlainText: () => this._trustedLineIndex()?.trustedPlainText(),
      }
      registerLogicalLineAccess(this, () => this._trustedLineIndex() ? this._lineAccess : undefined)
    }
  }

  /** @internal Exact owned gap, including when it is inside a canonical line. */
  get leadingGapNode(): HTMLElement | null { return this._leadingGap }

  /** @internal Distinguishes canonical lines from browser-created wrappers. */
  isCanonicalLineContainer(node: Node): boolean { return this._lineDom?.owns(node) ?? false }

  /** @internal Projection recovery accepts either canonical DOM topology. */
  hasCanonicalDomOrder(): boolean {
    if (this._trustedLineIndex()) return true
    if (this._lineDom) return this._lineDom.hasCanonicalOrder(this._children)
    const expected = this._children.map(child => child.domNode)
    const owned = new Set<Node>(expected)
    const direct = Array.from(this.domNode.childNodes).filter(node => owned.has(node))
    return direct.length === expected.length && direct.every((node, index) => node === expected[index])
  }

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
    const lines = this._trustedLineIndex()
    if (this._cachedLeaves !== null) return
    if (lines) {
      this._cachedLeaves = lines.sourceLines().flatMap(line => line.leaves)
      return
    }
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
  private _filterLeaves(children: readonly IBlot[] = this._children): (TextBlot | EmbedBlot)[] {
    return children.filter(
      (b): b is TextBlot | EmbedBlot => b.type === BlotType.Text || b.type === BlotType.Embed
    )
  }

  /**
   * Get the index of a blot in _children.
   * Uses cached _childIndex if the index is still valid, falls back to indexOf.
   */
  private _childIndexOf(blot: IBlot): number {
    if (!this._lineIndexNeedsRebuild && this._lineTrusted && this._lineIndex) return this._lineIndex.childIndexOf(blot)
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

  /** Flat prefix cache O(1); canonical lines use an O(log lines) numeric sum. */
  get textLength(): number {
    const lines = this._trustedLineIndex()
    if (lines) return lines.textLength
    this._ensureIndex()
    const sums = this._prefixSums!
    return sums[sums.length - 1]
  }

  /**
   * Full rebuild: clear existing children and build from a delta snapshot.
   */
  build(deltas: InlineModel) {
    this._withControlledMutation(() => this._build(deltas))
  }

  private _build(deltas: InlineModel) {
    this._invalidateIndex()
    this.detachAll()
    const leadingGap = createZeroSpace()
    this._leadingGap = leadingGap
    this._leadingGapText = leadingGap.textContent
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

    if (this._lineDom) this._syncLogicalLines()
    else this.domNode.replaceChildren(...nodes)
  }

  /**
   * Apply incremental delta operations to the blot tree and its DOM.
   *
   * This mirrors the semantics of `InlineManager.applyDeltaToView()` but
   * operates through the blot abstraction.
   */
  applyDelta(ops: DeltaOperation[]) {
    this._withControlledMutation(() => {
      if (this._tryApplySingleLineDelta(ops)) return
      this._applyDeltaToChildren(ops, this._children)
      this._invalidateIndex()
      this._syncLogicalLines()
    })
  }

  private _applyDeltaToChildren(ops: DeltaOperation[], children: IBlot[]) {
    let cursor = 0  // model offset cursor

    const getLeafAtCursor = (): { leaf: TextBlot | EmbedBlot; localOffset: number; leafIndex: number } | null => {
      const leaves = this._filterLeaves(children)
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
          this._formatRange(cursor, op.retain, op.attributes, children)
        }
        cursor += op.retain
        continue
      }

      if (op.delete != null) {
        this._deleteRange(cursor, op.delete, children)
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
            const prevLeaf = this._filterLeaves(children)[info.leafIndex - 1]
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
        this._insertBlotAt(cursor, blot, children)
        cursor += blot.length
      }
    }

    this._cleanupEmptyLeaves(children)
  }

  /**
   * Find the leaf blot and local offset at the given model character offset.
   * Flat: O(log leaves). Canonical lines: O(log lines + leaves in one line).
   */
  findByOffset(offset: number): { blot: TextBlot | EmbedBlot; localOffset: number } | null {
    const lines = this._trustedLineIndex()
    if (lines) return lines.findByOffset(offset)
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
   * Flat: O(1) after its lazy rebuild. Canonical lines: O(log lines).
   *
   * Zero-length blots (CursorBlot, BreakBlot) occupy no model characters;
   * their offset is the cumulative length of the leaves preceding them in
   * _children — i.e. their insertion point in model coordinates.
   * Returns -1 only for blots that are not children of this scroll.
   */
  offsetOf(blot: IBlot): number {
    const lines = this._trustedLineIndex()
    if (lines) return lines.offsetOf(blot)
    this._ensureIndex()
    return this._offsetByBlot!.get(blot) ?? -1
  }

  /**
   * Remove all children and clear the container DOM.
   */
  detachAll() {
    this._withControlledMutation(() => this._detachAll(), false)
  }

  private _detachAll() {
    this._lineObserver?.disconnect()
    this._lineIndex = undefined
    this._textRecovery = undefined
    this._lineTrusted = false
    this._cursorAnchors = new WeakMap()
    const children = this._children
    this._children = []
    this._leadingGap = null
    this._leadingGapText = null
    this._lineDom?.clear()
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
    this._withControlledMutation(() => this._insertLeafBefore(newBlot, ref))
  }

  private _insertLeafBefore(newBlot: TextBlot | EmbedBlot, ref: IBlot | null) {
    this._invalidateIndex()
    newBlot.parent = this

    if (!ref) {
      const breakIdx = this._children.findIndex(b => b.type === BlotType.Break)
      const insertIdx = breakIdx >= 0 ? breakIdx : this._children.length
      this._children.splice(insertIdx, 0, newBlot)
      const refNode = breakIdx >= 0 ? this._children[insertIdx + 1].domNode : null
      ;(refNode?.parentNode ?? this.domNode).insertBefore(newBlot.domNode, refNode)
      this._syncLogicalLines()
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
    this._syncLogicalLines()
  }

  /**
   * Remove a leaf blot from the tree and detach its DOM.
   */
  removeLeaf(blot: TextBlot | EmbedBlot) {
    this._withControlledMutation(() => this._removeLeaf(blot))
  }

  private _removeLeaf(blot: TextBlot | EmbedBlot) {
    const idx = this._childIndexOf(blot)
    if (idx >= 0) {
      this._children.splice(idx, 1)
      blot.detach()
      this._invalidateIndex()
      this._syncLogicalLines()
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
    return this._withControlledMutation(() => this._splitTextForLayout(modelOffset), false)
  }

  private _splitTextForLayout(modelOffset: number): [TextBlot, TextBlot] | null {
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
    return this._withControlledMutation(() => this._mergeLayoutTextSplit(split), false)
  }

  private _mergeLayoutTextSplit(split: readonly [TextBlot, TextBlot]): boolean {
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
    this._withControlledMutation(() => this._restoreCanonicalDomOrder())
  }

  private _restoreCanonicalDomOrder(): void {
    if (this._lineDom) {
      this._syncLogicalLines()
      return
    }
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
    this._withControlledMutation(() => {
      if (this._trySpliceSingleLine(startIdx, deleteCount, newBlots)) return
      this._spliceLeaves(startIdx, deleteCount, newBlots)
    })
  }

  private _spliceLeaves(startIdx: number, deleteCount: number, newBlots: (TextBlot | EmbedBlot)[]) {
    const currentLeaves = this._filterLeaves()
    const toRemove = currentLeaves.slice(startIdx, startIdx + deleteCount)

    // Find the DOM insertion anchor: the first blot after the removed range
    const afterBlot = currentLeaves[startIdx + deleteCount] ?? null
    const refNode = afterBlot?.domNode
      ?? this._children.find(b => b.type === BlotType.Break)?.domNode
      ?? null

    // Preserve zero-length children between removed leaves. Repeated array
    // splice/indexOf here makes a large syntax-state change quadratic.
    const removed = new Set<IBlot>(toRemove)
    this._children = this._children.filter(child => !removed.has(child))
    for (const blot of toRemove) blot.detach()

    // Compute insert position in _children
    const insertPos = afterBlot
      ? this._children.indexOf(afterBlot)
      : this._children.findIndex(b => b.type === BlotType.Break)

    // Array spread avoids the argument-count limit of splice(...newBlots).
    // In a built scroll the anchor is always a retained leaf or the end break.
    this._children = [
      ...this._children.slice(0, insertPos),
      ...newBlots,
      ...this._children.slice(insertPos),
    ]
    for (const nb of newBlots) {
      nb.parent = this
      ;(refNode?.parentNode ?? this.domNode).insertBefore(nb.domNode, refNode)
    }
    this._invalidateIndex()
    this._syncLogicalLines()
  }

  // ─── CursorBlot management ───

  /**
   * Insert a CursorBlot at the given model offset.
   * If the offset falls inside a TextBlot, the TextBlot is split.
   */
  insertCursorBlot(modelOffset: number, cursor: CursorBlot) {
    this._withControlledMutation(() => {
      if (!this._tryInsertCursorInLine(modelOffset, cursor)) this._insertCursorBlot(modelOffset, cursor)
    })
    this._cursorAnchors.set(cursor, cursor.anchorNode)
  }

  private _insertCursorBlot(modelOffset: number, cursor: CursorBlot) {
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
      this._syncLogicalLines()
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
    this._syncLogicalLines()
  }

  /**
   * Remove a CursorBlot from the tree.
   */
  removeCursorBlot(cursor: CursorBlot) {
    this._withControlledMutation(() => {
      if (!this._tryRemoveCursorInLine(cursor)) this._removeCursorBlot(cursor)
    })
    this._cursorAnchors.delete(cursor)
  }

  private _tryInsertCursorInLine(modelOffset: number, cursor: CursorBlot): boolean {
    // Nested converter/teardown callbacks may see an outer mutation's old index.
    const index = this._mutationDepth === 1 && this._lineTrusted ? this._lineIndex : undefined
    if (!index || !Number.isInteger(modelOffset) || modelOffset < 0 || modelOffset > index.textLength) return false
    const found = index.findByOffset(modelOffset)
    if (found?.blot instanceof EmbedBlot) return false
    let line = found ? index.lineOf(found.blot) : index.sourceLines()[0]
    if (!line) return false
    let insertAt = found ? line.children.indexOf(found.blot) + (found.localOffset > 0 ? 1 : 0)
      : line.children.findIndex(child => child.type === BlotType.Break)
    if (found?.blot instanceof TextBlot && found.blot.text === '\n' && found.localOffset === 1) {
      // The LF belongs to the preceding source line; the zero-length caret does
      // not. This also covers a hidden LF and the final Break-only empty line.
      line = index.sourceLines()[index.locate(line)!.lineIndex + 1]
      insertAt = 0
    }
    if (!line || insertAt < 0 || line.leaves.some(leaf => leaf instanceof EmbedBlot)) return false
    const position = index.locate(line)!
    const children = [...line.children]
    const inserted: IBlot[] = [cursor]
    if (found?.blot instanceof TextBlot && found.localOffset > 0 && found.localOffset < found.blot.length) {
      const right = found.blot.split(found.localOffset)
      right.parent = this
      inserted.push(right)
    }
    cursor.parent = this
    children.splice(insertAt, 0, ...inserted)
    this._commitSingleLine(line, children, position.childStart)
    return true
  }

  private _tryRemoveCursorInLine(cursor: CursorBlot): boolean {
    const index = this._mutationDepth === 1 && this._lineTrusted ? this._lineIndex : undefined
    if (!index) return false
    const line = index.lineOf(cursor)
    if (!line) {
      // An already released caret has nothing left to invalidate or rebuild.
      this._lineIndexNeedsRebuild = false
      return true
    }
    const position = index.locate(line)!
    const children = line.children.filter(child => child !== cursor)
    cursor.detach()
    this._commitSingleLine(line, children, position.childStart)
    return true
  }

  private _removeCursorBlot(cursor: CursorBlot) {
    const idx = this._childIndexOf(cursor)
    if (idx >= 0) {
      this._children.splice(idx, 1)
      cursor.detach()
      this._invalidateIndex()
      this._syncLogicalLines()
    }
  }

  // ─── Internal helpers ───

  private _invalidateExternalMutations(records: readonly MutationRecord[]): void {
    if (!records.length) return
    // Only character data in an owned caret's original anchor has no model
    // contribution. Any structural/attribute/other-leaf record revokes the whole
    // batch, even if it arrived alongside otherwise valid native preedit text.
    if (records.every(record => this._isCursorTextMutation(record))) return
    const index = this._lineTrusted ? this._lineIndex : this._textRecovery?.index
    const recovery = index ? this._textRecovery ?? {index, leaves: new Map()} : undefined
    this._textRecovery = recovery && records.every(record => this._rememberTextMutation(record, recovery))
      ? recovery : undefined
    this._lineTrusted = false
    this._lineIndex = undefined
    this._lineIndexNeedsRebuild = true
    this._invalidateIndex()
  }

  private _rememberTextMutation(record: MutationRecord, recovery: TextMutationRecovery): boolean {
    if (record.type !== 'characterData' || !(record.target instanceof Text)) return false
    const node = record.target
    const element = node.parentElement?.parentElement
    if (!element?.parentNode || !this.isCanonicalLineContainer(element.parentNode)) return false
    const blot = recovery.index.blotFromDom(element)
    if (!(blot instanceof TextBlot) || blot.parent !== this ||
      !this._isCanonicalTextBlot(blot) || blot.textNode !== node) return false
    const known = recovery.leaves.get(blot)
    if (known) return known.node === node && !node.data.includes('\n')
    const line = recovery.index.lineOf(blot)!
    if (line.leaves.some(leaf => leaf instanceof EmbedBlot)) return false
    // Read the old run from cached source text and offsets, never from the
    // browser-mutated TextBlot getter. LF leaves and LF changes stay full recovery.
    const start = recovery.index.locate(line)!.modelOffset
    const next = recovery.index.nextLeaf(blot)
    const end = next && recovery.index.lineOf(next) === line
      ? recovery.index.offsetOf(next) - start : line.length
    const text = line.text.slice(recovery.index.offsetOf(blot) - start, end)
    if (text.includes('\n') || node.data.includes('\n')) return false
    recovery.leaves.set(blot, {node, text})
    return true
  }

  private _recoverReturnedText(): void {
    const recovery = this._textRecovery
    if (!recovery || ![...recovery.leaves.values()].every(({node, text}) => node.data === text)) return
    // Whole-line equality is insufficient: text can move between two leaves
    // without changing the concatenated line while invalidating leaf offsets.
    this._lineIndex = recovery.index
    this._textRecovery = undefined
    this._lineTrusted = true
    this._lineIndexNeedsRebuild = false
    this._invalidateIndex()
  }

  private _isCursorTextMutation(record: MutationRecord): boolean {
    if (record.type !== 'characterData' || !this._lineTrusted || !this._lineIndex) return false
    const text = record.target
    const cText = text.parentElement
    const element = cText?.parentElement
    if (!cText || !element) return false
    const cursor = this._lineIndex.blotFromDom(element)
    return cursor instanceof CursorBlot && cursor.parent === this && this._cursorAnchors.get(cursor) === text &&
      element.childNodes.length === 1 && element.firstChild === cText &&
      cText.childNodes.length === 1 && cText.firstChild === text &&
      !!element.parentNode && this.isCanonicalLineContainer(element.parentNode)
  }

  private _trustedLineIndex(): LogicalLineIndex | undefined {
    if (!this._lineDom) return undefined
    if (!this._mutationDepth) {
      this._invalidateExternalMutations(this._lineObserver!.takeRecords())
      this._recoverReturnedText()
    }
    return this._lineTrusted && !this._lineIndexNeedsRebuild ? this._lineIndex : undefined
  }

  private _withControlledMutation<T>(mutation: () => T, canonical = true): T {
    if (!this._lineDom) return mutation()
    const outer = this._mutationDepth === 0
    if (outer) {
      this._invalidateExternalMutations(this._lineObserver!.takeRecords())
      this._lineIndexNeedsRebuild = true
      this._controlledMutationFailed = false
      this._invalidateIndex()
    }
    this._mutationDepth++
    let completed = false
    try {
      const value = mutation()
      completed = true
      return value
    } finally {
      this._mutationDepth--
      if (!completed) this._controlledMutationFailed = true
      if (outer) {
        try {
          if (completed && !this._controlledMutationFailed && canonical && this._leadingGap) {
            if (this._lineIndexNeedsRebuild) this._rebuildLogicalIndex()
          } else {
            this._lineTrusted = false
            this._lineIndex = undefined
            this._textRecovery = undefined
          }
        } finally {
          // Everything in this synchronous scope has already been read back from
          // actual leaves (or trust was revoked on failure). Future native edits
          // remain observable, including takeRecords() before the callback runs.
          this._lineObserver!.takeRecords()
          if (this._leadingGap) {
            this._lineObserver!.observe(this.domNode, {subtree: true, childList: true, characterData: true, attributes: true})
          }
        }
      }
    }
  }

  private _rebuildLogicalIndex(): void {
    this._lineTrusted = false
    this._lineIndex = undefined
    this._textRecovery = undefined
    if (!this._lineDom?.hasOnlyManagedNodes(this._leadingGap)) return
    const gap = this._leadingGap
    if (!gap || gap.childNodes.length !== 1 || gap.firstChild?.nodeType !== Node.TEXT_NODE ||
      gap.textContent !== this._leadingGapText || gap.getAttribute('data-zero-space') !== 'true') return
    for (const child of this._children) {
      if (child instanceof TextBlot && !this._isCanonicalTextBlot(child)) return
    }
    this._lineIndex = new LogicalLineIndex(this._children)
    this._lineIndexNeedsRebuild = false
    this._lineTrusted = true
  }

  private _isCanonicalTextBlot(blot: TextBlot): boolean {
    const element = blot.domNode
    const text = element.firstChild
    return element.childNodes.length === 1 && text instanceof HTMLElement && text.localName === 'c-text' &&
      text.childNodes.length === 1 && text.firstChild?.nodeType === Node.TEXT_NODE &&
      (blot.text === '\n' || !blot.text.includes('\n'))
  }

  private _replaceChildRange(start: number, count: number, children: readonly IBlot[]): void {
    if (children.length <= 4096) this._children.splice(start, count, ...children)
    else this._children = [...this._children.slice(0, start), ...children, ...this._children.slice(start + count)]
  }

  private _indexWithin(children: IBlot[], blot: IBlot): number {
    return children === this._children ? this._childIndexOf(blot) : children.indexOf(blot)
  }

  private _commitSingleLine(previous: LogicalSourceLine, children: IBlot[], childStart: number): void {
    // Inserting immediately before LF can reuse its unformatted TextBlot.
    // Preserve the canonical independent-LF invariant within this row only.
    children = this._splitLogicalChildren(children)
    this._replaceChildRange(childStart, previous.children.length, children)
    this._invalidateIndex()
    if (!this._lineDom!.syncLine(previous.children, children, this._leadingGap)) {
      this._syncLogicalLines()
      return
    }
    this._lineIndex!.replaceLine(previous, children)
    this._lineIndexNeedsRebuild = false
  }

  private _tryApplySingleLineDelta(ops: DeltaOperation[]): boolean {
    const index = this._lineTrusted ? this._lineIndex : undefined
    if (!index) return false
    let oldCursor = 0
    let first = Infinity
    let last = -Infinity
    for (const op of ops) {
      if (op.retain != null) {
        if (op.attributes && op.retain) { first = Math.min(first, oldCursor); last = oldCursor + op.retain }
        oldCursor += op.retain
      } else if (op.delete != null) {
        if (op.delete) { first = Math.min(first, oldCursor); last = oldCursor + op.delete }
        oldCursor += op.delete
      } else if (op.insert != null) {
        if (typeof op.insert !== 'string' || op.insert.includes('\n')) return false
        first = Math.min(first, oldCursor)
        last = Math.max(last, oldCursor)
      }
    }
    if (!Number.isFinite(first) || first < 0 || last > index.textLength) return false
    let line: LogicalSourceLine | undefined
    if (first === index.textLength) line = index.sourceLines().at(-1)
    else {
      const found = index.findByOffset(first)
      if (found) {
        const next = found.localOffset === found.blot.length ? index.nextLeaf(found.blot) : undefined
        line = index.lineOf(next ?? found.blot)
      }
    }
    if (!line || line.leaves.some(leaf => leaf instanceof EmbedBlot)) return false
    const position = index.locate(line)!
    const editableEnd = position.modelOffset + line.length - (line.text.endsWith('\n') ? 1 : 0)
    if (first < position.modelOffset || last > editableEnd) return false
    const localOps: DeltaOperation[] = []
    let skip = position.modelOffset
    for (const op of ops) {
      if (skip) {
        if (op.retain == null || op.attributes || op.retain < skip) return false
        const retain = op.retain - skip
        skip = 0
        if (retain) localOps.push({...op, retain})
      } else localOps.push(op)
    }
    const children = [...line.children]
    this._applyDeltaToChildren(localOps, children)
    this._commitSingleLine(line, children, position.childStart)
    return true
  }

  private _trySpliceSingleLine(startIdx: number, deleteCount: number, newBlots: (TextBlot | EmbedBlot)[]): boolean {
    const recovery = this._mutationDepth === 1 && !this._lineTrusted ? this._textRecovery : undefined
    const index = this._lineTrusted ? this._lineIndex : recovery?.index
    if (!index || startIdx < 0 || deleteCount < 0 || newBlots.some(leaf => leaf instanceof EmbedBlot)) return false
    const line = index.lineAtLeafIndex(startIdx)
    const position = index.locate(line)!
    const localStart = startIdx - position.leafStart
    if (localStart < 0 || localStart + deleteCount > line.leaves.length ||
      line.leaves.some(leaf => leaf instanceof EmbedBlot)) return false
    const removed = new Set<IBlot>(line.leaves.slice(localStart, localStart + deleteCount))
    if (recovery && ([...recovery.leaves.keys()].some(leaf => !removed.has(leaf)) ||
      newBlots.some(leaf => !(leaf instanceof TextBlot) || !this._isCanonicalTextBlot(leaf)))) return false
    const children = line.children.filter(child => !removed.has(child))
    const after = line.leaves[localStart + deleteCount]
    let insertAt = after ? children.indexOf(after) : children.findIndex(child => child.type === BlotType.Break)
    if (insertAt < 0) insertAt = children.length
    const next = [...children.slice(0, insertAt), ...newBlots, ...children.slice(insertAt)]
    const oldBreak = line.leaves.at(-1)
    const nextLeaves = this._filterLeaves(next)
    let breaks = 0
    for (const child of nextLeaves) {
      const text = (child as TextBlot).text
      if (text.includes('\n')) {
        if (text !== '\n' || child !== nextLeaves.at(-1)) return false
        breaks++
      }
    }
    const hadBreak = oldBreak instanceof TextBlot && oldBreak.text === '\n'
    if (breaks !== (hadBreak ? 1 : 0)) return false
    if (hadBreak && (oldBreak.attrs?.['s:display'] === 'none') !==
      ((nextLeaves.at(-1) as TextBlot).attrs?.['s:display'] === 'none')) return false
    // A Cursor at the next source line's start precedes the original global
    // insertion anchor; preserve that uncommon ordering with the full path.
    const nextLine = index.sourceLines()[position.lineIndex + 1]
    if (!after && nextLine && nextLine.children[0] !== nextLine.leaves[0]) return false
    const anchor = after?.domNode ?? children.find(child => child.type === BlotType.Break)?.domNode
      ?? nextLine?.leaves[0]?.domNode ?? null
    for (const child of removed) child.detach()
    for (const child of newBlots) {
      child.parent = this
      ;(anchor?.parentNode ?? this.domNode).insertBefore(child.domNode, anchor)
    }
    if (recovery) this._lineIndex = index
    this._commitSingleLine(line, next, position.childStart)
    if (recovery && !this._lineIndexNeedsRebuild) {
      this._textRecovery = undefined
      this._lineTrusted = true
    }
    return true
  }

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

  private _insertBlotAt(modelOffset: number, newBlot: TextBlot | EmbedBlot, children: IBlot[]) {
    newBlot.parent = this
    const leaves = this._filterLeaves(children)

    if (leaves.length === 0) {
      const breakIdx = children.findIndex(b => b.type === BlotType.Break)
      if (breakIdx >= 0) {
        children.splice(breakIdx, 0, newBlot)
        children[breakIdx + 1].domNode.parentNode!.insertBefore(newBlot.domNode, children[breakIdx + 1].domNode)
      } else {
        children.push(newBlot)
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
          const childIdx = this._indexWithin(children, leaf)
          children.splice(childIdx, 0, newBlot)
          return
        }

        if (leaf.type === BlotType.Text && localOffset < leaf.length) {
          const right = leaf.split(localOffset)
          right.parent = this
          const childIdx = this._indexWithin(children, leaf)
          leaf.domNode.parentNode!.insertBefore(newBlot.domNode, leaf.domNode.nextSibling)
          leaf.domNode.parentNode!.insertBefore(right.domNode, newBlot.domNode.nextSibling)
          children.splice(childIdx + 1, 0, newBlot, right)
          return
        }

        leaf.domNode.parentNode!.insertBefore(newBlot.domNode, leaf.domNode.nextSibling)
        const childIdx = this._indexWithin(children, leaf)
        children.splice(childIdx + 1, 0, newBlot)
        return
      }
      pos += leaf.length
    }

    const lastLeaf = leaves[leaves.length - 1]
    lastLeaf.domNode.parentNode!.insertBefore(newBlot.domNode, lastLeaf.domNode.nextSibling)
    const childIdx = this._indexWithin(children, lastLeaf)
    children.splice(childIdx + 1, 0, newBlot)
  }

  private _deleteRange(startOffset: number, length: number, children: IBlot[]) {
    let remaining = length
    let pos = 0
    const leaves = this._filterLeaves(children)

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
        const childIdx = this._indexWithin(children, leaf)
        if (childIdx >= 0) {
          children.splice(childIdx, 1)
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

  private _formatRange(startOffset: number, length: number, attrs: IInlineNodeAttrs, children: IBlot[]) {
    let remaining = length
    let pos = 0
    for (const leaf of this._filterLeaves(children)) {
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
        const childIdx = this._indexWithin(children, leaf)
        leaf.domNode.parentNode!.insertBefore(right.domNode, leaf.domNode.nextSibling)
        children.splice(childIdx + 1, 0, right)

        if (canFormat >= right.length) {
          right.format(attrs)
          remaining -= canFormat
        } else {
          const tail = right.split(canFormat)
          tail.parent = this
          const rightIdx = this._indexWithin(children, right)
          right.domNode.parentNode!.insertBefore(tail.domNode, right.domNode.nextSibling)
          children.splice(rightIdx + 1, 0, tail)
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

  private _cleanupEmptyLeaves(children: IBlot[]) {
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i]
      if (child.type === BlotType.Text && child.length === 0) {
        child.detach()
        children.splice(i, 1)
      }
    }
    // Merge adjacent TextBlots with matching attributes
    for (let i = 0; i < children.length - 1; i++) {
      const cur = children[i]
      const next = children[i + 1]
      if (cur instanceof TextBlot && next instanceof TextBlot &&
        (!this._lineDom || (!cur.text.includes('\n') && !next.text.includes('\n'))) &&
        (cur as TextBlot).mergeWith(next as TextBlot)) {
        children.splice(i + 1, 1)
        i--
      }
    }
  }

  private _syncLogicalLines(): void {
    if (!this._lineDom) return
    const children = this._splitLogicalChildren(this._children)
    if (children !== this._children) {
      this._children = children
      this._invalidateIndex()
    }
    this._lineDom.sync(this._children, this._leadingGap)
  }

  private _splitLogicalChildren(input: IBlot[]): IBlot[] {
    const children: IBlot[] = []
    let split = false
    for (const child of input) {
      if (!(child instanceof TextBlot) || child.text === '\n' || !child.text.includes('\n')) {
        children.push(child)
        continue
      }
      // Split once from the original string. Repeated TextBlot.split() would
      // copy the remaining suffix for every line of a large pasted source.
      const text = child.text
      const parts = text.split(/(\n)/).filter(Boolean)
      child.deleteAt(parts[0].length, text.length - parts[0].length)
      children.push(child)
      for (let index = 1; index < parts.length; index++) {
        const part = new TextBlot(parts[index], child.attrs)
        part.parent = this
        children.push(part)
      }
      split = true
    }
    return split ? children : input
  }
}
