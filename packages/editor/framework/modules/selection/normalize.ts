import {
  BaseBlockComponent,
  EditableBlockComponent,
  INLINE_END_BREAK_CLASS,
} from "../../block-std";
import {BlockCraftError, ErrorCode} from "../../../global";
import {closetBlockId} from "../../utils";
import {IBlockRange, INormalizedRange} from "./types";

/**
 * Convert a DOM StaticRange to a model-level INormalizedRange.
 *
 * Pure function — depends only on the provided `getBlockById` resolver,
 * no SelectionManager or Doc instance state.
 */
export function normalizeRange(
  range: StaticRange,
  getBlockById: (id: string) => BaseBlockComponent<any>,
  options?: { isComposing?: boolean }
): INormalizedRange {
  const {startContainer, endContainer, startOffset, endOffset, collapsed} = range

  const resolveBlock = (node: Node): BaseBlockComponent<any> => {
    const id = closetBlockId(node)
    if (!id) {
      throw new BlockCraftError(ErrorCode.SelectionError, `Cannot find active block by node: ${node}`)
    }
    return getBlockById(id) as BaseBlockComponent<any>
  }

  const getInlineOffset = (block: EditableBlockComponent<any>, node: Node, offset: number) => {
    if (node === block.hostElement && block.hostElement !== block.containerElement) {
      return offset > 0 ? block.textLength : 0
    }
    return block.runtime.mapper.domPointToModelPoint(block.containerElement, node, offset, options)
  }

  const getBlockRange = (block: BaseBlockComponent<any>, node: Node, offset: number): IBlockRange => {
    if (block instanceof EditableBlockComponent) {
      if (node instanceof HTMLElement && node.classList.contains(INLINE_END_BREAK_CLASS)) {
        return {
          blockId: block.id,
          block: block,
          type: 'text',
          index: block.textLength,
          length: 0
        }
      }

      return {
        blockId: block.id,
        block: block,
        type: 'text',
        index: getInlineOffset(block, node, offset),
        length: 0
      }
    }

    return {
      blockId: block.id,
      block: block,
      type: 'selected'
    }
  }

  const startBlock = resolveBlock(startContainer)
  let from = getBlockRange(startBlock, startContainer, startOffset)

  if (collapsed) {
    return {from, to: null, collapsed: from.type === 'text'}
  }

  let endBlock = startContainer === endContainer ? startBlock : resolveBlock(endContainer)

  if (startBlock === endBlock && from.type === 'selected') {
    return {from, to: null, collapsed: false}
  }

  let to: any
  if (endContainer instanceof HTMLElement && endContainer.classList.contains('edit-container') && endOffset === 0) {
    const prev = endContainer.closest('[data-node-type="editable"]')?.previousElementSibling
    if (prev && prev instanceof HTMLElement) {
      const id = prev.getAttribute('data-block-id')
      if (id) {
        endBlock = getBlockById(id) as BaseBlockComponent<any>
        if (endBlock.nodeType === 'editable') {
          to = {
            blockId: id,
            block: endBlock,
            type: 'text',
            index: (endBlock as EditableBlockComponent).textLength,
            length: 0
          }
        } else {
          to = {
            blockId: id,
            block: endBlock,
            type: 'selected'
          }
        }
      }
    }
  }
  to ??= getBlockRange(endBlock, endContainer, endOffset)

  if (from.type === 'text') {

    if (endBlock === startBlock && to.type === 'text') {
      from = {...from, length: to.index - from.index}
      return {from, to: null, collapsed: false}
    }

    from = {...from, length: from.block.textLength - from.index}
  }

  if (to.type === 'text') {
    to = {...to, length: to.index, index: 0}
  }

  return {from, to, collapsed: false}
}
