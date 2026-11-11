/** Local toolbar ownership; never promotes the text selection to an object selection. */
export function resolveObjectToolbarContentTarget(
  doc: BlockCraft.Doc,
  selection: BlockCraft.Selection | null | undefined,
  enabled: boolean,
): string | null {
  if (!enabled || doc.isReadonly || !selection) return null
  if (selection.anchor.type === 'gap' || selection.head.type === 'gap') return null

  const nearestObject = (startId: string): string | null => {
    const visited = new Set<string>()
    let id: string | null = startId
    while (id && !visited.has(id)) {
      visited.add(id)
      const flavour = doc.model.getFlavour(id)
      // Members may own a toolbar, but a group never inherits one from its contents.
      if (!flavour || flavour === 'object-group') return null
      const metadata = doc.schemas.get(flavour, false)?.metadata
      if (metadata?.objectDrag || metadata?.objectFormat || metadata?.objectSizing) {
        return doc.readonlyManager.isReadonly(id) ? null : id
      }
      id = doc.model.getParentId(id) ?? null
    }
    return null
  }

  const anchor = nearestObject(selection.anchor.blockId)
  if (!anchor) return null
  return selection.anchor.blockId === selection.head.blockId ||
    nearestObject(selection.head.blockId) === anchor ? anchor : null
}
