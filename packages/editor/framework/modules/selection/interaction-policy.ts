import type {BlockSelectionInteractionCapability} from '../../block-std'

function readSelectionInteraction(
  doc: BlockCraft.Doc,
  block: BlockCraft.BlockComponent | null | undefined,
): BlockSelectionInteractionCapability | null {
  if (!block) return null
  try {
    return doc.schemas?.get?.(block.flavour, false)
      ?.metadata.selectionInteraction ?? null
  } catch {
    return null
  }
}

/** Whether direct interaction with this block's own frame selects the Block. */
export function hasSelectableBlockFrame(
  doc: BlockCraft.Doc,
  block: BlockCraft.BlockComponent | null | undefined,
): block is BlockCraft.BlockComponent {
  return readSelectionInteraction(doc, block)?.frame === 'selectable'
}

/** Whether Escape from a direct editable child should select this frame. */
export function allowsEscapeToBlockFrame(
  doc: BlockCraft.Doc,
  block: BlockCraft.BlockComponent | null | undefined,
): block is BlockCraft.BlockComponent {
  if (!block) return false
  const interaction = readSelectionInteraction(doc, block)
  const escapeToFrame = interaction?.escapeToFrame ?? interaction?.editingBoundary
  if (escapeToFrame === 'always') return true
  if (escapeToFrame !== 'absolute') return false
  try {
    return doc.placement?.isInAbsoluteLayout?.(block) === true
  } catch {
    return false
  }
}

/** Whether this block currently owns a closed frame/child editing boundary. */
export function hasClosedContainerEditingBoundary(
  doc: BlockCraft.Doc,
  block: BlockCraft.BlockComponent | null | undefined,
): block is BlockCraft.BlockComponent {
  if (!block) return false
  const boundary = readSelectionInteraction(doc, block)?.editingBoundary
  if (boundary === 'always') return true
  if (boundary !== 'absolute') return false
  try {
    return doc.placement?.isInAbsoluteLayout?.(block) === true
  } catch {
    return false
  }
}
