import * as Y from 'yjs'
import {BaseBlockComponent, BlockNodeType} from '../../block-std'
import {BlockSelection} from './blockSelection'
import {resolveSelectionCommonParent} from './common-parent'
import {
  lazyBoundaryPoint,
  lazyGapPoint,
  lazyPoint,
  lazyTableCellPoint,
} from './normalize'
import {ISelectionJSON, ISelectionPoint, ISelectionPointJSON} from './types'

export type RelativeSelectionPointBookmark =
  | {readonly type: 'text'; readonly blockId: string; readonly position: Y.RelativePosition}
  | {readonly type: 'boundary'; readonly blockId: string; readonly index: number; readonly position: Y.RelativePosition}
  | {readonly type: 'selected'; readonly blockId: string}
  | {readonly type: 'gap'; readonly blockId: string; readonly side: 'before' | 'after'}
  | {readonly type: 'table-cell'; readonly blockId: string; readonly tableId: string}

export interface RelativeSelectionBookmark {
  readonly anchor: RelativeSelectionPointBookmark
  readonly head: RelativeSelectionPointBookmark
  readonly source: ISelectionJSON
  readonly dependencyBlockIds: ReadonlySet<string>
  readonly structuralPositions: readonly RelativeSelectionStructuralPosition[]
}

export interface RelativeSelectionStructuralPosition {
  readonly blockId: string
  readonly parentId: string
  readonly index: number
}

type RelativeSelectionSource = Pick<BlockSelection, 'anchor' | 'head' | 'commonParent'>

export function captureRelativeSelectionBookmark(
  selection: RelativeSelectionSource | null,
  doc: BlockCraft.Doc,
  previous?: RelativeSelectionBookmark | null,
): RelativeSelectionBookmark | null {
  if (!selection) return null

  const source: ISelectionJSON = {
    anchor: pointToJSON(selection.anchor),
    head: pointToJSON(selection.head),
    commonParent: selection.commonParent,
  }
  if (previous && sameSelectionJSON(resolveRelativeSelectionBookmark(previous, doc), source)) {
    return {
      anchor: previous.anchor,
      head: previous.head,
      source,
      dependencyBlockIds: collectDependencyBlockIds(source, doc),
      structuralPositions: collectStructuralPositions(source, doc),
    }
  }

  try {
    const anchor = capturePoint(selection.anchor, doc)
    const head = capturePoint(selection.head, doc)
    if (!anchor || !head) return null
    return {
      anchor,
      head,
      source,
      dependencyBlockIds: collectDependencyBlockIds(source, doc),
      structuralPositions: collectStructuralPositions(source, doc),
    }
  } catch {
    return null
  }
}

export function remoteChangeAffectsRelativeSelectionBookmark(
  bookmark: RelativeSelectionBookmark,
  affectedBlockIds: ReadonlySet<string>,
  doc: BlockCraft.Doc,
): boolean {
  const {anchor, head} = bookmark.source
  if (
    affectedBlockIds.has(anchor.blockId) ||
    affectedBlockIds.has(head.blockId) ||
    (!!anchor.tableId && affectedBlockIds.has(anchor.tableId)) ||
    (!!head.tableId && affectedBlockIds.has(head.tableId))
  ) return true

  let dependencyHit = false
  for (const id of affectedBlockIds) {
    if (bookmark.dependencyBlockIds.has(id)) {
      dependencyHit = true
      break
    }
  }
  if (!dependencyHit) return false

  return affectedStructuralPositionChanged(
    bookmark.structuralPositions,
    affectedBlockIds,
    doc,
  )
}

export function resolveRelativeSelectionBookmark(
  bookmark: RelativeSelectionBookmark,
  doc: BlockCraft.Doc,
): ISelectionJSON | null {
  try {
    const anchorJSON = resolvePoint(bookmark.anchor, doc)
    const headJSON = resolvePoint(bookmark.head, doc)
    if (!anchorJSON || !headJSON) return null

    const getBlock = (id: string) => doc.getBlockById(id) as BaseBlockComponent<any>
    const anchor = pointFromJSON(anchorJSON, getBlock)
    const head = pointFromJSON(headJSON, getBlock)
    const commonParent = resolveSelectionCommonParent(anchor, head, getBlock)
    if (!commonParent) return null

    return {anchor: anchorJSON, head: headJSON, commonParent}
  } catch {
    return null
  }
}

