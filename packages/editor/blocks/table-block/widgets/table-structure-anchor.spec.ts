import { resolveTableStructureAnchor } from './table-structure-anchor'

describe('resolveTableStructureAnchor', () => {
  it('places the anchor below the selected rect in wrapper-local coordinates', () => {
    const anchor = resolveTableStructureAnchor({
      wrapperRect: { left: 40, top: 100 },
      selectionRect: { left: 90, top: 140, width: 180, height: 36, right: 270, bottom: 176 },
      gap: 8,
    })

    expect(anchor.left).toBe(50)
    expect(anchor.top).toBe(84)
    expect(anchor.width).toBe(180)
  })

  it('keeps the same local x when the wrapper has shifted because of horizontal scroll', () => {
    const anchor = resolveTableStructureAnchor({
      wrapperRect: { left: -28, top: 60 },
      selectionRect: { left: 22, top: 100, width: 120, height: 36, right: 142, bottom: 136 },
      gap: 8,
    })

    expect(anchor.left).toBe(50)
    expect(anchor.top).toBe(84)
    expect(anchor.width).toBe(120)
  })
})
