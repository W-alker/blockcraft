import {INLINE_ELEMENT_TAG} from "../const";
import {isZeroSpace} from "../../../utils";
import {BlockCraftError, ErrorCode} from "../../../../global";
import {ScrollBlot} from "../blot/scroll-blot";
import {TextBlot} from "../blot/text-blot";
import {EmbedBlot} from "../blot/embed-blot";
import {BlotType} from "../blot/blot";

/**
 * Affinity for caret positioning at embed boundaries.
 * - `before`: logically before the embed (left side)
 * - `after`: logically after the embed (right side, past the gap)
 */
export type PointAffinity = 'before' | 'after'

export interface IDomPoint {
  node: Node
  offset: number
}

export interface DomToModelOptions {
  isComposing?: boolean
}

/**
 * Bidirectional mapping between model character offsets and DOM points
 * within an inline container.
 *
 * Phase 2 implementation: traverses the ScrollBlot tree instead of
 * querying the DOM with `querySelectorAll`. This makes position resolution
 * independent of transient DOM state and avoids O(n) DOM scans.
 *
 * The mapper holds a reference to its owning ScrollBlot, set at construction
 * time by InlineRuntime.
 */
export class InlinePositionMapper {

  private _scrollBlot: ScrollBlot | null = null

  /**
   * Bind this mapper to a ScrollBlot.
   * Called by InlineRuntime after constructing the ScrollBlot.
   */
  setScrollBlot(scrollBlot: ScrollBlot) {
    this._scrollBlot = scrollBlot
  }

  get scrollBlot(): ScrollBlot {
    if (!this._scrollBlot) {
      throw new BlockCraftError(ErrorCode.InlineEditorError, 'InlinePositionMapper: ScrollBlot not bound')
    }
    return this._scrollBlot
  }

  /**
   * Convert a DOM point (node + offset) to a model character index.
   *
   * Strategy:
   * 1. Handle edge cases: container-level offset, leading zero-space
   * 2. Find the closest c-element ancestor of the node
   * 3. Match it to a blot via domNode identity
   * 4. Accumulate model offset = sum of preceding blot lengths + local offset
   */
  domPointToModelPoint(
    container: HTMLElement,
    node: Node,
    offset: number,
    options?: DomToModelOptions
  ): number {
    // Edge: offset on the container element itself
    if (node === container) {
      if (offset <= 1) return 0 // leading gap or before
      return this._resolveContainerOffset(container, offset)
    }

    // Edge: leading zero-space
    const zeroNode = isZeroSpace(node)
    if (zeroNode?.parentElement === container) {
      return 0
    }

    const sb = this.scrollBlot
    const leaves = sb.leaves

    // Find the c-element this node belongs to
    const cElement = this._findCElement(node, container)
    if (!cElement) {
      throw new BlockCraftError(ErrorCode.SelectionError, 'DOM node not within inline container')
    }

    // Match c-element to a blot
    const leafIndex = leaves.findIndex(b => b.domNode === cElement)
    if (leafIndex < 0) {
      // Might be a CursorBlot — check all children
      const cursorBlot = sb.children.find(b => b.type === BlotType.Cursor && b.domNode === cElement)
      if (cursorBlot) {
        // CursorBlot has length 0, return the model offset at cursor position
        return sb.offsetOf(cursorBlot)
      }
      // BreakBlot (end-break) — cursor at very end of content
      if (sb.children.find(b => b.type === BlotType.Break && b.domNode === cElement)) {
        return sb.textLength
      }
      throw new BlockCraftError(ErrorCode.SelectionError, 'No blot found for DOM node')
    }

    const leaf = leaves[leafIndex]

    // Accumulate model offset of preceding leaves
    let modelOffset = 0
    for (let i = 0; i < leafIndex; i++) {
      modelOffset += leaves[i].length
    }

    // Compute local offset within the leaf
    const localOffset = this._computeLocalOffset(leaf, node, offset, cElement, options)
    return modelOffset + localOffset
  }

