import {
  BaseBlockComponent,
  BlockNodeType,
  EditableBlockComponent,
  INLINE_END_BREAK_CLASS,
} from "../../block-std";
import {BlockCraftError, ErrorCode} from "../../../global";
import {closetBlockId} from "../../utils";
import {resolveBlockGapSide} from "../../utils/zero-gap";
import {
  IBlockRange,
  INormalizedRange,
  ISelectionPoint,
  IGapSelectionPoint,
  IBoundarySelectionPoint,
  ITableCellSelectionPoint,
} from "./types";

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

type EndpointSide = 'start' | 'end'

interface IDomEndpoint {
  readonly block: BaseBlockComponent<any>
  readonly node: Node
  readonly offset: number
  readonly side: EndpointSide
  readonly preserveSameBlockWholeSelection?: boolean
}

function isElementNode(node: unknown): node is HTMLElement {
  return !!node && typeof (node as Node).nodeType === 'number' && (node as Node).nodeType === 1
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

  const getInlineShellOffset = (
    block: EditableBlockComponent<any>,
    node: Node,
    offset: number,
    side: EndpointSide,
  ): number | null => {
    const {hostElement, containerElement} = block
    if (!hostElement.contains(node)) return null
    if (containerElement.contains(node)) return null

    if (node.contains(containerElement)) {
      const children = Array.from(node.childNodes)
      const containerChildIndex = children.findIndex(child =>
        child === containerElement || child.contains(containerElement)
      )
      if (containerChildIndex >= 0) {
        return offset <= containerChildIndex ? 0 : block.textLength
      }
    }

    const position = node.compareDocumentPosition(containerElement)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return 0
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return block.textLength

    return side === 'start' ? 0 : block.textLength
  }

  const getInlineOffset = (
    block: EditableBlockComponent<any>,
    node: Node,
    offset: number,
    side: EndpointSide,
  ) => {
    const shellOffset = getInlineShellOffset(block, node, offset, side)
    if (shellOffset !== null) return shellOffset
    return block.runtime.mapper.domPointToModelPoint(block.containerElement, node, offset, options)
  }

  const resolveChildBoundaryIndex = (
    block: BaseBlockComponent<any>,
    container: HTMLElement,
    offset: number,
    side: EndpointSide,
  ): number => {
    const childNodes = Array.from(container.childNodes)
    const children = (block.childrenIds ?? [])
      .map(id => getBlockById(id))
      .map(child => ({child, domIndex: childNodes.indexOf(child.hostElement)}))
      .filter(item => item.domIndex >= 0)
      .sort((a, b) => a.domIndex - b.domIndex)
    if (side === 'start') {
      const nextIndex = children.findIndex(item => item.domIndex >= offset)
      return nextIndex >= 0 ? nextIndex : children.length
    }
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].domIndex < offset) return i + 1
    }
    return 0
  }

  const resolveCollapsedGapPoint = (block: BaseBlockComponent<any>, node: Node): IGapSelectionPoint | null => {
    const gapSide = resolveBlockGapSide(node)
    if (gapSide === null) return null
    if (block.nodeType !== BlockNodeType.void && block.nodeType !== BlockNodeType.block) return null
    return lazyGapPoint(block.id, gapSide, getBlockById)
  }

  const resolveParentBoundaryForBlock = (
    block: BaseBlockComponent<any>,
    side: 'before' | 'after',
  ): IBoundarySelectionPoint | null => {
    if (block.nodeType !== BlockNodeType.void && block.nodeType !== BlockNodeType.block) return null
    if (!block.parentId) return null

    const parent = getBlockById(block.parentId) as BaseBlockComponent<any>
    if (parent.nodeType !== BlockNodeType.block && parent.nodeType !== BlockNodeType.root) return null

    const childrenIds = parent.childrenIds ?? []
    let index = childrenIds.indexOf(block.id)
    if (index < 0 && typeof block.getIndexOfParent === 'function') {
      index = block.getIndexOfParent()
    }
    if (index < 0) return null

    return lazyBoundaryPoint(parent.id, side === 'before' ? index : index + 1, getBlockById)
  }

  const resolveGapBoundaryPoint = (endpoint: IDomEndpoint): IBoundarySelectionPoint | null => {
    if (endpoint.preserveSameBlockWholeSelection) return null
    const gapSide = resolveBlockGapSide(endpoint.node)
    if (gapSide === null) return null
    return resolveParentBoundaryForBlock(endpoint.block, gapSide)
  }

  const resolveParentBoundaryPoint = (endpoint: IDomEndpoint): IBoundarySelectionPoint | null => {
    if (endpoint.preserveSameBlockWholeSelection) return null
    return resolveParentBoundaryForBlock(endpoint.block, endpoint.side === 'start' ? 'before' : 'after')
  }

  const resolveEditableTextPoint = (endpoint: IDomEndpoint): ISelectionPoint | null => {
    const {block, node, offset, side} = endpoint
    if (!(block instanceof EditableBlockComponent)) return null
    if (isElementNode(node) && node.classList.contains(INLINE_END_BREAK_CLASS)) {
      return lazyPoint({blockId: block.id, type: 'text', offset: block.textLength}, getBlockById)
    }
    return lazyPoint({blockId: block.id, type: 'text', offset: getInlineOffset(block, node, offset, side)}, getBlockById)
  }

  const resolveContainerBoundaryPoint = (endpoint: IDomEndpoint): ISelectionPoint | null => {
    const {block, node, offset, side} = endpoint
    if (block.nodeType !== BlockNodeType.block && block.nodeType !== BlockNodeType.root) return null
    const element = isElementNode(node) ? node : null
    if (!element) return null
    const childrenContainer = element.classList.contains('children-render-container')
      ? element
      : element.querySelector<HTMLElement>('.children-render-container')
    if (element !== block.hostElement && !childrenContainer) return null

    const index = childrenContainer === element
      ? resolveChildBoundaryIndex(block, childrenContainer, offset, side)
      : (side === 'start' ? 0 : block.childrenLength)
    return lazyBoundaryPoint(block.id, index, getBlockById)
  }

  const resolveSelectedPointForBlock = (block: BaseBlockComponent<any>): ISelectionPoint => {
    return lazyPoint({blockId: block.id, type: 'selected'}, getBlockById)
  }

  const resolveSelectedPoint = ({block}: IDomEndpoint): ISelectionPoint => {
    return resolveSelectedPointForBlock(block)
  }

  const resolvePoint = (endpoint: IDomEndpoint): ISelectionPoint => {
    const editableTextPoint = resolveEditableTextPoint(endpoint)
    if (editableTextPoint) return editableTextPoint

    if (!collapsed) {
      const gapBoundaryPoint = resolveGapBoundaryPoint(endpoint)
      if (gapBoundaryPoint) return gapBoundaryPoint

      const containerBoundaryPoint = resolveContainerBoundaryPoint(endpoint)
      if (containerBoundaryPoint) return containerBoundaryPoint

      const parentBoundaryPoint = resolveParentBoundaryPoint(endpoint)
      if (parentBoundaryPoint) return parentBoundaryPoint
    }
    return resolveSelectedPoint(endpoint)
  }

  const startBlock = resolveBlock(startContainer)

  // Gap cursor: a COLLAPSED caret inside a block's leading/trailing gap span maps to
  // a `gap` point. This MUST be gated on `collapsed` — a NON-collapsed leading->trailing
  // range is a whole-block `selected` selection (resolved below), not a gap.
  if (collapsed) {
    const gp = resolveCollapsedGapPoint(startBlock, startContainer)
    if (gp) {
      return {start: gp, end: gp}
    }
  }

  let endBlock = startContainer === endContainer ? startBlock : resolveBlock(endContainer)
  const preserveSameBlockWholeSelection = !collapsed && startBlock === endBlock

  const s = resolvePoint({
    block: startBlock,
    node: startContainer,
    offset: startOffset,
    side: 'start',
    preserveSameBlockWholeSelection,
  })

  if (collapsed) {
    return {start: s, end: s}
  }

  const resolvePreviousBlockEndPoint = (): ISelectionPoint | undefined => {
    if (!(isElementNode(endContainer) && endContainer.classList.contains('edit-container') && endOffset === 0)) {
      return undefined
    }
    const prev = endContainer.closest('[data-node-type="editable"]')?.previousElementSibling
    if (!isElementNode(prev)) return undefined
    const id = prev.getAttribute('data-block-id')
    if (!id) return undefined
    endBlock = getBlockById(id) as BaseBlockComponent<any>
    if (endBlock.nodeType === BlockNodeType.editable) {
      return lazyPoint({blockId: id, type: 'text', offset: (endBlock as EditableBlockComponent).textLength}, getBlockById)
    }
    return resolveSelectedPointForBlock(endBlock)
  }

  // Same block, selected type
  if (startBlock === endBlock && s.type === 'selected') {
    return {start: s, end: s}
  }

  // Edge case: endContainer is an edit-container at offset 0 -> resolve to previous block's end.
  const e = resolvePreviousBlockEndPoint()
    ?? resolvePoint({
      block: endBlock,
      node: endContainer,
      offset: endOffset,
      side: 'end',
      preserveSameBlockWholeSelection,
    })

  return {start: s, end: e}
}

