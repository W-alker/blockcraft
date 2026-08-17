import {
  BlockReadonlyOperation,
  type BlockReadonlyViolationTrigger,
} from '../../doc/block-readonly.types'

const PLACEMENT_LAYOUT_FLAVOUR = 'placement-layout'
const OBJECT_GROUP_FLAVOUR = 'object-group'

const isAbsolutePlacementPlane = (flavour: unknown): boolean =>
  flavour === PLACEMENT_LAYOUT_FLAVOUR || flavour === OBJECT_GROUP_FLAVOUR

/**
 * Delete one absolute object from its placement plane without applying the
 * render-unit "keep one paragraph" fallback.
 *
 * This command deliberately stays package-internal. Keyboard handlers and
 * object toolbars share it so every entry point preserves the same selection,
 * readonly and undo semantics.
 */
export function deleteAbsolutePlacementObject(
  doc: BlockCraft.Doc,
  blockOrId: string | BlockCraft.BlockComponent,
  trigger: BlockReadonlyViolationTrigger = 'api',
): boolean {
  const blockId = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
  return deleteAbsolutePlacementObjects(doc, [blockId], trigger)
}

/**
 * Delete one contiguous object selection from a placement plane in one undo
 * step. The caller supplies model IDs so unmounted selected objects remain
 * deletable without resolving ComponentRefs.
 */
export function deleteAbsolutePlacementObjects(
  doc: BlockCraft.Doc,
  blockIds: readonly string[],
  trigger: BlockReadonlyViolationTrigger = 'api',
): boolean {
  const uniqueIds = [...new Set(blockIds)]
  if (!uniqueIds.length || uniqueIds.some(id => !doc.model.exists(id))) {
    return false
  }

  const parentId = doc.model.getParentId(uniqueIds[0]!)
  if (
    !parentId ||
    !isAbsolutePlacementPlane(doc.model.getFlavour(parentId))
  ) {
    return false
  }

  if (uniqueIds.some(id => {
    if (doc.model.getParentId(id) !== parentId) return true
    const flavour = doc.model.getFlavour(id)
    const capability = flavour
      ? doc.schemas.get(flavour, false)?.metadata.placement
      : undefined
    return !capability?.modes.includes('absolute')
  })) {
    return false
  }

  const indexedIds = uniqueIds
    .map(id => ({id, index: doc.model.indexInParent(id)}))
    .sort((a, b) => a.index - b.index)
  const index = indexedIds[0]!.index
  if (
    index < 0 ||
    indexedIds.some((item, offset) => item.index !== index + offset)
  ) {
    return false
  }
  const orderedIds = indexedIds.map(item => item.id)

  // Assert before capturing the undo bookmark. A rejected readonly operation
  // must not leave a pending selection snapshot for a later unrelated edit.
  doc.readonlyManager.assertRemovable(
    orderedIds,
    BlockReadonlyOperation.Delete,
    trigger,
  )

  const selection = doc.selection.value
  const boundaryIds = selection?.getBoundarySelectedChildIds?.() ?? null
  const ownsSelection = boundaryIds
    ? boundaryIds.length === orderedIds.length &&
      boundaryIds.every((id, offset) => id === orderedIds[offset])
    : orderedIds.length === 1 &&
      selection?.anchor.blockId === orderedIds[0] &&
      selection.head.blockId === orderedIds[0]

  doc.crud.undoManager.captureSelectionBeforeChange()
  const deleted = doc.crud.deleteBlocks(
    parentId,
    index,
    orderedIds.length,
    true,
  )
  if (!deleted.length) return false

  // Never recalculate against a block that no longer exists. The layout
  // normalizer may subsequently remove the empty root placement-layout. An
  // object group deliberately remains valid while empty so entering a group
  // and deleting its last member never deletes the selected group implicitly.
  if (ownsSelection) doc.selection.blur()
  return true
}
