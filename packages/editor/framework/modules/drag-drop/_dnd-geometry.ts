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
  position: DragPosition,
  geometryScale = 1
): DragLineRect {
  // BCR 是视口像素；蓝线位于缩放面内，偏移和长度必须还原为布局像素。
  // 线宽和边缘间隙仍为原有的 2px / 1px，随文档一起缩放。
  const top = (rect.top - rootRect.top) / geometryScale
  const left = (rect.left - rootRect.left) / geometryScale
  const width = rect.width / geometryScale
  const height = rect.height / geometryScale
  switch (position) {
    case 'left':
      return { top, left: left - 1, width: 2, height }
    case 'right':
      return { top, left: (rect.right - rootRect.left) / geometryScale + 1, width: 2, height }
    case 'after':
      return { top: (rect.bottom - rootRect.top) / geometryScale + 1, left, width, height: 2 }
    default:
      return { top: top - 1, left, width, height: 2 }
  }
}
