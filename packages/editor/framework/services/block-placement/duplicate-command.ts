import {BlockNodeType} from '../../block-std/types'
import type {DeltaInsert, IBlockSnapshot} from '../../block-std/types'
import {
  BlockReadonlyOperation,
  type BlockReadonlyViolationTrigger,
} from '../../doc/block-readonly.types'
import {generateId} from '../../utils'

const DUPLICATE_OFFSET = 12

export interface AbsolutePlacementInsertResult {
  parentId: string
  index: number
  blockIds: string[]
}

/** Resolve the stable object IDs and insertion point owned by one object selection. */
function resolveAbsoluteSelection(
  doc: BlockCraft.Doc,
  selection: BlockCraft.Selection | null | undefined,
): {parentId: string; blockIds: string[]; insertIndex: number} | null {
  if (!selection || !doc.placement?.isAbsoluteObjectSelection(selection)) {
    return null
  }

  const boundaryIds = selection.getBoundarySelectedChildIds?.() ?? null
  const blockIds = boundaryIds?.length
    ? [...boundaryIds]
    : [selection.anchor.blockId]
  const parentId = doc.model.getParentId(blockIds[0]!)
  if (
    !parentId ||
    blockIds.some(id =>
      !doc.model.exists(id) || doc.model.getParentId(id) !== parentId,
    )
  ) {
    return null
  }

  const indices = blockIds.map(id => doc.model.indexInParent(id))
  if (
    indices.some(index => index < 0) ||
    indices.some((index, offset) => index !== indices[0]! + offset)
  ) {
    return null
  }
  return {
    parentId,
    blockIds,
    insertIndex: indices[indices.length - 1]! + 1,
  }
}

function cloneForAbsoluteInsert(
  snapshot: IBlockSnapshot,
  offset: number,
  topLevel = true,
): IBlockSnapshot {
  const meta = {...snapshot.meta}
  delete meta['lock']
  delete meta['lockKind']

  const props = {...snapshot.props}
  if (topLevel) {
    const position = props['position'] as {x?: unknown; y?: unknown} | undefined
    const x = typeof position?.x === 'number' && Number.isFinite(position.x)
      ? position.x
      : 0
    const y = typeof position?.y === 'number' && Number.isFinite(position.y)
      ? position.y
      : 0
    props['position'] = {x: x + offset, y: y + offset}
  }

  const children = snapshot.nodeType === 'block' || snapshot.nodeType === 'root'
    ? (snapshot.children as IBlockSnapshot[]).map(child =>
        cloneForAbsoluteInsert(child, offset, false),
      )
    : (snapshot.children as DeltaInsert[]).map(operation => ({
        ...operation,
        ...(operation.attributes
          ? {attributes: {...operation.attributes}}
          : {}),
      }))

  return {
    ...snapshot,
    id: generateId(),
    props,
    meta,
    children,
  } as IBlockSnapshot
}

function readBlockMeta(
  doc: BlockCraft.Doc,
  blockId: string,
): Record<string, unknown> {
  const meta = doc.model.getYBlock(blockId)?.get('meta')
  return meta && typeof meta.toJSON === 'function'
    ? meta.toJSON() as Record<string, unknown>
    : {}
}

/** Mirror DocCRUD's detached-tree checks before its filtering insert path. */
function isValidSnapshotTree(
  doc: BlockCraft.Doc,
  snapshot: IBlockSnapshot,
): boolean {
  if (
    snapshot.nodeType !== BlockNodeType.block &&
    snapshot.nodeType !== BlockNodeType.root
  ) {
    return !!doc.schemas.get(snapshot.flavour, false)
  }

  const schema = doc.schemas.get(snapshot.flavour, false)
  if (!schema) return false
  if (schema.metadata.instanceMeta?.childConstraints) {
    for (const child of snapshot.children) {
      if (!doc.schemas.isValidChildrenForInstance(
        child.flavour,
        schema,
        snapshot.meta,
      )) {
        return false
      }
    }
  }
  return snapshot.children.every(child => isValidSnapshotTree(doc, child))
}

