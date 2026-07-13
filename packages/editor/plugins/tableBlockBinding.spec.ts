import {BlockNodeType, ClipboardDataType, IBlockProps, IBlockSnapshot} from "../framework";
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
    const targetCells = new Map<string, {
      id: string
      flavour: string
      props: IBlockProps
      childrenLength: number
      getIndexOfParent: () => number
    }>([
      ['target-1', {id: 'target-1', flavour: 'table-cell', props: {}, childrenLength: 0, getIndexOfParent: () => 0}],
      ['target-2', {id: 'target-2', flavour: 'table-cell', props: {}, childrenLength: 0, getIndexOfParent: () => 1}],
      ['target-3', {id: 'target-3', flavour: 'table-cell', props: {}, childrenLength: 0, getIndexOfParent: () => 0}],
      ['target-4', {id: 'target-4', flavour: 'table-cell', props: {}, childrenLength: 0, getIndexOfParent: () => 1}]
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
      selection: {recalculate: () => {}, setCursorAtBlock: () => {}},
      getBlockById: (id: string) => targetCells.get(id),
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

  it('skips async table paste when the original table selection is stale after parsing', async () => {
    const binding = new TableBlockBinding()
    const preventDefault = jasmine.createSpy('preventDefault')
    const tableElement = {getAttribute: () => 'table-1'}
    const sourceTable = table('source-table', [row('source-row', [cell('source-cell', 'A1')])])
    const targetCell = {
      id: 'cell-1',
      flavour: 'table-cell',
      parentId: 'row-1',
      props: {},
      getIndexOfParent: () => 0,
      hostElement: {
        closest: (selector: string) =>
          selector === '.table-block[data-block-id]' ? tableElement : null,
      },
    }
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      rowLength: 1,
      colLength: 1,
      childrenIds: ['row-1'],
      confirmSelection: jasmine.createSpy('confirmSelection').and.callFake((start: number[], end: number[]) => ({start, end})),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates'),
      getCellByCoordinate: jasmine.createSpy('getCellByCoordinate').and.returnValue(targetCell),
    }
    let live = true
    const doc = {
      isReadonly: false,
      logger: {warn: jasmine.createSpy('warn')},
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
        if (!live) throw new Error('missing')
        if (id === 'table-1') return tableBlock
        if (id === 'cell-1') return targetCell
        if (id === 'row-1') return {id: 'row-1'}
        return null
      }),
    }
    ;(binding as any).doc = doc

    let resolveParse!: (value: IBlockSnapshot) => void
    spyOn(binding as any, '_parsePastedTableSnapshot').and.returnValue(new Promise(resolve => {
      resolveParse = resolve
    }))
    const fill = spyOn(binding as any, '_fillTableFromSnapshot')
    const selection = {
      start: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      end: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      anchor: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      head: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      commonParent: 'table-1',
      firstBlock: targetCell,
      lastBlock: targetCell,
      isInSameBlock: true,
      getTableCellSelection: () => ({
        tableId: 'table-1',
        anchorCellId: 'cell-1',
        headCellId: 'cell-1',
      }),
      getBoundarySelectedChildIds: () => null,
    }
    const state = {
      selection,
      dataTypes: [ClipboardDataType.TEXT],
      getData: (type: ClipboardDataType) => type === ClipboardDataType.TEXT ? 'A\tB' : null,
    }
    const context = {
      preventDefault,
      get: () => state,
    }

    const result = binding.handlePaste(context as any)
    live = false
    resolveParse(sourceTable)
    await Promise.resolve()

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(fill).not.toHaveBeenCalled()
    expect(doc.logger.warn).toHaveBeenCalledWith('table paste target selection is stale, abort')
  })

  it('applies async table paste for a model table-cell selection against the live table instance', async () => {
    const binding = new TableBlockBinding()
    const preventDefault = jasmine.createSpy('preventDefault')
    const tableElement = {getAttribute: () => 'table-1'}
    const sourceTable = table('source-table', [row('source-row', [cell('source-cell', 'A1')])])
    const targetCell = {
      id: 'cell-1',
      flavour: 'table-cell',
      parentId: 'row-1',
      props: {},
      getIndexOfParent: () => 0,
      hostElement: {
        closest: (selector: string) =>
          selector === '.table-block[data-block-id]' ? tableElement : null,
      },
    }
    const makeTableBlock = (label: string) => ({
      id: 'table-1',
      flavour: 'table',
      rowLength: 1,
      colLength: 1,
      childrenIds: ['row-1'],
      label,
      confirmSelection: jasmine.createSpy(`${label}.confirmSelection`).and.callFake((start: number[], end: number[]) => ({start, end})),
      getSelectedCoordinates: jasmine.createSpy(`${label}.getSelectedCoordinates`),
      getCellByCoordinate: jasmine.createSpy(`${label}.getCellByCoordinate`).and.returnValue(targetCell),
    })
    const staleTable = makeTableBlock('stale')
    const liveTable = makeTableBlock('live')
    let resolveLive = false
    const doc = {
      isReadonly: false,
      logger: {warn: jasmine.createSpy('warn')},
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
        if (id === 'table-1') return resolveLive ? liveTable : staleTable
        if (id === 'cell-1') return targetCell
        if (id === 'row-1') return {id: 'row-1'}
        return null
      }),
    }
    ;(binding as any).doc = doc

    let resolveParse!: (value: IBlockSnapshot) => void
    spyOn(binding as any, '_parsePastedTableSnapshot').and.returnValue(new Promise(resolve => {
      resolveParse = resolve
    }))
    const fill = spyOn(binding as any, '_fillTableFromSnapshot')
    const selection = {
      start: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      end: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      anchor: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      head: {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'},
      commonParent: 'table-1',
      firstBlock: targetCell,
      lastBlock: targetCell,
      isInSameBlock: true,
      getTableCellSelection: () => ({
        tableId: 'table-1',
        anchorCellId: 'cell-1',
        headCellId: 'cell-1',
      }),
      getBoundarySelectedChildIds: () => null,
    }
    const state = {
      selection,
      dataTypes: [ClipboardDataType.TEXT],
      getData: (type: ClipboardDataType) => type === ClipboardDataType.TEXT ? 'A\tB' : null,
    }
    const context = {
      preventDefault,
      get: () => state,
    }

    const result = binding.handlePaste(context as any)
    resolveLive = true
    resolveParse(sourceTable)
    await Promise.resolve()

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(fill).toHaveBeenCalledWith(liveTable, sourceTable, [0, 0])
    expect(doc.logger.warn).not.toHaveBeenCalled()
  })

  it('does not intercept table paste when the text selection cell is stale', () => {
    const binding = new TableBlockBinding()
    const preventDefault = jasmine.createSpy('preventDefault')
    const tableElement = {getAttribute: () => 'table-1'}
    const cellElement = {getAttribute: () => 'missing-cell'}
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      childrenIds: ['row-1'],
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates').and.returnValue(null),
    }
    const firstBlock = {
      id: 'paragraph-1',
      flavour: 'paragraph',
      hostElement: {
        closest: (selector: string) => {
          if (selector === '.table-block[data-block-id]') return tableElement
          if (selector === 'td[data-block-id]') return cellElement
          return null
        },
      },
    }
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === 'table-1' ? tableBlock : null),
    }
    ;(binding as any).doc = doc
    const parse = spyOn(binding as any, '_parsePastedTableSnapshot')
    const context = {
      preventDefault,
      get: () => ({
        selection: {
          firstBlock,
          getTableCellSelection: () => null,
        },
        dataTypes: [ClipboardDataType.TEXT],
        getData: (type: ClipboardDataType) => type === ClipboardDataType.TEXT ? 'A\tB' : null,
      }),
    }

    const result = binding.handlePaste(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })

  it('skips table paste cursor restore when the table is stale before animation frame', () => {
    const binding = new TableBlockBinding()
    const doc = {
      logger: {warn: jasmine.createSpy('warn')},
      selection: {
        setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
        recalculate: jasmine.createSpy('recalculate'),
      },
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('missing'),
    }
    ;(binding as any).doc = doc

    ;(binding as any)._restoreCursorInCell({
      id: 'table-1',
      getCellByCoordinate: jasmine.createSpy('getCellByCoordinate'),
      _clearSelectionUiState: jasmine.createSpy('_clearSelectionUiState'),
    }, [0, 0])

    expect(doc.selection.setCursorAtBlock).not.toHaveBeenCalled()
    expect(doc.selection.recalculate).not.toHaveBeenCalled()
  })
})

