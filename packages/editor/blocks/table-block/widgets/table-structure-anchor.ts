export interface TableStructureAnchorRect {
  left: number
  top: number
  width: number
}

export interface TableStructureAnchorInput {
  wrapperRect: Pick<DOMRect, 'left' | 'top'>
  selectionRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height' | 'right' | 'bottom'>
  viewportRect?: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
  gap?: number
}

export function resolveTableStructureAnchor({
  wrapperRect,
  selectionRect,
  viewportRect,
  gap = 8,
}: TableStructureAnchorInput): TableStructureAnchorRect {
  const selectionRight = selectionRect.right ?? (selectionRect.left + selectionRect.width)
  const selectionBottom = selectionRect.bottom ?? (selectionRect.top + selectionRect.height)
  const visibleLeft = viewportRect ? Math.max(selectionRect.left, viewportRect.left) : selectionRect.left
  const visibleRight = viewportRect ? Math.min(selectionRight, viewportRect.right) : selectionRight
  const visibleTop = viewportRect ? Math.max(selectionRect.top, viewportRect.top) : selectionRect.top
  const visibleBottom = viewportRect ? Math.min(selectionBottom, viewportRect.bottom) : selectionBottom
  const hasVisibleIntersection = visibleRight > visibleLeft && visibleBottom > visibleTop
  const anchorLeft = hasVisibleIntersection ? visibleLeft : selectionRect.left
  const anchorWidth = hasVisibleIntersection ? (visibleRight - visibleLeft) : selectionRect.width
  const anchorTop = hasVisibleIntersection ? visibleTop : selectionRect.top
  const anchorHeight = hasVisibleIntersection ? (visibleBottom - visibleTop) : selectionRect.height

  return {
    left: anchorLeft - wrapperRect.left,
    top: anchorTop - wrapperRect.top + anchorHeight + gap,
    width: anchorWidth,
  }
}
