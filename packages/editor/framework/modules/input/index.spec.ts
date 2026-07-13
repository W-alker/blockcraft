import {InputTransformer} from "./index";
import {BlockNodeType, BlockSelectionScopeMetadata} from "../../block-std";
import {BlockSelection} from "../selection";
import {CompositionEventState} from "../../block-std/event/state/compositionState";

// `@DocEventRegister` validates `doc.event` and registers listeners in the
// constructor, so every mock doc must expose a minimal event dispatcher stub.
const eventStub = () => ({add() {}, bindHotkey() {}})

const setSelectionScope = <T extends Record<string, any>>(
  block: T,
  selectionScope: BlockSelectionScopeMetadata,
): T & {doc: any} => {
  return Object.assign(block, {
    doc: {
    schemas: {
      get: () => ({
        metadata: {
          selectionScope,
        },
      }),
    },
    },
  })
}

const makeBoundarySelection = (host: any, from = 0, to = 2) => new BlockSelection(
  {blockId: host.id, type: 'boundary', index: from, block: host} as any,
  {blockId: host.id, type: 'boundary', index: to, block: host} as any,
  host.id,
  () => host,
  () => 0,
)

const createBoundaryEditingHarness = (childrenIds = ['p1', 'p2']) => {
  const host = {
    id: 'callout-1',
    flavour: 'callout',
    childrenIds: [...childrenIds],
    get childrenLength() {
      return this.childrenIds.length
    },
  }
  const paragraphSnapshot = {
    id: 'new-p',
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    props: {},
    meta: {},
    children: [],
  }
  const paragraph = {
    id: 'new-p',
    flavour: 'paragraph',
    textLength: 0,
  }
  const blocks: Record<string, any> = {
    'callout-1': host,
    'new-p': paragraph,
  }
  childrenIds.forEach(id => {
    blocks[id] = {id, flavour: 'paragraph', textLength: 0}
  })

  const doc = {
    event: eventStub(),
    schemas: {
      get: jasmine.createSpy('get').and.returnValue({metadata: {renderUnit: true}}),
      isValidChildren: jasmine.createSpy('isValidChildren').and.returnValue(true),
      createSnapshot: jasmine.createSpy('createSnapshot').and.callFake((_flavour: string, params: any[]) => ({
        ...paragraphSnapshot,
        children: typeof params?.[0] === 'string' ? [{insert: params[0]}] : [],
      })),
    },
    crud: {
      undoManager: {
        captureSelectionBeforeChange: jasmine.createSpy('captureSelectionBeforeChange'),
      },
      transact: jasmine.createSpy('transact').and.callFake((cb: () => void) => cb()),
      deleteBlocks: jasmine.createSpy('deleteBlocks').and.callFake((_parentId: string, index: number, count: number) => {
        host.childrenIds.splice(index, count)
        return [{index, length: count}]
      }),
      insertBlocks: jasmine.createSpy('insertBlocks').and.callFake((_parentId: string, index: number) => {
        host.childrenIds.splice(index, 0, paragraph.id)
        blocks[paragraph.id] = paragraph
        return [paragraph]
      }),
    },
    selection: {
      value: null as any,
      setCursorAt: jasmine.createSpy('setCursorAt'),
      setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
      selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
      recalculate: jasmine.createSpy('recalculate'),
      blur: jasmine.createSpy('blur'),
    },
    getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks[id]),
    isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.flavour === 'paragraph'),
  }

  const selection = makeBoundarySelection(host, 0, Math.min(2, childrenIds.length))
  doc.selection.value = selection

  return {
    doc,
    host,
    paragraph,
    selection,
    transformer: new InputTransformer(doc as any) as any,
  }
}

const createMixedBoundaryEditingHarness = () => {
  const root = {
    id: 'root',
    flavour: 'root',
    childrenIds: ['callout-1', 'p1'],
    get childrenLength() {
      return this.childrenIds.length
    },
  }
  const callout = {
    id: 'callout-1',
    flavour: 'callout',
    nodeType: BlockNodeType.block,
    parentId: root.id,
    parentBlock: root,
    getIndexOfParent: () => 0,
  }
  const paragraph = {
    id: 'p1',
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    textLength: 16,
    parentId: root.id,
    parentBlock: root,
    getIndexOfParent: () => 1,
    textDeltas: jasmine.createSpy('textDeltas').and.returnValue([{insert: 'abcdefghijklmnop'}]),
    replaceText: jasmine.createSpy('replaceText'),
  }
  const blocks: Record<string, any> = {
    root,
    'callout-1': callout,
    p1: paragraph,
  }
  const selection = new BlockSelection(
    {blockId: paragraph.id, type: 'text', offset: 11, block: paragraph} as any,
    {blockId: root.id, type: 'boundary', index: 0, block: root} as any,
    root.id,
    id => blocks[id],
    (a, b) => {
      const aIndex = root.childrenIds.indexOf(a)
      const bIndex = root.childrenIds.indexOf(b)
      if (aIndex < bIndex) return Node.DOCUMENT_POSITION_FOLLOWING
      if (aIndex > bIndex) return Node.DOCUMENT_POSITION_PRECEDING
      return 0
    },
  )
  const doc = {
    event: eventStub(),
    selection: {
      value: selection,
      replay: jasmine.createSpy('replay'),
      setSelection: jasmine.createSpy('setSelection'),
      recalculate: jasmine.createSpy('recalculate'),
      blur: jasmine.createSpy('blur'),
    },
    crud: {
      undoManager: {
        captureSelectionBeforeChange: jasmine.createSpy('captureSelectionBeforeChange'),
      },
      transact: jasmine.createSpy('transact').and.callFake((cb: () => void) => cb()),
      deleteBlockById: jasmine.createSpy('deleteBlockById'),
      deleteBlocks: jasmine.createSpy('deleteBlocks'),
    },
    getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks[id]),
    isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.flavour === 'paragraph'),
    queryBlocksThroughPathDeeply: jasmine.createSpy('queryBlocksThroughPathDeeply').and.returnValue([]),
  }

  return {
    doc,
    root,
    callout,
    paragraph,
    selection,
    transformer: new InputTransformer(doc as any) as any,
  }
}

const createMixedTextBoundaryEditingHarness = () => {
  const root = {
    id: 'root',
    flavour: 'root',
    childrenIds: ['p1', 'callout-1'],
    get childrenLength() {
      return this.childrenIds.length
    },
  }
  const paragraph = {
    id: 'p1',
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    textLength: 16,
    parentId: root.id,
    parentBlock: root,
    getIndexOfParent: () => 0,
    textDeltas: jasmine.createSpy('textDeltas').and.returnValue([{insert: 'abcdefghijklmnop'}]),
    yText: {
      delete: jasmine.createSpy('delete'),
      insert: jasmine.createSpy('insert'),
    },
  }
  const callout = {
    id: 'callout-1',
    flavour: 'callout',
    nodeType: BlockNodeType.block,
    parentId: root.id,
    parentBlock: root,
    getIndexOfParent: () => 1,
  }
  const blocks: Record<string, any> = {
    root,
    p1: paragraph,
    'callout-1': callout,
  }
  const selection = new BlockSelection(
    {blockId: paragraph.id, type: 'text', offset: 11, block: paragraph} as any,
    {blockId: root.id, type: 'boundary', index: 2, block: root} as any,
    root.id,
    id => blocks[id],
    (a, b) => {
      const aIndex = root.childrenIds.indexOf(a)
      const bIndex = root.childrenIds.indexOf(b)
      if (aIndex < bIndex) return Node.DOCUMENT_POSITION_FOLLOWING
      if (aIndex > bIndex) return Node.DOCUMENT_POSITION_PRECEDING
      return 0
    },
  )
  const doc = {
    event: eventStub(),
    selection: {
      value: selection,
      replay: jasmine.createSpy('replay'),
      setSelection: jasmine.createSpy('setSelection'),
      recalculate: jasmine.createSpy('recalculate'),
      blur: jasmine.createSpy('blur'),
    },
    crud: {
      undoManager: {
        captureSelectionBeforeChange: jasmine.createSpy('captureSelectionBeforeChange'),
      },
      transact: jasmine.createSpy('transact').and.callFake((cb: () => void) => cb()),
      deleteBlockById: jasmine.createSpy('deleteBlockById'),
      deleteBlocks: jasmine.createSpy('deleteBlocks'),
    },
    getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks[id]),
    isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.flavour === 'paragraph'),
    queryBlocksThroughPathDeeply: jasmine.createSpy('queryBlocksThroughPathDeeply').and.returnValue([]),
  }

  return {
    doc,
    root,
    callout,
    paragraph,
    selection,
    transformer: new InputTransformer(doc as any) as any,
  }
}

