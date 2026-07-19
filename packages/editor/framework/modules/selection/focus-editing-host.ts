export function focusEditingHostForBlock(
  doc: BlockCraft.Doc,
  block?: BlockCraft.BlockComponent | null,
): void {
  let host: HTMLElement | null = null
  try {
    host = doc.root?.hostElement ?? null
    host = (block?.hostElement.closest('[contenteditable="true"]') as HTMLElement | null) ?? host
  } catch {
    // A restored block can exist in the model before its host is mounted.
  }
  if (!host) return

  const active = host.ownerDocument?.activeElement ?? null
  const containsActive = active !== null && host.contains?.(active)
  if (active !== host && !containsActive) {
    host.focus?.({preventScroll: true})
  }
}
