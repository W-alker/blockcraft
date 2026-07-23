import {PaginationPdfResult} from '../framework/modules/pagination/export'
import {PaginationPlugin} from '../plugins/pagination'
import {DocExportManager} from './export-manager'

describe('DocExportManager pagination PDF', () => {
  it('exports JSON from the model snapshot without traversing the root view', async () => {
    const snapshot = {
      id: 'root',
      flavour: 'root',
      nodeType: 'block',
      props: {},
      meta: {},
      children: [],
    }
    const exportSnapshot = jasmine.createSpy('exportSnapshot').and.returnValue(snapshot)
    const rootToSnapshot = jasmine.createSpy('toSnapshot')
    const createObjectURL = spyOn(URL, 'createObjectURL').and.returnValue('blob:blockcraft-test')
    const revokeObjectURL = spyOn(URL, 'revokeObjectURL')
    const click = spyOn(HTMLAnchorElement.prototype, 'click')
    const doc = {
      exportSnapshot,
      root: {toSnapshot: rootToSnapshot},
      plugins: [],
    } as unknown as BlockCraft.Doc

    await new DocExportManager(doc).exportToJson('document.json')

    expect(exportSnapshot).toHaveBeenCalledTimes(1)
    expect(rootToSnapshot).not.toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:blockcraft-test')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('delegates the host backend to the pagination plugin without taking another snapshot', async () => {
    const plugin = new PaginationPlugin()
    const expected: PaginationPdfResult = {
      output: 'host',
      status: 'saved',
      path: '/tmp/report.pdf',
      pageCount: 1,
      warnings: [],
    }
    spyOn(plugin, 'exportToPdf').and.resolveTo(expected)
    const doc = {
      plugins: [plugin],
      root: {toSnapshot: jasmine.createSpy('toSnapshot')},
    } as unknown as BlockCraft.Doc
    const backend = jasmine.createSpy('backend')

    const result = await new DocExportManager(doc).exportToPdf('report.pdf', {backend})

    expect(result).toBe(expected)
    expect(plugin.exportToPdf).toHaveBeenCalledOnceWith('report.pdf', jasmine.objectContaining({backend}))
    expect(doc.root.toSnapshot).not.toHaveBeenCalled()
  })

  it('passes an explicit pagination override through as a reflow request', async () => {
    const plugin = new PaginationPlugin()
    const expected: PaginationPdfResult = {
      output: 'browser-print',
      status: 'completed',
      pageCount: 1,
      warnings: [],
    }
    spyOn(plugin, 'exportToPdf').and.resolveTo(expected)
    const doc = {plugins: [plugin]} as unknown as BlockCraft.Doc

    await new DocExportManager(doc).exportToPdf('report.pdf', {
      pagination: {pageSize: 'Letter', orientation: 'landscape'},
    })

    expect(plugin.exportToPdf).toHaveBeenCalledOnceWith(
      'report.pdf',
      jasmine.objectContaining({
        pagination: {pageSize: 'Letter', orientation: 'landscape'},
      }),
    )
  })

  it('keeps printPdf as a browser-print compatibility alias', async () => {
    const plugin = new PaginationPlugin()
    const expected: PaginationPdfResult = {
      output: 'browser-print',
      status: 'completed',
      pageCount: 1,
      warnings: [],
    }
    spyOn(plugin, 'exportToPdf').and.resolveTo(expected)
    const doc = {plugins: [plugin]} as unknown as BlockCraft.Doc

    const result = await new DocExportManager(doc).printPdf({pdfPageSize: 'A4'})

    expect(result).toBe(expected)
    expect(plugin.exportToPdf).toHaveBeenCalledOnceWith(
      'document.pdf',
      jasmine.objectContaining({pagination: {pageSize: 'A4'}}),
    )
  })
})
