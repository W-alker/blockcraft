export function isFloatTextToolbarSelection(
  selection: BlockCraft.Selection | null | undefined
): selection is BlockCraft.Selection {
  if (!selection || selection.collapsed || selection.isAllSelected || selection.isEmpty) {
    return false
  }
  if (selection.start?.type !== 'text' || selection.end?.type !== 'text') {
    return false
  }

  const startCell = closestAncestorId(selection.start.block, 'table-cell')
  const endCell = closestAncestorId(selection.end.block, 'table-cell')
  if (startCell || endCell) {
    return !!startCell && startCell === endCell
  }

  return true
}

function closestAncestorId(
  block: BlockCraft.BlockComponent | null | undefined,
  flavour: string,
): string | null {
  let current = block
  while (current) {
    if (current.flavour === flavour) return current.id
    current = current.parentBlock ?? null
  }
  return null
}
