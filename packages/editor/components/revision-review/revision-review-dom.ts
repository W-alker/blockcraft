import type {
  RevisionReviewItem,
  RevisionReviewState,
} from '../../plugins/revision-review'

export const REVISION_MARK_SELECTOR = '[data-bc-revision-ids]'

export function readRevisionIds(element: HTMLElement): string[] {
  return (element.getAttribute('data-bc-revision-ids') ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
}

export function findMarkerItem(
  marker: HTMLElement,
  state: RevisionReviewState,
): RevisionReviewItem | null {
  const revisionIds = new Set(readRevisionIds(marker))
  if (!revisionIds.size) return null
  const active = state.activeItem
  if (active?.revisionIds.some(id => revisionIds.has(id))) return active
  return state.items.find(item =>
    item.revisionIds.some(id => revisionIds.has(id))) ?? null
}

export function findItemMarker(
  blockHost: HTMLElement,
  item: RevisionReviewItem,
): HTMLElement | null {
  const candidates = [
    ...(blockHost.matches(REVISION_MARK_SELECTOR) ? [blockHost] : []),
    ...Array.from(
      blockHost.querySelectorAll<HTMLElement>(REVISION_MARK_SELECTOR),
    ),
  ]
  const revisionIds = new Set(item.revisionIds)
  return candidates.find(candidate =>
    readRevisionIds(candidate).some(id => revisionIds.has(id))) ?? null
}