const createTableCellEditingHarness = (
  selectionCells: {anchor: string; head: string} = {anchor: 'cell-1', head: 'cell-4'},
  options: {missingBlocks?: string[]} = {},
) => {
  let paragraphSeq = 0
  const blocks: Record<string, any> = {}

  const makeParagraph = (id: string, text = ''): any => {
    const paragraph = {
      id,
      flavour: 'paragraph',
      textLength: text.length,
      textContent: () => text,
      yText: {
        insert: jasmine.createSpy(`${id}.insert`),
      },
    }
    blocks[id] = paragraph
    return paragraph
  }

  const makeCell = (id: string, parentId: string, index: number) => {
    const firstParagraph = makeParagraph(`${id}-p0`)
    const cell = {
      id,
      flavour: 'table-cell',
      props: {},
      parentId,
      children: [firstParagraph],
      get childrenLength() {
        return this.children.length
      },
      get firstChildren() {
        return this.children[0] ?? null
      },
      get childrenIds() {
        return this.children.map((child: any) => child.id)
      },
      getIndexOfParent: () => index,
    }
    firstParagraph.parentId = id
    firstParagraph.parentBlock = cell
    blocks[id] = cell
    return cell
  }

  const row1 = {id: 'row-1', flavour: 'table-row', childrenIds: ['cell-1', 'cell-2']}
  const row2 = {id: 'row-2', flavour: 'table-row', childrenIds: ['cell-3', 'cell-4']}
  const cell1 = makeCell('cell-1', 'row-1', 0)
  const cell2 = makeCell('cell-2', 'row-1', 1)
  const cell3 = makeCell('cell-3', 'row-2', 0)
  const cell4 = makeCell('cell-4', 'row-2', 1)
  const rows = [[cell1, cell2], [cell3, cell4]]
  const table = {
    id: 'table-1',
    flavour: 'table',
    childrenIds: ['row-1', 'row-2'],
    confirmSelection: jasmine.createSpy('confirmSelection').and.callFake((start: number[], end: number[]) => ({start, end})),
    getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.callFake((start: number[], end: number[]) =>
      rows.slice(start[0], end[0] + 1).map(row => row.slice(start[1], end[1] + 1))),
  }
  blocks['table-1'] = table
  blocks['row-1'] = row1
  blocks['row-2'] = row2

  const selection = new BlockSelection(
    {blockId: selectionCells.anchor, type: 'table-cell', tableId: 'table-1', block: blocks[selectionCells.anchor]} as any,
    {blockId: selectionCells.head, type: 'table-cell', tableId: 'table-1', block: blocks[selectionCells.head]} as any,
    'table-1',
    id => blocks[id],
    () => 0,
  )

  const doc = {
    event: eventStub(),
    getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
      options.missingBlocks?.includes(id) ? null : blocks[id]),
    isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.flavour === 'paragraph'),
    schemas: {
      createSnapshot: jasmine.createSpy('createSnapshot').and.callFake((_flavour: string, params: any[] = []) => {
        const children = typeof params?.[0] === 'string'
          ? [{insert: params[0]}]
          : []
        return {
          id: `new-p-${++paragraphSeq}`,
          flavour: 'paragraph',
          children,
        }
      }),
    },
    crud: {
      undoManager: {
        captureSelectionBeforeChange: jasmine.createSpy('captureSelectionBeforeChange'),
      },
      transact: jasmine.createSpy('transact').and.callFake((cb: () => void) => cb()),
      deleteBlocks: jasmine.createSpy('deleteBlocks').and.callFake((parentId: string, _index: number, count: number) => {
        const cell = blocks[parentId]
        if (cell?.flavour === 'table-cell') {
          const removed = cell.children.splice(_index, count)
          removed.forEach((child: any) => delete blocks[child.id])
        }
        return [{index: 0, length: count}]
      }),
      insertBlocks: jasmine.createSpy('insertBlocks').and.callFake((parentId: string, _index: number, snapshots: any[]) => {
        const cell = blocks[parentId]
        const inserted = snapshots.map(snapshot => {
          const text = snapshot.children?.map((op: any) => op.insert || '').join('') || ''
          const paragraph = makeParagraph(snapshot.id, text)
          paragraph.parentId = parentId
          paragraph.parentBlock = cell
          return paragraph
        })
        cell.children.splice(_index, 0, ...inserted)
        return inserted
      }),
    },
    selection: {
      value: selection,
      normalizeRange: jasmine.createSpy('normalizeRange'),
      setSelection: jasmine.createSpy('setSelection'),
      setTableCellSelection: jasmine.createSpy('setTableCellSelection'),
      setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
      recalculate: jasmine.createSpy('recalculate'),
      blur: jasmine.createSpy('blur'),
    },
    logger: {
      warn: jasmine.createSpy('warn'),
    },
  }

  return {
    doc,
    selection,
    table,
    cells: [cell1, cell2, cell3, cell4],
    get anchorParagraph() {
      return cell1.firstChildren
    },
    transformer: new InputTransformer(doc as any) as any,
  }
}

const createWholeTableSelectionHarness = () => {
  const root = {
    id: 'root',
    flavour: 'root',
  }
  const table = {
    id: 'table-1',
    flavour: 'table',
    parentBlock: root,
    confirmSelection: jasmine.createSpy('confirmSelection'),
    getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates'),
  }
  const paragraph = {
    id: 'new-p',
    flavour: 'paragraph',
    textLength: 0,
    yText: {insert: jasmine.createSpy('insert')},
    rerender: jasmine.createSpy('rerender'),
    setInlineRange: jasmine.createSpy('setInlineRange'),
  }
  const selection = new BlockSelection(
    {blockId: table.id, type: 'selected', block: table} as any,
    {blockId: table.id, type: 'selected', block: table} as any,
    root.id,
    () => table as any,
    () => 0,
  )
  const doc = {
    event: eventStub(),
    selection: {
      value: selection,
      normalizeRange: jasmine.createSpy('normalizeRange'),
      setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
      setSelection: jasmine.createSpy('setSelection'),
      recalculate: jasmine.createSpy('recalculate'),
      blur: jasmine.createSpy('blur'),
    },
    schemas: {
      get: jasmine.createSpy('get').and.callFake((flavour: string) =>
        flavour === 'root' ? {metadata: {renderUnit: true}} : undefined),
      isValidChildren: jasmine.createSpy('isValidChildren').and.callFake((child: string, parent: string) =>
        child === 'paragraph' && parent === 'root'),
      createSnapshot: jasmine.createSpy('createSnapshot').and.returnValue(paragraph),
    },
    crud: {
      undoManager: {
        captureSelectionBeforeChange: jasmine.createSpy('captureSelectionBeforeChange'),
        beginCaptureGroup: jasmine.createSpy('beginCaptureGroup'),
        endCaptureGroup: jasmine.createSpy('endCaptureGroup'),
      },
      transact: jasmine.createSpy('transact').and.callFake((cb: () => void) => cb()),
      insertBlocksAfter: jasmine.createSpy('insertBlocksAfter'),
      deleteBlockById: jasmine.createSpy('deleteBlockById'),
    },
    yDoc: {
      transact: jasmine.createSpy('yDoc.transact').and.callFake((cb: () => void) => cb()),
    },
    prevSibling: jasmine.createSpy('prevSibling').and.returnValue(null),
    nextSibling: jasmine.createSpy('nextSibling').and.returnValue(null),
    queryBlocksThroughPathDeeply: jasmine.createSpy('queryBlocksThroughPathDeeply').and.returnValue([]),
    getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
      if (id === table.id) return table
      if (id === paragraph.id) return paragraph
      if (id === root.id) return root
      throw new Error(`Block not found: ${id}`)
    }),
    logger: {
      warn: jasmine.createSpy('warn'),
    },
  }

  return {
    doc,
    table,
    paragraph,
    selection,
    transformer: new InputTransformer(doc as any) as any,
  }
}

