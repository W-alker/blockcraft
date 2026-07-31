import {
  BlockReadonlyOperation,
  type BlockReadonlyViolationTrigger,
} from '../../doc/block-readonly.types'

const PLACEMENT_LAYOUT_FLAVOUR = 'placement-layout'

/**
 * Delete one absolute object from a placement layout without applying the
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
  if (!doc.model.exists(blockId)) return false

  const parentId = doc.model.getParentId(blockId)
  if (
    !parentId ||
    doc.model.getFlavour(parentId) !== PLACEMENT_LAYOUT_FLAVOUR
  ) {
    return false
  }

  const flavour = doc.model.getFlavour(blockId)
  const capability = flavour
    ? doc.schemas.get(flavour, false)?.metadata.placement
    : undefined
  const placement = doc.model.getProps(blockId)?.['placement']
  if (
    !capability?.modes.includes('absolute') ||
    !placement ||
    typeof placement !== 'object' ||
    (placement as {mode?: unknown}).mode !== 'absolute'
  ) {
    return false
  }

  const index = doc.model.indexInParent(blockId)
  if (index < 0) return false

  // Assert before capturing the undo bookmark. A rejected readonly operation
  // must not leave a pending selection snapshot for a later unrelated edit.
  doc.readonlyManager.assertRemovable(
    [blockId],
    BlockReadonlyOperation.Delete,
    trigger,
  )

  const selection = doc.selection.value
  const ownsSelection =
    selection?.anchor.blockId === blockId &&
    selection.head.blockId === blockId

  doc.crud.undoManager.captureSelectionBeforeChange()
  const deleted = doc.crud.deleteBlocks(parentId, index, 1, true)
  if (!deleted.length) return false

  // Never recalculate against a block that no longer exists. The layout
  // normalizer may subsequently remove the empty placement-layout.
  if (ownsSelection) doc.selection.blur()
  return true
}
