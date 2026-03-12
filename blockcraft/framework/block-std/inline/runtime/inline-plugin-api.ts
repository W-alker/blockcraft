import {DeltaInsert, IInlineNodeAttrs} from "../../types";
import {InlinePositionMapper, IDomPoint, PointAffinity} from "../position/inline-position-mapper";
import {EditableBlockComponent} from "../../block/component/editable-block";

/**
 * Describes a leaf run at a given model offset.
 */
export interface ILeafInfo {
  type: 'text' | 'embed'
  /** Model offset of this leaf's start within the block */
  startOffset: number
  /** Logical length of this leaf */
  length: number
  /** Attributes/formatting of this leaf */
  attrs: IInlineNodeAttrs | undefined
  /** For text leaves, the text content; for embeds, null */
  text: string | null
  /** The DOM element owning this leaf (c-element) */
  domElement: HTMLElement
}

/**
 * Public API surface for inline plugins (mention, inline-link, formula, etc.).
 *
 * Plugins should use this API instead of directly querying inline DOM structure
 * (c-element, c-text, zero-space, etc.). This decouples plugins from the
 * internal DOM contract, allowing the inline runtime to evolve independently.
 *
 * ### What each plugin needs:
 *
 * | Plugin              | API needed                                                 |
 * |---------------------|------------------------------------------------------------|
 * | **mention**         | `getClientRectsForRange`, `applyDeltaToView`               |
 * | **inline-link**     | `getLeafAtOffset`, `getLeafRange`, `getClientRectsForRange`|
 * | **formula**         | `getLeafAtOffset`, `normalizeRange`                        |
 * | **code-block**      | extends InlineManager (separate path)                      |
 *
 * ### Migration path:
 *
 * Phase 3 of the RFC will migrate each plugin to use only these APIs.
 * Until then, plugins may continue using internal APIs, but new code
 * should prefer `InlinePluginAPI`.
 */
export class InlinePluginAPI {
  constructor(
    private readonly _getMapper: () => InlinePositionMapper,
    private readonly _getDoc: () => BlockCraft.Doc
  ) {}

  private get mapper() { return this._getMapper() }
  private get doc() { return this._getDoc() }

  /**
   * Convert a model character index to a DOM point for selection manipulation.
   */
  modelPointToDom(block: EditableBlockComponent, index: number, affinity?: PointAffinity): IDomPoint {
    return this.mapper.modelPointToDomPoint(block.containerElement, index, affinity)
  }

  /**
   * Convert a DOM point to a model character index.
   */
  domPointToModel(block: EditableBlockComponent, node: Node, offset: number, options?: { isComposing?: boolean }): number {
    return this.mapper.domPointToModelPoint(block.containerElement, node, offset, options)
  }

  /**
   * Create a DOM Range from model indices within a block.
   */
  modelRangeToDomRange(block: EditableBlockComponent, startIndex: number, endIndex?: number): Range {
    return this.mapper.modelRangeToDomRange(block.containerElement, startIndex, endIndex)
  }

  /**
   * Get DOMRect array for a model range, useful for positioning popups/toolbars.
   *
   * Replaces direct use of `range.getBoundingClientRect()` / `range.getClientRects()`
   * which required plugins to construct DOM ranges manually.
   */
  getClientRectsForRange(block: EditableBlockComponent, startIndex: number, endIndex: number): DOMRect[] {
    return this.mapper.modelRangeToClientRects(block.containerElement, startIndex, endIndex)
  }

  /**
   * Get the bounding rect of a single model point (collapsed cursor position).
   */
  getCaretRect(block: EditableBlockComponent, index: number): DOMRect | null {
    const range = this.mapper.modelRangeToDomRange(block.containerElement, index)
    const rects = range.getClientRects()
    return rects.length > 0 ? rects[0] : range.getBoundingClientRect()
  }

  /**
   * Query the leaf (text run or embed) at a given model offset.
   *
   * Replaces plugins' need to walk `c-element` siblings manually
   * (e.g., inline-link-extension's `adjustRangeByLinkNode`).
   */
  getLeafAtOffset(block: EditableBlockComponent, offset: number): ILeafInfo | null {
    return queryLeafFromDOM(block.containerElement, offset)
  }

