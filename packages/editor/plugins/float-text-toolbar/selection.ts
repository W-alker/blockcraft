export function isFloatTextToolbarSelection(
  selection: BlockCraft.Selection | null | undefined
): selection is BlockCraft.Selection {
  if (!selection || selection.collapsed || selection.isAllSelected || selection.isEmpty) {
    return false
  }
  return selection.start?.type === 'text' && selection.end?.type === 'text'
}