describe('InputTransformer beforeInput range resolution', () => {
  const resolveRange = (selection: any, targetRange: any, blocks: Record<string, any> = {}) => {
    const transformer = new InputTransformer({
      event: eventStub(),
      getBlockById: (id: string) => blocks[id],
    } as any) as any
    return transformer['_resolveBeforeInputRange'](selection, targetRange)
  }

  const createTransformer = (selection: any) => {
    const doc = {
      rootId: 'root',
      event: eventStub(),
      selection: {
        value: selection,
        setSelection: jasmine.createSpy('setSelection'),
        blur: jasmine.createSpy('blur')
      },
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {renderUnit: true}}),
        isValidChildren: jasmine.createSpy('isValidChildren').and.returnValue(true)
      }
    }
    return {
      doc,
      transformer: new InputTransformer(doc as any) as any
    }
  }

  it('prefers the model selection when selected block endpoints are present', () => {
    const selection = {
      start: {type: 'selected', blockId: 'void-1'},
      end: {type: 'text', blockId: 'paragraph-1', offset: 4}
    }
    const targetRange = {
      from: {type: 'text', blockId: 'paragraph-1', index: 0, length: 0},
      to: null,
      collapsed: true
    }

    expect(resolveRange(selection, targetRange)).toBe(selection)
  })

  it('prefers the model selection when boundary endpoints are present', () => {
    const selection = {
      start: {type: 'boundary', blockId: 'callout-1', index: 0},
      end: {type: 'boundary', blockId: 'callout-1', index: 2},
    }
    const targetRange = {
      from: {type: 'text', blockId: 'paragraph-1', index: 0, length: 0},
      to: null,
      collapsed: true
    }

    expect(resolveRange(selection, targetRange)).toBe(selection)
  })

  it('prefers the model selection when table-cell endpoints are present', () => {
    const selection = {
      start: {type: 'table-cell', blockId: 'cell-1', tableId: 'table-1'},
      end: {type: 'table-cell', blockId: 'cell-4', tableId: 'table-1'},
      getTableCellSelection: () => ({tableId: 'table-1', anchorCellId: 'cell-1', headCellId: 'cell-4'}),
    }
    const targetRange = {
      from: {type: 'text', blockId: 'cell-1-p', index: 0, length: 0},
      to: null,
      collapsed: true,
    }

    expect(resolveRange(selection, targetRange)).toBe(selection)
  })

  it('uses the DOM target range for plain text selections', () => {
    const selection = {
      start: {type: 'text', blockId: 'paragraph-1', offset: 0},
      end: {type: 'text', blockId: 'paragraph-1', offset: 3}
    }
    const targetRange = {
      from: {type: 'text', blockId: 'paragraph-1', index: 0, length: 3},
      to: null,
      collapsed: false
    }

    expect(resolveRange(selection, targetRange)).toBe(targetRange)
  })

  it('prefers the model selection for cross-column text ranges', () => {
    const selection = {
      collapsed: false,
      commonParent: 'columns-1',
      start: {type: 'text', blockId: 'left-p', offset: 2},
      end: {type: 'text', blockId: 'right-p', offset: 3},
    }
    const targetRange = {
      from: {type: 'text', blockId: 'left-p', index: 2, length: 4},
      to: {type: 'text', blockId: 'right-p', index: 0, length: 3},
      collapsed: false,
    }

    expect(resolveRange(selection, targetRange, {
      'columns-1': setSelectionScope({id: 'columns-1', flavour: 'columns'}, 'columns'),
    })).toBe(selection)
  })

  it('prevents uncontrolled beforeInput when no model or DOM target range can be resolved', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const blur = jasmine.createSpy('blur')
    const warn = jasmine.createSpy('warn')
    const event = {
      target: null,
      inputType: 'insertText',
      data: 'x',
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [{}],
      preventDefault,
    }
    const doc = {
      event: eventStub(),
      logger: {warn},
      selection: {
        value: null,
        normalizeRange: jasmine.createSpy('normalizeRange').and.throwError('bad range'),
        blur,
      },
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')

    const result = transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(blur).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('prevents composing beforeInput when no composition session owns it', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertCompositionText',
      data: '拼',
      isComposing: true,
      defaultPrevented: false,
      preventDefault,
    }
    const doc = {
      event: eventStub(),
      selection: {value: null},
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')

    transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(preventDefault).toHaveBeenCalled()
  })

  it('prevents composing beforeInput without an active session even when a model selection exists', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertCompositionText',
      data: '拼',
      isComposing: true,
      defaultPrevented: false,
      preventDefault,
    }
    const doc = {
      event: eventStub(),
      selection: {value: {start: {type: 'text'}}},
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')

    transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(transformer.compositionSession.updateAnchorFromInputEvent).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
  })

  it('does not retarget an active composition anchor from composing beforeInput target ranges', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertCompositionText',
      data: '拼',
      isComposing: true,
      defaultPrevented: false,
      getTargetRanges: () => [{}],
      preventDefault,
    }
    const doc = {
      event: eventStub(),
      selection: {value: {start: {type: 'text'}}},
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOnProperty(transformer.compositionSession, 'isActive', 'get').and.returnValue(true)
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')

    transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(transformer.compositionSession.updateAnchorFromInputEvent).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('replaces a model boundary selection from beforeInput', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer, selection, paragraph} = createBoundaryEditingHarness()
    const event = {
      target: null,
      inputType: 'insertText',
      data: 'x',
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')

    const result = transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith('callout-1', 0, 2, true)
    expect(doc.crud.insertBlocks).toHaveBeenCalledWith(
      'callout-1',
      0,
      [jasmine.objectContaining({id: 'new-p', children: [{insert: 'x'}]})],
    )
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(paragraph, 1)
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('replaces a mixed boundary-to-text model selection from beforeInput', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer, callout, paragraph} = createMixedBoundaryEditingHarness()
    const event = {
      target: null,
      inputType: 'insertText',
      data: 'x',
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')

    const result = transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(callout.id)
    expect(paragraph.replaceText).toHaveBeenCalledWith(0, 11, 'x', undefined)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: paragraph.id,
      type: 'text',
      index: 1,
      length: 0,
    })
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('replaces a mixed text-to-boundary model selection from beforeInput', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer, callout, paragraph} = createMixedTextBoundaryEditingHarness()
    const event = {
      target: null,
      inputType: 'insertText',
      data: 'x',
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')

    const result = transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: paragraph.id, type: 'text', offset: 11},
      head: {blockId: paragraph.id, type: 'text', offset: 11},
      commonParent: paragraph.id,
    })
    expect(paragraph.yText.delete).toHaveBeenCalledWith(11, 5)
    expect(paragraph.yText.insert).toHaveBeenCalledWith(11, 'x', undefined)
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(callout.id)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: paragraph.id,
      type: 'text',
      index: 12,
      length: 0,
    })
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('prevents compositionStart when no model selection can be recovered', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const next = jasmine.createSpy('next')
    const blur = jasmine.createSpy('blur')
    const doc = {
      event: eventStub(),
      selection: {value: null, blur},
    }
    const transformer = new InputTransformer(doc as any) as any

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: (type: string) => type === 'compositionState',
      get: () => ({selectionResult: {value: null, next}}),
    } as any)

    expect(result).toBeTrue()
    expect(next).toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
    expect(blur).toHaveBeenCalled()
  })

  it('recalculates and clears a stale model selection before starting composition', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const next = jasmine.createSpy('next')
    const staleBlock = {
      id: 'gone',
      flavour: 'table',
    }
    const staleSelection = new BlockSelection(
      {blockId: staleBlock.id, type: 'selected', block: staleBlock} as any,
      {blockId: staleBlock.id, type: 'selected', block: staleBlock} as any,
      staleBlock.id,
      () => staleBlock as any,
      () => 0,
    )
    const doc = {
      event: eventStub(),
      selection: {
        value: staleSelection,
        recalculate: jasmine.createSpy('recalculate').and.returnValue({value: null, next}),
        blur: jasmine.createSpy('blur'),
      },
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('Block not found: gone'),
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(doc.selection.recalculate).toHaveBeenCalledWith(false, {isComposing: true})
    expect(next).toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.blur).toHaveBeenCalled()
    expect(transformer.compositionSession.start).not.toHaveBeenCalled()
  })

  it('normalizes compositionState recalculate errors to a null selection result', () => {
    const doc = {
      selection: {
        recalculate: jasmine.createSpy('recalculate').and.throwError('normalize failed'),
      },
    }
    const state = new CompositionEventState(
      doc as any,
      new CompositionEvent('compositionstart', {data: '中'}),
    )

    expect(state.selectionResult.value).toBeNull()
    expect(state.selection).toBeNull()
    expect(() => state.getFallbackPoint()).not.toThrow()
  })

  it('aborts compositionStart when stale selection recovery throws', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const staleBlock = {
      id: 'gone',
      flavour: 'table',
    }
    const staleSelection = new BlockSelection(
      {blockId: staleBlock.id, type: 'selected', block: staleBlock} as any,
      {blockId: staleBlock.id, type: 'selected', block: staleBlock} as any,
      staleBlock.id,
      () => staleBlock as any,
      () => 0,
    )
    const doc = {
      event: eventStub(),
      selection: {
        value: staleSelection,
        recalculate: jasmine.createSpy('recalculate').and.throwError('normalize failed'),
        blur: jasmine.createSpy('blur'),
      },
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('Block not found: gone'),
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'start')
    spyOn(transformer.compositionSession, 'abortPendingCommit').and.callThrough()

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(doc.selection.recalculate).toHaveBeenCalledWith(false, {isComposing: true})
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.blur).toHaveBeenCalled()
    expect(transformer.compositionSession.abortPendingCommit).toHaveBeenCalled()
    expect(transformer.compositionSession.start).not.toHaveBeenCalled()
  })

  it('materializes an empty paragraph before starting composition on a boundary selection', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer, paragraph} = createBoundaryEditingHarness()
    doc.selection.recalculate.and.returnValue({value: null})
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith('callout-1', 0, 2, true)
    expect(doc.crud.insertBlocks).toHaveBeenCalledWith(
      'callout-1',
      0,
      [jasmine.objectContaining({id: 'new-p', children: []})],
    )
    expect(doc.selection.setCursorAtBlock).toHaveBeenCalledWith(paragraph.id, true)
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(paragraph, 0)
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('starts collapsed text composition from the model selection without recalculating', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const block = {
      id: 'p1',
      flavour: 'paragraph',
      textLength: 5,
    }
    const selection = new BlockSelection(
      {blockId: block.id, type: 'text', offset: 2, block} as any,
      {blockId: block.id, type: 'text', offset: 2, block} as any,
      block.id,
      () => block as any,
      () => 0,
    )
    const doc = {
      event: eventStub(),
      selection: {
        value: selection,
        recalculate: jasmine.createSpy('recalculate').and.returnValue({value: null}),
        blur: jasmine.createSpy('blur'),
      },
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.selection.recalculate).not.toHaveBeenCalled()
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(block, 2)
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('focuses the editor host and parks the DOM cursor before starting text composition', () => {
    const rootHost = document.createElement('div')
    const blockHost = document.createElement('p')
    const outside = document.createElement('button')
    rootHost.setAttribute('contenteditable', 'true')
    rootHost.appendChild(blockHost)
    document.body.append(rootHost, outside)
    outside.focus()
    const preventDefault = jasmine.createSpy('preventDefault')
    const block = {
      id: 'p1',
      flavour: 'paragraph',
      textLength: 5,
      hostElement: blockHost,
    }
    const selection = new BlockSelection(
      {blockId: block.id, type: 'text', offset: 2, block} as any,
      {blockId: block.id, type: 'text', offset: 2, block} as any,
      block.id,
      () => block as any,
      () => 0,
    )
    const doc = {
      event: eventStub(),
      root: {hostElement: rootHost},
      selection: {
        value: selection,
        setCursorAt: jasmine.createSpy('setCursorAt'),
        recalculate: jasmine.createSpy('recalculate').and.returnValue({value: null}),
        blur: jasmine.createSpy('blur'),
      },
      isEditable: jasmine.createSpy('isEditable').and.returnValue(true),
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(rootHost)
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(block as any, 2)
    expect(doc.selection.recalculate).not.toHaveBeenCalled()
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(block, 2)
    rootHost.remove()
    outside.remove()
  })

  it('materializes a selected-to-text IME range without blurring the composition target', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const selectedBlock = {
      id: 'callout-1',
      flavour: 'callout',
    }
    const textBlock = {
      id: 'paragraph-1',
      flavour: 'paragraph',
      textLength: 120,
      textDeltas: jasmine.createSpy('textDeltas'),
      replaceText: jasmine.createSpy('replaceText'),
    }
    const selection = new BlockSelection(
      {blockId: selectedBlock.id, type: 'selected', block: selectedBlock} as any,
      {blockId: textBlock.id, type: 'text', offset: 89, block: textBlock} as any,
      'root',
      id => id === selectedBlock.id ? selectedBlock as any : textBlock as any,
      () => Node.DOCUMENT_POSITION_FOLLOWING,
    )
    const captureSelectionBeforeChange = jasmine.createSpy('captureSelectionBeforeChange')
    const blur = jasmine.createSpy('blur')
    const replay = jasmine.createSpy('replay')
    const transact = jasmine.createSpy('transact').and.callFake((cb: () => void) => cb())
    const doc = {
      event: eventStub(),
      selection: {
        value: selection,
        blur,
        replay,
        setCursorAt: jasmine.createSpy('setCursorAt'),
      },
      crud: {
        undoManager: {captureSelectionBeforeChange},
        transact,
        deleteBlocks: jasmine.createSpy('deleteBlocks'),
        deleteBlockById: jasmine.createSpy('deleteBlockById'),
      },
      queryBlocksThroughPathDeeply: jasmine.createSpy('queryBlocksThroughPathDeeply').and.returnValue([
        {parent: 'root', index: 1, length: 1},
      ]),
      isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.flavour === 'paragraph'),
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(captureSelectionBeforeChange).toHaveBeenCalled()
    expect(replay).toHaveBeenCalledWith({
      anchor: {blockId: textBlock.id, type: 'text', offset: 0},
      head: {blockId: textBlock.id, type: 'text', offset: 0},
      commonParent: textBlock.id,
    })
    expect(blur).not.toHaveBeenCalled()
    expect((captureSelectionBeforeChange.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((replay.calls.mostRecent() as any).invocationOrder)
    expect((replay.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((transact.calls.mostRecent() as any).invocationOrder)
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith('root', 1, 1)
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(selectedBlock.id)
    expect(textBlock.replaceText).toHaveBeenCalledWith(0, 89, null, undefined)
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(textBlock as any, 0)
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(textBlock, 0)
  })

  it('materializes a cross-block text IME range across a container block', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const root = {id: 'root', flavour: 'root'}
    const upperText = {
      id: 'upper',
      flavour: 'paragraph',
      textLength: 5,
      textDeltas: jasmine.createSpy('upperTextDeltas').and.returnValue([{insert: 'UPPER'}]),
      yText: {
        length: 5,
        delete: jasmine.createSpy('upperDelete'),
        applyDelta: jasmine.createSpy('upperApplyDelta'),
      },
      rerender: jasmine.createSpy('upperRerender'),
    }
    const callout = {
      id: 'callout-1',
      flavour: 'callout',
    }
    const lowerText = {
      id: 'lower',
      flavour: 'paragraph',
      textLength: 16,
      textDeltas: jasmine.createSpy('lowerTextDeltas').and.returnValue([{insert: 'abcdefghijklmnop'}]),
      yText: {
        delete: jasmine.createSpy('lowerDelete'),
      },
    }
    const blocks: Record<string, any> = {
      root,
      upper: upperText,
      'callout-1': callout,
      lower: lowerText,
    }
    const selection = new BlockSelection(
      {blockId: lowerText.id, type: 'text', offset: 11, block: lowerText} as any,
      {blockId: upperText.id, type: 'text', offset: 0, block: upperText} as any,
      root.id,
      id => blocks[id],
      (a, b) => {
        const order = ['upper', 'callout-1', 'lower']
        return order.indexOf(a) < order.indexOf(b)
          ? Node.DOCUMENT_POSITION_FOLLOWING
          : Node.DOCUMENT_POSITION_PRECEDING
      },
    )
    const captureSelectionBeforeChange = jasmine.createSpy('captureSelectionBeforeChange')
    const replay = jasmine.createSpy('replay')
    const transact = jasmine.createSpy('transact').and.callFake((cb: () => void) => cb())
    const doc = {
      event: eventStub(),
      selection: {
        value: selection,
        blur: jasmine.createSpy('blur'),
        replay,
        setCursorAt: jasmine.createSpy('setCursorAt'),
      },
      crud: {
        undoManager: {captureSelectionBeforeChange},
        transact,
        deleteBlocks: jasmine.createSpy('deleteBlocks'),
        deleteBlockById: jasmine.createSpy('deleteBlockById'),
      },
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks[id]),
      isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.flavour === 'paragraph'),
      queryBlocksThroughPathDeeply: jasmine.createSpy('queryBlocksThroughPathDeeply').and.returnValue([
        {parent: root.id, index: 1, length: 1},
      ]),
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(captureSelectionBeforeChange).toHaveBeenCalled()
    expect(replay).toHaveBeenCalledWith({
      anchor: {blockId: upperText.id, type: 'text', offset: 0},
      head: {blockId: upperText.id, type: 'text', offset: 0},
      commonParent: upperText.id,
    })
    expect((captureSelectionBeforeChange.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((replay.calls.mostRecent() as any).invocationOrder)
    expect((replay.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((transact.calls.mostRecent() as any).invocationOrder)
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith(root.id, 1, 1)
    expect(upperText.yText.delete).toHaveBeenCalledWith(0, 5)
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(lowerText.id)
    expect(upperText.yText.applyDelta).toHaveBeenCalled()
    expect(upperText.rerender).toHaveBeenCalled()
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(upperText as any, 0)
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(upperText, 0)
  })

  it('materializes a mixed boundary-to-text IME range without blurring', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer, callout, paragraph} = createMixedBoundaryEditingHarness()
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(callout.id)
    expect(paragraph.replaceText).toHaveBeenCalledWith(0, 11, '', undefined)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: paragraph.id,
      type: 'text',
      index: 0,
      length: 0,
    })
    expect(doc.selection.blur).not.toHaveBeenCalled()
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(paragraph, 0)
  })

  it('materializes a mixed text-to-boundary IME range without blurring', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer, callout, paragraph} = createMixedTextBoundaryEditingHarness()
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: paragraph.id, type: 'text', offset: 11},
      head: {blockId: paragraph.id, type: 'text', offset: 11},
      commonParent: paragraph.id,
    })
    expect(paragraph.yText.delete).toHaveBeenCalledWith(11, 5)
    expect(paragraph.yText.insert).not.toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(callout.id)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: paragraph.id,
      type: 'text',
      index: 11,
      length: 0,
    })
    expect(doc.selection.blur).not.toHaveBeenCalled()
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(paragraph, 11)
  })

  it('ignores compositionEnd when compositionStart was not accepted', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const transformer = new InputTransformer({event: eventStub()} as any) as any

    transformer['_handleCompositionEnd']({
      getDefaultEvent: () => ({preventDefault}),
    } as any)

    expect(preventDefault).toHaveBeenCalled()
  })

  it('falls back to keydown insertion when selection starts with a selected block', () => {
    const selection = {
      collapsed: false,
      commonParent: 'root',
      start: {type: 'selected', blockId: 'void-1'},
      end: {type: 'text', blockId: 'paragraph-1', offset: 3}
    }
    const {doc, transformer} = createTransformer(selection)
    spyOn(transformer, '_replaceText')
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'a',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault
      })
    })

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(transformer['_replaceText']).toHaveBeenCalledWith(selection, 'a', true)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: 'paragraph-1',
      type: 'text',
      index: 1,
      length: 0
    })
  })

  // The `commonParent !== rootId` gate was intentionally removed in 551b10c
  // ("fix: 带selected选区2"), so the keydown fallback now fires for selected-start
  // ranges regardless of their common parent (e.g. inside columns).
  it('falls back on keydown for non-root selected block ranges', () => {
    const selection = {
      collapsed: false,
      commonParent: 'columns-1',
      start: {type: 'selected', blockId: 'image-1'},
      end: {type: 'text', blockId: 'paragraph-1', offset: 3}
    }
    const {doc, transformer} = createTransformer(selection)
    spyOn(transformer, '_replaceText')
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'a',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault
      })
    })

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(transformer['_replaceText']).toHaveBeenCalledWith(selection, 'a', true)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: 'paragraph-1',
      type: 'text',
      index: 1,
      length: 0
    })
  })

  it('falls back on keydown when a range ends with a selected block', () => {
    const selection = {
      collapsed: false,
      commonParent: 'root',
      start: {type: 'text', blockId: 'paragraph-1', offset: 2},
      end: {type: 'selected', blockId: 'image-1'}
    }
    const {doc, transformer} = createTransformer(selection)
    spyOn(transformer, '_replaceText')
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'a',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault
      })
    })

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(transformer['_replaceText']).toHaveBeenCalledWith(selection, 'a', true)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: 'paragraph-1',
      type: 'text',
      index: 3,
      length: 0
    })
  })
})