export function sameSelectionJSON(
  a: ISelectionJSON | null,
  b: ISelectionJSON | null,
): boolean {
  if (a === b) return true
  if (!a || !b || a.commonParent !== b.commonParent) return false
  return samePointJSON(a.anchor, b.anchor) && samePointJSON(a.head, b.head)
}

function capturePoint(
  point: ISelectionPoint,
  doc: BlockCraft.Doc,
): RelativeSelectionPointBookmark | null {
  if (point.type === 'selected') return {type: 'selected', blockId: point.blockId}
  if (point.type === 'gap') return {type: 'gap', blockId: point.blockId, side: point.side}
  if (point.type === 'table-cell') {
    return {type: 'table-cell', blockId: point.blockId, tableId: point.tableId}
  }

  const block = doc.getBlockById(point.blockId)
  if (point.type === 'boundary') {
    if (block.nodeType === BlockNodeType.editable) return null
    const children = block.yBlock.get('children') as Y.Array<string>
    if (!(children instanceof Y.Array)) return null
    const index = clamp(point.index, 0, children.length)
    return {
      type: 'boundary',
      blockId: point.blockId,
      index,
      position: Y.createRelativePositionFromTypeIndex(children, index, 0),
    }
  }

  if (!doc.isEditable(block)) return null
  const index = clamp(point.offset, 0, block.textLength)
  return {
    type: 'text',
    blockId: point.blockId,
    position: Y.createRelativePositionFromTypeIndex(block.yText, index, 0),
  }
}

function resolvePoint(
  point: RelativeSelectionPointBookmark,
  doc: BlockCraft.Doc,
): ISelectionPointJSON | null {
  const block = readConnectedBlock(point.blockId, doc)
  if (!block) return null

  if (point.type === 'selected') return {type: 'selected', blockId: point.blockId}
  if (point.type === 'gap') {
    return {type: 'gap', blockId: point.blockId, side: point.side}
  }
  if (point.type === 'table-cell') {
    if (!isDescendantOf(point.blockId, point.tableId, doc)) return null
    return {type: 'table-cell', blockId: point.blockId, tableId: point.tableId}
  }
  if (point.type === 'boundary') {
    if (block.nodeType === BlockNodeType.editable) return null
    const children = block.yBlock.get('children') as Y.Array<string>
    if (!(children instanceof Y.Array)) return null
    const absolute = Y.createAbsolutePositionFromRelativePosition(point.position, doc.yDoc)
    const index = absolute?.type === children
      ? absolute.index
      : point.index
    return {
      type: 'boundary',
      blockId: point.blockId,
      index: clamp(index, 0, children.length),
    }
  }

  if (!doc.isEditable(block)) return null
  const absolute = Y.createAbsolutePositionFromRelativePosition(point.position, doc.yDoc)
  if (!absolute || absolute.type !== block.yText) return null
  return {
    type: 'text',
    blockId: point.blockId,
    offset: clamp(absolute.index, 0, block.textLength),
  }
}

function pointFromJSON(
  point: ISelectionPointJSON,
  getBlockById: (id: string) => BaseBlockComponent<any>,
): ISelectionPoint {
  if (point.type === 'boundary') {
    return lazyBoundaryPoint(point.blockId, point.index ?? 0, getBlockById)
  }
  if (point.type === 'gap') {
    return lazyGapPoint(point.blockId, point.side ?? 'before', getBlockById)
  }
  if (point.type === 'table-cell') {
    if (!point.tableId) throw new Error('Missing tableId')
    return lazyTableCellPoint(point.blockId, point.tableId, getBlockById)
  }
  if (point.type === 'selected') {
    const selected: ISelectionPoint = {blockId: point.blockId, type: 'selected'} as ISelectionPoint
    Object.defineProperty(selected, 'block', {
      get: () => getBlockById(point.blockId),
      enumerable: false,
      configurable: true,
    })
    return selected
  }
  return lazyPoint(point as any, getBlockById)
}

function pointToJSON(point: ISelectionPoint): ISelectionPointJSON {
  if (point.type === 'text') {
    return {blockId: point.blockId, type: 'text', offset: point.offset}
  }
  if (point.type === 'gap') {
    return {blockId: point.blockId, type: 'gap', side: point.side}
  }
  if (point.type === 'boundary') {
    return {blockId: point.blockId, type: 'boundary', index: point.index}
  }
  if (point.type === 'table-cell') {
    return {blockId: point.blockId, type: 'table-cell', tableId: point.tableId}
  }
  return {blockId: point.blockId, type: 'selected'}
}

