export type DragPosition = 'before' | 'after' | 'left' | 'right' | 'none'
export type DragLineRect = { top: number, left: number, width: number, height: number }

export function calcPositionByRect(
  e: { clientX: number, clientY: number },
  rect: Pick<DOMRect, 'top' | 'left' | 'right' | 'width' | 'height'>,
  leftOrRight = false
): DragPosition {
  const edge = Math.min(Math.max(10, rect.width / 6), 50)
  if (leftOrRight) {
    if (e.clientX < rect.left + edge) return 'left'
    if (e.clientX > rect.right - edge) return 'right'
  }
  if (e.clientY > rect.top + rect.height / 2) return 'after'
  return 'before'
}

export function calcDragLineRect(
  rootRect: Pick<DOMRect, 'top' | 'left'>,
  rect: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>,
  position: DragPosition
): DragLineRect {
  switch (position) {
    case 'left':
      return { top: rect.top - rootRect.top, left: rect.left - rootRect.left - 1, width: 2, height: rect.height }
    case 'right':
      return { top: rect.top - rootRect.top, left: rect.right - rootRect.left + 1, width: 2, height: rect.height }
    case 'after':
      return { top: rect.bottom - rootRect.top + 1, left: rect.left - rootRect.left, width: rect.width, height: 2 }
    default:
      return { top: rect.top - rootRect.top - 1, left: rect.left - rootRect.left, width: rect.width, height: 2 }
  }
}