describe('InputTransformer typed-over-selection format inheritance', () => {
  // Builds a beforeInput context for a non-composing `insertText`.
  const makeContext = (data: string) => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertText',
      data,
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [{}],
      preventDefault
    }
    return {
      preventDefault,
      context: {get: () => ({event})} as any
    }
  }

  const createCrossColumnTextRangeHarness = (throughPath: any[] = []) => {
    const leftDelete = jasmine.createSpy('leftDelete')
    const leftInsert = jasmine.createSpy('leftInsert')
    const leftApplyDelta = jasmine.createSpy('leftApplyDelta')
    const rightDelete = jasmine.createSpy('rightDelete')
    const columns = setSelectionScope({id: 'columns-1', flavour: 'columns'}, 'columns')
    const leftColumn = {
      id: 'column-left',
      flavour: 'column',
      parentBlock: columns,
      parentId: columns.id,
      childrenIds: ['left-p', 'left-tail-a', 'left-tail-b'],
    }
    const middleColumn = {
      id: 'column-middle',
      flavour: 'column',
      parentBlock: columns,
      parentId: columns.id,
      childrenIds: ['middle-p'],
    }
    const rightColumn = {
      id: 'column-right',
      flavour: 'column',
      parentBlock: columns,
      parentId: columns.id,
      childrenIds: ['right-prefix', 'right-p'],
    }
    const leftBlock = {
      id: 'left-p',
      blockId: 'left-p',
      flavour: 'paragraph',
      textLength: 8,
      parentBlock: leftColumn,
      parentId: leftColumn.id,
      textDeltas: () => [{insert: 'ABCDEFGH'}],
      yText: {insert: leftInsert, delete: leftDelete, length: 8},
      applyDeltaOperations: leftApplyDelta,
    }
    const rightBlock = {
      id: 'right-p',
      blockId: 'right-p',
      flavour: 'paragraph',
      textLength: 10,
      parentBlock: rightColumn,
      parentId: rightColumn.id,
      textDeltas: () => [{insert: '0123456789'}],
      yText: {delete: rightDelete},
    }
    const blocks: Record<string, any> = {
      'columns-1': columns,
      'column-left': leftColumn,
      'column-middle': middleColumn,
      'column-right': rightColumn,
      'left-p': leftBlock,
      'left-tail-a': {id: 'left-tail-a', flavour: 'paragraph'},
      'left-tail-b': {id: 'left-tail-b', flavour: 'paragraph'},
      'middle-p': {id: 'middle-p', flavour: 'paragraph'},
      'right-prefix': {id: 'right-prefix', flavour: 'paragraph'},
      'right-p': rightBlock,
    }
    const order = ['left-p', 'left-tail-a', 'left-tail-b', 'column-middle', 'right-prefix', 'right-p']
    const selection = new BlockSelection(
      {blockId: leftBlock.id, type: 'text', offset: 3, block: leftBlock} as any,
      {blockId: rightBlock.id, type: 'text', offset: 4, block: rightBlock} as any,
      columns.id,
      id => blocks[id],
      (a, b) => {
        const aIndex = order.indexOf(a)
        const bIndex = order.indexOf(b)
        if (aIndex < bIndex) return Node.DOCUMENT_POSITION_FOLLOWING
        if (aIndex > bIndex) return Node.DOCUMENT_POSITION_PRECEDING
        return 0
      },
    )
    const captureSelectionBeforeChange = jasmine.createSpy('captureSelectionBeforeChange')
    const transact = jasmine.createSpy('transact').and.callFake((cb: () => void) => cb())
    const doc = {
      event: eventStub(),
      selection: {
        value: selection,
        replay: jasmine.createSpy('replay'),
        setCursorAt: jasmine.createSpy('setCursorAt'),
        blur: jasmine.createSpy('blur'),
      },
      crud: {
        undoManager: {
          captureSelectionBeforeChange,
          beginCaptureGroup: jasmine.createSpy('beginCaptureGroup'),
          endCaptureGroup: jasmine.createSpy('endCaptureGroup'),
        },
        transact,
        deleteBlocks: jasmine.createSpy('deleteBlocks'),
        deleteBlockById: jasmine.createSpy('deleteBlockById'),
      },
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks[id]),
      isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.flavour === 'paragraph'),
      queryBlocksThroughPathDeeply: jasmine.createSpy('queryBlocksThroughPathDeeply').and.returnValue(throughPath),
    }
    return {
      doc,
      transformer: new InputTransformer(doc as any) as any,
      selection,
      leftBlock,
      rightBlock,
      leftDelete,
      leftInsert,
      leftApplyDelta,
      rightDelete,
      captureSelectionBeforeChange,
      transact,
    }
  }

  it('_inheritedReplaceAttrs returns common attrs of a uniformly formatted range', () => {
    const transformer = new InputTransformer({event: eventStub()} as any) as any
    const block = {
      textDeltas: () => [{insert: 'ABCDE', attributes: {'a:bold': true}}]
    }
    // select "BC" in the middle of the bold run
    expect(transformer['_inheritedReplaceAttrs'](block, 1, 2)).toEqual({'a:bold': true})
  })

  it('_inheritedReplaceAttrs returns undefined for mixed or empty ranges', () => {
    const transformer = new InputTransformer({event: eventStub()} as any) as any
    const block = {
      textDeltas: () => [
        {insert: 'A', attributes: {'a:bold': true}},
        {insert: 'B'}
      ]
    }
    // mixed (bold + plain) => no common attrs
    expect(transformer['_inheritedReplaceAttrs'](block, 0, 2)).toBeUndefined()
    // zero-length range => nothing to inherit
    expect(transformer['_inheritedReplaceAttrs'](block, 0, 0)).toBeUndefined()
    // single bold char => inherits bold
    expect(transformer['_inheritedReplaceAttrs'](block, 0, 1)).toEqual({'a:bold': true})
  })

  it('carries the selected range format when typing over a same-block range', () => {
    const replaceText = jasmine.createSpy('replaceText')
    const block = {
      textDeltas: () => [{insert: 'ABCDE', attributes: {'a:bold': true}}],
      replaceText
    }
    const from = {type: 'text', index: 1, length: 2, block}
    const range = {from, to: null, collapsed: false}

    const setSelection = jasmine.createSpy('setSelection')
    const doc = {
      event: eventStub(),
      selection: {
        value: {start: {type: 'text'}, end: {type: 'text'}},
        setSelection,
        normalizeRange: () => range
      },
      crud: {undoManager: {captureSelectionBeforeChange: jasmine.createSpy('cap')}}
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')
    spyOn(transformer, '_resolveBeforeInputRange').and.returnValue(range)

    const {context} = makeContext('X')
    transformer['_handleBeforeInput'](context)

    expect(replaceText).toHaveBeenCalledWith(1, 2, 'X', {'a:bold': true})
    expect(setSelection).toHaveBeenCalledWith({...from, index: 2, length: 0})
  })

  it('carries the from-block range format when typing over a cross-block range', () => {
    const insert = jasmine.createSpy('insert')
    const del = jasmine.createSpy('delete')
    const fromBlock = {
      blockId: 'b1',
      textDeltas: () => [{insert: 'HELLO', attributes: {'a:italic': true}}],
      yText: {insert, delete: del, length: 5}
    }
    const toBlock = {
      blockId: 'b2',
      textLength: 3,
      textDeltas: () => [{insert: 'XYZ'}],
      yText: {insert: jasmine.createSpy('toInsert'), delete: jasmine.createSpy('toDelete')}
    }
    // select from index 2 to end of the italic from-block, through to end of to-block
    const from = {type: 'text', index: 2, length: 3, block: fromBlock, blockId: 'b1'}
    const to = {type: 'text', index: 0, length: 3, block: toBlock, blockId: 'b2'}
    const range = {from, to, collapsed: false}

    const doc = {
      event: eventStub(),
      crud: {
        undoManager: {captureSelectionBeforeChange: jasmine.createSpy('cap')},
        transact: (cb: () => void) => cb(),
        deleteBlockById: jasmine.createSpy('deleteBlockById')
      },
      queryBlocksThroughPathDeeply: () => []
    }
    const transformer = new InputTransformer(doc as any) as any
    transformer['_replaceText'](range, 'Z', true)

    expect(del).toHaveBeenCalledWith(2, 3)
    expect(insert).toHaveBeenCalledWith(2, 'Z', {'a:italic': true})
  })

  it('does not append the end block tail when replacing a cross-column text range', () => {
    const {
      doc,
      transformer,
      selection,
      leftDelete,
      leftInsert,
      leftApplyDelta,
      rightDelete,
    } = createCrossColumnTextRangeHarness()

    transformer['_replaceText'](selection, 'Z', true)

    expect(leftDelete).toHaveBeenCalledWith(3, 5)
    expect(leftInsert).toHaveBeenCalledWith(3, 'Z', undefined)
    expect(rightDelete).toHaveBeenCalledWith(0, 4)
    expect(leftApplyDelta).not.toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).not.toHaveBeenCalled()
  })

  it('deletes covered structural groups when replacing a cross-column text range', () => {
    const throughPath = [
      {parent: 'column-left', index: 1, length: 2},
      {parent: 'column-right', index: 0, length: 1},
      {parent: 'columns-1', index: 1, length: 1},
    ]
    const {
      doc,
      transformer,
      selection,
      leftBlock,
      rightBlock,
      captureSelectionBeforeChange,
      transact,
    } = createCrossColumnTextRangeHarness(throughPath)

    transformer['_replaceText'](selection, 'Z', true)

    expect(doc.queryBlocksThroughPathDeeply).toHaveBeenCalledWith(leftBlock, rightBlock)
    expect(doc.crud.deleteBlocks.calls.allArgs()).toEqual([
      ['column-left', 1, 2],
      ['column-right', 0, 1],
      ['columns-1', 1, 1],
    ])
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: leftBlock.id, type: 'text', offset: 3},
      head: {blockId: leftBlock.id, type: 'text', offset: 3},
      commonParent: leftBlock.id,
    })
    expect(captureSelectionBeforeChange).toHaveBeenCalled()
    expect((captureSelectionBeforeChange.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((doc.selection.replay.calls.mostRecent() as any).invocationOrder)
    expect((doc.selection.replay.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((transact.calls.mostRecent() as any).invocationOrder)
  })

  it('starts cross-column text IME without merging the end block tail', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer, selection, leftBlock} = createCrossColumnTextRangeHarness()
    spyOn(transformer, '_replaceText')
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.beginCaptureGroup).toHaveBeenCalled()
    expect(transformer['_replaceText']).toHaveBeenCalledWith(selection, null, false)
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(leftBlock, 3)
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(leftBlock, 3)
  })
})

