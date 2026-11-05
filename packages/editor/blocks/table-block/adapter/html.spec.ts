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

  for (const attribute of ['', 'data-bc-table-column-sizing="fixed"', 'data-bc-table-column-sizing="unknown"']) {
    it(`keeps existing import behavior for ${attribute || 'unmarked'} tables`, async () => {
      const imported = await adapter().toBlockSnapshot(
        `<table ${attribute} style="table-layout:auto;width:100%"><tr><td>内容</td></tr></table>`,
      )
      const table = imported.children[0] as IBlockSnapshot
      expect(table.props['columnSizing']).toBeUndefined()
      expect(table.props['colWidths']).toEqual([120])
    })
  }

  it('preserves the existing unmarked export for fixed-width tables', async () => {
    const table = TableBlockSchema.createSnapshot(1, 2)
    delete table.props.columnSizing
    const html = await adapter().toHtml(root(table))
    const element = new DOMParser().parseFromString(html, 'text/html').querySelector('table')!
    expect(element.hasAttribute('data-bc-table-column-sizing')).toBeFalse()
    expect(element.hasAttribute('style')).toBeFalse()
  })
})
