import {BlotType, IBlot, IScrollBlot} from "./blot";
import {TextBlot} from "./text-blot";
import {EmbedBlot} from "./embed-blot";
import {BreakBlot} from "./break-blot";
import {CursorBlot} from "./cursor-blot";
import {DeltaInsert, DeltaInsertEmbed, DeltaInsertText, DeltaOperation, IInlineNodeAttrs, InlineModel} from "../../types";
import {createZeroSpace} from "../../../utils";
import type {EmbedConverter} from "../index";

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
    let leafIdx = 0 // index into `this.leaves`

    const getLeafAtCursor = (): { leaf: TextBlot | EmbedBlot; localOffset: number; leafIndex: number } | null => {
      const leaves = this.leaves
      let offset = 0
      for (let i = leafIdx; i < leaves.length; i++) {
        if (offset + leaves[i].length > cursor || (offset + leaves[i].length === cursor && i === leaves.length - 1)) {
          return {leaf: leaves[i], localOffset: cursor - offset, leafIndex: i}
        }
        if (offset + leaves[i].length === cursor) {
          leafIdx = i + 1
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
        const info = getLeafAtCursor()
        if (info) leafIdx = info.leafIndex
        continue
      }

      if (op.delete != null) {
        this._deleteRange(cursor, op.delete)
        continue
      }

      if (op.insert != null) {
        const delta: DeltaInsert = {insert: op.insert, attributes: op.attributes} as DeltaInsert
        const blot = this._createLeafBlot(delta)
        this._insertBlotAt(cursor, blot)
        cursor += blot.length
        const info = getLeafAtCursor()
        if (info) leafIdx = info.leafIndex
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
    return new EmbedBlot(embedView, delta.attributes)
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
        this._children.splice(childIdx, 1)
        leaf.detach()
        i--
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
      if (pos + leaf.length <= startOffset) {
        pos += leaf.length
        continue
      }

      const localStart = Math.max(0, startOffset - pos)
      const canFormat = Math.min(remaining, leaf.length - localStart)

      if (localStart === 0 && canFormat >= leaf.length) {
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

      pos += leaf.length + (leaf instanceof TextBlot ? 0 : canFormat)
      if (remaining <= 0) break
    }
  }

  private _cleanupEmptyLeaves() {
    for (let i = this._children.length - 1; i >= 0; i--) {
      const child = this._children[i]
      if (child.type === BlotType.Text && child.length === 0) {
        child.detach()
        this._children.splice(i, 1)
      }
    }
  }
}
