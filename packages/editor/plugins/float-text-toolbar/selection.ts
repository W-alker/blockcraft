import {sliceDelta} from '../../global'
import type {DeltaInsert} from '../../framework'

export function isFloatTextToolbarSelection(
  selection: BlockCraft.Selection | null | undefined
): selection is BlockCraft.Selection {
  if (!selection || selection.collapsed || selection.isAllSelected || selection.isEmpty) {
    return false
  }
  if (selection.start?.type !== 'text' || selection.end?.type !== 'text') {
    return false
  }
  if (isEmbedOnlyInlineSelection(selection)) return false

  const startCell = closestAncestorId(selection.start.block, 'table-cell')
  const endCell = closestAncestorId(selection.end.block, 'table-cell')
  if (startCell || endCell) {
    return !!startCell && startCell === endCell
  }

  return true
}

/** A selected inline Embed is a valid clipboard range, but has no text format. */
function isEmbedOnlyInlineSelection(selection: BlockCraft.Selection): boolean {
  if (
    !selection.isInSameBlock ||
    selection.start.type !== 'text' ||
    selection.end.type !== 'text'
  ) return false

  try {
    const block = selection.start.block ?? selection.firstBlock
    if (typeof (block as any)?.textDeltas !== 'function') return false
    const deltas = (block as any).textDeltas() as DeltaInsert[]
    const selected = sliceDelta(
      deltas,
      selection.start.offset,
      selection.end.offset,
    )
    return selected.length > 0 && selected.every(delta =>
      typeof delta.insert !== 'string' || delta.insert.length === 0
    )
  } catch {
    // Selection liveness is checked by the caller. If a custom editable block
    // cannot expose deltas here, retain the previous toolbar behavior.
    return false
  }
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
