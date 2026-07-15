import {PaginationConfig} from '../pagination.types'
import {exportPrintPagesToPdf} from './document-pdf-exporter'
import {PrintPages} from './print-paginator'

describe('exportPrintPagesToPdf host backend', () => {
  const config: PaginationConfig = {pageSize: 'A4'}

  function createPages(): PrintPages & {dispose: jasmine.Spy} {
    const container = document.createElement('div')
    container.className = 'bc-print-root'
    document.body.appendChild(container)
    const dispose = jasmine.createSpy('dispose').and.callFake(() => container.remove())
    return {
      container,
      pages: [],
      pageCount: 2,
      pageWidthPx: 793,
      pageHeightPx: 1123,
      pageWidthPt: 595,
      pageHeightPt: 842,
      layoutRevision: 7,
      warnings: [],
      dispose,
    }
  }

  it('calls the backend while the current-page print mirror is mounted', async () => {
    const pages = createPages()
    const backend = jasmine.createSpy('backend').and.callFake(async context => {
      expect(context.suggestedName).toBe('report.pdf')
      expect(context.pageCount).toBe(2)
      expect(context.layoutRevision).toBe(7)
      expect(context.printRoot.classList.contains('bc-print-mirror')).toBeTrue()
      expect(document.head.querySelector('[data-bc-print-mirror-style]')).not.toBeNull()
      return {status: 'saved' as const, path: '/tmp/report.pdf'}
    })

    const result = await exportPrintPagesToPdf(pages, config, 'report.pdf', {backend})

    expect(result).toEqual(jasmine.objectContaining({
      output: 'host',
      status: 'saved',
      path: '/tmp/report.pdf',
      pageCount: 2,
      layoutRevision: 7,
    }))
    expect(pages.dispose).toHaveBeenCalledTimes(1)
    expect(document.head.querySelector('[data-bc-print-mirror-style]')).toBeNull()
  })

  it('wraps host errors and still disposes the print surface', async () => {
    const pages = createPages()
    const backend = jasmine.createSpy('backend').and.rejectWith(new Error('native failure'))

    await expectAsync(exportPrintPagesToPdf(pages, config, 'report.pdf', {backend}))
      .toBeRejectedWith(jasmine.objectContaining({code: 'host-print-failed'}))

    expect(pages.dispose).toHaveBeenCalledTimes(1)
    expect(document.head.querySelector('[data-bc-print-mirror-style]')).toBeNull()
  })
})
