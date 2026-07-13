import {resolveSelectionScopePolicyForBlockId} from "./scope";

interface ISelectionCoveredBlocksDoc {
  getBlockById?(id: string): BlockCraft.BlockComponent

  queryBlocksThroughPathDeeply?(
    from: string | BlockCraft.BlockComponent,
    to: string | BlockCraft.BlockComponent,
  ): { group: string[] }[]

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
    if (shouldUseEndpointClassesForTextRange(selection, doc)) {
      return uniqueBlockIds([selection.start.blockId, selection.end.blockId])
    }
    if (selection.isInSameBlock) return [selection.firstBlock.id]
    const textRangeIds = getTextRangeCoveredBlockIds(selection, doc)
    if (textRangeIds) return textRangeIds
    return doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true)
  } catch {
    return []
  }
}

function shouldUseEndpointClassesForTextRange(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): boolean {
  if (!doc.getBlockById) return false
  if (selection.start?.type !== 'text' || selection.end?.type !== 'text') return false
  return resolveSelectionScopePolicyForBlockId(
    selection.commonParent,
    id => doc.getBlockById!(id) as any,
  )?.coveredBlockClassMode === 'text-endpoints'
}

function uniqueBlockIds(ids: string[]): string[] {
  return [...new Set(ids)]
}

function getTextRangeCoveredBlockIds(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): string[] | null {
  if (!doc.queryBlocksThroughPathDeeply) return null
  if (selection.start?.type !== 'text' || selection.end?.type !== 'text') return null

  const through = doc.queryBlocksThroughPathDeeply(selection.firstBlock, selection.lastBlock)
  return uniqueBlockIds([
    selection.start.blockId,
    ...through.flatMap(segment => segment.group),
    selection.end.blockId,
  ])
}
