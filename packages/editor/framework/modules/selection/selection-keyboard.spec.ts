import {SelectionKeyboard} from './selection-keyboard';
import {BlockNodeType} from '../../block-std';

// `@DocEventRegister` validates `doc.event` and registers listeners in the
// constructor, so the mock doc must expose a minimal event dispatcher stub.
const eventStub = () => ({add() {}, bindHotkey() {}});

interface MockSelection {
  setGapCursor: jasmine.Spy;
  selectOrSetCursorAtBlock: jasmine.Spy;
  setCursorAtBlock: jasmine.Spy;
  selectBlock: jasmine.Spy;
  replay: jasmine.Spy;
  setTableCellSelection: jasmine.Spy;
  scrollSelectionIntoView: jasmine.Spy;
}

interface MockDoc {
  event: ReturnType<typeof eventStub>;
  prevSibling: jasmine.Spy;
  nextSibling: jasmine.Spy;
  isEditable: jasmine.Spy;
  getBlockById: jasmine.Spy;
  schemas: {
    get: jasmine.Spy;
  };
  selection: MockSelection;
}

function createMockDoc(): MockDoc {
  return {
    event: eventStub(),
    prevSibling: jasmine.createSpy('prevSibling').and.returnValue(null),
    nextSibling: jasmine.createSpy('nextSibling').and.returnValue(null),
    // Default: a block is editable only if explicitly tagged editable.
    isEditable: jasmine.createSpy('isEditable').and.callFake(
      (b: any) => b?.nodeType === BlockNodeType.editable,
    ),
    getBlockById: jasmine.createSpy('getBlockById').and.returnValue(null),
    schemas: {
      get: jasmine.createSpy('get').and.callFake((flavour: string) => ({
        metadata: {
          isLeaf: flavour === 'table-cell' || flavour === 'table-row' || flavour === 'column',
          renderUnit: flavour === 'table-cell' || flavour === 'column',
        },
      })),
    },
    selection: {
      setGapCursor: jasmine.createSpy('setGapCursor'),
      selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
      setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
      selectBlock: jasmine.createSpy('selectBlock'),
      replay: jasmine.createSpy('replay'),
      setTableCellSelection: jasmine.createSpy('setTableCellSelection'),
      scrollSelectionIntoView: jasmine.createSpy('scrollSelectionIntoView'),
    },
  };
}

/** Build a ctx whose `get('keyboardState')` yields the given selection + key. */
function ctxFor(sel: any, key: string): any {
  const preventDefault = jasmine.createSpy('preventDefault');
  return {
    preventDefault,
    get: () => ({selection: sel, raw: {key}, composing: false}),
  };
}

function ctrlACtxFor(sel: any): any {
  const preventDefault = jasmine.createSpy('preventDefault');
  const stopPropagation = jasmine.createSpy('stopPropagation');
  return {
    get: () => ({
      selection: sel,
      raw: {
        key: 'a',
        preventDefault,
        stopPropagation,
      },
    }),
    preventDefault,
    stopPropagation,
    rawPreventDefault: preventDefault,
    rawStopPropagation: stopPropagation,
  };
}

function textPoint(block: any, offset: number) {
  return {blockId: block.id, type: 'text', offset, block};
}

function selectedPoint(block: any) {
  return {blockId: block.id, type: 'selected', block};
}

function selectionWithJSON(selection: any, commonParent: string) {
  selection.commonParent = commonParent;
  selection.toJSON = () => ({
    anchor: selection.anchor.type === 'text'
      ? {blockId: selection.anchor.blockId, type: 'text', offset: selection.anchor.offset}
      : {blockId: selection.anchor.blockId, type: 'selected'},
    head: selection.head.type === 'text'
      ? {blockId: selection.head.blockId, type: 'text', offset: selection.head.offset}
      : {blockId: selection.head.blockId, type: 'selected'},
    commonParent,
  });
  return selection;
}

function installNativeSelection(focusBlockId: string | null, options: {isCollapsed?: boolean} = {}) {
  let host: HTMLElement | null = null;
  let text: Text | null = null;
  if (focusBlockId) {
    host = document.createElement('span');
    host.setAttribute('data-block-id', focusBlockId);
    text = document.createTextNode('x');
    host.appendChild(text);
    document.body.appendChild(host);
  }

  const nativeSelection = {
    focusNode: text,
    isCollapsed: options.isCollapsed ?? false,
    extend: jasmine.createSpy('extend'),
    setBaseAndExtent: jasmine.createSpy('setBaseAndExtent'),
  };
  spyOn(document, 'getSelection').and.returnValue(nativeSelection as any);

  return {
    nativeSelection,
    cleanup: () => host?.remove(),
  };
}

function createKeyboard(doc: any): any {
  return new SelectionKeyboard(doc, {
    getNativeSelection: () => document.getSelection(),
  } as any) as any;
}

describe('SelectionKeyboard surface boundary', () => {
  it('reads native selection from the injected surface instead of the global document', () => {
    const doc = createMockDoc();
    const nativeSelection = {isCollapsed: false};
    const surface = {
      getNativeSelection: jasmine.createSpy('getNativeSelection').and.returnValue(nativeSelection),
    };
    const globalSelection = spyOn(document, 'getSelection').and.returnValue(nativeSelection as any);
    const keyboard = new SelectionKeyboard(doc as any, surface as any) as any;

    keyboard._handlerNoEditable(ctxFor({}, 'ArrowLeft'));

    expect(surface.getNativeSelection).toHaveBeenCalledTimes(1);
    expect(globalSelection).not.toHaveBeenCalled();
  });

  it('does not treat an absolute object as a keyboard gap target', () => {
    const doc = createMockDoc() as MockDoc & {
      placement: {allowsGapCursor: jasmine.Spy};
    };
    doc.placement = {
      allowsGapCursor: jasmine.createSpy('allowsGapCursor')
        .and.returnValue(false),
    };
    const keyboard = createKeyboard(doc);
    const shape = {
      id: 'shape-absolute',
      flavour: 'shape',
      nodeType: BlockNodeType.block,
    };

    expect(keyboard._supportsBlockGap(shape)).toBeFalse();
    expect(doc.placement.allowsGapCursor).toHaveBeenCalledOnceWith(shape);
  });
});

