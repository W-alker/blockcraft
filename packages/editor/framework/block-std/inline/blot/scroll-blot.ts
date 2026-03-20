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

  constructor(
    readonly domNode: HTMLElement,
    private _embedConverters: Map<string, EmbedConverter>
  ) {}

  get children(): IBlot[] {
    return this._children
  }

  /**
   * Leaf blots only (excludes BreakBlot and CursorBlot).
   */
  get leaves(): (TextBlot | EmbedBlot)[] {
    return this._children.filter(
      (b): b is TextBlot | EmbedBlot => b.type === BlotType.Text || b.type === BlotType.Embed
    )
  }

  get textLength(): number {
    return this._children.reduce((sum, b) => sum + b.length, 0)
  }

  /**
   * Full rebuild: clear existing children and build from a delta snapshot.
   */
  build(deltas: InlineModel) {
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
      const leaves = this.leaves
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
            const prevLeaf = this.leaves[info.leafIndex - 1]
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
  }

  /**
   * Find the leaf blot and local offset at the given model character offset.
   */
  findByOffset(offset: number): { blot: TextBlot | EmbedBlot; localOffset: number } | null {
    let pos = 0
    for (const leaf of this.leaves) {
      if (offset <= pos + leaf.length) {
        return {blot: leaf, localOffset: offset - pos}
      }
      pos += leaf.length
    }
    return null
  }

  /**
   * Get the model offset of a given leaf blot.
   */
  offsetOf(blot: IBlot): number {
    let pos = 0
    for (const child of this.leaves) {
      if (child === blot) return pos
      pos += child.length
    }
    return -1
  }

  /**
   * Remove all children and clear the container DOM.
   */
  detachAll() {
    for (const child of this._children) {
      child.parent = null
    }
    this._children = []
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
    newBlot.parent = this

    if (!ref) {
      const breakIdx = this._children.findIndex(b => b.type === BlotType.Break)
      const insertIdx = breakIdx >= 0 ? breakIdx : this._children.length
      this._children.splice(insertIdx, 0, newBlot)
      const refNode = breakIdx >= 0 ? this._children[insertIdx + 1].domNode : null
      this.domNode.insertBefore(newBlot.domNode, refNode)
      return
    }

    const refIdx = this._children.indexOf(ref)
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
    const idx = this._children.indexOf(blot)
    if (idx >= 0) {
      this._children.splice(idx, 1)
      blot.detach()
    }
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
    const currentLeaves = this.leaves
    const toRemove = currentLeaves.slice(startIdx, startIdx + deleteCount)

    // Find the DOM insertion anchor: the first blot after the removed range
    const afterBlot = currentLeaves[startIdx + deleteCount] ?? null
    const refNode = afterBlot?.domNode
      ?? this._children.find(b => b.type === BlotType.Break)?.domNode
      ?? null

    // Remove old blots
    for (const blot of toRemove) {
      const idx = this._children.indexOf(blot)
      if (idx >= 0) this._children.splice(idx, 1)
      blot.detach()
    }

    // Compute insert position in _children
    const insertPos = afterBlot
      ? this._children.indexOf(afterBlot)
      : this._children.findIndex(b => b.type === BlotType.Break)

    // Insert new blots (in order)
    for (let i = 0; i < newBlots.length; i++) {
      const nb = newBlots[i]
      nb.parent = this
      this._children.splice(insertPos + i, 0, nb)
      this.domNode.insertBefore(nb.domNode, refNode)
    }
  }

  // ─── CursorBlot management ───

  /**
   * Insert a CursorBlot at the given model offset.
   * If the offset falls inside a TextBlot, the TextBlot is split.
   */
  insertCursorBlot(modelOffset: number, cursor: CursorBlot) {
    cursor.parent = this
    const info = this.findByOffset(modelOffset)

    if (!info) {
      // Empty container — insert before break
      const breakBlot = this._children.find(b => b.type === BlotType.Break)
      if (breakBlot) {
        const idx = this._children.indexOf(breakBlot)
        this._children.splice(idx, 0, cursor)
        breakBlot.domNode.parentNode!.insertBefore(cursor.domNode, breakBlot.domNode)
      } else {
        this._children.push(cursor)
        this.domNode.appendChild(cursor.domNode)
      }
      return
    }

    const {blot, localOffset} = info
    if (blot.type === BlotType.Text && localOffset > 0 && localOffset < blot.length) {
      // Split the TextBlot
      const right = (blot as TextBlot).split(localOffset)
      right.parent = this
      const blotIdx = this._children.indexOf(blot)
      blot.domNode.parentNode!.insertBefore(cursor.domNode, blot.domNode.nextSibling)
      blot.domNode.parentNode!.insertBefore(right.domNode, cursor.domNode.nextSibling)
      this._children.splice(blotIdx + 1, 0, cursor, right)
    } else {
      // At boundary — insert before or after
      const blotIdx = this._children.indexOf(blot)
      if (localOffset === 0) {
        this._children.splice(blotIdx, 0, cursor)
        blot.domNode.parentNode!.insertBefore(cursor.domNode, blot.domNode)
      } else {
        this._children.splice(blotIdx + 1, 0, cursor)
        blot.domNode.parentNode!.insertBefore(cursor.domNode, blot.domNode.nextSibling)
      }
    }
  }

  /**
   * Remove a CursorBlot from the tree.
   */
  removeCursorBlot(cursor: CursorBlot) {
    const idx = this._children.indexOf(cursor)
    if (idx >= 0) {
      this._children.splice(idx, 1)
      cursor.detach()
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
    const leaves = this.leaves

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
          const childIdx = this._children.indexOf(leaf)
          this._children.splice(childIdx, 0, newBlot)
          return
        }

        if (leaf.type === BlotType.Text && localOffset < leaf.length) {
          const right = leaf.split(localOffset)
          right.parent = this
          const childIdx = this._children.indexOf(leaf)
          leaf.domNode.parentNode!.insertBefore(newBlot.domNode, leaf.domNode.nextSibling)
          leaf.domNode.parentNode!.insertBefore(right.domNode, newBlot.domNode.nextSibling)
          this._children.splice(childIdx + 1, 0, newBlot, right)
          return
        }

        leaf.domNode.parentNode!.insertBefore(newBlot.domNode, leaf.domNode.nextSibling)
        const childIdx = this._children.indexOf(leaf)
        this._children.splice(childIdx + 1, 0, newBlot)
        return
      }
      pos += leaf.length
    }

    const lastLeaf = leaves[leaves.length - 1]
    lastLeaf.domNode.parentNode!.insertBefore(newBlot.domNode, lastLeaf.domNode.nextSibling)
    const childIdx = this._children.indexOf(lastLeaf)
    this._children.splice(childIdx + 1, 0, newBlot)
  }

  private _deleteRange(startOffset: number, length: number) {
    let remaining = length
    let pos = 0
    const leaves = this.leaves

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
        const childIdx = this._children.indexOf(leaf)
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
    for (const leaf of this.leaves) {
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
        const childIdx = this._children.indexOf(leaf)
        leaf.domNode.parentNode!.insertBefore(right.domNode, leaf.domNode.nextSibling)
        this._children.splice(childIdx + 1, 0, right)

        if (canFormat >= right.length) {
          right.format(attrs)
          remaining -= canFormat
        } else {
          const tail = right.split(canFormat)
          tail.parent = this
          const rightIdx = this._children.indexOf(right)
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