describe('TableBlockBinding delete', () => {
  const createBinding = (tableBlock: any, options: {
    readonly?: boolean
    selection?: any
  } = {}) => {
    const binding = new TableBlockBinding()
    const doc = {
      isReadonly: !!options.readonly,
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === tableBlock.id ? tableBlock : null),
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((callback: () => void) => callback()),
      },
    }
    ;(binding as any).doc = doc
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = {
      get: () => ({
        raw: {preventDefault},
        selection: options.selection,
      }),
    }
    return {binding, doc, context, preventDefault}
  }

  const blockInTable = (flavour = 'paragraph') => ({
    flavour,
    hostElement: {
      closest: (selector: string) =>
        selector === '.table-block[data-block-id]'
          ? {getAttribute: () => 'table-1'}
          : null,
    },
  })

  it('clears every cell in an explicit rectangular table selection', () => {
    const cells = ['a1', 'a2', 'b1', 'b2'].map(id => ({
      id,
      clearContent: jasmine.createSpy(`clear-${id}`),
    }))
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      getExplicitSelectedCoordinates: jasmine.createSpy('getExplicitSelectedCoordinates').and.returnValue({
        start: [0, 0],
        end: [1, 1],
      }),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates'),
      confirmSelection: jasmine.createSpy('confirmSelection').and.callFake((start: number[], end: number[]) => ({start, end})),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.returnValue([
        [cells[0], cells[1]],
        [cells[2], cells[3]],
      ]),
    }
    const {binding, context, preventDefault} = createBinding(tableBlock, {
      selection: {
        isAllSelected: false,
        firstBlock: blockInTable('paragraph'),
      },
    })

    const result = binding.handleDelete(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(tableBlock.getSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getCellsMatrixByCoordinates).toHaveBeenCalledWith([0, 0], [1, 1])
    cells.forEach(cell => expect(cell.clearContent).toHaveBeenCalled())
  })

  it('falls back to a single selected table cell when there is no explicit rectangle', () => {
    const onlyCell = {id: 'cell-1', clearContent: jasmine.createSpy('clearContent')}
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      getExplicitSelectedCoordinates: jasmine.createSpy('getExplicitSelectedCoordinates').and.returnValue(null),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates').and.returnValue({
        start: [0, 0],
        end: [0, 0],
      }),
      confirmSelection: jasmine.createSpy('confirmSelection').and.callFake((start: number[], end: number[]) => ({start, end})),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.returnValue([[onlyCell]]),
    }
    const {binding, context, preventDefault} = createBinding(tableBlock, {
      selection: {
        isAllSelected: true,
        firstBlock: blockInTable('table-cell'),
      },
    })

    const result = binding.handleDelete(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(onlyCell.clearContent).toHaveBeenCalled()
  })

  it('clears a collapsed single-cell model selection', () => {
    const binding = new TableBlockBinding()
    const preventDefault = jasmine.createSpy('preventDefault')
    const onlyCell = {
      id: 'cell-1',
      flavour: 'table-cell',
      parentId: 'row-1',
      props: {},
      getIndexOfParent: () => 0,
      clearContent: jasmine.createSpy('clearContent'),
      hostElement: {
        closest: (selector: string) =>
          selector === '.table-block[data-block-id]'
            ? {getAttribute: () => 'table-1'}
            : null,
      },
    }
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      childrenIds: ['row-1'],
      getExplicitSelectedCoordinates: jasmine.createSpy('getExplicitSelectedCoordinates'),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates'),
      confirmSelection: jasmine.createSpy('confirmSelection').and.callFake((start: number[], end: number[]) => ({start, end})),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.returnValue([[onlyCell]]),
    }
    ;(binding as any).doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === 'table-1' ? tableBlock : onlyCell),
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((callback: () => void) => callback()),
      },
    }
    const selection = {
      isAllSelected: false,
      firstBlock: onlyCell,
      getTableCellSelection: () => ({
        tableId: 'table-1',
        anchorCellId: 'cell-1',
        headCellId: 'cell-1',
      }),
    }
    const context = {
      get: () => ({
        raw: {preventDefault},
        selection,
      }),
    }

    const result = binding.handleDelete(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(tableBlock.getExplicitSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getCellsMatrixByCoordinates).toHaveBeenCalledWith([0, 0], [0, 0])
    expect(onlyCell.clearContent).toHaveBeenCalled()
  })

  it('clears every cell in a rectangular model selection', () => {
    const binding = new TableBlockBinding()
    const preventDefault = jasmine.createSpy('preventDefault')
    const tableElement = {getAttribute: () => 'table-1'}
    const cells = ['cell-1', 'cell-2', 'cell-3', 'cell-4'].map((id, index) => ({
      id,
      flavour: 'table-cell',
      parentId: index < 2 ? 'row-1' : 'row-2',
      props: {},
      getIndexOfParent: () => index % 2,
      clearContent: jasmine.createSpy(`${id}.clearContent`),
      hostElement: {
        closest: (selector: string) =>
          selector === '.table-block[data-block-id]' ? tableElement : null,
      },
    }))
    const cellMap = new Map(cells.map(cell => [cell.id, cell]))
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      childrenIds: ['row-1', 'row-2'],
      getExplicitSelectedCoordinates: jasmine.createSpy('getExplicitSelectedCoordinates'),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates'),
      confirmSelection: jasmine.createSpy('confirmSelection').and.callFake((start: number[], end: number[]) => ({start, end})),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.returnValue([
        [cells[0], cells[1]],
        [cells[2], cells[3]],
      ]),
    }
    ;(binding as any).doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === 'table-1' ? tableBlock : cellMap.get(id)),
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((callback: () => void) => callback()),
      },
    }
    const selection = {
      isAllSelected: false,
      firstBlock: cells[0],
      getTableCellSelection: () => ({
        tableId: 'table-1',
        anchorCellId: 'cell-1',
        headCellId: 'cell-4',
      }),
    }
    const context = {
      get: () => ({
        raw: {preventDefault},
        selection,
      }),
    }

    const result = binding.handleDelete(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(tableBlock.getExplicitSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getCellsMatrixByCoordinates).toHaveBeenCalledWith([0, 0], [1, 1])
    cells.forEach(cell => expect(cell.clearContent).toHaveBeenCalled())
  })

  it('does not fall back to explicit table delete when a model table-cell endpoint is stale', () => {
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      childrenIds: ['row-1'],
      getExplicitSelectedCoordinates: jasmine.createSpy('getExplicitSelectedCoordinates').and.returnValue({
        start: [0, 0],
        end: [0, 0],
      }),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates'),
      confirmSelection: jasmine.createSpy('confirmSelection'),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates'),
    }
    const {binding, context, preventDefault} = createBinding(tableBlock, {
      selection: {
        isAllSelected: false,
        firstBlock: blockInTable('table-cell'),
        getTableCellSelection: () => ({
          tableId: 'table-1',
          anchorCellId: 'missing-cell',
          headCellId: 'missing-cell',
        }),
      },
    })

    const result = binding.handleDelete(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(tableBlock.getExplicitSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getCellsMatrixByCoordinates).not.toHaveBeenCalled()
  })

  it('does not intercept ordinary text deletion inside a table cell', () => {
    const tableBlock = {
      id: 'table-1',
      getExplicitSelectedCoordinates: jasmine.createSpy('getExplicitSelectedCoordinates').and.returnValue(null),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates'),
      confirmSelection: jasmine.createSpy('confirmSelection'),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates'),
    }
    const {binding, context, preventDefault} = createBinding(tableBlock, {
      selection: {
        isAllSelected: false,
        firstBlock: blockInTable('paragraph'),
      },
    })

    const result = binding.handleDelete(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(tableBlock.getSelectedCoordinates).not.toHaveBeenCalled()
  })

  it('does not intercept whole-table block deletion even when table cell coordinates are stale', () => {
    const tableBlock = {
      id: 'table-1',
      getExplicitSelectedCoordinates: jasmine.createSpy('getExplicitSelectedCoordinates').and.returnValue({
        start: [0, 0],
        end: [1, 1],
      }),
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates'),
      confirmSelection: jasmine.createSpy('confirmSelection'),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates'),
    }
    const {binding, context, preventDefault} = createBinding(tableBlock, {
      selection: {
        isAllSelected: true,
        firstBlock: blockInTable('table'),
      },
    })

    const result = binding.handleDelete(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(tableBlock.getExplicitSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getSelectedCoordinates).not.toHaveBeenCalled()
    expect(tableBlock.getCellsMatrixByCoordinates).not.toHaveBeenCalled()
  })
})

