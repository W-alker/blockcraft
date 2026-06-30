import {InputTransformer} from "./index";

// `@DocEventRegister` validates `doc.event` and registers listeners in the
// constructor, so every mock doc must expose a minimal event dispatcher stub.
const eventStub = () => ({add() {}, bindHotkey() {}})

describe('InputTransformer beforeInput range resolution', () => {
  const resolveRange = (selection: any, targetRange: any) => {
    const transformer = new InputTransformer({event: eventStub()} as any) as any
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
        setCursorAt: jasmine.createSpy('setCursorAt'),
      },
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
})