describe('SelectionKeyboard – Left/Right gap navigation', () => {
  let doc: MockDoc;
  let keyboard: any;

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = createKeyboard(doc);
  });

  describe('text edge → sibling', () => {
    it('ArrowRight at text-end into a void sibling lands on gap-before', () => {
      const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
      const firstBlock = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 5};
      doc.nextSibling.and.returnValue(voidBlock);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 5},
        firstBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'before');
    });

    it('ArrowLeft at text-start into a void sibling lands on gap-after', () => {
      const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
      const firstBlock = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 5};
      doc.prevSibling.and.returnValue(voidBlock);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 0},
        firstBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowLeft'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'after');
    });

    it('ArrowRight at text-end into an editable sibling sets cursor at text-start', () => {
      const editable = {id: 'p3', nodeType: BlockNodeType.editable};
      const firstBlock = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 3};
      doc.nextSibling.and.returnValue(editable);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 3},
        firstBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(editable, true);
    });

    it('ArrowRight in the MIDDLE of text is not consumed (browser handles)', () => {
      const firstBlock = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 5};
      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 2},
        firstBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBeUndefined();
      expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
      expect(doc.selection.selectOrSetCursorAtBlock).not.toHaveBeenCalled();
    });
  });

  describe('void two-stop step-across', () => {
    it('ArrowRight at gap-before steps across to gap-after (same block)', () => {
      const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'gap', side: 'before'},
        firstBlock: voidBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'after');
    });

    it('ArrowLeft at gap-after steps across to gap-before (same block)', () => {
      const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'gap', side: 'after'},
        firstBlock: voidBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowLeft'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'before');
    });

    it('ArrowRight at gap-after exits to the next sibling', () => {
      const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
      const next = {id: 'p2', nodeType: BlockNodeType.editable};
      doc.nextSibling.and.returnValue(next);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'gap', side: 'after'},
        firstBlock: voidBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(next, true);
    });

    it('ArrowLeft at gap-before exits to the previous sibling', () => {
      const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
      const prev = {id: 'p1', nodeType: BlockNodeType.editable};
      doc.prevSibling.and.returnValue(prev);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'gap', side: 'before'},
        firstBlock: voidBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowLeft'));

      expect(res).toBe(true);
      // Entering the previous editable from the right → cursor at its text-end.
      expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(prev, false);
    });
  });

  describe('container (block) enter/exit', () => {
    it('ArrowRight at text-end into a container lands on its gap-before', () => {
      const container = {id: 'img1', nodeType: BlockNodeType.block};
      const firstBlock = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 4};
      doc.nextSibling.and.returnValue(container);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 4},
        firstBlock,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).toHaveBeenCalledWith(container, 'before');
    });

    it('ArrowRight from a last editable descendant exits to the container gap-after', () => {
      const container = {id: 'img1', nodeType: BlockNodeType.block};
      // Caption is the last child: no next sibling, parent is the container.
      const caption = {
        id: 'cap1',
        nodeType: BlockNodeType.editable,
        textLength: 2,
        parentBlock: container,
      };
      doc.nextSibling.and.returnValue(null);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 2},
        firstBlock: caption,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).toHaveBeenCalledWith(container, 'after');
    });

    it('keeps an edge caret inside an absolute placement container', () => {
      const container = {
        id: 'object-1',
        flavour: 'text-box',
        nodeType: BlockNodeType.block,
      };
      const child = {
        id: 'p1',
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        textLength: 2,
        parentBlock: container,
      };
      doc.nextSibling.and.returnValue(null);
      (doc as any).placement = {
        isInAbsoluteLayout: (block: any) => block === container,
      };
      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 2},
        firstBlock: child,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBeTrue();
      expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
      expect(doc.selection.selectOrSetCursorAtBlock).not.toHaveBeenCalled();
    });

    it('ArrowRight from the last editable child of a renderUnit leaf enters the next renderUnit text start', () => {
      const cell = {
        id: 'cell-1',
        flavour: 'table-cell',
        nodeType: BlockNodeType.block,
        childrenLength: 1,
        childrenIds: ['p1'],
      };
      const paragraph = {
        id: 'p1',
        nodeType: BlockNodeType.editable,
        textLength: 3,
        parentBlock: cell,
      };
      const nextParagraph = {
        id: 'p2',
        nodeType: BlockNodeType.editable,
        textLength: 4,
      };
      const nextCell = {
        id: 'cell-2',
        flavour: 'table-cell',
        nodeType: BlockNodeType.block,
        firstChildren: nextParagraph,
      };
      doc.nextSibling.and.callFake((block: any) => block?.id === 'cell-1' ? nextCell : null);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 3},
        firstBlock: paragraph,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
      expect(doc.selection.replay).not.toHaveBeenCalled();
      expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(nextParagraph, true);
    });

    it('ArrowRight from a renderUnit leaf end boundary enters the next renderUnit text start', () => {
      const column = {
        id: 'column-1',
        flavour: 'column',
        nodeType: BlockNodeType.block,
        childrenLength: 1,
        childrenIds: ['p1'],
      };
      const nextParagraph = {
        id: 'p2',
        nodeType: BlockNodeType.editable,
        textLength: 4,
      };
      const nextColumn = {
        id: 'column-2',
        flavour: 'column',
        nodeType: BlockNodeType.block,
        firstChildren: nextParagraph,
      };
      doc.nextSibling.and.returnValue(nextColumn);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'boundary', blockId: 'column-1', index: 1, block: column},
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
      expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(nextParagraph, true);
    });

    it('ArrowRight from the last column text exits to the columns trailing gap', () => {
      const columns = {
        id: 'columns-1',
        flavour: 'columns',
        nodeType: BlockNodeType.block,
      };
      const column = {
        id: 'column-1',
        flavour: 'column',
        nodeType: BlockNodeType.block,
        childrenLength: 1,
        childrenIds: ['p1'],
        parentBlock: columns,
      };
      const paragraph = {
        id: 'p1',
        nodeType: BlockNodeType.editable,
        textLength: 3,
        parentBlock: column,
      };
      doc.nextSibling.and.returnValue(null);

      const sel = {
        isAllSelected: false,
        collapsed: true,
        start: {type: 'text', offset: 3},
        firstBlock: paragraph,
      };

      const res = keyboard._handleLeftRightArrow(ctxFor(sel, 'ArrowRight'));

      expect(res).toBe(true);
      expect(doc.selection.replay).not.toHaveBeenCalled();
      expect(doc.selection.setGapCursor).toHaveBeenCalledWith(columns, 'after');
    });
  });
});

describe('SelectionKeyboard – Up/Down renderUnit navigation', () => {
  let doc: MockDoc;
  let keyboard: any;

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = createKeyboard(doc);
  });

  it('ArrowDown at text-end into a table-cell enters its first editable child instead of gap', () => {
    const paragraph = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      textLength: 3,
    };
    const nextParagraph = {
      id: 'p2',
      nodeType: BlockNodeType.editable,
      textLength: 4,
    };
    const nextCell = {
      id: 'cell-2',
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
      firstChildren: nextParagraph,
    };
    doc.nextSibling.and.returnValue(nextCell);

    const ctx = ctxFor({
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {type: 'text', offset: paragraph.textLength},
      firstBlock: paragraph,
    }, 'ArrowDown');

    const result = keyboard._handlerUpOrDown(ctx);

    expect(result).toBeTrue();
    expect(ctx.preventDefault).toHaveBeenCalled();
    expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(nextParagraph, true);
    expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
  });

  it('ArrowUp at text-start into a column enters its last editable child instead of gap', () => {
    const paragraph = {
      id: 'p2',
      nodeType: BlockNodeType.editable,
      textLength: 3,
    };
    const previousParagraph = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      textLength: 4,
    };
    const previousColumn = {
      id: 'column-1',
      flavour: 'column',
      nodeType: BlockNodeType.block,
      lastChildren: previousParagraph,
    };
    doc.prevSibling.and.returnValue(previousColumn);

    const ctx = ctxFor({
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: true,
      isEndOfBlock: false,
      start: {type: 'text', offset: 0},
      firstBlock: paragraph,
    }, 'ArrowUp');

    const result = keyboard._handlerUpOrDown(ctx);

    expect(result).toBeTrue();
    expect(ctx.preventDefault).toHaveBeenCalled();
    expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(previousParagraph, false);
    expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
  });

  it('repairs a stale table-cell gap by entering real cell content', () => {
    const paragraph = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      textLength: 4,
    };
    const cell = {
      id: 'cell-1',
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
      firstChildren: paragraph,
    };

    const ctx = ctxFor({
      isAllSelected: false,
      collapsed: true,
      start: {blockId: cell.id, type: 'gap', side: 'before', block: cell},
      firstBlock: cell,
    }, 'ArrowDown');

    const result = keyboard._handlerUpOrDown(ctx);

    expect(result).toBeTrue();
    expect(ctx.preventDefault).toHaveBeenCalled();
    expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(paragraph, true);
    expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
  });

  it('ArrowDown from the last child inside a table-cell enters the next cell content', () => {
    const cell = {
      id: 'cell-1',
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
    };
    const paragraph = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      textLength: 3,
      parentBlock: cell,
    };
    const nextParagraph = {
      id: 'p2',
      nodeType: BlockNodeType.editable,
      textLength: 4,
    };
    const nextCell = {
      id: 'cell-2',
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
      firstChildren: nextParagraph,
    };
    doc.nextSibling.and.callFake((block: any) => block?.id === cell.id ? nextCell : null);

    const ctx = ctxFor({
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {type: 'text', offset: paragraph.textLength},
      firstBlock: paragraph,
    }, 'ArrowDown');

    const result = keyboard._handlerUpOrDown(ctx);

    expect(result).toBeTrue();
    expect(ctx.preventDefault).toHaveBeenCalled();
    expect(doc.selection.setGapCursor).not.toHaveBeenCalled();
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(nextParagraph, true);
    expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
  });

  it('ArrowDown from the last child inside the last column exits to the columns trailing gap', () => {
    const columns = {
      id: 'columns-1',
      flavour: 'columns',
      nodeType: BlockNodeType.block,
    };
    const column = {
      id: 'column-1',
      flavour: 'column',
      nodeType: BlockNodeType.block,
      parentBlock: columns,
    };
    const paragraph = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      textLength: 3,
      parentBlock: column,
    };
    doc.nextSibling.and.returnValue(null);

    const ctx = ctxFor({
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {type: 'text', offset: paragraph.textLength},
      firstBlock: paragraph,
    }, 'ArrowDown');

    const result = keyboard._handlerUpOrDown(ctx);

    expect(result).toBeTrue();
    expect(ctx.preventDefault).toHaveBeenCalled();
    expect(doc.selection.selectOrSetCursorAtBlock).not.toHaveBeenCalled();
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(columns, 'after');
    expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
  });
});