/**
 * Convert new anchor/head endpoints to legacy INormalizedRange (from/to/collapsed).
 * Used for backward compat during migration.
 */
export function endpointsToLegacy(endpoints: INormalizedEndpoints): INormalizedRange {
  const {start, end} = endpoints

  if (start.type === 'boundary' || end.type === 'boundary') {
    throw new BlockCraftError(ErrorCode.SelectionError, 'Boundary selection cannot be converted to legacy range')
  }

  if (start.type === 'table-cell' || end.type === 'table-cell') {
    throw new BlockCraftError(ErrorCode.SelectionError, 'Table-cell selection cannot be converted to legacy range')
  }

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

export function lazyBoundaryPoint(
  blockId: string,
  index: number,
  getBlockById: (id: string) => BaseBlockComponent<any>,
): IBoundarySelectionPoint {
  const point: IBoundarySelectionPoint = { blockId, type: 'boundary', index } as any
  Object.defineProperty(point, 'block', {
    get: () => getBlockById(blockId),
    enumerable: false,
    configurable: true,
  })
  return point
}

export function lazyTableCellPoint(
  blockId: string,
  tableId: string,
  getBlockById: (id: string) => BaseBlockComponent<any>,
): ITableCellSelectionPoint {
  const point: ITableCellSelectionPoint = { blockId, type: 'table-cell', tableId } as any
  Object.defineProperty(point, 'block', {
    get: () => getBlockById(blockId),
    enumerable: false,
    configurable: true,
  })
  return point
}
