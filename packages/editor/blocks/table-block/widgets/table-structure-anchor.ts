export interface TableStructureAnchorRect {
  left: number
  top: number
  width: number
  height: number
}

export interface TableStructureAnchorInput {
  wrapperRect: Pick<DOMRect, 'left' | 'top'>
  selectionRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height' | 'right' | 'bottom'>
  viewportRect?: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
}

/**
 * Build the wrapper-local rect for the invisible `.table-menu-anchor` element
 * that the structure toolbar's CDK overlay connects to.
 *
 * The anchor spans the table's **real vertical extent** (top → bottom). The
 * overlay then uses CDK's `bottom-center → top-center` fallback: it sits below
 * the table when there's room and flips **above the table's top** when there
 * isn't — instead of overlapping the table near the viewport bottom.
 *
 * Only the horizontal span is clamped to the visible viewport, so the toolbar
 * stays centered on the visible part of a horizontally-scrolled wide table.
 * The vertical span is deliberately left unclamped: clamping it to the viewport
 * would collapse the anchor to the screen edge and defeat the flip.
 */
export function resolveTableStructureAnchor({
  wrapperRect,
  selectionRect,
  viewportRect,
}: TableStructureAnchorInput): TableStructureAnchorRect {
  const selectionRight = selectionRect.right ?? (selectionRect.left + selectionRect.width)
  const visibleLeft = viewportRect ? Math.max(selectionRect.left, viewportRect.left) : selectionRect.left
  const visibleRight = viewportRect ? Math.min(selectionRight, viewportRect.right) : selectionRight
  const hasVisibleWidth = visibleRight > visibleLeft
  const anchorLeft = hasVisibleWidth ? visibleLeft : selectionRect.left
  const anchorWidth = hasVisibleWidth ? (visibleRight - visibleLeft) : selectionRect.width

  return {
    left: anchorLeft - wrapperRect.left,
    top: selectionRect.top - wrapperRect.top,
    width: anchorWidth,
    height: selectionRect.height,
  }
}

export interface TableToolbarSideInput {
  tableRect: Pick<DOMRect, 'top' | 'bottom'>
  /** The editor's scroll viewport — the region the toolbar is clamped to. */
  viewportRect: Pick<DOMRect, 'top' | 'bottom'>
  /** Estimated toolbar footprint; only used to settle a below-vs-above choice. */
  toolbarHeight?: number
  gap?: number
}

/**
 * Decide whether the structure toolbar should flip *above* the table.
 *
 * CDK flips against the browser window, but the toolbar is clamped to the
 * editor's scroll viewport (which can be shorter than the window). Measuring
 * room against that viewport keeps the flip decision in sync with the clamp:
 * prefer below, but flip above when there is no room below and above is roomier.
 */
export function preferTableToolbarAbove({
  tableRect,
  viewportRect,
  toolbarHeight = 44,
  gap = 8,
}: TableToolbarSideInput): boolean {
  const needed = toolbarHeight + gap + 8
  const roomBelow = viewportRect.bottom - tableRect.bottom
  const roomAbove = tableRect.top - viewportRect.top
  return roomBelow < needed && roomAbove > roomBelow
}