describe('InputTransformer table-cell selection editing', () => {
  const makeBeforeInputContext = (event: any) => ({
    get: () => ({event}),
  }) as any

  it('replaces a table-cell selection with typed text in the anchor cell', () => {
    const harness = createTableCellEditingHarness()
    const {doc, transformer} = harness
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertText',
      data: '你',
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }

    const result = transformer['_handleBeforeInput'](makeBeforeInputContext(event))
    const anchorParagraph = harness.anchorParagraph

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledTimes(4)
    expect(doc.crud.insertBlocks).toHaveBeenCalledTimes(4)
    expect(anchorParagraph.textContent()).toBe('你')
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: anchorParagraph.id,
      type: 'text',
      offset: 1,
    })
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('aborts table-cell typing when a model endpoint is stale', () => {
    const {doc, transformer} = createTableCellEditingHarness(undefined, {
      missingBlocks: ['cell-1'],
    })
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertText',
      data: '你',
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }

    const result = transformer['_handleBeforeInput'](makeBeforeInputContext(event))

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).not.toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).not.toHaveBeenCalled()
    expect(doc.crud.insertBlocks).not.toHaveBeenCalled()
    expect(doc.selection.blur).toHaveBeenCalled()
  })

  it('clears a table-cell selection for delete beforeInput and keeps the rectangle selected', () => {
    const {doc, transformer, table, cells} = createTableCellEditingHarness()
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'deleteContentBackward',
      data: null,
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }

    const result = transformer['_handleBeforeInput'](makeBeforeInputContext(event))

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledTimes(4)
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(table, cells[0], cells[3])
    expect(doc.selection.setSelection).not.toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('aborts table-cell delete beforeInput when a model endpoint is stale', () => {
    const {doc, transformer} = createTableCellEditingHarness(undefined, {
      missingBlocks: ['cell-4'],
    })
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'deleteContentBackward',
      data: null,
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }

    const result = transformer['_handleBeforeInput'](makeBeforeInputContext(event))

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).not.toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).not.toHaveBeenCalled()
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled()
    expect(doc.selection.blur).toHaveBeenCalled()
  })

  it('materializes the anchor cell before starting IME composition', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const harness = createTableCellEditingHarness()
    const {doc, transformer} = harness
    doc.selection.recalculate.and.returnValue({value: null})
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)
    const anchorParagraph = harness.anchorParagraph

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledTimes(4)
    expect(doc.selection.setCursorAtBlock).toHaveBeenCalledWith(anchorParagraph.id, true)
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(anchorParagraph, 0)
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('aborts table-cell IME composition when a model endpoint is stale', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const {doc, transformer} = createTableCellEditingHarness(undefined, {
      missingBlocks: ['cell-1'],
    })
    spyOn(transformer.compositionSession, 'start')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).not.toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).not.toHaveBeenCalled()
    expect(doc.selection.blur).toHaveBeenCalled()
    expect(transformer.compositionSession.start).not.toHaveBeenCalled()
  })

  it('replaces a table-cell selection from printable keydown fallback', () => {
    const harness = createTableCellEditingHarness()
    const {doc, transformer} = harness
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'a',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault,
      }),
    } as any)
    const anchorParagraph = harness.anchorParagraph

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(anchorParagraph.textContent()).toBe('a')
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: anchorParagraph.id,
      type: 'text',
      offset: 1,
    })
    expect(doc.selection.recalculate).toHaveBeenCalled()
  })

  it('replaces a collapsed single-cell selection from printable keydown fallback', () => {
    const harness = createTableCellEditingHarness({anchor: 'cell-1', head: 'cell-1'})
    const {doc, transformer} = harness
    const preventDefault = jasmine.createSpy('preventDefault')

    expect(doc.selection.value.collapsed).toBeTrue()

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'b',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault,
      }),
    } as any)
    const anchorParagraph = harness.anchorParagraph

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledTimes(1)
    expect(anchorParagraph.textContent()).toBe('b')
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: anchorParagraph.id,
      type: 'text',
      offset: 1,
    })
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('Enter clears selected cells and places the caret in the anchor cell', async () => {
    const harness = createTableCellEditingHarness()
    const {doc, transformer, selection} = harness
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = await transformer['_handlerEnter']({
      preventDefault,
      get: () => ({selection, raw: {ctrlKey: false, shiftKey: false}}),
    } as any)
    const anchorParagraph = harness.anchorParagraph

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledTimes(4)
    expect(doc.selection.setCursorAtBlock).toHaveBeenCalledWith(anchorParagraph.id, true)
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })
})