describe('SelectionKeyboard – Up/Down all-selected model fallback', () => {
  let doc: MockDoc;
  let keyboard: any;

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = createKeyboard(doc);
  });

  it('moves from a whole-block void selection when native focus is missing', () => {
    const selected = {id: 'divider-1', nodeType: BlockNodeType.void};
    const next = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 4};
    doc.nextSibling.and.returnValue(next);
    installNativeSelection(null);

    const ctx = ctxFor({
      isAllSelected: true,
      collapsed: false,
      head: selectedPoint(selected),
    }, 'ArrowDown');

    const result = keyboard._handlerUpOrDown(ctx);

    expect(result).toBeTrue();
    expect(ctx.preventDefault).toHaveBeenCalled();
    expect(doc.nextSibling).toHaveBeenCalledWith(selected);
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(next, true);
    expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
  });

  it('falls back to the model head when native focus points at a stale block', () => {
    const selected = {id: 'callout-1', nodeType: BlockNodeType.block};
    const previous = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 5};
    doc.getBlockById.and.callFake((id: string) => {
      if (id === 'stale') throw new Error('Block not found: stale');
      return null;
    });
    doc.prevSibling.and.returnValue(previous);
    const {cleanup} = installNativeSelection('stale');

    const ctx = ctxFor({
      isAllSelected: true,
      collapsed: false,
      head: selectedPoint(selected),
    }, 'ArrowUp');

    try {
      const result = keyboard._handlerUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.prevSibling).toHaveBeenCalledWith(selected);
      expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(previous, false);
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('uses the model head instead of a live native focus drift for whole-block selections', () => {
    const selected = {id: 'divider-1', nodeType: BlockNodeType.void};
    const driftedParagraph = {id: 'p-drift', nodeType: BlockNodeType.editable, textLength: 6};
    const selectedNext = {id: 'p-after-divider', nodeType: BlockNodeType.editable, textLength: 4};
    const driftedNext = {id: 'p-after-drift', nodeType: BlockNodeType.editable, textLength: 8};
    doc.getBlockById.and.callFake((id: string) => {
      if (id === driftedParagraph.id) return driftedParagraph;
      if (id === selected.id) return selected;
      return null;
    });
    doc.nextSibling.and.callFake((block: any) =>
      block?.id === selected.id ? selectedNext : driftedNext
    );
    const {cleanup} = installNativeSelection(driftedParagraph.id);

    const ctx = ctxFor({
      isAllSelected: true,
      collapsed: false,
      head: selectedPoint(selected),
    }, 'ArrowDown');

    try {
      const result = keyboard._handlerUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.nextSibling).toHaveBeenCalledWith(selected);
      expect(doc.nextSibling).not.toHaveBeenCalledWith(driftedParagraph);
      expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(selectedNext, true);
      expect(doc.selection.selectOrSetCursorAtBlock).not.toHaveBeenCalledWith(driftedNext, true);
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});

describe('SelectionKeyboard – Ctrl+A in table cells', () => {
  function createTableCellCtrlAHarness() {
    const table = {id: 'table-1', flavour: 'table'};
    const row = {id: 'row-1', flavour: 'table-row', parentBlock: table};
    const cellHost = document.createElement('td');
    const cell = {
      id: 'cell-1',
      flavour: 'table-cell',
      parentBlock: row,
      hostElement: cellHost,
    };
    const paragraph = {
      id: 'p-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      textLength: 3,
      parentBlock: cell,
    };
    const blocks: Record<string, any> = {
      'table-1': table,
      'row-1': row,
      'cell-1': cell,
      'p-1': paragraph,
    };
    const doc = {
      event: eventStub(),
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks[id]),
      isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.nodeType === BlockNodeType.editable),
      selection: {
        selectAllChildren: jasmine.createSpy('selectAllChildren'),
        selectBlock: jasmine.createSpy('selectBlock'),
        setTableCellSelection: jasmine.createSpy('setTableCellSelection'),
      },
      messageService: {
        info: jasmine.createSpy('info'),
      },
    };
    const keyboard = createKeyboard(doc);
    return {keyboard, doc, table, cell, paragraph};
  }

  it('promotes a fully-selected paragraph inside a cell to table-cell model selection', () => {
    const {keyboard, doc, table, cell, paragraph} = createTableCellCtrlAHarness();
    const ctx = ctrlACtxFor({
      commonParent: paragraph.id,
      isInSameBlock: true,
      start: {blockId: paragraph.id, type: 'text', offset: 0, block: paragraph},
      end: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(ctx.rawPreventDefault).toHaveBeenCalled();
    expect(ctx.rawStopPropagation).toHaveBeenCalled();
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(table, cell, cell, true);
    expect(doc.selection.selectAllChildren).not.toHaveBeenCalled();
  });

  it('selects the whole table when Ctrl+A starts from a model table-cell selection', () => {
    const {keyboard, doc, table, cell} = createTableCellCtrlAHarness();
    const ctx = ctrlACtxFor({
      commonParent: table.id,
      start: {blockId: cell.id, type: 'table-cell', tableId: table.id, block: cell},
      end: {blockId: cell.id, type: 'table-cell', tableId: table.id, block: cell},
      getTableCellSelection: () => ({
        tableId: table.id,
        anchorCellId: cell.id,
        headCellId: cell.id,
      }),
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectBlock).toHaveBeenCalledWith(table);
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled();
    expect(doc.selection.selectAllChildren).not.toHaveBeenCalled();
  });

  it('repairs a boundary selection whose common parent is a table cell', () => {
    const {keyboard, doc, table, cell} = createTableCellCtrlAHarness();
    const ctx = ctrlACtxFor({
      commonParent: cell.id,
      start: {blockId: cell.id, type: 'boundary', index: 0, block: cell},
      end: {blockId: cell.id, type: 'boundary', index: 1, block: cell},
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(table, cell, cell, true);
    expect(doc.selection.selectAllChildren).not.toHaveBeenCalled();
  });
});

describe('SelectionKeyboard – Ctrl+A ladder', () => {
  function createCtrlAHarness() {
    const root = {
      id: 'root',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      childrenIds: ['callout-1', 'after-1'],
      childrenLength: 2,
    };
    const callout = {
      id: 'callout-1',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      parentId: root.id,
      parentBlock: root,
      childrenIds: ['p-1', 'p-2'],
      childrenLength: 2,
    };
    const paragraph = {
      id: 'p-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      textLength: 5,
      parentId: callout.id,
      parentBlock: callout,
    };
    const paragraph2 = {
      id: 'p-2',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      textLength: 4,
      parentId: callout.id,
      parentBlock: callout,
    };
    const after = {
      id: 'after-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      textLength: 3,
      parentId: root.id,
      parentBlock: root,
    };
    const blocks = new Map<string, any>([
      [root.id, root],
      [callout.id, callout],
      [paragraph.id, paragraph],
      [paragraph2.id, paragraph2],
      [after.id, after],
    ]);
    const doc = {
      event: eventStub(),
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => blocks.get(id)),
      isEditable: jasmine.createSpy('isEditable').and.callFake((block: any) => block?.nodeType === BlockNodeType.editable),
      selection: {
        selectAllChildren: jasmine.createSpy('selectAllChildren'),
        selectBlock: jasmine.createSpy('selectBlock'),
        setTableCellSelection: jasmine.createSpy('setTableCellSelection'),
      },
      messageService: {
        info: jasmine.createSpy('info'),
      },
    };
    const keyboard = createKeyboard(doc);
    return {keyboard, doc, root, callout, paragraph};
  }

  it('selects the parent content when an editable block is already fully selected', () => {
    const {keyboard, doc, callout, paragraph} = createCtrlAHarness();
    const ctx = ctrlACtxFor({
      commonParent: paragraph.id,
      isInSameBlock: true,
      start: {blockId: paragraph.id, type: 'text', offset: 0, block: paragraph},
      end: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).toHaveBeenCalledOnceWith(callout);
    expect(doc.selection.setTableCellSelection).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  });

  it('selects all children of the common container from a partial boundary range', () => {
    const {keyboard, doc, callout} = createCtrlAHarness();
    const ctx = ctrlACtxFor({
      commonParent: callout.id,
      start: {blockId: callout.id, type: 'boundary', index: 0, block: callout},
      end: {blockId: callout.id, type: 'boundary', index: 1, block: callout},
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).toHaveBeenCalledOnceWith(callout);
  });

  it('lifts a full container boundary range to the parent content', () => {
    const {keyboard, doc, root, callout} = createCtrlAHarness();
    const ctx = ctrlACtxFor({
      commonParent: callout.id,
      start: {blockId: callout.id, type: 'boundary', index: 0, block: callout},
      end: {blockId: callout.id, type: 'boundary', index: callout.childrenLength, block: callout},
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).toHaveBeenCalledOnceWith(root);
  });

  it('lifts an explicit whole-block selection to the parent content', () => {
    const {keyboard, doc, root, callout} = createCtrlAHarness();
    const ctx = ctrlACtxFor({
      commonParent: callout.id,
      start: {blockId: callout.id, type: 'selected', block: callout},
      end: {blockId: callout.id, type: 'selected', block: callout},
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).toHaveBeenCalledOnceWith(root);
  });
});

describe('SelectionKeyboard – placement-aware frame interaction', () => {
  function createHarness(absolute = false) {
    const doc = createMockDoc() as any;
    const frame = {
      id: 'frame',
      flavour: 'text-box',
      nodeType: BlockNodeType.block,
    };
    const child = {
      id: 'child',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      parentBlock: frame,
    };
    doc.schemas.get.and.callFake((flavour: string) => ({
      metadata: {
        selectionInteraction: flavour === 'text-box'
          ? {frame: 'selectable', editingBoundary: 'absolute'}
          : undefined,
      },
    }));
    doc.readonlyManager = {isReadonly: () => false};
    doc.placement = {isInAbsoluteLayout: () => absolute};
    return {doc, keyboard: createKeyboard(doc), frame, child};
  }

  it('enters the first editable descendant from a selected frame', () => {
    const {doc, keyboard, frame} = createHarness(true);
    const context = ctxFor({
      isInSameBlock: true,
      anchor: selectedPoint(frame),
      head: selectedPoint(frame),
      firstBlock: frame,
    }, 'Enter');

    const result = keyboard._handleClosedContainerEnter(context);

    expect(result).toBeTrue();
    expect(context.preventDefault).toHaveBeenCalledTimes(1);
    expect(doc.selection.setCursorAtBlock).toHaveBeenCalledOnceWith(frame, true);
  });

  it('returns a direct text child to whole-frame selection on Escape', () => {
    const {doc, keyboard, frame, child} = createHarness(true);
    const point = textPoint(child, 1);
    const context = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      anchor: point,
      head: point,
      firstBlock: child,
    }, 'Escape');

    const result = keyboard._handleEscape(context);

    expect(result).toBeTrue();
    expect(context.preventDefault).toHaveBeenCalledTimes(1);
    expect(doc.selection.selectBlock).toHaveBeenCalledOnceWith(frame);
  });

  it('does not turn an ordinary container scope into a selectable frame', () => {
    const {doc, keyboard} = createHarness();
    const callout = {
      id: 'callout',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
    };
    const context = ctxFor({
      isInSameBlock: true,
      anchor: selectedPoint(callout),
      head: selectedPoint(callout),
      firstBlock: callout,
    }, 'Enter');

    expect(keyboard._handleClosedContainerEnter(context)).toBeUndefined();
    expect(doc.selection.setCursorAtBlock).not.toHaveBeenCalled();
  });

  it('leaves Enter and Escape native while the frame is in relative flow', () => {
    const {doc, keyboard, frame, child} = createHarness();
    const enter = ctxFor({
      isInSameBlock: true,
      anchor: selectedPoint(frame),
      head: selectedPoint(frame),
      firstBlock: frame,
    }, 'Enter');
    const point = textPoint(child, 1);
    const escape = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      anchor: point,
      head: point,
      firstBlock: child,
    }, 'Escape');

    expect(keyboard._handleClosedContainerEnter(enter)).toBeUndefined();
    expect(keyboard._handleEscape(escape)).toBeUndefined();
    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(doc.selection.setCursorAtBlock).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  });
});

describe('SelectionKeyboard – Ctrl+A container layout boundary', () => {
  function createContainerCtrlAHarness(absolute = false) {
    const root = {
      id: 'root',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      childrenIds: ['text-box-1'],
      childrenLength: 1,
    } as any;
    const textBox = {
      id: 'text-box-1',
      flavour: 'text-box',
      nodeType: BlockNodeType.block,
      parentId: root.id,
      parentBlock: root,
      childrenIds: ['p-1', 'p-2'],
      childrenLength: 2,
    } as any;
    const paragraph = {
      id: 'p-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      textLength: 5,
      parentId: textBox.id,
      parentBlock: textBox,
    } as any;
    const paragraph2 = {
      id: 'p-2',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      textLength: 4,
      parentId: textBox.id,
      parentBlock: textBox,
    } as any;
    const blocks = new Map<string, any>([
      [root.id, root],
      [textBox.id, textBox],
      [paragraph.id, paragraph],
      [paragraph2.id, paragraph2],
    ]);
    const doc = {
      event: eventStub(),
      getBlockById: jasmine.createSpy('getBlockById')
        .and.callFake((id: string) => blocks.get(id)),
      isEditable: jasmine.createSpy('isEditable')
        .and.callFake((block: any) => block?.nodeType === BlockNodeType.editable),
      schemas: {
        get: jasmine.createSpy('get').and.callFake((flavour: string) => ({
          metadata: {
            selectionScope: flavour === 'text-box'
              ? absolute
                ? 'container'
                : 'transparent'
              : flavour === 'root'
                ? 'document'
                : undefined,
          },
        })),
      },
      selection: {
        selectAllChildren: jasmine.createSpy('selectAllChildren'),
        selectBlock: jasmine.createSpy('selectBlock'),
        setTableCellSelection: jasmine.createSpy('setTableCellSelection'),
      },
      messageService: {
        info: jasmine.createSpy('info'),
      },
      placement: {
        isInAbsoluteLayout: jasmine.createSpy('isInAbsoluteLayout')
          .and.callFake((block: any) => absolute && block?.id === textBox.id),
      },
    } as any;
    for (const block of blocks.values()) block.doc = doc;

    return {
      keyboard: createKeyboard(doc),
      doc,
      root,
      textBox,
      paragraph,
      paragraph2,
    };
  }

  it('keeps first Ctrl+A on the active child while the text box is in flow', () => {
    const {keyboard, doc, paragraph2} = createContainerCtrlAHarness();
    const point = textPoint(paragraph2, 2);
    const ctx = ctrlACtxFor({
      commonParent: paragraph2.id,
      anchor: point,
      head: point,
      start: point,
      end: point,
      isInSameBlock: true,
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).toHaveBeenCalledOnceWith(paragraph2);
    expect(doc.messageService.info).toHaveBeenCalledTimes(1);
  });

  it('selects the complete text-box scope first while it is absolute', () => {
    const {keyboard, doc, textBox, paragraph2} = createContainerCtrlAHarness(true);
    const point = textPoint(paragraph2, 2);
    const ctx = ctrlACtxFor({
      commonParent: paragraph2.id,
      anchor: point,
      head: point,
      start: point,
      end: point,
      isInSameBlock: true,
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).toHaveBeenCalledOnceWith(textBox);
    expect(doc.messageService.info).not.toHaveBeenCalled();
  });

  it('keeps repeated Ctrl+A capped at an absolute text box', () => {
    const {keyboard, doc, root, textBox} = createContainerCtrlAHarness(true);
    const start = {
      blockId: textBox.id,
      type: 'boundary',
      index: 0,
      block: textBox,
    };
    const end = {
      blockId: textBox.id,
      type: 'boundary',
      index: textBox.childrenLength,
      block: textBox,
    };
    const ctx = ctrlACtxFor({
      commonParent: textBox.id,
      anchor: start,
      head: end,
      start,
      end,
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).not.toHaveBeenCalled();
    expect(doc.selection.selectAllChildren).not.toHaveBeenCalledWith(root);
  });

  it('lifts a full normal-flow text box selection to root content', () => {
    const {keyboard, doc, root, textBox} = createContainerCtrlAHarness();
    const start = {
      blockId: textBox.id,
      type: 'boundary',
      index: 0,
      block: textBox,
    };
    const end = {
      blockId: textBox.id,
      type: 'boundary',
      index: textBox.childrenLength,
      block: textBox,
    };
    const ctx = ctrlACtxFor({
      commonParent: textBox.id,
      anchor: start,
      head: end,
      start,
      end,
    });

    const result = keyboard.handleCtrlA(ctx);

    expect(result).toBeTrue();
    expect(doc.selection.selectAllChildren).toHaveBeenCalledOnceWith(root);
  });
});

describe('SelectionKeyboard – Shift extension follows the model head', () => {
  let doc: MockDoc;
  let keyboard: any;

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = createKeyboard(doc);
  });

  it('extends Shift+Left inside a non-collapsed text range from the model head', () => {
    const block = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 8, parentId: 'root'};
    installNativeSelection(null);
    const sel = selectionWithJSON({
      isAllSelected: false,
      collapsed: false,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: false,
      anchor: textPoint(block, 6),
      head: textPoint(block, 3),
    }, 'p1');

    const ctx = ctxFor(sel, 'ArrowLeft');
    const res = keyboard._handleShiftLeftOrRight(ctx);

    expect(res).toBe(true);
    expect(ctx.preventDefault).toHaveBeenCalled();
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: 'p1', type: 'text', offset: 6},
      head: {blockId: 'p1', type: 'text', offset: 2},
      commonParent: 'p1',
    });
    expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
  });

  it('continues Shift+Left from a selected model head instead of the native focus node', () => {
    const anchorBlock = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 5, parentId: 'root'};
    const selectedBlock = {id: 'callout', nodeType: BlockNodeType.block, parentId: 'root'};
    const previousBlock = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 4, parentId: 'root'};
    doc.prevSibling.and.callFake((id: string) => id === 'callout' ? previousBlock : null);
    const {nativeSelection, cleanup} = installNativeSelection('p2');
    const sel = selectionWithJSON({
      isAllSelected: false,
      collapsed: false,
      isInSameBlock: false,
      isStartOfBlock: true,
      isEndOfBlock: false,
      anchor: textPoint(anchorBlock, 2),
      head: selectedPoint(selectedBlock),
    }, 'root');

    try {
      const ctx = ctxFor(sel, 'ArrowLeft');
      const res = keyboard._handleShiftLeftOrRight(ctx);

      expect(res).toBe(true);
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.prevSibling).toHaveBeenCalledWith(selectedBlock.id);
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(nativeSelection.setBaseAndExtent).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: 'p2', type: 'text', offset: 2},
        head: {blockId: 'p1', type: 'text', offset: 4},
        commonParent: 'root',
      });
    } finally {
      cleanup();
    }
  });

  it('extends Shift+Up inside a collapsed editable block via replay', () => {
    const block = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 8, parentId: 'root'};
    doc.getBlockById.and.callFake((id: string) => id === 'p1' ? block : null);
    const {nativeSelection, cleanup} = installNativeSelection('p1', {isCollapsed: true});
    const sel = selectionWithJSON({
      isAllSelected: false,
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: false,
      start: textPoint(block, 5),
      firstBlock: block,
      anchor: textPoint(block, 5),
      head: textPoint(block, 5),
    }, 'p1');

    try {
      const ctx = ctxFor(sel, 'ArrowUp');
      const res = keyboard._handleShiftUpOrDown(ctx);

      expect(res).toBe(true);
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(nativeSelection.setBaseAndExtent).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: 'p1', type: 'text', offset: 5},
        head: {blockId: 'p1', type: 'text', offset: 0},
        commonParent: 'p1',
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('falls back to the model head when native focus points at a stale block', () => {
    const block = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 4, parentId: 'root'};
    const next = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 7, parentId: 'root'};
    doc.getBlockById.and.callFake((id: string) => {
      if (id === 'stale') throw new Error('Block not found: stale');
      return id === 'p1' ? block : id === 'p2' ? next : null;
    });
    doc.nextSibling.and.callFake((id: string) => id === 'p1' ? next : null);
    const {nativeSelection, cleanup} = installNativeSelection('stale', {isCollapsed: false});
    const sel = selectionWithJSON({
      isAllSelected: false,
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: textPoint(block, block.textLength),
      firstBlock: block,
      anchor: textPoint(block, block.textLength),
      head: textPoint(block, block.textLength),
    }, 'p1');

    try {
      const ctx = ctxFor(sel, 'ArrowRight');
      const res = keyboard._handleShiftLeftOrRight(ctx);

      expect(res).toBe(true);
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(nativeSelection.setBaseAndExtent).not.toHaveBeenCalled();
      expect(doc.nextSibling).toHaveBeenCalledWith(block.id);
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: 'p1', type: 'text', offset: 4},
        head: {blockId: 'p2', type: 'text', offset: 0},
        commonParent: 'root',
      });
    } finally {
      cleanup();
    }
  });
});

