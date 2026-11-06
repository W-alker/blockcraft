import {HtmlAdapter} from '../../../adapters/html-adapter/html-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'
import {BlockNodeType, type IBlockSnapshot} from '../../../framework'
import {TableBlockSchema} from '..'

describe('table column sizing HTML exchange', () => {
  const adapter = () => new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY)
  const root = (table: IBlockSnapshot): IBlockSnapshot => ({
    id: 'root-table-exchange', flavour: 'root', nodeType: BlockNodeType.root,
    props: {}, meta: {}, children: [table],
  })

  it('round trips automatic sizing and content without freezing measured widths', async () => {
    const table = TableBlockSchema.createSnapshot(2, 2, [['名称', '说明'], ['项目', '较长的说明内容']])
    table.props['columnSizing'] = 'auto'
    const html = await adapter().toHtml(root(table))
    const element = new DOMParser().parseFromString(html, 'text/html').querySelector('table')!
    expect(element.getAttribute('data-bc-table-column-sizing')).toBe('auto')
    expect(element.style.tableLayout).toBe('auto')
    expect(element.style.width).toBe('100%')
    expect(element.querySelector('col[width]')).toBeNull()

    const imported = await adapter().toBlockSnapshot(html)
    const reopened = imported.children[0] as IBlockSnapshot
    expect(reopened.props['columnSizing']).toBe('auto')
    expect(reopened.props['colWidths']).toEqual([120, 120])
    const rows = reopened.children as IBlockSnapshot[]
    const cells = rows[1].children as IBlockSnapshot[]
    expect((cells[1].children[0] as IBlockSnapshot).children).toEqual([{insert: '较长的说明内容', attributes: {}}])
  })

  for (const attribute of ['', 'data-bc-table-column-sizing="unknown"']) {
    it(`defaults to auto for ${attribute || 'unmarked'} tables without column hints`, async () => {
      const imported = await adapter().toBlockSnapshot(
        `<table ${attribute} style="table-layout:auto;width:100%"><tr><td>内容</td></tr></table>`,
      )
      const table = imported.children[0] as IBlockSnapshot
      expect(table.props['columnSizing']).toBe('auto')
      expect(table.props['colWidths']).toEqual([120])
    })
  }

  it('round trips fixed sizing and source widths', async () => {
    const table = TableBlockSchema.createSnapshot(1, 2)
    table.props.depth = 2
    delete table.props.columnSizing
    table.props.colWidths = [83.5, 240]
    const html = await adapter().toHtml(root(table))
    const element = new DOMParser().parseFromString(html, 'text/html').querySelector('table')!
    expect(element.getAttribute('data-bc-table-column-sizing')).toBe('fixed')
    expect(element.hasAttribute('style')).toBeFalse()
    expect(element.hasAttribute('data-bc-depth')).toBeFalse()
    expect(Array.from(element.querySelectorAll('col')).map(col => col.getAttribute('width'))).toEqual(['83.5', '240'])
    const imported = await adapter().toBlockSnapshot(html)
    const reopened = imported.children[0] as IBlockSnapshot
    expect(reopened.props['columnSizing']).toBeUndefined()
    expect(reopened.props['colWidths']).toEqual([83.5, 240])
  })

  const cases: {name: string; columns: string; attrs?: string; widths: number[]; auto?: boolean}[] = [
    {name: 'width attributes and inline styles', columns: '<col width="80"><col width="90" style="width:150px">', widths: [80, 150]},
    {name: 'important style precedence', columns: '<col style="width:80px!important;width:100px"><col style="width:80px;width:100px">', widths: [80, 100]},
    {name: 'column span bounded by actual cells', columns: '<col span="999999999" width="85">', widths: [85, 85]},
    {name: 'missing and invalid widths', columns: '<col width="-10"><col style="width:160px">', widths: [120, 160]},
    {name: 'partial column hints', columns: '<col width="80">', widths: [80, 120]},
    {name: 'absolute unit conversion', columns: '<col style="width:72pt"><col style="width:1in">', widths: [96, 96]},
    {name: 'percentages with absolute table width', attrs: 'style="width:400px"', columns: '<col width="25%"><col style="width:75%">', widths: [100, 300]},
    {name: 'unresolved percentages', attrs: 'width="100%"', columns: '<col width="25%"><col width="75%">', widths: [120, 120], auto: true},
    {name: 'unsupported and invalid hints', columns: '<col style="width:calc(100% - 10px)"><col width="0">', widths: [120, 120], auto: true},
    {name: 'empty colgroup', columns: '', widths: [120, 120], auto: true},
    {name: 'explicit auto overrides column hints', attrs: 'data-bc-table-column-sizing="auto"', columns: '<col width="80"><col width="160">', widths: [80, 160], auto: true},
    {name: 'explicit fixed without column hints', attrs: 'data-bc-table-column-sizing="fixed"', columns: '', widths: [120, 120]},
  ]
  for (const test of cases) {
    it(`imports ${test.name}`, async () => {
      const imported = await adapter().toBlockSnapshot(`<table ${test.attrs ?? ''}><colgroup>${test.columns}</colgroup><tr><td>A</td><td>B</td></tr></table>`)
      const table = imported.children[0] as IBlockSnapshot
      expect(table.props['columnSizing']).toBe(test.auto ? 'auto' : undefined)
      expect(table.props['colWidths']).toEqual(test.widths)
    })
  }

  it('maps group spans and inherited widths to logical columns in merged cells', async () => {
    const imported = await adapter().toBlockSnapshot('<table><colgroup span="2" width="80"></colgroup><colgroup style="width:140px"><col><col width="180"></colgroup><tr><td colspan="2">A</td><td>B</td><td>C</td></tr></table>')
    const table = imported.children[0] as IBlockSnapshot
    expect(table.props['columnSizing']).toBeUndefined()
    expect(table.props['colWidths']).toEqual([80, 80, 140, 180])
    const cells = (table.children[0] as IBlockSnapshot).children as IBlockSnapshot[]
    expect(cells[0].props['colspan']).toBe(2)
    expect(cells[1].props['display']).toBe('none')
  })

  it('does not inherit nested table column hints', async () => {
    const imported = await adapter().toBlockSnapshot('<table><tr><td><table><colgroup><col width="200"></colgroup><tr><td>A</td></tr></table></td></tr></table>')
    const table = imported.children[0] as IBlockSnapshot
    expect(table.props['columnSizing']).toBe('auto')
    expect(table.props['colWidths']).toEqual([120])
  })
})