describe('InputTransformer whole-table block selection editing', () => {
  const makeBeforeInputContext = (event: any) => ({
    get: () => ({event}),
  }) as any

  it('replaces a selected table block with a paragraph when typing', () => {
    const {doc, transformer, table, paragraph} = createWholeTableSelectionHarness()
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertText',
      data: 'x',
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }

    const result = transformer['_handleBeforeInput'](makeBeforeInputContext(event))

    expect(result).toBeUndefined()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.schemas.createSnapshot).toHaveBeenCalledWith('paragraph', ['x'])
    expect(doc.crud.insertBlocksAfter).toHaveBeenCalledWith(table.id, [paragraph])
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(table.id)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: paragraph.id,
      type: 'text',
      offset: 1,
    })
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.setCursorAtBlock).not.toHaveBeenCalled()
    expect(table.confirmSelection).not.toHaveBeenCalled()
    expect(table.getCellsMatrixByCoordinates).not.toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('replaces a selected table block from printable keydown fallback without losing the text cursor', () => {
    const {doc, transformer, table, paragraph} = createWholeTableSelectionHarness()
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'y',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault,
      }),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.schemas.createSnapshot).toHaveBeenCalledWith('paragraph', ['y'])
    expect(doc.crud.insertBlocksAfter).toHaveBeenCalledWith(table.id, [paragraph])
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(table.id)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: paragraph.id,
      type: 'text',
      offset: 1,
    })
    expect(doc.selection.recalculate).toHaveBeenCalled()
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })

  it('keeps selected-block IME materialization and commit in one undo capture group', () => {
    const {doc, transformer, table, paragraph} = createWholeTableSelectionHarness()
    const preventDefault = jasmine.createSpy('preventDefault')
    const commitPoint = {block: paragraph, index: 0}
    const compositionState = {
      text: '中',
      getFallbackPoint: jasmine.createSpy('getFallbackPoint').and.throwError('fallback should not be read'),
      resolveCommitPoint: jasmine.createSpy('resolveCommitPoint').and.returnValue(commitPoint),
    }
    spyOn(transformer.compositionSession, 'start')
    spyOnProperty(transformer.compositionSession, 'isIdle', 'get').and.returnValue(false)
    spyOn(transformer.compositionSession, 'resolveInsertionPoint').and.returnValue(commitPoint as any)
    spyOn(transformer.compositionSession, 'drainDeferredPatches').and.returnValue([])

    const started = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(started).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.beginCaptureGroup).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect((doc.crud.undoManager.beginCaptureGroup.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((doc.crud.undoManager.captureSelectionBeforeChange.calls.first() as any).invocationOrder)
    expect(doc.crud.insertBlocksAfter).toHaveBeenCalledWith(table.id, [paragraph])
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(table.id)
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(paragraph, 0)
    expect(doc.crud.undoManager.endCaptureGroup).not.toHaveBeenCalled()

    transformer['_handleCompositionEnd']({
      getDefaultEvent: () => ({preventDefault: jasmine.createSpy('compositionEndPreventDefault')}),
      get: () => compositionState,
    } as any)

    expect(transformer.compositionSession.resolveInsertionPoint).toHaveBeenCalledWith(null)
    expect(compositionState.getFallbackPoint).not.toHaveBeenCalled()
    expect(compositionState.resolveCommitPoint).toHaveBeenCalledWith(commitPoint)
    expect(paragraph.yText.insert).toHaveBeenCalledWith(0, '中', undefined)
    expect(paragraph.rerender).toHaveBeenCalled()
    expect(doc.crud.undoManager.endCaptureGroup).toHaveBeenCalled()
    expect((doc.crud.undoManager.captureSelectionBeforeChange.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((doc.crud.undoManager.endCaptureGroup.calls.mostRecent() as any).invocationOrder)
  })

  it('deletes a selected table block instead of clearing cells', () => {
    const {doc, transformer, table, selection} = createWholeTableSelectionHarness()
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'deleteContentBackward',
      data: null,
      isComposing: false,
      defaultPrevented: false,
      getTargetRanges: () => [],
      preventDefault,
    }

    const result = transformer['_handleBeforeInput'](makeBeforeInputContext(event))

    expect(result).toBeUndefined()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.yDoc.transact).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledWith(table.id)
    expect(doc.crud.insertBlocksAfter).not.toHaveBeenCalled()
    expect(doc.selection.normalizeRange).not.toHaveBeenCalled()
    expect(table.confirmSelection).not.toHaveBeenCalled()
    expect(table.getCellsMatrixByCoordinates).not.toHaveBeenCalled()
    expect(selection.getTableCellSelection()).toBeNull()
  })
})

describe('InputTransformer block-selection paragraph host resolution', () => {
  // Schema lookup driven by a per-flavour map: renderUnit flag + whether the
  // flavour accepts a paragraph child. Mirrors the two schema reads in
  // _resolveBlockSelectionHost.
  const makeDoc = (
    schemaMap: Record<string, { renderUnit?: boolean; acceptsParagraph?: boolean }>,
  ) => ({
    event: eventStub(),
    schemas: {
      get: (flavour: string) =>
        schemaMap[flavour]
          ? {metadata: {renderUnit: !!schemaMap[flavour].renderUnit}}
          : undefined,
      isValidChildren: (_child: string, parentFlavour: string) =>
        !!schemaMap[parentFlavour]?.acceptsParagraph,
    },
  })
  const mkBlock = (flavour: string, id: string, parentBlock: any = null) => ({
    flavour,
    id,
    parentBlock,
  })

  it('routes a block-selected table-cell to inside-mode (parent row cannot host a paragraph)', () => {
    const doc = makeDoc({
      'table-cell': {renderUnit: true, acceptsParagraph: true},
      'table-row': {renderUnit: false, acceptsParagraph: false},
    })
    const cell = mkBlock('table-cell', 'cell-1', mkBlock('table-row', 'row-1'))
    const transformer = new InputTransformer(doc as any) as any
    expect(transformer['_resolveBlockSelectionHost'](cell)).toEqual({host: cell, mode: 'inside'})
  })

  it('routes a block-selected column to inside-mode (parent columns cannot host a paragraph)', () => {
    const doc = makeDoc({
      column: {renderUnit: true, acceptsParagraph: true},
      columns: {renderUnit: false, acceptsParagraph: false},
    })
    const column = mkBlock('column', 'column-1', mkBlock('columns', 'columns-1'))
    const transformer = new InputTransformer(doc as any) as any
    expect(transformer['_resolveBlockSelectionHost'](column)).toEqual({host: column, mode: 'inside'})
  })

  it('keeps a block-selected callout on sibling-mode (parent can host a paragraph)', () => {
    const doc = makeDoc({
      callout: {renderUnit: true, acceptsParagraph: true},
      root: {renderUnit: true, acceptsParagraph: true},
    })
    const root = mkBlock('root', 'root')
    const callout = mkBlock('callout', 'callout-1', root)
    const transformer = new InputTransformer(doc as any) as any
    expect(transformer['_resolveBlockSelectionHost'](callout)).toEqual({host: root, mode: 'sibling'})
  })

  it('routes a block-selected paragraph inside a cell to sibling-mode', () => {
    const doc = makeDoc({
      paragraph: {renderUnit: false, acceptsParagraph: false},
      'table-cell': {renderUnit: true, acceptsParagraph: true},
    })
    const cell = mkBlock('table-cell', 'cell-1')
    const paragraph = mkBlock('paragraph', 'p-1', cell)
    const transformer = new InputTransformer(doc as any) as any
    expect(transformer['_resolveBlockSelectionHost'](paragraph)).toEqual({host: cell, mode: 'sibling'})
  })

  it('returns null when neither the block nor its parent can host a paragraph', () => {
    const doc = makeDoc({
      divider: {renderUnit: false, acceptsParagraph: false},
      'table-row': {renderUnit: false, acceptsParagraph: false},
    })
    const divider = mkBlock('divider', 'divider-1', mkBlock('table-row', 'row-1'))
    const transformer = new InputTransformer(doc as any) as any
    expect(transformer['_resolveBlockSelectionHost'](divider)).toBeNull()
  })
})

