interface ISelectionCoveredBlocksDoc {
  queryBlocksBetween(
    from: string | BlockCraft.BlockComponent,
    to: string | BlockCraft.BlockComponent,
    contain?: boolean,
  ): string[]
}

export function getSelectionCoveredBlockIds(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): string[] {
  try {
    const boundaryIds = selection.getBoundarySelectedChildIds?.() ?? null
    if (boundaryIds !== null) return boundaryIds
    if (selection.getTableCellSelection?.()) return []
    if (selection.collapsed && selection.start?.type === 'gap') return []
    if (selection.isInSameBlock) return [selection.firstBlock.id]
    return doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true)
  } catch {
    return []
  }
}
