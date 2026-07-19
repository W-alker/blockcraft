import {BlockSelection} from "./blockSelection";

type SelectionLivenessDoc = {
  model?: {
    exists: (blockId: string) => boolean
    getChildrenIds?: (blockId: string) => readonly string[]
    queryBetween?: (fromId: string, toId: string, contain?: boolean) => readonly string[]
  }
  getBlockById?: (id: string) => BlockCraft.BlockComponent | null | undefined
  queryBlocksBetween?: (
    start: BlockCraft.BlockComponent,
    end: BlockCraft.BlockComponent,
    includeBoundary?: boolean,
  ) => string[] | null | undefined
}

function hasBlock(
  doc: Pick<SelectionLivenessDoc, "model" | "getBlockById">,
  blockId: string,
): boolean {
  if (!blockId) return false
  if (typeof doc.model?.exists === "function") {
    try {
      return doc.model.exists(blockId)
    } catch {
      return false
    }
  }
  try {
    return !!doc.getBlockById?.(blockId)
  } catch {
    return false
  }
}

/** Cheap guard for read hot paths. Structural consumers still use isSelectionAlive. */
export function hasLiveSelectionEndpoints(
  selection: BlockSelection | null | undefined,
  doc: Pick<SelectionLivenessDoc, "model" | "getBlockById">,
): selection is BlockSelection {
  if (!selection) return false
  if (typeof doc.model?.exists !== "function" && typeof doc.getBlockById !== "function") return true

  const anchorId = selection.anchor.blockId
  const headId = selection.head.blockId
  const commonParentId = selection.commonParent
  if (!hasBlock(doc, anchorId)) return false
  if (headId !== anchorId && !hasBlock(doc, headId)) return false
  if (
    commonParentId !== anchorId &&
    commonParentId !== headId &&
    !hasBlock(doc, commonParentId)
  ) return false

  if (selection.anchor.type === "table-cell") {
    if (!hasBlock(doc, selection.anchor.tableId)) return false
    if (
      selection.head.type === "table-cell" &&
      selection.head.tableId !== selection.anchor.tableId &&
      !hasBlock(doc, selection.head.tableId)
    ) {
      return false
    }
  } else if (selection.head.type === "table-cell" && !hasBlock(doc, selection.head.tableId)) {
    return false
  }
  return true
}

/**
 * Validate that a model selection can still resolve all lazy block references.
 *
 * Selection points intentionally keep `block` lazy, so structural edits/undo can
 * leave an old BlockSelection object whose ids no longer exist. Run this before
 * broadcasting or accepting a selection as an IME/input target.
 */
export function isSelectionAlive(
  selection: BlockSelection | null | undefined,
  doc: SelectionLivenessDoc,
): selection is BlockSelection {
  if (!selection) return false

  if (typeof doc.model?.exists === "function") {
    if (!hasLiveSelectionEndpoints(selection, doc)) return false

    const ids = new Set<string>([
      selection.anchor.blockId,
      selection.head.blockId,
      selection.commonParent,
    ])
    const tableCellSelection = selection.getTableCellSelection()
    if (tableCellSelection) {
      ids.add(tableCellSelection.tableId)
      ids.add(tableCellSelection.anchorCellId)
      ids.add(tableCellSelection.headCellId)
    }

    const anchor = selection.anchor
    const head = selection.head
    if (
      anchor.type === "boundary" &&
      head.type === "boundary" &&
      anchor.blockId === head.blockId
    ) {
      const children = doc.model.getChildrenIds?.(anchor.blockId) ?? []
      const from = Math.max(0, Math.min(anchor.index, head.index))
      const to = Math.min(children.length, Math.max(anchor.index, head.index))
      children.slice(from, to).forEach(id => ids.add(id))
    } else if (
      anchor.blockId !== head.blockId &&
      !tableCellSelection &&
      typeof doc.model.queryBetween === "function"
    ) {
      doc.model.queryBetween(anchor.blockId, head.blockId, false).forEach(id => ids.add(id))
    }

    for (const id of ids) {
      if (!hasBlock(doc, id)) return false
    }
    return true
  }

  const candidate = selection as any
  const start = candidate.start ?? candidate.anchor
  const end = candidate.end ?? candidate.head ?? start
  if (!start || !end) return false

  try {
    void start
    void end
  } catch {
    return false
  }

  let firstBlock: BlockCraft.BlockComponent | null = null
  let lastBlock: BlockCraft.BlockComponent | null = null
  try {
    if ("firstBlock" in candidate) firstBlock = candidate.firstBlock
    if ("lastBlock" in candidate) lastBlock = candidate.lastBlock
  } catch {
    return false
  }

  if (typeof doc.getBlockById !== "function") return true

  const ids = new Set<string>()
  if (candidate.anchor?.blockId) ids.add(candidate.anchor.blockId)
  if (candidate.head?.blockId) ids.add(candidate.head.blockId)
  if (start.blockId) ids.add(start.blockId)
  if (end.blockId) ids.add(end.blockId)
  if (candidate.commonParent) ids.add(candidate.commonParent)

  let tableCellSelection: { tableId: string; anchorCellId: string; headCellId: string } | null = null
  if (typeof candidate.getTableCellSelection === "function") {
    try {
      tableCellSelection = candidate.getTableCellSelection()
    } catch {
      return false
    }
  }
  if (tableCellSelection) {
    ids.add(tableCellSelection.tableId)
    ids.add(tableCellSelection.anchorCellId)
    ids.add(tableCellSelection.headCellId)
  }

  let boundaryChildIds: string[] | null = null
  if (typeof candidate.getBoundarySelectedChildIds === "function") {
    try {
      boundaryChildIds = candidate.getBoundarySelectedChildIds()
    } catch {
      return false
    }
  }
  boundaryChildIds?.forEach(id => ids.add(id))

  if (firstBlock) ids.add(firstBlock.id)
  if (lastBlock) ids.add(lastBlock.id)

  if (
    firstBlock &&
    lastBlock &&
    !candidate.isInSameBlock &&
    !tableCellSelection &&
    !boundaryChildIds &&
    typeof doc.queryBlocksBetween === "function"
  ) {
    try {
      doc.queryBlocksBetween(firstBlock, lastBlock, false)
        ?.forEach(id => ids.add(id))
    } catch {
      return false
    }
  }

  for (const id of ids) {
    try {
      if (!doc.getBlockById(id)) return false
    } catch {
      return false
    }
  }
  return true
}