describe('TableBlockBinding copy/cut', () => {
  const createBinding = (selection: any, overrides: Record<string, any> = {}) => {
    const binding = new TableBlockBinding()
    const doc = {
      selection: {value: selection},
      getBlockById: jasmine.createSpy('getBlockById'),
      clipboard: {copyBlocksModel: jasmine.createSpy('copyBlocksModel')},
      messageService: {success: jasmine.createSpy('success')},
      logger: {warn: jasmine.createSpy('warn')},
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((callback: () => void) => callback()),
      },
      schemas: {
        createSnapshot: (flavour: string) =>
          flavour === 'table-row'
            ? row('copied-row', [])
            : editable('empty-paragraph', ''),
      },
      ...overrides,
    }
    ;(binding as any).doc = doc
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = {
      preventDefault,
    }
    return {binding, doc, context, preventDefault}
  }

  it('does not intercept whole-table block copy', () => {
    const selection = {
      isAllSelected: true,
      firstBlock: {
        flavour: 'table',
      },
    }
    const {binding, doc, context, preventDefault} = createBinding(selection)

    const result = binding.handleCopy(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.getBlockById).not.toHaveBeenCalled()
    expect(doc.clipboard.copyBlocksModel).not.toHaveBeenCalled()
  })

  const createTableCopyHarness = (options: {
    coordinates?: {start: number[]; end: number[]} | null
    copyResult?: Promise<void>
  } = {}) => {
    const tableElement = {getAttribute: () => 'table-1'}
    const cells = ['cell-1', 'cell-2'].map((id, index) => ({
      id,
      flavour: 'table-cell',
      parentId: 'row-1',
      props: {},
      getIndexOfParent: () => index,
      clearContent: jasmine.createSpy(`${id}.clearContent`),
      toSnapshot: jasmine.createSpy(`${id}.toSnapshot`).and.returnValue(cell(id, index === 0 ? 'A1' : 'B1')),
      hostElement: {
        closest: (selector: string) =>
          selector === '.table-block[data-block-id]' ? tableElement : null,
      },
    }))
    const coordinates = options.coordinates === undefined
      ? {start: [0, 0], end: [0, 1]}
      : options.coordinates
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      props: {colWidths: [120, 160]},
      childrenIds: ['row-1'],
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates').and.returnValue(coordinates),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.returnValue([cells]),
      toSnapshot: jasmine.createSpy('toSnapshot').and.returnValue(table('table-1', [])),
    }
    const selection = {
      isAllSelected: false,
      firstBlock: cells[0],
      getTableCellSelection: () => null,
    }
    const copyResult = options.copyResult ?? Promise.resolve()
    const {binding, doc, context, preventDefault} = createBinding(selection, {
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === 'table-1' ? tableBlock : null),
      clipboard: {
        copyBlocksModel: jasmine.createSpy('copyBlocksModel').and.returnValue(copyResult),
      },
    })

    return {binding, doc, context, preventDefault, tableBlock, cells}
  }

  it('does not prevent native copy when a table selection no longer resolves to a table', () => {
    const tableElement = {getAttribute: () => 'missing-table'}
    const selection = {
      isAllSelected: false,
      firstBlock: {
        flavour: 'table-cell',
        hostElement: {
          closest: (selector: string) =>
            selector === '.table-block[data-block-id]' ? tableElement : null,
        },
      },
    }
    const {binding, doc, context, preventDefault} = createBinding(selection, {
      getBlockById: jasmine.createSpy('getBlockById').and.returnValue(null),
    })

    const result = binding.handleCopy(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.clipboard.copyBlocksModel).not.toHaveBeenCalled()
  })

  it('does not prevent native copy when table coordinates are stale', () => {
    const {binding, doc, context, preventDefault, tableBlock} = createTableCopyHarness({
      coordinates: null,
    })

    const result = binding.handleCopy(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(tableBlock.getCellsMatrixByCoordinates).not.toHaveBeenCalled()
    expect(doc.clipboard.copyBlocksModel).not.toHaveBeenCalled()
  })

  it('does not fall back to table UI copy when a model table-cell endpoint is stale', () => {
    const tableElement = {getAttribute: () => 'table-1'}
    const firstBlock = {
      id: 'cell-1',
      flavour: 'table-cell',
      hostElement: {
        closest: (selector: string) =>
          selector === '.table-block[data-block-id]' ? tableElement : null,
      },
    }
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      props: {colWidths: [120]},
      childrenIds: ['row-1'],
      getSelectedCoordinates: jasmine.createSpy('getSelectedCoordinates').and.returnValue({
        start: [0, 0],
        end: [0, 0],
      }),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates'),
      toSnapshot: jasmine.createSpy('toSnapshot').and.returnValue(table('table-1', [])),
    }
    const selection = {
      isAllSelected: false,
      firstBlock,
      getTableCellSelection: () => ({
        tableId: 'table-1',
        anchorCellId: 'missing-cell',
        headCellId: 'missing-cell',
      }),
    }
    const {binding, doc, context, preventDefault} = createBinding(selection, {
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === 'table-1' ? tableBlock : null),
    })

    const result = binding.handleCopy(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(tableBlock.getSelectedCoordinates).not.toHaveBeenCalled()
    expect(doc.clipboard.copyBlocksModel).not.toHaveBeenCalled()
  })

  it('copies a resolved table rectangle and prevents the native copy event', async () => {
    const {binding, doc, context, preventDefault, tableBlock} = createTableCopyHarness()

    const result = binding.handleCopy(context as any)
    await Promise.resolve()

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(tableBlock.getCellsMatrixByCoordinates).toHaveBeenCalledWith([0, 0], [0, 1])
    expect(doc.clipboard.copyBlocksModel).toHaveBeenCalled()
    expect(doc.messageService.success).toHaveBeenCalledWith('已复制')
  })

  it('clears copied cells only after table cut copy succeeds', async () => {
    let resolveCopy!: () => void
    const copyResult = new Promise<void>(resolve => {
      resolveCopy = resolve
    })
    const {binding, context, preventDefault, cells} = createTableCopyHarness({copyResult})

    const result = binding.handleCut(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    cells.forEach(cell => expect(cell.clearContent).not.toHaveBeenCalled())

    resolveCopy()
    await Promise.resolve()
    await Promise.resolve()

    cells.forEach(cell => expect(cell.clearContent).toHaveBeenCalled())
  })

  it('logs table copy failures without clearing cells for cut', async () => {
    const error = new Error('copy failed')
    const {binding, doc, context, cells} = createTableCopyHarness({
      copyResult: Promise.reject(error),
    })

    const result = binding.handleCut(context as any)
    await Promise.resolve()
    await Promise.resolve()

    expect(result).toBeTrue()
    expect(doc.logger.warn).toHaveBeenCalledWith('table cut failed', error)
    cells.forEach(cell => expect(cell.clearContent).not.toHaveBeenCalled())
  })
})

