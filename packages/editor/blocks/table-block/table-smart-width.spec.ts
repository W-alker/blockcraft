import {smartTableColumnWidths, TableCellWidthProfile} from './table-smart-width'

const profile = (column: number, natural: number, minimum: number, heights: number[]): TableCellWidthProfile => ({
  column, row: 0, rowspan: 1, colspan: 1, natural, minimum,
  samples: heights.map((height, i) => ({width: 50 + i * 50, height})),
})

describe('smart table column allocation', () => {
  it('keeps short values compact and gives the description the remaining width', () => {
    const widths = smartTableColumnWidths(3, 400, [
      profile(0, 60, 30, [24, 24]), profile(1, 90, 70, [24, 24]),
      profile(2, 600, 50, [240, 144, 96, 72, 48, 48, 24]),
    ])
    expect(widths).toEqual([60, 90, 250])
  })

  it('uses measured wrap reduction when equally long columns have different content', () => {
    const widths = smartTableColumnWidths(2, 250, [
      profile(0, 600, 50, [240, 144, 96, 72, 48]),
      profile(1, 600, 50, [48, 48, 48, 48, 48]),
    ])
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(widths.reduce((sum, width) => sum + width)).toBe(250)
  })

  it('treats merged cells as a total span constraint', () => {
    const merged = {...profile(0, 300, 240, [48, 48, 48, 48, 24, 24]), colspan: 3}
    const widths = smartTableColumnWidths(3, 300, [merged])
    expect(widths.reduce((sum, width) => sum + width)).toBe(300)
    expect(Math.max(...widths)).toBeLessThan(240)
  })

  it('keeps minimum content width even when the document cannot contain the table', () => {
    expect(smartTableColumnWidths(2, 100, [profile(0, 180, 180, [24]), profile(1, 90, 90, [24])]))
      .toEqual([180, 90])
  })
})
