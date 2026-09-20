import {cssPageSize} from './print-vector'
import {resolvePrintPageDimensions} from './print-page-geometry'

describe('cssPageSize', () => {
  it('uses explicit physical dimensions for every named pagination paper size', () => {
    expect(cssPageSize({pageSize: 'A0'})).toBe('841mm 1189mm')
    expect(cssPageSize({pageSize: 'A1'})).toBe('594mm 841mm')
    expect(cssPageSize({pageSize: 'A2'})).toBe('420mm 594mm')
    expect(cssPageSize({pageSize: 'Tabloid'})).toBe('11in 17in')
  })

  it('swaps physical dimensions for landscape without changing the pagination paper', () => {
    expect(cssPageSize({pageSize: 'A4', orientation: 'landscape'})).toBe('297mm 210mm')
    expect(cssPageSize({pageSize: 'Legal', orientation: 'landscape'})).toBe('14in 8.5in')
  })

  it('keeps custom page dimensions in CSS pixels', () => {
    expect(cssPageSize({pageSize: {width: 400, height: 600}})).toBe('400px 600px')
    expect(cssPageSize({
      pageSize: {width: 400, height: 600},
      orientation: 'landscape',
    })).toBe('600px 400px')
  })

  it('uses one exact physical size for the A4 page box and @page rule', () => {
    const page = resolvePrintPageDimensions({pageSize: 'A4'})

    expect(cssPageSize({pageSize: 'A4'})).toBe(`${page.widthCss} ${page.heightCss}`)
    expect(page.widthCss).toBe('210mm')
    expect(page.heightCss).toBe('297mm')
    expect(page.widthPx).toBeCloseTo(210 * 96 / 25.4, 10)
    expect(page.heightPx).toBeCloseTo(297 * 96 / 25.4, 10)
  })

  it('converts custom CSS pixels to physical PDF points for native backends', () => {
    const page = resolvePrintPageDimensions({pageSize: {width: 400, height: 600}})

    expect(page.widthPt).toBe(300)
    expect(page.heightPt).toBe(450)
  })
})