describe('InputTransformer composition selection safety', () => {
  it('aborts compositionStart when the current selection points at a missing block', () => {
    const staleSelection = {
      start: {blockId: 'missing-block', type: 'selected'},
      end: {blockId: 'missing-block', type: 'selected'},
      anchor: {blockId: 'missing-block', type: 'selected'},
      head: {blockId: 'missing-block', type: 'selected'},
      commonParent: 'root',
      get firstBlock() {
        throw new Error('Block not found')
      },
    }
    const next = jasmine.createSpy('next')
    const doc = {
      event: eventStub(),
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('Block not found'),
      queryBlocksBetween: jasmine.createSpy('queryBlocksBetween'),
      selection: {
        value: staleSelection,
        recalculate: jasmine.createSpy('recalculate').and.returnValue({value: null, next}),
        blur: jasmine.createSpy('blur'),
      },
    }
    const transformer = new InputTransformer(doc as any) as any
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(doc.selection.recalculate).toHaveBeenCalledWith(false, {isComposing: true})
    expect(next).toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.selection.blur).toHaveBeenCalled()
    expect(transformer.compositionSession.consumeAbort()).toBeTrue()
  })

  it('consumes compositionEnd after an aborted compositionStart without reading compositionState', () => {
    const transformer = new InputTransformer({event: eventStub()} as any) as any
    transformer.compositionSession.abortPendingCommit()
    const preventDefault = jasmine.createSpy('preventDefault')
    const get = jasmine.createSpy('get').and.throwError('compositionState should not be read')

    const result = transformer['_handleCompositionEnd']({
      getDefaultEvent: () => ({preventDefault}),
      get,
    } as any)

    expect(result).toBeUndefined()
    expect(preventDefault).toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(transformer.compositionSession.consumeAbort()).toBeFalse()
  })

  it('commits compositionEnd from the session anchor without reading the DOM fallback', () => {
    const preventDefault = jasmine.createSpy('preventDefault')
    const insert = jasmine.createSpy('insert')
    const rerender = jasmine.createSpy('rerender')
    const setInlineRange = jasmine.createSpy('setInlineRange')
    const captureSelectionBeforeChange = jasmine.createSpy('captureSelectionBeforeChange')
    const replay = jasmine.createSpy('replay')
    const block = {
      id: 'p1',
      yText: {insert},
      rerender,
      setInlineRange,
    }
    const anchorPoint = {block, index: 2}
    const compositionState = {
      text: '中',
      getFallbackPoint: jasmine.createSpy('getFallbackPoint').and.throwError('fallback should not be read'),
      resolveCommitPoint: jasmine.createSpy('resolveCommitPoint').and.returnValue(anchorPoint),
    }
    const doc = {
      event: eventStub(),
      crud: {
        undoManager: {captureSelectionBeforeChange},
        transact: jasmine.createSpy('transact').and.callFake((cb: () => void) => cb()),
      },
      selection: {
        replay,
        recalculate: jasmine.createSpy('recalculate'),
      },
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOnProperty(transformer.compositionSession, 'isIdle', 'get').and.returnValue(false)
    spyOn(transformer.compositionSession, 'resolveInsertionPoint').and.returnValue(anchorPoint as any)
    spyOn(transformer.compositionSession, 'drainDeferredPatches').and.returnValue([])

    transformer['_handleCompositionEnd']({
      getDefaultEvent: () => ({preventDefault}),
      get: () => compositionState,
    } as any)

    expect(preventDefault).toHaveBeenCalled()
    expect(transformer.compositionSession.resolveInsertionPoint).toHaveBeenCalledWith(null)
    expect(compositionState.getFallbackPoint).not.toHaveBeenCalled()
    expect(compositionState.resolveCommitPoint).toHaveBeenCalledWith(anchorPoint)
    expect(replay).toHaveBeenCalledWith({
      anchor: {blockId: block.id, type: 'text', offset: 2},
      head: {blockId: block.id, type: 'text', offset: 2},
      commonParent: block.id,
    })
    expect(captureSelectionBeforeChange).toHaveBeenCalled()
    expect((replay.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((captureSelectionBeforeChange.calls.mostRecent() as any).invocationOrder)
    expect((captureSelectionBeforeChange.calls.mostRecent() as any).invocationOrder)
      .toBeLessThan((doc.crud.transact.calls.mostRecent() as any).invocationOrder)
    expect(insert).toHaveBeenCalledWith(2, '中', undefined)
    expect(rerender).toHaveBeenCalled()
    expect(setInlineRange).toHaveBeenCalledWith(3)
    expect(doc.selection.recalculate).toHaveBeenCalled()
  })

  it('refocuses and reapplies the committed IME cursor if the browser drops focus', () => {
    const rootHost = document.createElement('div')
    const blockHost = document.createElement('p')
    const outside = document.createElement('button')
    rootHost.setAttribute('contenteditable', 'true')
    rootHost.appendChild(blockHost)
    document.body.append(rootHost, outside)
    const preventDefault = jasmine.createSpy('preventDefault')
    const insert = jasmine.createSpy('insert')
    const rerender = jasmine.createSpy('rerender')
    const captureSelectionBeforeChange = jasmine.createSpy('captureSelectionBeforeChange')
    const setInlineRange = jasmine.createSpy('setInlineRange').and.callFake(() => {
      if (setInlineRange.calls.count() === 1) outside.focus()
    })
    const block = {
      id: 'p1',
      hostElement: blockHost,
      textLength: 3,
      yText: {insert},
      rerender,
      setInlineRange,
    }
    const anchorPoint = {block, index: 2}
    const compositionState = {
      text: '中',
      getFallbackPoint: jasmine.createSpy('getFallbackPoint').and.throwError('fallback should not be read'),
      resolveCommitPoint: jasmine.createSpy('resolveCommitPoint').and.returnValue(anchorPoint),
    }
    const doc = {
      event: eventStub(),
      root: {hostElement: rootHost},
      crud: {
        undoManager: {captureSelectionBeforeChange},
        transact: jasmine.createSpy('transact').and.callFake((cb: () => void) => cb()),
      },
      selection: {
        replay: jasmine.createSpy('replay'),
        recalculate: jasmine.createSpy('recalculate'),
      },
    }
    const transformer = new InputTransformer(doc as any) as any
    spyOnProperty(transformer.compositionSession, 'isIdle', 'get').and.returnValue(false)
    spyOn(transformer.compositionSession, 'resolveInsertionPoint').and.returnValue(anchorPoint as any)
    spyOn(transformer.compositionSession, 'drainDeferredPatches').and.returnValue([])

    transformer['_handleCompositionEnd']({
      getDefaultEvent: () => ({preventDefault}),
      get: () => compositionState,
    } as any)

    expect(preventDefault).toHaveBeenCalled()
    expect(captureSelectionBeforeChange).toHaveBeenCalled()
    expect(setInlineRange).toHaveBeenCalledTimes(2)
    expect(setInlineRange).toHaveBeenCalledWith(3)
    expect(document.activeElement).toBe(rootHost)
    expect(doc.selection.recalculate).toHaveBeenCalled()
    rootHost.remove()
    outside.remove()
  })

  it('returns a null composition fallback point when the recalculated selection is stale', () => {
    const selection = {
      start: {type: 'text', offset: 2},
      get firstBlock() {
        throw new Error('Block not found')
      },
    }
    const doc = {
      selection: {
        recalculate: jasmine.createSpy('recalculate').and.returnValue({value: selection}),
      },
      inputManger: {
        compositionSession: {
          prepareCommit: jasmine.createSpy('prepareCommit').and.returnValue(null),
        },
      },
    }
    const state = new CompositionEventState(doc as any, {data: '中'} as CompositionEvent)

    expect(state.getFallbackPoint()).toBeNull()
  })
})

describe('InputTransformer._insertParagraphAtGap', () => {
  const createTestDoc = (indexOfParent: number) => {
    const mockVoidBlock = {
      id: 'void-1',
      parentId: 'parent-1',
      getIndexOfParent: jasmine.createSpy('getIndexOfParent').and.returnValue(indexOfParent),
      nodeType: 'void',
    }
    const mockNewParagraph = {id: 'paragraph-new', textLength: 0}
    const doc = {
      event: eventStub(),
      selection: {
        value: null,
        blur: jasmine.createSpy('blur'),
        setCursorAt: jasmine.createSpy('setCursorAt'),
      },
      isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.id === mockNewParagraph.id),
      crud: {
        insertNewParagraph: jasmine.createSpy('insertNewParagraph').and.returnValue(mockNewParagraph),
        deleteBlockById: jasmine.createSpy('deleteBlockById'),
      },
    }
    return {doc, mockVoidBlock, mockNewParagraph}
  }

  const makeGap = (side: 'before' | 'after', block: any) => ({
    blockId: 'void-1',
    type: 'gap' as const,
    side,
    block,
  })

  it('inserts paragraph BEFORE the void at the block index when side=before', () => {
    const {doc, mockVoidBlock} = createTestDoc(2)
    const transformer = new InputTransformer(doc as any) as any

    transformer['_insertParagraphAtGap'](makeGap('before', mockVoidBlock), 'hello')

    // before => index unchanged (= getIndexOfParent())
    expect(doc.crud.insertNewParagraph).toHaveBeenCalledWith('parent-1', 2, [{insert: 'hello'}])
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(
      doc.crud.insertNewParagraph.calls.mostRecent().returnValue,
      5,
    )
  })

  it('inserts paragraph AFTER the void at index+1 when side=after', () => {
    const {doc, mockVoidBlock} = createTestDoc(2)
    const transformer = new InputTransformer(doc as any) as any

    transformer['_insertParagraphAtGap'](makeGap('after', mockVoidBlock), 'world')

    // after => index + 1
    expect(doc.crud.insertNewParagraph).toHaveBeenCalledWith('parent-1', 3, [{insert: 'world'}])
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(
      doc.crud.insertNewParagraph.calls.mostRecent().returnValue,
      5,
    )
  })

  it('inserts an empty paragraph (empty op) and places the caret at 0 for empty text', () => {
    const {doc, mockVoidBlock} = createTestDoc(0)
    const transformer = new InputTransformer(doc as any) as any

    transformer['_insertParagraphAtGap'](makeGap('before', mockVoidBlock), '')

    expect(doc.crud.insertNewParagraph).toHaveBeenCalledWith('parent-1', 0, [])
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(
      doc.crud.insertNewParagraph.calls.mostRecent().returnValue,
      0,
    )
  })

  it('keeps the original void block — never calls deleteBlockById', () => {
    const {doc, mockVoidBlock} = createTestDoc(1)
    const transformer = new InputTransformer(doc as any) as any

    transformer['_insertParagraphAtGap'](makeGap('after', mockVoidBlock), 'x')

    // after => getIndexOfParent() (=1) + 1 = 2
    expect(doc.crud.insertNewParagraph).toHaveBeenCalledWith('parent-1', 2, [{insert: 'x'}])
    expect(doc.crud.deleteBlockById).not.toHaveBeenCalled()
  })

  it('does not materialize a gap paragraph from printable keydown', () => {
    const {doc, mockVoidBlock} = createTestDoc(1)
    const selection = {
      collapsed: true,
      start: makeGap('after', mockVoidBlock),
    }
    ;(doc.selection as any).value = selection
    const transformer = new InputTransformer(doc as any) as any
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'n',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault,
      }),
    })

    expect(result).toBeUndefined()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(doc.crud.insertNewParagraph).not.toHaveBeenCalled()
  })

  it('still materializes a gap paragraph from non-composing beforeinput', () => {
    const {doc, mockVoidBlock} = createTestDoc(1)
    const selection = {
      collapsed: true,
      start: makeGap('after', mockVoidBlock),
    }
    ;(doc.selection as any).value = selection
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent')
    const preventDefault = jasmine.createSpy('preventDefault')
    const event = {
      target: null,
      inputType: 'insertText',
      data: 'a',
      isComposing: false,
      defaultPrevented: false,
      preventDefault,
    }

    transformer['_handleBeforeInput']({
      get: () => ({event}),
    } as any)

    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.insertNewParagraph).toHaveBeenCalledWith('parent-1', 2, [{insert: 'a'}])
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(
      doc.crud.insertNewParagraph.calls.mostRecent().returnValue,
      1,
    )
  })

  it('starts gap IME composition from the materialized paragraph without recalculating', () => {
    const {doc, mockVoidBlock, mockNewParagraph} = createTestDoc(1)
    const selection = {
      collapsed: true,
      start: makeGap('after', mockVoidBlock),
    }
    ;(doc.selection as any).value = selection
    ;(doc.selection as any).recalculate = jasmine.createSpy('recalculate').and.returnValue({value: null})
    const transformer = new InputTransformer(doc as any) as any
    spyOn(transformer.compositionSession, 'start')
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleCompositionStart']({
      preventDefault,
      has: () => false,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.insertNewParagraph).toHaveBeenCalledWith('parent-1', 2, [])
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(mockNewParagraph, 0)
    expect(transformer.compositionSession.start).toHaveBeenCalledWith(mockNewParagraph, 0)
    expect(doc.selection.blur).not.toHaveBeenCalled()
    expect((doc.selection as any).recalculate).not.toHaveBeenCalled()
  })
})

