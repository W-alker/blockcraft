import {PaginationConfig} from '../pagination.types'
import {mountPrintPagesInPage} from './print-live'
import {PrintPages} from './print-paginator'

describe('mountPrintPagesInPage', () => {
  it('keeps the print mirror mounted for a host backend and disposes idempotently', async () => {
    const container = document.createElement('div')
    container.className = 'bc-print-root'
    const pageElements = Array.from({length: 7}, (_, index) => {
      const pageElement = document.createElement('div')
      pageElement.className = 'bc-print-page'
      pageElement.setAttribute('data-page-index', `${index}`)
      container.appendChild(pageElement)
      return pageElement
    })
    const pageElement = pageElements[0]
    document.body.appendChild(container)
    const pages = {
      container,
      pages: pageElements,
      pageCount: 7,
      pageWidthCss: '210mm',
      pageHeightCss: '297mm',
      pageWidthPx: 793.7007874015749,
      pageHeightPx: 1122.5196850393702,
      pageWidthPt: 595.2755905511812,
      pageHeightPt: 841.8897637795276,
      dispose: () => container.remove(),
    } satisfies PrintPages
    // mount 必须消费 build 产出的 A4 geometry，即使调用方随后传入了不同 config。
    const config: PaginationConfig = {pageSize: 'Letter'}

    const mounted = await mountPrintPagesInPage(pages, config)

    expect(mounted.printRoot).toBe(container)
    expect(container.classList.contains('bc-print-mirror')).toBeTrue()
    expect(document.head.querySelector('[data-bc-print-mirror-style]')).not.toBeNull()
    const css = document.head.querySelector('[data-bc-print-mirror-style]')?.textContent ?? ''
    expect(css).toContain('break-before: auto !important')
    expect(css).toContain('page-break-before: auto !important')
    expect(css).toContain('break-inside: avoid !important')
    expect(css).toContain('page-break-inside: avoid !important')
    expect(css).not.toContain('.bc-print-page-slot + .bc-print-page-slot')
    expect(css).not.toContain('break-before: page !important')
    expect(css).not.toContain('page-break-before: always !important')
    expect(css).toContain('break-after: auto !important')
    expect(css).toContain('page-break-after: auto !important')
    expect(css).not.toContain('break-after: page !important')
    expect(css).not.toContain('page-break-after: always !important')
    expect(css).toContain('@page { size: 210mm 297mm; margin: 0; }')
    expect(css).toContain('width: 210mm !important')
    expect(css).not.toContain('width: 100% !important')
    // A4 物理高是 1122.519... CSS px；WebKit 的物理分页步长向下量化为
    // 1122px。7 页必须使用 7 个独立 1122px 流占位，不能累计出第 8 页尾条。
    expect(css).toContain('height: 1122px !important')
    expect(css).not.toContain('height: calc(297mm - 0.01px) !important')
    expect(css).toContain('height: 297mm !important')
    expect(css).toContain('height: auto !important; min-height: 0 !important; max-height: none !important')
    expect(css).toContain('overflow: hidden !important')
    expect(css).not.toContain('height: 100% !important')
    expect(css).toContain('.bc-print-page *::before')
    expect(css).toContain('page-break-before: auto !important')
    expect(css).toContain('page-break-after: auto !important')
    expect(container.querySelectorAll(':scope > .bc-print-page-slot')).toHaveSize(7)
    expect(container.querySelector(':scope > .bc-print-page-slot > .bc-print-page')).toBe(pageElement)

    mounted.dispose()
    mounted.dispose()

    expect(container.classList.contains('bc-print-mirror')).toBeFalse()
    expect(container.querySelector(':scope > .bc-print-page')).toBe(pageElement)
    expect(container.querySelectorAll(':scope > .bc-print-page')).toHaveSize(7)
    expect(container.querySelector('.bc-print-page-slot')).toBeNull()
    expect(document.head.querySelector('[data-bc-print-mirror-style]')).toBeNull()
    pages.dispose()
  })
})
