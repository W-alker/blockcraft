import { preferTableToolbarAbove, resolveTableStructureAnchor } from './table-structure-anchor'

describe('resolveTableStructureAnchor', () => {
  it('spans the selected rect vertically in wrapper-local coordinates', () => {
    const anchor = resolveTableStructureAnchor({
      wrapperRect: { left: 40, top: 100 },
      selectionRect: { left: 90, top: 140, width: 180, height: 36, right: 270, bottom: 176 },
    })

    expect(anchor.left).toBe(50)
    expect(anchor.top).toBe(40)
    expect(anchor.width).toBe(180)
    expect(anchor.height).toBe(36)
  })

  it('keeps the same local x when the wrapper has shifted because of horizontal scroll', () => {
    const anchor = resolveTableStructureAnchor({
      wrapperRect: { left: -28, top: 60 },
      selectionRect: { left: 22, top: 100, width: 120, height: 36, right: 142, bottom: 136 },
    })

    expect(anchor.left).toBe(50)
    expect(anchor.top).toBe(40)
    expect(anchor.width).toBe(120)
    expect(anchor.height).toBe(36)
  })

  it('clamps only horizontally so the toolbar can flip above a table taller than the viewport', () => {
    const anchor = resolveTableStructureAnchor({
      wrapperRect: { left: 0, top: 0 },
      // Table is wider AND taller than the visible viewport, clipped on both x sides.
      selectionRect: { left: 0, top: 50, width: 600, height: 200, right: 600, bottom: 250 },
      viewportRect: { left: 100, right: 400, top: 0, bottom: 120 },
    })

    // Horizontal: clamped to the visible [100, 400] span for centering.
    expect(anchor.left).toBe(100)
    expect(anchor.width).toBe(300)
    // Vertical: stays the table's real top/height (NOT clamped to the viewport),
    // so the connected overlay sees the true table rect and can flip above it.
    expect(anchor.top).toBe(50)
    expect(anchor.height).toBe(200)
  })
})

describe('preferTableToolbarAbove', () => {
  const viewportRect = { top: 100, bottom: 900 } // an 800px-tall scroll viewport

  it('stays below when there is room below the table', () => {
    const above = preferTableToolbarAbove({
      tableRect: { top: 150, bottom: 300 },
      viewportRect,
    })
    expect(above).toBe(false)
  })

  it('flips above when the table sits at the bottom of the scroll viewport', () => {
    // Only 20px below the table inside the viewport — not enough for the toolbar.
    const above = preferTableToolbarAbove({
      tableRect: { top: 700, bottom: 880 },
      viewportRect,
    })
    expect(above).toBe(true)
  })

  it('flips above when the table bottom is below the viewport entirely', () => {
    const above = preferTableToolbarAbove({
      tableRect: { top: 200, bottom: 1200 },
      viewportRect,
    })
    expect(above).toBe(true)
  })

  it('stays below when neither side has room but below is the lesser-evil', () => {
    // Table taller than viewport on both ends: roomBelow and roomAbove both
    // negative and equal-ish; we keep the default (below) rather than flip.
    const above = preferTableToolbarAbove({
      tableRect: { top: 50, bottom: 950 },
      viewportRect,
    })
    expect(above).toBe(false)
  })
})
