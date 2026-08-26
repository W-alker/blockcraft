/**
 * Package-internal bridge for view-only Revision projection invalidation.
 *
 * Revision metadata lives outside the block model, so decision/view changes do
 * not produce BlockModelGraph content events. Layout owners still need the
 * affected stable block IDs after Revision has rebuilt their canonical DOM.
 * Keep that bridge out of the public DocumentRevisionManager API.
 */
export interface RevisionPresentationChange {
  readonly blockIds: readonly string[]
}

type RevisionPresentationListener = (
  change: RevisionPresentationChange,
) => void

const listenersByManager = new WeakMap<object, Set<RevisionPresentationListener>>()

export function subscribeRevisionPresentationChange(
  manager: object,
  listener: RevisionPresentationListener,
): () => void {
  const listeners = listenersByManager.get(manager)
    ?? new Set<RevisionPresentationListener>()
  listeners.add(listener)
  listenersByManager.set(manager, listeners)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) listenersByManager.delete(manager)
  }
}

export function emitRevisionPresentationChange(
  manager: object,
  blockIds: Iterable<string>,
): void {
  const listeners = listenersByManager.get(manager)
  if (!listeners?.size) return
  const uniqueIds = [...new Set(blockIds)]
  if (!uniqueIds.length) return
  const change: RevisionPresentationChange = {blockIds: uniqueIds}
  for (const listener of [...listeners]) listener(change)
}