function collectDependencyBlockIds(
  selection: ISelectionJSON,
  doc: BlockCraft.Doc,
): ReadonlySet<string> {
  const ids = new Set<string>()
  collectAncestorIds(selection.anchor.blockId, ids, doc)
  collectAncestorIds(selection.head.blockId, ids, doc)
  if (selection.anchor.tableId) collectAncestorIds(selection.anchor.tableId, ids, doc)
  if (selection.head.tableId) collectAncestorIds(selection.head.tableId, ids, doc)
  collectAncestorIds(selection.commonParent, ids, doc)
  return ids
}

function collectStructuralPositions(
  selection: ISelectionJSON,
  doc: BlockCraft.Doc,
): readonly RelativeSelectionStructuralPosition[] {
  const result: RelativeSelectionStructuralPosition[] = []
  const visited = new Set<string>()
  const seeds = [
    selection.anchor.blockId,
    selection.head.blockId,
    selection.anchor.tableId,
    selection.head.tableId,
  ].filter((id): id is string => !!id)

  for (const seed of seeds) {
    let current = readBlock(seed, doc)
    while (current?.parentId) {
      const key = `${current.id}:${current.parentId}`
      if (visited.has(key)) break
      visited.add(key)
      const parent = readBlock(current.parentId, doc)
      if (!parent) break
      result.push({
        blockId: current.id,
        parentId: parent.id,
        index: parent.childrenIds.indexOf(current.id),
      })
      current = parent
    }
  }

  return result
}

function collectAncestorIds(
  blockId: string,
  result: Set<string>,
  doc: BlockCraft.Doc,
): void {
  const visited = new Set<string>()
  let currentId: string | null = blockId
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    result.add(currentId)
    const block = readBlock(currentId, doc)
    if (!block) return
    currentId = block.parentId ?? null
  }
}

function readConnectedBlock(
  blockId: string,
  doc: BlockCraft.Doc,
): BaseBlockComponent<any> | null {
  const block = readBlock(blockId, doc)
  if (!block) return null
  if (block.parentId === undefined) return block
  const visited = new Set<string>()
  let current = block

  while (current.parentId) {
    if (visited.has(current.id)) return null
    visited.add(current.id)
    const parent = readBlock(current.parentId, doc)
    if (!parent || !parent.childrenIds.includes(current.id)) return null
    current = parent
  }

  return current.nodeType === BlockNodeType.root || current.parentId === undefined
    ? block
    : null
}

function readBlock(
  blockId: string,
  doc: BlockCraft.Doc,
): BaseBlockComponent<any> | null {
  try {
    return doc.getBlockById(blockId) as BaseBlockComponent<any>
  } catch {
    return null
  }
}

function isDescendantOf(
  blockId: string,
  ancestorId: string,
  doc: BlockCraft.Doc,
): boolean {
  const visited = new Set<string>()
  let current = readBlock(blockId, doc)
  while (current && !visited.has(current.id)) {
    if (current.id === ancestorId) return true
    visited.add(current.id)
    current = current.parentId ? readBlock(current.parentId, doc) : null
  }
  return false
}

function samePointJSON(a: ISelectionPointJSON, b: ISelectionPointJSON): boolean {
  return a.blockId === b.blockId &&
    a.type === b.type &&
    (a.offset ?? null) === (b.offset ?? null) &&
    (a.side ?? null) === (b.side ?? null) &&
    (a.index ?? null) === (b.index ?? null) &&
    (a.tableId ?? null) === (b.tableId ?? null)
}

function affectedStructuralPositionChanged(
  positions: readonly RelativeSelectionStructuralPosition[],
  affectedBlockIds: ReadonlySet<string>,
  doc: BlockCraft.Doc,
): boolean {
  for (const position of positions) {
    if (!affectedBlockIds.has(position.parentId)) continue
    const block = readBlock(position.blockId, doc)
    const parent = readBlock(position.parentId, doc)
    if (
      !block || !parent ||
      block.parentId !== position.parentId ||
      parent.childrenIds.indexOf(position.blockId) !== position.index
    ) return true
  }
  return false
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}