describe('TableBlockBinding table-cell arrow navigation', () => {
  const createArrowHarness = (
    selectionCells: {anchor: string; head: string},
    key: string,
    shiftKey = false,
    options: {hiddenCells?: string[]; missingTable?: boolean; missingCells?: string[]} = {},
  ) => {
    const binding = new TableBlockBinding()
    const preventDefault = jasmine.createSpy('preventDefault')
    const tableElement = {getAttribute: () => 'table-1'}
    const rows = ['row-1', 'row-2']
    const cellIds = [
      ['cell-1', 'cell-2'],
      ['cell-3', 'cell-4'],
    ]
    const cells = new Map<string, any>()
    cellIds.forEach((rowCells, rowIdx) => {
      rowCells.forEach((id, colIdx) => {
        cells.set(id, {
          id,
          flavour: 'table-cell',
          parentId: rows[rowIdx],
          props: options.hiddenCells?.includes(id) ? {display: 'none'} : {},
          getIndexOfParent: () => colIdx,
          hostElement: {
            closest: (selector: string) =>
              selector === '.table-block[data-block-id]' ? tableElement : null,
          },
        })
      })
    })
    const tableBlock = {
      id: 'table-1',
      flavour: 'table',
      rowLength: 2,
      colLength: 2,
      childrenIds: rows,
      getCellByCoordinate: jasmine.createSpy('getCellByCoordinate').and.callFake((rowIdx: number, colIdx: number) =>
        cells.get(cellIds[rowIdx]?.[colIdx])),
    }
    const doc = {
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
        id === tableBlock.id
          ? (options.missingTable ? null : tableBlock)
          : (options.missingCells?.includes(id) ? null : cells.get(id))),
      selection: {
        setTableCellSelection: jasmine.createSpy('setTableCellSelection'),
        setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
        selectBlock: jasmine.createSpy('selectBlock'),
        recalculate: jasmine.createSpy('recalculate'),
      },
    }
    ;(binding as any).doc = doc
    const rawPreventDefault = jasmine.createSpy('rawPreventDefault')
    const selection = {
      isAllSelected: false,
      firstBlock: cells.get(selectionCells.anchor),
      getTableCellSelection: () => ({
        tableId: 'table-1',
        anchorCellId: selectionCells.anchor,
        headCellId: selectionCells.head,
      }),
    }
    const context = {
      preventDefault,
      get: () => ({
        raw: {key, shiftKey, preventDefault: rawPreventDefault},
        selection,
      }),
    }
    return {binding, context, preventDefault, rawPreventDefault, doc, tableBlock, cells}
  }

  it('moves a table-cell selection to the adjacent cell with plain arrows', () => {
    const {binding, context, preventDefault, doc, tableBlock, cells} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'ArrowRight')

    const result = binding.handleArrow(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(
      tableBlock,
      cells.get('cell-2'),
      cells.get('cell-2'),
      true,
    )
  })

  it('extends the table-cell selection head with shift arrows', () => {
    const {binding, context, doc, tableBlock, cells} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-2'}, 'ArrowDown', true)

    const result = binding.handleArrow(context as any)

    expect(result).toBeTrue()
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(
      tableBlock,
      cells.get('cell-1'),
      cells.get('cell-4'),
      true,
    )
  })

  it('consumes boundary arrows without moving the model selection', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'ArrowUp')

    const result = binding.handleArrow(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('does not intercept ordinary text arrow navigation inside a table cell', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'ArrowRight')
    const originalGet = context.get
    ;(context as any).get = () => {
      const state = originalGet()
      return {
        ...state,
        selection: {
          firstBlock: state.selection.firstBlock,
          getTableCellSelection: () => null,
        },
      }
    }

    const result = binding.handleArrow(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('does not intercept table-cell arrow navigation when the table is stale', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'ArrowRight', false, {
        missingTable: true,
      })

    const result = binding.handleArrow(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('does not intercept table-cell arrow navigation when an endpoint cell is stale', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'ArrowRight', false, {
        missingCells: ['cell-1'],
      })

    const result = binding.handleArrow(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('does not move arrow navigation into hidden table cells', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'ArrowDown', false, {
        hiddenCells: ['cell-3'],
      })

    const result = binding.handleArrow(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('moves a single-cell selection with Tab and wraps to the next row', () => {
    const {binding, context, preventDefault, doc, tableBlock, cells} =
      createArrowHarness({anchor: 'cell-2', head: 'cell-2'}, 'Tab')

    const result = binding.handleTab(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(
      tableBlock,
      cells.get('cell-3'),
      cells.get('cell-3'),
      true,
    )
  })

  it('moves a single-cell selection backward with Shift+Tab', () => {
    const {binding, context, preventDefault, doc, tableBlock, cells} =
      createArrowHarness({anchor: 'cell-3', head: 'cell-3'}, 'Tab', true)

    const result = binding.handleTab(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(
      tableBlock,
      cells.get('cell-2'),
      cells.get('cell-2'),
      true,
    )
  })

  it('skips hidden cells when moving a single-cell selection with Tab', () => {
    const {binding, context, doc, tableBlock, cells} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'Tab', false, {
        hiddenCells: ['cell-2'],
      })

    const result = binding.handleTab(context as any)

    expect(result).toBeTrue()
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(
      tableBlock,
      cells.get('cell-3'),
      cells.get('cell-3'),
      true,
    )
  })

  it('consumes Tab at the table edge without moving the model selection', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-4', head: 'cell-4'}, 'Tab')

    const result = binding.handleTab(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('does not intercept ordinary text Tab inside a table cell', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'Tab')
    const originalGet = context.get
    ;(context as any).get = () => {
      const state = originalGet()
      return {
        ...state,
        selection: {
          firstBlock: state.selection.firstBlock,
          getTableCellSelection: () => null,
        },
      }
    }

    const result = binding.handleTab(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('does not intercept table-cell Tab when the table is stale', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'Tab', false, {
        missingTable: true,
      })

    const result = binding.handleTab(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('does not intercept table-cell Tab when an endpoint cell is stale', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'Tab', false, {
        missingCells: ['cell-1'],
      })

    const result = binding.handleTab(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
  })

  it('selects the whole table from a model table-cell selection with Ctrl+A', () => {
    const {binding, context, rawPreventDefault, doc, tableBlock} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'a')

    const result = binding.handleCtrlA(context as any)

    expect(result).toBeTrue()
    expect(rawPreventDefault).toHaveBeenCalled()
    expect(doc.selection.selectBlock).toHaveBeenCalledWith(tableBlock)
  })

  it('does not intercept table-cell Ctrl+A when the table is stale', () => {
    const {binding, context, rawPreventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'a', false, {
        missingTable: true,
      })

    const result = binding.handleCtrlA(context as any)

    expect(result).toBeFalse()
    expect(rawPreventDefault).not.toHaveBeenCalled()
    expect(doc.selection.selectBlock).not.toHaveBeenCalled()
  })

  it('does not intercept table-cell Ctrl+A when an endpoint cell is stale', () => {
    const {binding, context, rawPreventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'a', false, {
        missingCells: ['cell-1'],
      })

    const result = binding.handleCtrlA(context as any)

    expect(result).toBeFalse()
    expect(rawPreventDefault).not.toHaveBeenCalled()
    expect(doc.selection.selectBlock).not.toHaveBeenCalled()
  })

  it('restores the cursor at the anchor cell with Escape', () => {
    const {binding, context, preventDefault, doc, cells} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-4'}, 'Escape')

    const result = binding.handleEscape(context as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.setCursorAtBlock).toHaveBeenCalledWith(cells.get('cell-1'), false, false)
    expect(doc.selection.recalculate).toHaveBeenCalled()
  })

  it('does not intercept ordinary text Escape inside a table cell', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-1'}, 'Escape')
    const originalGet = context.get
    ;(context as any).get = () => {
      const state = originalGet()
      return {
        ...state,
        selection: {
          firstBlock: state.selection.firstBlock,
          getTableCellSelection: () => null,
        },
      }
    }

    const result = binding.handleEscape(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setCursorAtBlock).not.toHaveBeenCalled()
  })

  it('does not intercept table-cell Escape when the table is stale', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-4'}, 'Escape', false, {
        missingTable: true,
      })

    const result = binding.handleEscape(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setCursorAtBlock).not.toHaveBeenCalled()
  })

  it('does not intercept table-cell Escape when an endpoint cell is stale', () => {
    const {binding, context, preventDefault, doc} =
      createArrowHarness({anchor: 'cell-1', head: 'cell-4'}, 'Escape', false, {
        missingCells: ['cell-1'],
      })

    const result = binding.handleEscape(context as any)

    expect(result).toBeFalse()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.setCursorAtBlock).not.toHaveBeenCalled()
  })
})
