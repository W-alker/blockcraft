export interface TableStructureAnchorRect {
  left: number
  top: number
  width: number
}

export interface TableStructureAnchorInput {
  wrapperRect: Pick<DOMRect, 'left' | 'top'>
  selectionRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
  gap?: number
}

export function resolveTableStructureAnchor({
  wrapperRect,
  selectionRect,
  gap = 8,
}: TableStructureAnchorInput): TableStructureAnchorRect {
  return {
    left: selectionRect.left - wrapperRect.left,
    top: selectionRect.top - wrapperRect.top + selectionRect.height + gap,
    width: selectionRect.width,
  }
}
