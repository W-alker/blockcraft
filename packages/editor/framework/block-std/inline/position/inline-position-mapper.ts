import {INLINE_ELEMENT_TAG} from "../const";
import {isZeroSpace} from "../../../utils";
import {BlockCraftError, ErrorCode} from "../../../../global";

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
 * Centralized bidirectional mapping between model character offsets and DOM points
 * within an inline container (`edit-container`).
 *
 * This replaces the previously scattered offset-calculation logic in
 * `SelectionManager.normalizeRange()` (DOM->model) and
 * `InlineManager.queryNodePositionInlineByOffset()` (model->DOM).
 *
 * The mapper is stateless and operates purely on the current DOM structure,
 * making it safe to share across the document lifetime.
 */
export class InlinePositionMapper {

  /**
   * Convert a DOM point (node + offset within that node) to a model character index
   * within the given inline container.
   *
   * Handles zero-width spaces, embed elements, composing state, and container-level offsets.
   */
  domPointToModelPoint(
    container: HTMLElement,
    node: Node,
    offset: number,
    options?: DomToModelOptions
  ): number {
    const isContainer = node === container
    const elements = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
    if (elements.length === 0) {
      return 0
    }

    if (isContainer && offset <= 1) {
      return 0
    }

    const zeroNode = isZeroSpace(node)
    if (zeroNode?.parentElement === container) {
      return 0
    }

    const cElement = this._findClosestInlineElement(node, container, elements, isContainer, offset)
    if (!cElement) {
      throw new BlockCraftError(ErrorCode.SelectionError, 'Fatal range position')
    }

    let pos = 0
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]
      const elementLength = this._getElementLength(element, options)
      if (element === cElement) {
        const isGap = isZeroSpace(node) && node.parentElement?.closest(INLINE_ELEMENT_TAG) === cElement
        if (isGap) {
          return pos + 1
        }
        return pos + (isContainer ? elementLength : this._getNodeOffset(node, offset, elementLength, cElement))
      }
      pos += elementLength
    }

    throw new BlockCraftError(ErrorCode.SelectionError, 'Fatal range position')
  }

  /**
   * Convert a model character index to a DOM point suitable for `Selection.setPosition()`
   * or `Range.setStart()/setEnd()`.
   */
  modelPointToDomPoint(
    container: HTMLElement,
    index: number,
    _affinity: PointAffinity = 'after'
  ): IDomPoint {
    if (index === 0) {
      return {
        node: container.firstElementChild?.firstChild as Text,
        offset: 0
      }
    }

    const elements = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
    let remaining = index
    for (const ele of elements) {
      const isEmbed = (ele.firstElementChild as HTMLElement).contentEditable === 'false'
      const eleLength = isEmbed ? 1 : ele.textContent!.length
      if (remaining <= eleLength) {
        if (isEmbed && remaining === 1) {
          return {
            node: ele.querySelector('[data-zero-space="true"]')!.firstChild as Text,
            offset: 0
          }
        }

        return {
          node: ele.firstElementChild!.firstChild as Text,
          offset: remaining
        }
      }
      remaining -= eleLength
    }
    throw new BlockCraftError(ErrorCode.InlineEditorError, `Error inline node position queried: character offset: ${remaining}`)
  }

  /**
   * Create a DOM Range from model start/end character indices.
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
   * Get DOMRect list for a model range, useful for positioning toolbars/popups.
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
   * Compute total inline text length by scanning the container's inline elements.
   */
  getContainerTextLength(container: HTMLElement, options?: DomToModelOptions): number {
    const elements = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
    let total = 0
    for (const element of elements) {
      total += this._getElementLength(element, options)
    }
    return total
  }

  private _findClosestInlineElement(
    node: Node,
    container: HTMLElement,
    elements: HTMLElement[],
    isContainer: boolean,
    offset: number
  ): HTMLElement | null {
    if (isContainer) {
      const index = Math.min(elements.length - 1, Math.max(0, offset - 2))
      return elements[index]
    }

    if (node instanceof HTMLElement && node.localName === INLINE_ELEMENT_TAG) {
      return node
    }

    return node.parentElement?.closest(INLINE_ELEMENT_TAG) as HTMLElement | null
  }

  private _getElementLength(element: HTMLElement, options?: DomToModelOptions): number {
    const firstNode = element.firstChild
    const isEmbed = firstNode instanceof HTMLElement && firstNode.contentEditable === 'false'
    if (isEmbed) return 1
    if (options?.isComposing && firstNode instanceof Text) {
      return firstNode.length
    }
    return element.textContent?.length ?? 0
  }

  private _getNodeOffset(
    targetNode: Node,
    nodeOffset: number,
    elementLength: number,
    cElement: HTMLElement
  ): number {
    if (targetNode instanceof Text) {
      return Math.max(0, Math.min(nodeOffset, targetNode.length))
    }

    if (!(targetNode instanceof HTMLElement)) {
      return Math.max(0, Math.min(nodeOffset, elementLength))
    }

    if (targetNode === cElement) {
      const firstNode = cElement.firstChild
      const isEmbed = firstNode instanceof HTMLElement && firstNode.contentEditable === 'false'
      if (isEmbed) {
        return nodeOffset > 0 ? 1 : 0
      }
    }

    const boundary = Math.max(0, Math.min(nodeOffset, targetNode.childNodes.length))
    let textOffset = 0
    for (let i = 0; i < boundary; i++) {
      const child = targetNode.childNodes[i]
      if (isZeroSpace(child)) continue
      textOffset += child.textContent?.length ?? 0
    }

    return Math.max(0, Math.min(textOffset, elementLength))
  }
}