describe('SelectionKeyboard – Shift+Arrow in table cells', () => {
  function installNativeSelection(focusBlockId: string, options: {isCollapsed?: boolean} = {}) {
    const host = document.createElement('span');
    host.setAttribute('data-block-id', focusBlockId);
    const text = document.createTextNode('x');
    host.appendChild(text);
    document.body.appendChild(host);

    const nativeSelection = {
      focusNode: text,
      isCollapsed: options.isCollapsed ?? false,
      extend: jasmine.createSpy('extend'),
      setBaseAndExtent: jasmine.createSpy('setBaseAndExtent'),
    };
    spyOn(document, 'getSelection').and.returnValue(nativeSelection as any);

    return {
      nativeSelection,
      cleanup: () => host.remove(),
    };
  }

  function createTableShiftArrowHarness() {
    const table = {
      id: 'table-1',
      flavour: 'table',
      nodeType: BlockNodeType.block,
      rowLength: 2,
      colLength: 2,
      childrenIds: ['row-1', 'row-2'],
      getCellByCoordinate: jasmine.createSpy('getCellByCoordinate'),
    };
    const row1 = {id: 'row-1', flavour: 'table-row', nodeType: BlockNodeType.block, parentBlock: table};
    const row2 = {id: 'row-2', flavour: 'table-row', nodeType: BlockNodeType.block, parentBlock: table};
    const cells = new Map<string, any>();
    [
      ['cell-1', row1, 0],
      ['cell-2', row1, 1],
      ['cell-3', row2, 0],
      ['cell-4', row2, 1],
    ].forEach(([id, row, colIdx]) => {
      cells.set(id as string, {
        id,
        flavour: 'table-cell',
        nodeType: BlockNodeType.block,
        parentBlock: row,
        parentId: (row as any).id,
        props: {},
        getIndexOfParent: () => colIdx,
        hostElement: document.createElement('td'),
      });
    });
    table.getCellByCoordinate.and.callFake((rowIdx: number, colIdx: number) => {
      const matrix = [
        ['cell-1', 'cell-2'],
        ['cell-3', 'cell-4'],
      ];
      return cells.get(matrix[rowIdx]?.[colIdx]);
    });
    const paragraph = {
      id: 'p-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      textLength: 6,
      parentBlock: cells.get('cell-1'),
    };
    const blocks = new Map<string, any>([
      ['table-1', table],
      ['row-1', row1],
      ['row-2', row2],
      ['p-1', paragraph],
      ...Array.from(cells.entries()),
    ]);
    const doc = createMockDoc();
    doc.getBlockById.and.callFake((id: string) => blocks.get(id));
    const keyboard = createKeyboard(doc);
    return {keyboard, doc, table, cells, paragraph};
  }

  it('promotes Shift+Right at a table-cell text edge to model cell selection', () => {
    const {keyboard, doc, table, cells, paragraph} = createTableShiftArrowHarness();
    const {nativeSelection, cleanup} = installNativeSelection(paragraph.id);
    const ctx = ctxFor({
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      head: {type: 'text', offset: paragraph.textLength, block: paragraph},
    }, 'ArrowRight');

    try {
      const result = keyboard._handleShiftLeftOrRight(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(nativeSelection.setBaseAndExtent).not.toHaveBeenCalled();
      expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(
        table,
        cells.get('cell-1'),
        cells.get('cell-2'),
        true,
      );
    } finally {
      cleanup();
    }
  });

  it('promotes Shift+Down from a table-cell text range to model cell selection', () => {
    const {keyboard, doc, table, cells, paragraph} = createTableShiftArrowHarness();
    const {nativeSelection, cleanup} = installNativeSelection(paragraph.id, {isCollapsed: false});
    const ctx = ctxFor({
      isStartOfBlock: false,
      isEndOfBlock: true,
    }, 'ArrowDown');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(nativeSelection.setBaseAndExtent).not.toHaveBeenCalled();
      expect(doc.selection.setTableCellSelection).toHaveBeenCalledWith(
        table,
        cells.get('cell-1'),
        cells.get('cell-3'),
        true,
      );
    } finally {
      cleanup();
    }
  });
});