describe('InputTransformer boundary selection editing', () => {
  it('Backspace deletes covered boundary children and moves selection to the next child', () => {
    const {doc, transformer, selection, host} = createBoundaryEditingHarness(['p1', 'p2', 'p3'])
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleBackspace']({
      preventDefault,
      get: () => ({selection}),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith('callout-1', 0, 2)
    expect(host.childrenIds).toEqual(['p3'])
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(
      jasmine.objectContaining({id: 'p3'}),
      true,
    )
  })

  it('Delete deletes covered boundary children and moves selection to the previous child at the end', () => {
    const {doc, transformer, host} = createBoundaryEditingHarness(['p1', 'p2', 'p3'])
    const selection = makeBoundarySelection(host, 1, 3)
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleDelete']({
      preventDefault,
      get: () => ({selection}),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith('callout-1', 1, 2)
    expect(host.childrenIds).toEqual(['p1'])
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(
      jasmine.objectContaining({id: 'p1'}),
      false,
    )
  })

  it('replaces boundary selection from printable keydown fallback', () => {
    const {doc, transformer, selection, paragraph} = createBoundaryEditingHarness()
    const preventDefault = jasmine.createSpy('preventDefault')
    expect(selection.getBoundarySelectedChildIds()).toEqual(['p1', 'p2'])

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'n',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault,
      }),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith('callout-1', 0, 2, true)
    expect(doc.crud.insertBlocks).toHaveBeenCalled()
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(paragraph, 1)
    expect(doc.selection.recalculate).toHaveBeenCalled()
  })

  it('materializes a collapsed boundary cursor from printable keydown fallback', () => {
    const {doc, transformer, host, paragraph} = createBoundaryEditingHarness(['p1'])
    const selection = makeBoundarySelection(host, 1, 1)
    doc.selection.value = selection
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'n',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault,
      }),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).not.toHaveBeenCalled()
    expect(doc.crud.insertBlocks).toHaveBeenCalledWith('callout-1', 1, [jasmine.any(Object)])
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(paragraph, 1)
    expect(doc.selection.recalculate).toHaveBeenCalled()
  })

  it('Enter replaces boundary selection with an empty paragraph', async () => {
    const {doc, transformer, selection, paragraph} = createBoundaryEditingHarness()
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = await transformer['_handlerEnter']({
      preventDefault,
      get: () => ({selection, raw: {ctrlKey: false, shiftKey: false}}),
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlocks).toHaveBeenCalledWith('callout-1', 0, 2, true)
    expect(doc.crud.insertBlocks).toHaveBeenCalledWith(
      'callout-1',
      0,
      [jasmine.objectContaining({id: 'new-p', children: []})],
    )
    expect(doc.selection.setCursorAt).toHaveBeenCalledWith(paragraph, 0)
    expect(doc.selection.recalculate).toHaveBeenCalled()
  })
})

describe('InputTransformer gap deletion', () => {
  const createTransformer = (
    side: 'before' | 'after',
    nodeType: BlockNodeType,
    options: {
      prevBlock?: any
      nextBlock?: any
      fallbackBlock?: any
    } = {},
  ) => {
    const parent = {
      id: 'root',
      childrenIds: [] as string[],
      get childrenLength() {
        return this.childrenIds.length
      },
    }
    const block = {
      id: 'container-1',
      nodeType,
      parentBlock: parent,
      parentId: parent.id,
      getIndexOfParent: () => parent.childrenIds.indexOf(block.id),
    }
    const blocks: Record<string, any> = {
      root: parent,
      [block.id]: block,
    }
    const prevBlock = options.prevBlock ?? null
    const nextBlock = options.nextBlock ?? null
    const fallbackBlock = options.fallbackBlock ?? null
    if (prevBlock) {
      prevBlock.parentBlock = parent
      prevBlock.parentId = parent.id
      blocks[prevBlock.id] = prevBlock
      parent.childrenIds.push(prevBlock.id)
    }
    parent.childrenIds.push(block.id)
    if (nextBlock) {
      nextBlock.parentBlock = parent
      nextBlock.parentId = parent.id
      blocks[nextBlock.id] = nextBlock
      parent.childrenIds.push(nextBlock.id)
    }
    if (fallbackBlock) {
      fallbackBlock.parentBlock = parent
      fallbackBlock.parentId = parent.id
      blocks[fallbackBlock.id] = fallbackBlock
    }
    const selection = {
      isAllSelected: false,
      collapsed: true,
      start: {
        blockId: block.id,
        type: 'gap' as const,
        side,
        block,
      },
    }
    const doc = {
      event: eventStub(),
      isEditable: jasmine.createSpy('isEditable').and.callFake((candidate: any) => candidate?.nodeType === BlockNodeType.editable),
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks[id]),
      prevSibling: jasmine.createSpy('prevSibling').and.returnValue(prevBlock),
      nextSibling: jasmine.createSpy('nextSibling').and.returnValue(nextBlock),
      selection: {
        recalculate: jasmine.createSpy('recalculate'),
        replay: jasmine.createSpy('replay'),
        setGapCursor: jasmine.createSpy('setGapCursor'),
        selectBlock: jasmine.createSpy('selectBlock'),
        blur: jasmine.createSpy('blur'),
      },
      crud: {
        undoManager: {
          captureSelectionBeforeChange: jasmine.createSpy('captureSelectionBeforeChange'),
        },
        deleteBlockById: jasmine.createSpy('deleteBlockById').and.callFake((id: string) => {
          parent.childrenIds = parent.childrenIds.filter(childId => childId !== id)
          delete blocks[id]
          if (fallbackBlock && !parent.childrenIds.length) {
            parent.childrenIds.push(fallbackBlock.id)
          }
        }),
      },
    }
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = {
      preventDefault,
      get: () => ({selection}),
    }
    return {
      doc,
      preventDefault,
      context,
      transformer: new InputTransformer(doc as any) as any,
    }
  }

  it('Backspace deletes a container block from gap-after and lands on the next block start', () => {
    const nextBlock = {id: 'next-p', nodeType: BlockNodeType.editable, textLength: 6}
    const {transformer, context, doc, preventDefault} = createTransformer('after', BlockNodeType.block, {nextBlock})

    const result = transformer['_handleBackspace'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.undoManager.captureSelectionBeforeChange).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledOnceWith('container-1')
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: nextBlock.id, type: 'text', offset: 0},
      head: {blockId: nextBlock.id, type: 'text', offset: 0},
      commonParent: nextBlock.id,
    })
    expect(doc.selection.recalculate).not.toHaveBeenCalled()
  })

  it('Backspace deletes a trailing gap block and lands at the previous editable end when there is no next block', () => {
    const prevBlock = {id: 'prev-p', nodeType: BlockNodeType.editable, textLength: 4}
    const {transformer, context, doc, preventDefault} = createTransformer('after', BlockNodeType.block, {prevBlock})

    const result = transformer['_handleBackspace'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledOnceWith('container-1')
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: prevBlock.id, type: 'text', offset: prevBlock.textLength},
      head: {blockId: prevBlock.id, type: 'text', offset: prevBlock.textLength},
      commonParent: prevBlock.id,
    })
    expect(doc.selection.setGapCursor).not.toHaveBeenCalled()
  })

  it('Backspace deletes a trailing gap block and lands on the previous non-editable trailing gap', () => {
    const prevBlock = {id: 'prev-table', nodeType: BlockNodeType.block}
    const {transformer, context, doc, preventDefault} = createTransformer('after', BlockNodeType.block, {prevBlock})

    const result = transformer['_handleBackspace'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledOnceWith('container-1')
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(prevBlock, 'after')
    expect(doc.selection.replay).not.toHaveBeenCalled()
  })

  it('Backspace from gap-before moves to the previous editable end without deleting the gap block', () => {
    const prevBlock = {id: 'prev-p', nodeType: BlockNodeType.editable, textLength: 4}
    const nextBlock = {id: 'next-p', nodeType: BlockNodeType.editable, textLength: 6}
    const {transformer, context, doc, preventDefault} = createTransformer('before', BlockNodeType.block, {prevBlock, nextBlock})

    const result = transformer['_handleBackspace'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).not.toHaveBeenCalled()
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: prevBlock.id, type: 'text', offset: prevBlock.textLength},
      head: {blockId: prevBlock.id, type: 'text', offset: prevBlock.textLength},
      commonParent: prevBlock.id,
    })
  })

  it('Backspace from gap-before moves to the previous non-editable trailing gap', () => {
    const prevBlock = {id: 'prev-table', nodeType: BlockNodeType.block}
    const nextBlock = {id: 'next-p', nodeType: BlockNodeType.editable, textLength: 6}
    const {transformer, context, doc, preventDefault} = createTransformer('before', BlockNodeType.block, {prevBlock, nextBlock})

    const result = transformer['_handleBackspace'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).not.toHaveBeenCalled()
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(prevBlock, 'after')
    expect(doc.selection.replay).not.toHaveBeenCalled()
  })

  it('Delete deletes a container block from gap-before and uses the same adjacent restore policy', () => {
    const nextBlock = {id: 'next-p', nodeType: BlockNodeType.editable, textLength: 6}
    const {transformer, context, doc, preventDefault} = createTransformer('before', BlockNodeType.block, {nextBlock})

    const result = transformer['_handleDelete'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).toHaveBeenCalledOnceWith('container-1')
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: nextBlock.id, type: 'text', offset: 0},
      head: {blockId: nextBlock.id, type: 'text', offset: 0},
      commonParent: nextBlock.id,
    })
  })

  it('Delete from gap-after moves to the next editable start without deleting the gap block', () => {
    const prevBlock = {id: 'prev-p', nodeType: BlockNodeType.editable, textLength: 4}
    const nextBlock = {id: 'next-p', nodeType: BlockNodeType.editable, textLength: 6}
    const {transformer, context, doc, preventDefault} = createTransformer('after', BlockNodeType.block, {prevBlock, nextBlock})

    const result = transformer['_handleDelete'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).not.toHaveBeenCalled()
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: nextBlock.id, type: 'text', offset: 0},
      head: {blockId: nextBlock.id, type: 'text', offset: 0},
      commonParent: nextBlock.id,
    })
  })

  it('Delete from gap-after moves to the next non-editable leading gap', () => {
    const prevBlock = {id: 'prev-table', nodeType: BlockNodeType.block}
    const nextBlock = {id: 'next-table', nodeType: BlockNodeType.block}
    const {transformer, context, doc, preventDefault} = createTransformer('after', BlockNodeType.block, {prevBlock, nextBlock})

    const result = transformer['_handleDelete'](context)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(doc.crud.deleteBlockById).not.toHaveBeenCalled()
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(nextBlock, 'before')
    expect(doc.selection.replay).not.toHaveBeenCalled()
  })

  it('focuses the auto-created fallback paragraph when deleting the only renderUnit child', () => {
    const fallbackBlock = {id: 'fallback-p', nodeType: BlockNodeType.editable, textLength: 0}
    const {transformer, context, doc} = createTransformer('after', BlockNodeType.block, {fallbackBlock})

    const result = transformer['_handleBackspace'](context)

    expect(result).toBeTrue()
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: fallbackBlock.id, type: 'text', offset: 0},
      head: {blockId: fallbackBlock.id, type: 'text', offset: 0},
      commonParent: fallbackBlock.id,
    })
    expect(doc.selection.blur).not.toHaveBeenCalled()
  })
})
