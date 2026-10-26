import {resolveSelectionScopePolicyForBlockId} from "./scope";

interface ISelectionCoverageModel {
  getChildrenIds(blockId: string): readonly string[]
  getParentId(blockId: string): string | null
  getPath(blockId: string): readonly string[] | null
  indexInParent(blockId: string): number
}

interface ISelectionCoveredBlocksDoc {
  model?: ISelectionCoverageModel
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

type CoverageEntry =
  | {kind: "id"; blockId: string}
  | {kind: "segment"; parentId: string; from: number; to: number}

interface SelectionCoveragePlan {
  entries: CoverageEntry[]
}

export function getSelectionCoveredBlockIds(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): string[] {
  try {
    const plan = createModelCoveragePlan(selection, doc)
    if (plan && doc.model) return materializeCoveragePlan(plan, doc.model)
    return getLegacySelectionCoveredBlockIds(selection, doc)
  } catch {
    return []
  }
}

/**
 * Resolve presentation classes only for views that currently exist. Segment
 * membership is checked through O(1) model parent/index reads, so a long range
 * never expands into all of its intermediate block ids on scroll.
 */
export function getMountedSelectionCoveredBlockIds(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
  mountedBlockIds: readonly string[],
): string[] {
  if (!mountedBlockIds.length) return []
  try {
    const plan = createModelCoveragePlan(selection, doc)
    if (!plan || !doc.model) {
      const mounted = new Set(mountedBlockIds)
      return getLegacySelectionCoveredBlockIds(selection, doc).filter(id => mounted.has(id))
    }
    return filterCoveragePlan(plan, doc.model, mountedBlockIds)
  } catch {
    return []
  }
}

function createModelCoveragePlan(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): SelectionCoveragePlan | null {
  const model = doc.model
  if (!model) return null

  const start = selection.start
  const end = selection.end
  if (!start || !end) return null

  if (
    start.type === "boundary" &&
    end.type === "boundary" &&
    start.blockId === end.blockId
  ) {
    const from = Math.max(0, Math.min(start.index, end.index))
    // Array.slice and mounted-candidate checks naturally clamp an old boundary
    // to the current children. Avoid reading/cloning the full child list here:
    // this plan is rebuilt on virtual view-window changes.
    const to = Math.max(from, Math.max(start.index, end.index))
    return {
      entries: from === to
        ? []
        : [{kind: "segment", parentId: start.blockId, from, to}],
    }
  }

  if (selection.getTableCellSelection?.()) return {entries: []}
  if (selection.collapsed && start.type === "gap") return {entries: []}

  if (shouldUseEndpointClassesForTextRange(selection, doc)) {
    return idPlan([start.blockId, end.blockId])
  }

  if (selection.isInSameBlock) {
    return idPlan([readFirstBlockId(selection)])
  }

  if (start.type === "text" && end.type === "text") {
    return createDeepTextCoveragePlan(start.blockId, end.blockId, model)
  }

  return createInclusiveBranchCoveragePlan(
    readFirstBlockId(selection),
    readLastBlockId(selection),
    model,
  )
}

function createDeepTextCoveragePlan(
  startId: string,
  endId: string,
  model: ISelectionCoverageModel,
): SelectionCoveragePlan {
  const startPath = model.getPath(startId)
  const endPath = model.getPath(endId)
  if (!startPath || !endPath) return idPlan([startId, endId])

  const commonLength = commonPathLength(startPath, endPath)
  if (
    commonLength === 0 ||
    commonLength >= startPath.length ||
    commonLength >= endPath.length
  ) {
    return idPlan([startId, endId])
  }

  const entries: CoverageEntry[] = [{kind: "id", blockId: startId}]

  for (let index = startPath.length - 1; index > commonLength; index--) {
    const parentId = startPath[index - 1]
    const childIndex = model.indexInParent(startPath[index])
    const length = model.getChildrenIds(parentId).length
    pushSegment(entries, parentId, childIndex + 1, length)
  }

  for (let index = endPath.length - 1; index > commonLength; index--) {
    const parentId = endPath[index - 1]
    const childIndex = model.indexInParent(endPath[index])
    pushSegment(entries, parentId, 0, childIndex)
  }

  const commonParentId = startPath[commonLength - 1]
  const startBranchIndex = model.indexInParent(startPath[commonLength])
  const endBranchIndex = model.indexInParent(endPath[commonLength])
  pushSegment(
    entries,
    commonParentId,
    Math.min(startBranchIndex, endBranchIndex) + 1,
    Math.max(startBranchIndex, endBranchIndex),
  )
  entries.push({kind: "id", blockId: endId})
  return {entries}
}

function createInclusiveBranchCoveragePlan(
  startId: string,
  endId: string,
  model: ISelectionCoverageModel,
): SelectionCoveragePlan {
  if (startId === endId) return idPlan([startId])
  const startPath = model.getPath(startId)
  const endPath = model.getPath(endId)
  if (!startPath || !endPath) return idPlan([startId, endId])
  const commonLength = commonPathLength(startPath, endPath)
  if (
    commonLength === 0 ||
    commonLength >= startPath.length ||
    commonLength >= endPath.length
  ) {
    return idPlan([startId, endId])
  }

  const parentId = startPath[commonLength - 1]
  const startIndex = model.indexInParent(startPath[commonLength])
  const endIndex = model.indexInParent(endPath[commonLength])
  if (startIndex < 0 || endIndex < 0) return idPlan([startId, endId])
  return {
    entries: [{
      kind: "segment",
      parentId,
      from: Math.min(startIndex, endIndex),
      to: Math.max(startIndex, endIndex) + 1,
    }],
  }
}

function materializeCoveragePlan(
  plan: SelectionCoveragePlan,
  model: ISelectionCoverageModel,
): string[] {
  const ids: string[] = []
  for (const entry of plan.entries) {
    if (entry.kind === "id") {
      ids.push(entry.blockId)
      continue
    }
    ids.push(...model.getChildrenIds(entry.parentId).slice(entry.from, entry.to))
  }
  return uniqueBlockIds(ids)
}

function filterCoveragePlan(
  plan: SelectionCoveragePlan,
  model: ISelectionCoverageModel,
  mountedBlockIds: readonly string[],
): string[] {
  const mounted = new Set(mountedBlockIds)
  const ids: string[] = []
  for (const entry of plan.entries) {
    if (entry.kind === "id") {
      if (mounted.has(entry.blockId)) ids.push(entry.blockId)
      continue
    }
    for (const blockId of mountedBlockIds) {
      if (model.getParentId(blockId) !== entry.parentId) continue
      const index = model.indexInParent(blockId)
      if (index >= entry.from && index < entry.to) ids.push(blockId)
    }
  }
  return uniqueBlockIds(ids)
}

function pushSegment(
  entries: CoverageEntry[],
  parentId: string,
  from: number,
  to: number,
): void {
  if (from < 0 || to <= from) return
  entries.push({kind: "segment", parentId, from, to})
}

function idPlan(ids: string[]): SelectionCoveragePlan {
  return {
    entries: uniqueBlockIds(ids).map(blockId => ({kind: "id", blockId})),
  }
}

function commonPathLength(left: readonly string[], right: readonly string[]): number {
  let index = 0
  while (index < left.length && index < right.length && left[index] === right[index]) index++
  return index
}

function readFirstBlockId(selection: BlockCraft.Selection): string {
  return (selection as BlockCraft.Selection & {firstBlockId?: string}).firstBlockId ?? selection.firstBlock.id
}

function readLastBlockId(selection: BlockCraft.Selection): string {
  return (selection as BlockCraft.Selection & {lastBlockId?: string}).lastBlockId ?? selection.lastBlock.id
}

function getLegacySelectionCoveredBlockIds(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): string[] {
  const boundaryIds = selection.getBoundarySelectedChildIds?.() ?? null
  if (boundaryIds !== null) return boundaryIds
  if (selection.getTableCellSelection?.()) return []
  if (selection.collapsed && selection.start?.type === "gap") return []
  if (shouldUseEndpointClassesForTextRange(selection, doc)) {
    return uniqueBlockIds([selection.start.blockId, selection.end.blockId])
  }
  if (selection.isInSameBlock) return [selection.firstBlock.id]
  const textRangeIds = getLegacyTextRangeCoveredBlockIds(selection, doc)
  if (textRangeIds) return textRangeIds
  return doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true)
}

function shouldUseEndpointClassesForTextRange(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): boolean {
  if (!doc.getBlockById) return false
  if (selection.start?.type !== "text" || selection.end?.type !== "text") return false
  return resolveSelectionScopePolicyForBlockId(
    selection.commonParent,
    id => doc.getBlockById!(id) as any,
  )?.coveredBlockClassMode === "text-endpoints"
}

function uniqueBlockIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))]
}

function getLegacyTextRangeCoveredBlockIds(
  selection: BlockCraft.Selection,
  doc: ISelectionCoveredBlocksDoc,
): string[] | null {
  if (!doc.queryBlocksThroughPathDeeply) return null
  if (selection.start?.type !== "text" || selection.end?.type !== "text") return null

  const through = doc.queryBlocksThroughPathDeeply(selection.firstBlock, selection.lastBlock)
  return uniqueBlockIds([
    selection.start.blockId,
    ...through.flatMap(segment => segment.group),
    selection.end.blockId,
  ])
}
