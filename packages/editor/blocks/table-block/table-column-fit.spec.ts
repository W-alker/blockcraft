import {fitTableColumnWidths, measureTableCellWidths, measureTableCellWidthMetrics} from './table-column-fit'

describe('table column content fitting', () => {
  it('measures wrapping height at bounded candidate widths without changing source content', () => {
    const cell = document.createElement('div')
    cell.style.cssText = 'font:16px/24px monospace;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere'
    cell.innerHTML = '<c-element><c-text>Long description with several words that can wrap across multiple lines.</c-text></c-element>'
    document.body.appendChild(cell)
    const before = cell.outerHTML
    try {
      const [metric] = measureTableCellWidthMetrics([cell], 400)
      expect(metric.natural).toBeGreaterThan(400)
      expect(metric.samples.length).toBeLessThanOrEqual(17)
      expect(metric.samples[0].height).toBeGreaterThan(metric.samples.at(-1)!.height)
      expect(metric.samples.at(-1)!.width).toBe(400)
      expect(cell.outerHTML).toBe(before)
    } finally {
      cell.remove()
    }
  })
  it('clamps measured columns and preserves unmeasured/invalid columns', () => {
    expect(fitTableColumnWidths([200, 200, 200, 200, 200],
      new Map([[0, 21], [1, 123.4], [2, 900], [4, NaN]]), 50, 600))
      .toEqual([50, 124, 600, 200, 200])
  })

  it('measures natural text, explicit breaks, typography and padding without changing the source', () => {
    const host = document.createElement('div')
    host.style.cssText = 'width:60px;font:20px monospace;zoom:1.5'
    host.innerHTML = '<div style="padding:8px"><div><c-element><c-text>abcdefghij</c-text></c-element><br><c-element><c-text>abc</c-text></c-element></div></div>'
    document.body.appendChild(host)
    const cell = host.firstElementChild as HTMLElement
    const before = host.outerHTML
    try {
      const [width] = measureTableCellWidths([cell])
      // 十个等宽字符约 120px，加左右内边距 16px；不受 60px 软换行或 zoom 影响。
      expect(width).toBeGreaterThan(130)
      expect(width).toBeLessThan(145)
      expect(host.outerHTML).toBe(before)
      cell.style.fontSize = '30px'
      expect(measureTableCellWidths([cell])[0]).toBeGreaterThan(width + 50)
    } finally {
      host.remove()
    }
  })

  it('excludes pagination UI and uses displayed media width instead of resource intrinsic size', () => {
    const cell = document.createElement('div')
    cell.style.padding = '0 8px'
    cell.innerHTML = '<img style="width:180px;height:60px"><span data-bc-inline-pagination-gap style="display:inline-block;width:900px"></span><button>ignored control</button>'
    document.body.appendChild(cell)
    try {
      expect(measureTableCellWidths([cell])[0]).toBe(196)
      expect(document.querySelector('[inert]')).toBeNull()
    } finally {
      cell.remove()
    }
  })
})