  /**
   * Convert a model character index to a DOM point.
   *
   * Strategy: iterate blot tree leaves, decrement remaining offset
   * until we land inside a blot.
   */
  modelPointToDomPoint(
    container: HTMLElement,
    index: number,
    _affinity: PointAffinity = 'after'
  ): IDomPoint {
    if (index === 0) {
      const leadingGap = container.firstElementChild
      if (leadingGap?.firstChild) {
        return { node: leadingGap.firstChild as Text, offset: 0 }
      }
      return { node: container, offset: 0 }
    }

    const leaves = this.scrollBlot.leaves
    let remaining = index

    for (const leaf of leaves) {
      if (remaining <= leaf.length) {
        if (leaf.type === BlotType.Embed) {
          if (remaining === 1) {
            // After embed: position in the gap zero-space
            const gap = (leaf as EmbedBlot).gapNode
            return { node: gap.firstChild as Text, offset: 0 }
          }
          // Before embed (remaining === 0 handled above)
          const wrapper = (leaf as EmbedBlot).cElement.querySelector('span[contenteditable="false"]')!
          return { node: wrapper, offset: 0 }
        }

        // TextBlot
        return {
          node: (leaf as TextBlot).textNode,
          offset: remaining
        }
      }
      remaining -= leaf.length
    }

    throw new BlockCraftError(
      ErrorCode.InlineEditorError,
      `Offset out of range: ${index} (textLength=${this.scrollBlot.textLength})`
    )
  }

  /**
   * Create a DOM Range spanning [startIndex, endIndex).
   */
  modelRangeToDomRange(
    container: HTMLElement,
    startIndex: number,
    endIndex?: number
  ): Range {
    const range = document.createRange()
    const start = this.modelPointToDomPoint(container, startIndex)
    range.setStart(start.node, start.offset)
    if (endIndex == null || endIndex === startIndex) {
      range.collapse(true)
    } else {
      const end = this.modelPointToDomPoint(container, endIndex)
      range.setEnd(end.node, end.offset)
    }
    return range
  }

  /**
   * Get DOMRect list for a model range.
   */
  modelRangeToClientRects(
    container: HTMLElement,
    startIndex: number,
    endIndex: number
  ): DOMRect[] {
    const range = this.modelRangeToDomRange(container, startIndex, endIndex)
    return Array.from(range.getClientRects())
  }

  /**
   * Compute total inline text length from the blot tree.
   */
  getContainerTextLength(_container: HTMLElement, _options?: DomToModelOptions): number {
    return this.scrollBlot.textLength
  }

  // ─── Private helpers ───

  private _findCElement(node: Node, container: HTMLElement): HTMLElement | null {
    if (node instanceof HTMLElement && node.localName === INLINE_ELEMENT_TAG) {
      return node
    }
    const closest = node.parentElement?.closest(INLINE_ELEMENT_TAG) as HTMLElement | null
    if (closest && container.contains(closest)) {
      return closest
    }
    return null
  }

  private _resolveContainerOffset(container: HTMLElement, offset: number): number {
    // Container child offset: count inline elements up to `offset`
    // offset 0 = before leading gap, offset 1 = leading gap, offset 2+ = inline elements
    const leaves = this.scrollBlot.leaves
    if (!leaves.length) return 0
    const index = Math.min(leaves.length - 1, Math.max(0, offset - 2))
    let modelOffset = 0
    for (let i = 0; i <= index; i++) {
      modelOffset += leaves[i].length
    }
    return modelOffset
  }

  private _computeLocalOffset(
    leaf: TextBlot | EmbedBlot,
    node: Node,
    offset: number,
    cElement: HTMLElement,
    options?: DomToModelOptions
  ): number {
    // Embed: gap zero-space means "after"
    if (leaf.type === BlotType.Embed) {
      if (isZeroSpace(node) && node.parentElement?.closest(INLINE_ELEMENT_TAG) === cElement) {
        return 1
      }
      if (node === cElement && offset > 0) {
        return 1
      }
      return 0
    }

    // TextBlot
    if (node instanceof Text) {
      return Math.min(offset, leaf.length)
    }

    // HTMLElement within the c-element
    if (node === cElement) {
      const firstChild = cElement.firstChild
      const isEmbed = firstChild instanceof HTMLElement && firstChild.contentEditable === 'false'
      if (isEmbed) {
        return offset > 0 ? 1 : 0
      }
    }

    // Element child offset: accumulate text lengths of child nodes
    if (node instanceof HTMLElement) {
      const boundary = Math.min(offset, node.childNodes.length)
      let textOffset = 0
      for (let i = 0; i < boundary; i++) {
        const child = node.childNodes[i]
        if (isZeroSpace(child)) continue
        textOffset += child.textContent?.length ?? 0
      }
      return Math.min(textOffset, leaf.length)
    }

    return Math.min(offset, leaf.length)
  }
}
