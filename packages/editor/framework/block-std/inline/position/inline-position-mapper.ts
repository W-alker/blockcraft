import {INLINE_ELEMENT_TAG} from "../const";
import {isZeroSpace} from "../../../utils";
import {BlockCraftError, ErrorCode} from "../../../../global";
import {ScrollBlot} from "../blot/scroll-blot";
import {TextBlot} from "../blot/text-blot";
import {EmbedBlot} from "../blot/embed-blot";
import {BlotType} from "../blot/blot";
import {getLogicalLineAccess} from "../blot/logical-line-access";

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
 * Logical-line surfaces use their owned Blot index for leaf lookup and model
 * offsets. Unindexed surfaces and transient DOM structures retain the tree
 * traversal paths; container boundaries follow actual DOM ancestry.
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
      if (offset <= 0) return 0
      // The first direct child can be a whole canonical line. Only a direct
      // leading gap has zero model length at childOffset=1.
      if (offset === 1 && container.firstChild === this.scrollBlot.leadingGapNode) return 0
      return this._resolveContainerOffset(container, offset)
    }

    // Edge: leading zero-space
    const zeroNode = isZeroSpace(node)
    if (zeroNode && zeroNode === this.scrollBlot.leadingGapNode && container.contains(zeroNode)) {
      return 0
    }

    const sb = this.scrollBlot
    if (sb.isCanonicalLineContainer(node)) {
      return this._resolveLineOffset(node as HTMLElement, offset)
    }
    // Find the c-element this node belongs to
    const cElement = this._findCElement(node, container)
    if (!cElement) {
      throw new BlockCraftError(ErrorCode.SelectionError, 'DOM node not within inline container')
    }

    const indexedBlot = getLogicalLineAccess(sb)?.blotFromDom(cElement)
    if (indexedBlot) {
      const modelOffset = sb.offsetOf(indexedBlot)
      if (modelOffset >= 0) {
        if (indexedBlot.type === BlotType.Cursor) return modelOffset
        if (indexedBlot.type === BlotType.Break) return sb.textLength
        if (indexedBlot.type === BlotType.Text || indexedBlot.type === BlotType.Embed) {
          return modelOffset + this._computeLocalOffset(
            indexedBlot as TextBlot | EmbedBlot, node, offset, cElement, options,
          )
        }
      }
    }

    // Match c-element to a blot
    const leaves = sb.leaves
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
   * Use the logical-line index when available; other surfaces retain the
   * preceding-leaf boundary convention of the tree traversal.
   */
  modelPointToDomPoint(
    container: HTMLElement,
    index: number,
    _affinity: PointAffinity = 'after'
  ): IDomPoint {
    if (index === 0) {
      const leadingGap = this.scrollBlot.leadingGapNode
      if (leadingGap?.firstChild) {
        return { node: leadingGap.firstChild, offset: 0 }
      }
      return { node: container, offset: 0 }
    }

    const sb = this.scrollBlot
    const access = getLogicalLineAccess(sb)
    if (access && Number.isFinite(index) && index > 0 && index <= sb.textLength) {
      const found = sb.findByOffset(index)
      if (found && found.localOffset >= 0 && found.localOffset <= found.blot.length) {
        return this._leafPointToDomPoint(
          found.blot, found.localOffset, _affinity,
          () => access.nextLeaf(found.blot),
        )
      }
    }

    const leaves = this.scrollBlot.leaves
    let remaining = index

    for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
      const leaf = leaves[leafIndex]
      if (remaining <= leaf.length) {
        return this._leafPointToDomPoint(leaf, remaining, _affinity, () => leaves[leafIndex + 1])
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

  private _leafPointToDomPoint(
    leaf: TextBlot | EmbedBlot,
    localOffset: number,
    affinity: PointAffinity,
    nextLeaf: () => TextBlot | EmbedBlot | undefined,
  ): IDomPoint {
    if (leaf.type === BlotType.Embed) {
      if (localOffset === 1) {
        // Keep the marker on the non-composing side of the caret. WebKit can
        // otherwise append intermediate IME values instead of replacing them.
        const gap = (leaf as EmbedBlot).gapNode
        const marker = gap.firstChild
        if (marker?.nodeType === Node.TEXT_NODE) {
          return {node: marker, offset: marker.textContent?.length ?? 0}
        }
        return {node: gap, offset: gap.childNodes.length}
      }
      const wrapper = (leaf as EmbedBlot).cElement.querySelector('span[contenteditable="false"]')!
      return {node: wrapper, offset: 0}
    }

    if (affinity === 'after' && localOffset === leaf.length && (leaf as TextBlot).text.endsWith('\n')) {
      const nextLineStart = this._nextCanonicalLineStart(leaf as TextBlot, nextLeaf())
      if (nextLineStart) return nextLineStart
    }
    return {node: (leaf as TextBlot).textNode, offset: localOffset}
  }

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
    // Container child offset: count actual Blot DOM nodes before the boundary.
    // View-only projections may insert zero-model-length direct children
    // (pagination gaps) or wrap Blots in fragment groups; fixed `offset - 2`
    // arithmetic would count those nodes as text and shift the caret model offset.
    const leaves = this.scrollBlot.leaves
    if (!leaves.length) return 0
    const boundary = Math.max(0, Math.min(container.childNodes.length, offset))
    const preceding = new Set<Node>(
      Array.from(container.childNodes).slice(0, boundary),
    )
    let modelOffset = 0
    for (const leaf of leaves) {
      const directChild = directChildOf(container, leaf.domNode)
      if (directChild && preceding.has(directChild)) {
        modelOffset += leaf.length
      }
    }
    return modelOffset
  }

  /** Map only registered logical-line boundaries, never arbitrary wrappers. */
  private _resolveLineOffset(line: HTMLElement, offset: number): number {
    const boundary = Math.max(0, Math.min(line.childNodes.length, offset))
    const preceding = new Set<Node>(Array.from(line.childNodes).slice(0, boundary))
    let modelOffset = 0
    let foundLine = false
    for (const blot of this.scrollBlot.children) {
      const directChild = directChildOf(line, blot.domNode)
      if (directChild) {
        foundLine = true
        if (!preceding.has(directChild)) return modelOffset
        modelOffset += blot.length
      } else if (!foundLine) {
        modelOffset += blot.length
      } else {
        return modelOffset
      }
    }
    if (foundLine) return modelOffset
    throw new BlockCraftError(ErrorCode.SelectionError, 'No blot found for canonical line')
  }

  private _nextCanonicalLineStart(
    leaf: TextBlot,
    nextLeaf: TextBlot | EmbedBlot | undefined,
  ): IDomPoint | null {
    const line = leaf.domNode.parentNode
    if (!line || !this.scrollBlot.isCanonicalLineContainer(line)) return null
    // Hidden revision newlines keep following text in the same visible line.
    if (nextLeaf && line.contains(nextLeaf.domNode)) return null
    let next = (line as HTMLElement).nextElementSibling
    while (next && !this.scrollBlot.isCanonicalLineContainer(next)) next = next.nextElementSibling
    if (!next) return null
    if (nextLeaf instanceof TextBlot && next.contains(nextLeaf.domNode)) {
      if (nextLeaf.attrs?.['s:display'] === 'none') return {node: next, offset: 0}
      return {node: nextLeaf.textNode, offset: 0}
    }
    // The terminal empty line contains the zero-model-length BreakBlot. A
    // container boundary before it gives the browser an editable line to enter.
    return {node: next, offset: 0}
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

function directChildOf(container: HTMLElement, node: Node): Node | null {
  let current: Node | null = node
  while (current?.parentNode && current.parentNode !== container) {
    current = current.parentNode
  }
  return current?.parentNode === container ? current : null
}
