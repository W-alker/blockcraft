import {PaginationConfig} from '../pagination.types'
import {mountPrintPagesInPage} from './print-live'
import {PrintPages} from './print-paginator'

describe('mountPrintPagesInPage', () => {
  it('keeps the print mirror mounted for a host backend and disposes idempotently', async () => {
    const container = document.createElement('div')
    container.className = 'bc-print-root'
    document.body.appendChild(container)
    const pages = {
      container,
      pages: [],
      pageCount: 0,
      pageWidthPx: 793,
      pageHeightPx: 1123,
      pageWidthPt: 595,
      pageHeightPt: 842,
      dispose: () => container.remove(),
    } satisfies PrintPages
    const config: PaginationConfig = {pageSize: 'A4'}

    const mounted = await mountPrintPagesInPage(pages, config)

    expect(mounted.printRoot).toBe(container)
    expect(container.classList.contains('bc-print-mirror')).toBeTrue()
    expect(document.head.querySelector('[data-bc-print-mirror-style]')).not.toBeNull()

    mounted.dispose()
    mounted.dispose()

    expect(container.classList.contains('bc-print-mirror')).toBeFalse()
    expect(document.head.querySelector('[data-bc-print-mirror-style]')).toBeNull()
    pages.dispose()
  })
})