describe('SelectionKeyboard – Shift+Arrow from gap cursor', () => {
  let doc: MockDoc;
  let keyboard: any;

  function installNativeSelection(focusBlockId: string) {
    const host = document.createElement('span');
    host.setAttribute('data-block-id', focusBlockId);
    const text = document.createTextNode('x');
    host.appendChild(text);
    document.body.appendChild(host);

    spyOn(document, 'getSelection').and.returnValue({
      focusNode: text,
      isCollapsed: true,
      extend: jasmine.createSpy('extend'),
      setBaseAndExtent: jasmine.createSpy('setBaseAndExtent'),
    } as any);

    return () => host.remove();
  }

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = createKeyboard(doc);
  });

  it('selects a block boundary range when Shift+Left moves inward from gap-after', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['table-1']};
    const table = {id: 'table-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => id === root.id ? root : table);
    const cleanup = installNativeSelection(table.id);
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {blockId: table.id, type: 'gap', side: 'after', block: table},
    }, 'ArrowLeft');

    try {
      const result = keyboard._handleShiftLeftOrRight(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.selection.selectBlock).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: root.id, type: 'boundary', index: 1},
        head: {blockId: root.id, type: 'boundary', index: 0},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('selects a block boundary range when Shift+Right moves inward from gap-before', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['table-1']};
    const table = {id: 'table-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => id === root.id ? root : table);
    const cleanup = installNativeSelection(table.id);
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: true,
      isEndOfBlock: false,
      start: {blockId: table.id, type: 'gap', side: 'before', block: table},
    }, 'ArrowRight');

    try {
      const result = keyboard._handleShiftLeftOrRight(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.selection.selectBlock).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: root.id, type: 'boundary', index: 0},
        head: {blockId: root.id, type: 'boundary', index: 1},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('falls back to whole-block selection from an orphan gap with no parent boundary', () => {
    const orphan = {id: 'orphan-block', nodeType: BlockNodeType.block};
    const cleanup = installNativeSelection(orphan.id);
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {blockId: orphan.id, type: 'gap', side: 'after', block: orphan},
    }, 'ArrowLeft');

    try {
      const result = keyboard._handleShiftLeftOrRight(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.selection.replay).not.toHaveBeenCalled();
      expect(doc.selection.selectBlock).toHaveBeenCalledWith(orphan);
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('falls back to a selected endpoint when Shift+Arrow reaches a block without parent boundary metadata', () => {
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 4};
    const orphan = {id: 'orphan-callout', nodeType: BlockNodeType.block};
    doc.nextSibling.and.returnValue(orphan);
    const cleanup = installNativeSelection(paragraph.id);
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      commonParent: paragraph.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      head: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      start: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength},
        head: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength},
        commonParent: paragraph.id,
      }),
    }, 'ArrowRight');

    try {
      const result = keyboard._handleShiftLeftOrRight(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength},
        head: {blockId: orphan.id, type: 'selected'},
        commonParent: paragraph.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('extends from text into a container block with a boundary endpoint on Shift+Right', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p1', 'callout-1']};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 4, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => id === root.id ? root : id === paragraph.id ? paragraph : callout);
    doc.nextSibling.and.returnValue(callout);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      commonParent: 'p1',
      anchor: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      head: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      start: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength},
        head: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength},
        commonParent: paragraph.id,
      }),
    }, 'ArrowRight');

    try {
      const result = keyboard._handleShiftLeftOrRight(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: root.id, type: 'boundary', index: 1},
        head: {blockId: root.id, type: 'boundary', index: 2},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('extends from text into a container block with a boundary endpoint on Shift+Down', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p1', 'callout-1']};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 4, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => id === root.id ? root : id === paragraph.id ? paragraph : callout);
    doc.nextSibling.and.returnValue(callout);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      commonParent: 'p1',
      anchor: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      head: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      start: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength, block: paragraph},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength},
        head: {blockId: paragraph.id, type: 'text', offset: paragraph.textLength},
        commonParent: paragraph.id,
      }),
    }, 'ArrowDown');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: root.id, type: 'boundary', index: 1},
        head: {blockId: root.id, type: 'boundary', index: 2},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('keeps a non-collapsed text anchor when Shift+Up crosses into a container', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['callout-1', 'p1']};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 16, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => id === root.id ? root : id === paragraph.id ? paragraph : callout);
    doc.prevSibling.and.returnValue(callout);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = false;
    const ctx = ctxFor({
      collapsed: false,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: false,
      commonParent: paragraph.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: 11, block: paragraph},
      head: {blockId: paragraph.id, type: 'text', offset: 3, block: paragraph},
      start: {blockId: paragraph.id, type: 'text', offset: 3, block: paragraph},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: paragraph.id, type: 'text', offset: 3},
        commonParent: paragraph.id,
      }),
    }, 'ArrowUp');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: root.id, type: 'boundary', index: 0},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('extends out of a container to its parent boundary on Shift+Up', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['callout-1', 'p-after']};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root, childrenIds: ['inner']};
    const inner = {id: 'inner', nodeType: BlockNodeType.editable, textLength: 6, parentId: callout.id, parentBlock: callout};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [callout.id]: callout,
      [inner.id]: inner,
    } as any)[id]);
    doc.prevSibling.and.returnValue(null);
    const cleanup = installNativeSelection(inner.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = true;
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: true,
      isEndOfBlock: false,
      commonParent: inner.id,
      anchor: {blockId: inner.id, type: 'text', offset: 0, block: inner},
      head: {blockId: inner.id, type: 'text', offset: 0, block: inner},
      start: {blockId: inner.id, type: 'text', offset: 0, block: inner},
      toJSON: () => ({
        anchor: {blockId: inner.id, type: 'text', offset: 0},
        head: {blockId: inner.id, type: 'text', offset: 0},
        commonParent: inner.id,
      }),
    }, 'ArrowUp');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: inner.id, type: 'text', offset: 0},
        head: {blockId: root.id, type: 'boundary', index: 0},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('extends out of a container to its parent boundary on Shift+Right', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['callout-1', 'p-after']};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root, childrenIds: ['inner']};
    const inner = {id: 'inner', nodeType: BlockNodeType.editable, textLength: 6, parentId: callout.id, parentBlock: callout};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [callout.id]: callout,
      [inner.id]: inner,
    } as any)[id]);
    doc.nextSibling.and.returnValue(null);
    const cleanup = installNativeSelection(inner.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = true;
    const ctx = ctxFor({
      collapsed: true,
      isInSameBlock: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      commonParent: inner.id,
      anchor: {blockId: inner.id, type: 'text', offset: inner.textLength, block: inner},
      head: {blockId: inner.id, type: 'text', offset: inner.textLength, block: inner},
      start: {blockId: inner.id, type: 'text', offset: inner.textLength, block: inner},
      toJSON: () => ({
        anchor: {blockId: inner.id, type: 'text', offset: inner.textLength},
        head: {blockId: inner.id, type: 'text', offset: inner.textLength},
        commonParent: inner.id,
      }),
    }, 'ArrowRight');

    try {
      const result = keyboard._handleShiftLeftOrRight(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: inner.id, type: 'text', offset: inner.textLength},
        head: {blockId: root.id, type: 'boundary', index: 1},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('continues Shift+Up from a boundary head instead of the native focus node', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p0', 'callout-1', 'p1']};
    const previousParagraph = {id: 'p0', nodeType: BlockNodeType.editable, textLength: 8, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 16, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [previousParagraph.id]: previousParagraph,
      [callout.id]: callout,
      [paragraph.id]: paragraph,
    } as any)[id]);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = false;
    const ctx = ctxFor({
      collapsed: false,
      commonParent: root.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: 11, block: paragraph},
      head: {blockId: root.id, type: 'boundary', index: 1, block: root},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: root.id, type: 'boundary', index: 1},
        commonParent: root.id,
      }),
    }, 'ArrowUp');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.prevSibling).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: previousParagraph.id, type: 'text', offset: 0},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('continues Shift+Up from a model text head after replay resets native focus direction', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p-before', 'p0', 'callout-1', 'p1']};
    const before = {id: 'p-before', nodeType: BlockNodeType.editable, textLength: 5, parentId: root.id, parentBlock: root};
    const previousParagraph = {id: 'p0', nodeType: BlockNodeType.editable, textLength: 8, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 16, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [before.id]: before,
      [previousParagraph.id]: previousParagraph,
      [callout.id]: callout,
      [paragraph.id]: paragraph,
    } as any)[id]);
    doc.prevSibling.and.callFake((id: string) => id === previousParagraph.id ? before : null);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = false;
    const ctx = ctxFor({
      collapsed: false,
      commonParent: root.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: 11, block: paragraph},
      head: {blockId: previousParagraph.id, type: 'text', offset: 0, block: previousParagraph},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: previousParagraph.id, type: 'text', offset: 0},
        commonParent: root.id,
      }),
    }, 'ArrowUp');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.prevSibling).toHaveBeenCalledWith(previousParagraph.id);
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: before.id, type: 'text', offset: 0},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('continues Shift+Down from a boundary head instead of the native focus node', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p1', 'callout-1', 'p2']};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 16, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    const nextParagraph = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 7, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [paragraph.id]: paragraph,
      [callout.id]: callout,
      [nextParagraph.id]: nextParagraph,
    } as any)[id]);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = false;
    const ctx = ctxFor({
      collapsed: false,
      commonParent: root.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: 5, block: paragraph},
      head: {blockId: root.id, type: 'boundary', index: 2, block: root},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: 5},
        head: {blockId: root.id, type: 'boundary', index: 2},
        commonParent: root.id,
      }),
    }, 'ArrowDown');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.nextSibling).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: 5},
        head: {blockId: nextParagraph.id, type: 'text', offset: nextParagraph.textLength},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('continues Shift+Down from a model text head after replay resets native focus direction', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p1', 'callout-1', 'p2', 'p-after']};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 16, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    const nextParagraph = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 7, parentId: root.id, parentBlock: root};
    const after = {id: 'p-after', nodeType: BlockNodeType.editable, textLength: 5, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [paragraph.id]: paragraph,
      [callout.id]: callout,
      [nextParagraph.id]: nextParagraph,
      [after.id]: after,
    } as any)[id]);
    doc.nextSibling.and.callFake((id: string) => id === nextParagraph.id ? after : null);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = false;
    const ctx = ctxFor({
      collapsed: false,
      commonParent: root.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: 5, block: paragraph},
      head: {blockId: nextParagraph.id, type: 'text', offset: nextParagraph.textLength, block: nextParagraph},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: 5},
        head: {blockId: nextParagraph.id, type: 'text', offset: nextParagraph.textLength},
        commonParent: root.id,
      }),
    }, 'ArrowDown');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.nextSibling).toHaveBeenCalledWith(nextParagraph.id);
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: 5},
        head: {blockId: after.id, type: 'text', offset: after.textLength},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('shrinks an upward boundary selection when Shift+Down moves back over a block child', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p0', 'callout-1', 'p1']};
    const previousParagraph = {id: 'p0', nodeType: BlockNodeType.editable, textLength: 8, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 16, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [previousParagraph.id]: previousParagraph,
      [callout.id]: callout,
      [paragraph.id]: paragraph,
    } as any)[id]);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = false;
    const ctx = ctxFor({
      collapsed: false,
      commonParent: root.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: 11, block: paragraph},
      head: {blockId: root.id, type: 'boundary', index: 1, block: root},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: root.id, type: 'boundary', index: 1},
        commonParent: root.id,
      }),
    }, 'ArrowDown');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.selection.selectBlock).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: 11},
        head: {blockId: root.id, type: 'boundary', index: 2},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('shrinks a downward boundary selection when Shift+Up moves back over a block child', () => {
    const root = {id: 'root', nodeType: BlockNodeType.root, childrenIds: ['p1', 'callout-1', 'p2']};
    const paragraph = {id: 'p1', nodeType: BlockNodeType.editable, textLength: 16, parentId: root.id, parentBlock: root};
    const callout = {id: 'callout-1', nodeType: BlockNodeType.block, parentId: root.id, parentBlock: root};
    const nextParagraph = {id: 'p2', nodeType: BlockNodeType.editable, textLength: 7, parentId: root.id, parentBlock: root};
    doc.getBlockById.and.callFake((id: string) => ({
      [root.id]: root,
      [paragraph.id]: paragraph,
      [callout.id]: callout,
      [nextParagraph.id]: nextParagraph,
    } as any)[id]);
    const cleanup = installNativeSelection(paragraph.id);
    const nativeSelection = document.getSelection() as any;
    nativeSelection.isCollapsed = false;
    const ctx = ctxFor({
      collapsed: false,
      commonParent: root.id,
      anchor: {blockId: paragraph.id, type: 'text', offset: 5, block: paragraph},
      head: {blockId: root.id, type: 'boundary', index: 2, block: root},
      toJSON: () => ({
        anchor: {blockId: paragraph.id, type: 'text', offset: 5},
        head: {blockId: root.id, type: 'boundary', index: 2},
        commonParent: root.id,
      }),
    }, 'ArrowUp');

    try {
      const result = keyboard._handleShiftUpOrDown(ctx);

      expect(result).toBeTrue();
      expect(ctx.preventDefault).toHaveBeenCalled();
      expect(nativeSelection.extend).not.toHaveBeenCalled();
      expect(doc.selection.selectBlock).not.toHaveBeenCalled();
      expect(doc.selection.replay).toHaveBeenCalledWith({
        anchor: {blockId: paragraph.id, type: 'text', offset: 5},
        head: {blockId: root.id, type: 'boundary', index: 1},
        commonParent: root.id,
      });
      expect(doc.selection.scrollSelectionIntoView).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});

describe('SelectionKeyboard – Up/Down gap landing', () => {
  let doc: MockDoc;
  let keyboard: any;

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = createKeyboard(doc);
  });

  it('ArrowDown from text-end into a void sibling lands on gap-before', () => {
    const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
    const firstBlock = {id: 'p1', nodeType: BlockNodeType.editable};
    doc.nextSibling.and.returnValue(voidBlock);

    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {type: 'text', offset: 3},
      firstBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowDown'));

    expect(res).toBe(true);
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'before');
  });

  it('ArrowUp from text-start into a void sibling lands on gap-after', () => {
    const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
    const firstBlock = {id: 'p2', nodeType: BlockNodeType.editable};
    doc.prevSibling.and.returnValue(voidBlock);

    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: true,
      isEndOfBlock: false,
      start: {type: 'text', offset: 0},
      firstBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowUp'));

    expect(res).toBe(true);
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'after');
  });

  it('ArrowDown at gap-before of a void steps across to gap-after', () => {
    const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: true,
      isEndOfBlock: false,
      start: {type: 'gap', side: 'before'},
      firstBlock: voidBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowDown'));

    expect(res).toBe(true);
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'after');
  });

  it('ArrowDown at gap-after of a void steps out to the next sibling', () => {
    const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
    const next = {id: 'p3', nodeType: BlockNodeType.editable};
    doc.nextSibling.and.returnValue(next);

    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {type: 'gap', side: 'after'},
      firstBlock: voidBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowDown'));

    expect(res).toBe(true);
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(next, true);
  });

  it('ArrowUp at gap-after of a void steps across to gap-before', () => {
    const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {type: 'gap', side: 'after'},
      firstBlock: voidBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowUp'));

    expect(res).toBe(true);
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'before');
  });

  it('ArrowUp at gap-before of a void steps out to the previous sibling', () => {
    const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
    const prev = {id: 'p0', nodeType: BlockNodeType.editable};
    doc.prevSibling.and.returnValue(prev);

    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: true,
      isEndOfBlock: false,
      start: {type: 'gap', side: 'before'},
      firstBlock: voidBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowUp'));

    expect(res).toBe(true);
    // Entering the previous editable from below → cursor at its text-end.
    expect(doc.selection.selectOrSetCursorAtBlock).toHaveBeenCalledWith(prev, false);
  });

  it('ArrowDown from text-end into a container sibling lands on gap-before', () => {
    const container = {id: 'img1', nodeType: BlockNodeType.block};
    const firstBlock = {id: 'p1', nodeType: BlockNodeType.editable};
    doc.nextSibling.and.returnValue(container);

    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: false,
      isEndOfBlock: true,
      start: {type: 'text', offset: 4},
      firstBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowDown'));

    expect(res).toBe(true);
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(container, 'before');
  });

  it('gap caret pressing inward with no adjacent target stays in place', () => {
    // ArrowUp at gap-before is the "away" direction (not inward), so it tries to
    // exit. With no previous sibling and no enclosing container, the caret keeps
    // its current gap stop instead of moving or throwing.
    const voidBlock = {id: 'v1', nodeType: BlockNodeType.void};
    doc.prevSibling.and.returnValue(null);

    const sel = {
      isAllSelected: false,
      collapsed: true,
      isStartOfBlock: true,
      isEndOfBlock: false,
      start: {type: 'gap', side: 'before'},
      firstBlock: voidBlock,
    };

    const res = keyboard._handlerUpOrDown(ctxFor(sel, 'ArrowUp'));

    expect(res).toBe(true);
    expect(doc.selection.setGapCursor).toHaveBeenCalledWith(voidBlock, 'before');
  });
});
