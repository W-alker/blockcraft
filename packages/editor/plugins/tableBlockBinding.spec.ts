import {BlockNodeType, IBlockProps, IBlockSnapshot} from "../framework";
import {findFirstTableSnapshot, getPastedTableCellRows} from "./tableBlockBinding";

const editable = (id: string, text: string): IBlockSnapshot => ({
  id,
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  props: {},
  meta: {},
  children: [{insert: text}]
})

const cell = (id: string, text: string, props: IBlockProps = {}): IBlockSnapshot => ({
  id,
  flavour: 'table-cell',
  nodeType: BlockNodeType.block,
  props,
  meta: {},
  children: [editable(`${id}-p`, text)]
})

const row = (id: string, cells: IBlockSnapshot[]): IBlockSnapshot => ({
  id,
  flavour: 'table-row',
  nodeType: BlockNodeType.block,
  props: {},
  meta: {},
  children: cells
})

const table = (id: string, rows: IBlockSnapshot[]): IBlockSnapshot => ({
  id,
  flavour: 'table',
  nodeType: BlockNodeType.block,
  props: {colWidths: []},
  meta: {},
  children: rows
})

describe('TableBlockBinding paste helpers', () => {
  it('finds the first table inside a pasted root snapshot', () => {
    const tableSnapshot = table('table-1', [])
    const root: IBlockSnapshot = {
      id: 'root',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [
        editable('p1', 'before'),
        tableSnapshot
      ]
    }

    expect(findFirstTableSnapshot(root)).toBe(tableSnapshot)
  })

  it('returns visible pasted table cells as a row matrix', () => {
    const tableSnapshot = table('table-1', [
      row('row-1', [
        cell('cell-1', 'A1'),
        cell('cell-hidden', '', {display: 'none'}),
        cell('cell-2', 'B1')
      ]),
      row('row-2', [
        cell('cell-3', 'A2'),
        cell('cell-4', 'B2')
      ])
    ])

    const rows = getPastedTableCellRows(tableSnapshot)

    expect(rows.map(cells => cells.map(c => c.id))).toEqual([
      ['cell-1', 'cell-2'],
      ['cell-3', 'cell-4']
    ])
  })
})