function canInsertAllSnapshots(
  doc: BlockCraft.Doc,
  parentId: string,
  snapshots: readonly IBlockSnapshot[],
): boolean {
  const parentFlavour = doc.model.getFlavour(parentId)
  const parentSchema = parentFlavour
    ? doc.schemas.get(parentFlavour, false)
    : null
  if (!parentSchema) return false
  const parentMeta = readBlockMeta(doc, parentId)
  return snapshots.every(snapshot =>
    doc.schemas.isValidChildrenForInstance(
      snapshot.flavour,
      parentSchema,
      parentMeta,
    ) && isValidSnapshotTree(doc, snapshot),
  )
}

function selectInsertedObjects(
  doc: BlockCraft.Doc,
  result: AbsolutePlacementInsertResult,
): void {
  if (result.blockIds.length === 1) {
    const blockId = result.blockIds[0]!
    doc.selection.replay({
      anchor: {blockId, type: 'selected'},
      head: {blockId, type: 'selected'},
      commonParent: blockId,
    })
    return
  }

  doc.selection.replay({
    anchor: {
      blockId: result.parentId,
      type: 'boundary',
      index: result.index,
    },
    head: {
      blockId: result.parentId,
      type: 'boundary',
      index: result.index + result.blockIds.length,
    },
    commonParent: result.parentId,
  })
}

/**
 * Insert clipboard/object snapshots beside the current absolute-object
 * selection. Only placement-capable roots are accepted; nested children keep
 * their local geometry while each top-level object receives one visible offset.
 */
export function insertAbsolutePlacementCopies(
  doc: BlockCraft.Doc,
  selection: BlockCraft.Selection | null | undefined,
  snapshots: readonly IBlockSnapshot[],
  operation: BlockReadonlyOperation.Insert | BlockReadonlyOperation.Paste,
  trigger: BlockReadonlyViolationTrigger,
  offset = DUPLICATE_OFFSET,
): AbsolutePlacementInsertResult | null {
  const target = resolveAbsoluteSelection(doc, selection)
  if (!target || !snapshots.length) return null
  if (snapshots.some(snapshot => {
    const placement = doc.schemas.get(snapshot.flavour, false)?.metadata.placement
    return !placement?.modes.includes('absolute')
  })) {
    return null
  }
  if (!canInsertAllSnapshots(doc, target.parentId, snapshots)) return null

  doc.readonlyManager.assertInsertable(target.parentId, operation, trigger)
  doc.crud.undoManager.captureSelectionBeforeChange()
  const copies = snapshots.map(snapshot =>
    cloneForAbsoluteInsert(snapshot, offset),
  )
  const blockIds = doc.crud.insertBlockSnapshots(
    target.parentId,
    target.insertIndex,
    copies,
  )
  if (blockIds.length !== copies.length) return null

  const result = {
    parentId: target.parentId,
    index: target.insertIndex,
    blockIds,
  }
  selectInsertedObjects(doc, result)
  return result
}

/** Duplicate the selected absolute object(s) without touching the OS clipboard. */
export function duplicateAbsolutePlacementSelection(
  doc: BlockCraft.Doc,
  selection: BlockCraft.Selection | null | undefined,
  trigger: BlockReadonlyViolationTrigger = 'input',
): AbsolutePlacementInsertResult | null {
  const target = resolveAbsoluteSelection(doc, selection)
  if (!target) return null
  const snapshots = target.blockIds
    .map(id => doc.model.toSnapshot(id))
    .filter((snapshot): snapshot is IBlockSnapshot => !!snapshot)
  if (snapshots.length !== target.blockIds.length) return null
  return insertAbsolutePlacementCopies(
    doc,
    selection,
    snapshots,
    BlockReadonlyOperation.Insert,
    trigger,
  )
}
