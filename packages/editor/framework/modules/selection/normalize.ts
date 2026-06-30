import {
  BaseBlockComponent,
  EditableBlockComponent,
  INLINE_END_BREAK_CLASS,
} from "../../block-std";
import {BlockCraftError, ErrorCode} from "../../../global";
import {closetBlockId} from "../../utils";
import {resolveBlockGapSide} from "../../utils/zero-gap";
import {IBlockRange, INormalizedRange, ISelectionPoint, IGapSelectionPoint} from "./types";

/**
 * Document-ordered endpoints from normalizeRange().
 * Note: `start` is always before `end` in document order.
 * The caller (recalculate) determines the real anchor/head direction
 * from the native Selection API.
 */
export interface INormalizedEndpoints {
  readonly start: ISelectionPoint
  readonly end: ISelectionPoint
}

/**
 * Convert a DOM StaticRange to model-level anchor/head selection points.
 *
 * Pure function — depends only on the provided `getBlockById` resolver,
 * no SelectionManager or Doc instance state.
 *
 * Returns raw endpoints without length computation. The caller (BlockSelection)
 * derives lengths, direction, and other properties on demand.
 */
export function normalizeRange(
  range: StaticRange,
  getBlockById: (id: string) => BaseBlockComponent<any>,
  options?: { isComposing?: boolean }
): INormalizedEndpoints {
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

  const resolvePoint = (block: BaseBlockComponent<any>, node: Node, offset: number): ISelectionPoint => {
    if (block instanceof EditableBlockComponent) {
      if (node instanceof HTMLElement && node.classList.contains(INLINE_END_BREAK_CLASS)) {
        return lazyPoint({blockId: block.id, type: 'text', offset: block.textLength}, getBlockById)
      }
      return lazyPoint({blockId: block.id, type: 'text', offset: getInlineOffset(block, node, offset)}, getBlockById)
    }
    return lazyPoint({blockId: block.id, type: 'selected', offset: 0}, getBlockById)
  }

  const startBlock = resolveBlock(startContainer)

  // Gap cursor: a COLLAPSED caret inside a block's leading/trailing gap span maps to
  // a `gap` point. This MUST be gated on `collapsed` — a NON-collapsed leading->trailing
  // range is a whole-block `selected` selection (resolved below), not a gap.
  if (collapsed) {
    const gapSide = resolveBlockGapSide(startContainer)
    if (gapSide !== null && (startBlock.nodeType === 'void' || startBlock.nodeType === 'block')) {
      const gp = lazyGapPoint(startBlock.id, gapSide, getBlockById)
      return {start: gp, end: gp}
    }
  }

  const s = resolvePoint(startBlock, startContainer, startOffset)

  if (collapsed) {
    return {start: s, end: s}
  }

  let endBlock = startContainer === endContainer ? startBlock : resolveBlock(endContainer)

  // Same block, selected type
  if (startBlock === endBlock && s.type === 'selected') {
    return {start: s, end: s}
  }

  // Edge case: endContainer is an edit-container at offset 0 -> resolve to previous block's end
  let e: ISelectionPoint | undefined
  if (endContainer instanceof HTMLElement && endContainer.classList.contains('edit-container') && endOffset === 0) {
    const prev = endContainer.closest('[data-node-type="editable"]')?.previousElementSibling
    if (prev && prev instanceof HTMLElement) {
      const id = prev.getAttribute('data-block-id')
      if (id) {
        endBlock = getBlockById(id) as BaseBlockComponent<any>
        if (endBlock.nodeType === 'editable') {
          e = lazyPoint({blockId: id, type: 'text', offset: (endBlock as EditableBlockComponent).textLength}, getBlockById)
        } else {
          e = lazyPoint({blockId: id, type: 'selected', offset: 0}, getBlockById)
        }
      }
    }
  }
  e ??= resolvePoint(endBlock, endContainer, endOffset)

  return {start: s, end: e}
}

/**
 * Convert new anchor/head endpoints to legacy INormalizedRange (from/to/collapsed).
 * Used for backward compat during migration.
 */
export function endpointsToLegacy(endpoints: INormalizedEndpoints): INormalizedRange {
  const {start, end} = endpoints

  // Gap is lossy in legacy format — collapse to a whole-block `selected` range.
  if (start.type === 'gap' || end.type === 'gap') {
    const block = start.block
    const range: any = {blockId: start.blockId, type: 'selected'}
    Object.defineProperty(range, 'block', {
      get: () => block,
      enumerable: false,
      configurable: true,
    })
    return {from: range, to: null, collapsed: true}
  }

  const collapsed = start.blockId === end.blockId
    && start.type === 'text' && end.type === 'text'
    && start.offset === end.offset

  const _lazy = (range: any, block: BaseBlockComponent<any>): any => {
    Object.defineProperty(range, 'block', {
      get: () => block,
      enumerable: false,
      configurable: true,
    });
    return range;
  }

  const makeFrom = (): IBlockRange => {
    if (start.type === 'selected') {
      return _lazy({blockId: start.blockId, type: 'selected'}, start.block)
    }
    if (start.blockId === end.blockId && end.type === 'text') {
      return _lazy({blockId: start.blockId, type: 'text', index: start.offset, length: end.offset - start.offset}, start.block)
    }
    return _lazy({
      blockId: start.blockId, type: 'text', index: start.offset,
      length: (start.block as EditableBlockComponent).textLength - start.offset
    }, start.block)
  }

  const makeTo = (): IBlockRange | null => {
    if (start.blockId === end.blockId) return null
    if (end.type === 'selected') {
      return _lazy({blockId: end.blockId, type: 'selected'}, end.block)
    }
    return _lazy({blockId: end.blockId, type: 'text', index: 0, length: end.offset}, end.block)
  }

  return {
    from: makeFrom(),
    to: makeTo(),
    collapsed,
  }
}

export function lazyPoint(
  point: { blockId: string; type: string; offset?: number },
  getBlockById: (id: string) => BaseBlockComponent<any>,
): ISelectionPoint {
  if (point.offset === undefined) (point as any).offset = 0
  Object.defineProperty(point, 'block', {
    get: () => getBlockById(point.blockId),
    enumerable: false,
    configurable: true,
  });
  return point as ISelectionPoint;
}

export function lazyGapPoint(
  blockId: string,
  side: 'before' | 'after',
  getBlockById: (id: string) => BaseBlockComponent<any>,
): IGapSelectionPoint {
  const point: IGapSelectionPoint = { blockId, type: 'gap', side } as any
  Object.defineProperty(point, 'block', {
    get: () => getBlockById(blockId),
    enumerable: false,
    configurable: true,
  })
  return point
}
