import {BlockNodeType, IBlockProps, IBlockSnapshot} from "../framework";
import {findFirstTableSnapshot, getPastedTableCellRows, TableBlockBinding} from "./tableBlockBinding";

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

  it('keeps merged source cell coordinates when filling target cells', () => {
    const sourceTable = table('table-1', [
      row('row-1', [
        cell('source-1', 'A1', {rowspan: 2}),
        cell('source-2', 'B1')
      ]),
      row('row-2', [
        cell('source-hidden', '', {display: 'none'}),
        cell('source-3', 'B2')
      ])
    ])
    const targetCells = new Map<string, {id: string; props: IBlockProps; childrenLength: number}>([
      ['target-1', {id: 'target-1', props: {}, childrenLength: 0}],
      ['target-2', {id: 'target-2', props: {}, childrenLength: 0}],
      ['target-3', {id: 'target-3', props: {}, childrenLength: 0}],
      ['target-4', {id: 'target-4', props: {}, childrenLength: 0}]
    ])
    const insertions: Array<{parentId: string; children: IBlockSnapshot[]}> = []
    const binding = new TableBlockBinding()

    ;(binding as any).doc = {
      crud: {
        transact: (callback: () => void) => callback(),
        deleteBlocks: () => {},
        insertBlocks: (parentId: string, _index: number, children: IBlockSnapshot[]) => {
          insertions.push({parentId, children})
        }
      },
      schemas: {
        createSnapshot: () => editable('empty', '')
      },
      logger: {warn: () => {}},
      selection: {recalculate: () => {}, setCursorAtBlock: () => {}}
    }
    spyOn(window, 'requestAnimationFrame').and.returnValue(0)

    ;(binding as any)._fillTableFromSnapshot({
      rowLength: 2,
      getChildrenByIndex: (rowIndex: number) => ({
        childrenIds: rowIndex === 0
          ? ['target-1', 'target-2']
          : ['target-3', 'target-4']
      }),
      getCellByCoordinate: () => targetCells.get('target-1'),
      _clearSelectionUiState: () => {}
    }, sourceTable, [0, 0])

    const insertedTextByCell = new Map(insertions.map(insertion => [
      insertion.parentId,
      ((insertion.children[0].children as {insert: string}[])[0]).insert
    ]))

    expect(insertedTextByCell.get('target-1')).toBe('A1')
    expect(insertedTextByCell.get('target-2')).toBe('B1')
    expect(insertedTextByCell.has('target-3')).toBeFalse()
    expect(insertedTextByCell.get('target-4')).toBe('B2')
  })
})