  /**
   * Find all consecutive leaves that share the same attribute value for a given key.
   *
   * For example, `getLeafRange(block, offset, 'a:link')` returns all
   * contiguous leaves where `attrs['a:link']` has the same non-null value
   * as the leaf at `offset`.
   *
   * Returns `{startOffset, endOffset, attrs}` or null if the leaf at `offset`
   * doesn't have the given attribute.
   */
  getLeafRange(block: EditableBlockComponent, offset: number, attrKey: string): {
    startOffset: number
    endOffset: number
    attrs: IInlineNodeAttrs | undefined
  } | null {
    return queryLeafRangeFromDOM(block.containerElement, offset, attrKey)
  }

  /**
   * Get the current inline deltas for a block.
   */
  getDeltas(block: EditableBlockComponent): DeltaInsert[] {
    return block.textDeltas()
  }

  /**
   * Check whether the document is currently in IME composition on a given block.
   */
  isComposing(blockId?: string): boolean {
    const session = this.doc.inputManger.compositionSession
    if (!blockId) return session.isActive
    return session.isActive && session.activeBlockId === blockId
  }
}

// --- Internal helpers (operating on current DOM, Phase 1 compatible) ---

import {INLINE_ELEMENT_TAG} from "../const";

function queryLeafFromDOM(container: HTMLElement, offset: number): ILeafInfo | null {
  const elements = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
  let pos = 0
  for (const ele of elements) {
    const isEmbed = (ele.firstElementChild as HTMLElement)?.contentEditable === 'false'
    const len = isEmbed ? 1 : (ele.textContent?.length ?? 0)
    if (len === 0) continue
    if (offset < pos + len || (offset === pos + len && ele === elements[elements.length - 1])) {
      return {
        type: isEmbed ? 'embed' : 'text',
        startOffset: pos,
        length: len,
        attrs: getAttrsFromElement(ele),
        text: isEmbed ? null : (ele.textContent ?? ''),
        domElement: ele
      }
    }
    pos += len
  }
  return null
}

function queryLeafRangeFromDOM(container: HTMLElement, offset: number, attrKey: string): {
  startOffset: number
  endOffset: number
  attrs: IInlineNodeAttrs | undefined
} | null {
  const elements = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
  let pos = 0
  let targetIdx = -1
  const lengths: number[] = []

  for (let i = 0; i < elements.length; i++) {
    const ele = elements[i]
    const isEmbed = (ele.firstElementChild as HTMLElement)?.contentEditable === 'false'
    const len = isEmbed ? 1 : (ele.textContent?.length ?? 0)
    lengths.push(len)
    if (targetIdx < 0 && offset < pos + len) {
      targetIdx = i
    }
    pos += len
  }

  if (targetIdx < 0) return null

  const targetAttrs = getAttrsFromElement(elements[targetIdx])
  const targetValue = targetAttrs?.[attrKey]
  if (targetValue == null) return null

  let startIdx = targetIdx
  let endIdx = targetIdx

  while (startIdx > 0) {
    const prev = getAttrsFromElement(elements[startIdx - 1])
    if (prev?.[attrKey] !== targetValue) break
    startIdx--
  }

  while (endIdx < elements.length - 1) {
    const next = getAttrsFromElement(elements[endIdx + 1])
    if (next?.[attrKey] !== targetValue) break
    endIdx++
  }

  let startOffset = 0
  for (let i = 0; i < startIdx; i++) startOffset += lengths[i]
  let endOffset = startOffset
  for (let i = startIdx; i <= endIdx; i++) endOffset += lengths[i]

  return {startOffset, endOffset, attrs: targetAttrs}
}

function getAttrsFromElement(ele: HTMLElement): IInlineNodeAttrs | undefined {
  const names = ele.getAttributeNames()
  if (names.length === 0 && ele.style.length === 0) return undefined
  const attrs: IInlineNodeAttrs = {}
  for (const name of names) {
    if (name.startsWith('data-')) {
      attrs[`d:${name.slice(5)}`] = ele.getAttribute(name)
    } else {
      attrs[`a:${name}`] = ele.getAttribute(name)
    }
  }
  for (let i = 0; i < ele.style.length; i++) {
    const key = ele.style[i]
    attrs[`s:${key}`] = ele.style.getPropertyValue(key)
  }
  return attrs
}
