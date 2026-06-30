import {SelectionKeyboard} from './selection-keyboard';
import {BlockNodeType} from '../../block-std';

// `@DocEventRegister` validates `doc.event` and registers listeners in the
// constructor, so the mock doc must expose a minimal event dispatcher stub.
const eventStub = () => ({add() {}, bindHotkey() {}});

interface MockSelection {
  setGapCursor: jasmine.Spy;
  selectOrSetCursorAtBlock: jasmine.Spy;
  setCursorAtBlock: jasmine.Spy;
  scrollSelectionIntoView: jasmine.Spy;
}

interface MockDoc {
  event: ReturnType<typeof eventStub>;
  prevSibling: jasmine.Spy;
  nextSibling: jasmine.Spy;
  isEditable: jasmine.Spy;
  getBlockById: jasmine.Spy;
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
    selection: {
      setGapCursor: jasmine.createSpy('setGapCursor'),
      selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
      setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
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

describe('SelectionKeyboard – Left/Right gap navigation', () => {
  let doc: MockDoc;
  let keyboard: any;

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = new SelectionKeyboard(doc as any) as any;
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
  });
});

describe('SelectionKeyboard – Up/Down gap landing', () => {
  let doc: MockDoc;
  let keyboard: any;

  beforeEach(() => {
    doc = createMockDoc();
    keyboard = new SelectionKeyboard(doc as any) as any;
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
