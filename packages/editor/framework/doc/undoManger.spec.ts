import * as Y from "yjs";
import {DocUndoManger} from "./undoManger";
import {BlockNodeType} from "../block-std";
import {BlockSelection} from "../modules/selection";
import {resolveRelativeSelectionBookmark} from "../modules/selection/relative-bookmark";
import {
  BlockReadonlyError,
  BlockReadonlyOperation,
} from "./block-readonly.types";
import {ORIGIN_BLOCK_READONLY_CONTROL} from "./origins";

/**
 * Regression guard for the "second Ctrl+Z does nothing" bug.
 *
 * `undoRedoing$` is normally reset inside crud._syncYEvent during the undo
 * transaction. If that observer throws before the reset (e.g. a children-sync
 * hiccup while reverting a cross-block paste), the flag sticks `true` and the
 * `undo()` guard silently blocks EVERY subsequent undo. undo()/redo() must
 * therefore guarantee the reset themselves.
 *
 * This suite runs the manager WITHOUT the crud observer, so the flag would stay
 * stuck if the try/finally reset were missing.
 */
describe('DocUndoManger – undoRedoing flag never sticks', () => {
  let ydoc: Y.Doc;
  let yBlockMap: Y.Map<any>;
  let mgr: DocUndoManger;
  let mockDoc: any;

  beforeEach(() => {
    ydoc = new Y.Doc();
    yBlockMap = ydoc.getMap('blocks');
    mockDoc = {
      selection: {
        value: null,
        replay: jasmine.createSpy('replay'),
        recalculate: jasmine.createSpy('recalculate'),
        restoreBookmark: jasmine.createSpy('restoreBookmark'),
      },
      logger: {warn: jasmine.createSpy('warn')},
      getBlockById: () => { throw new Error('no block in test'); },
      isEditable: () => false,
      root: {hostElement: document.createElement('div')},
      yDoc: ydoc,
      model: {exists: (id: string) => yBlockMap.has(id)},
      readonlyManager: {
        assertUndoRedoWritable: jasmine.createSpy('assertUndoRedoWritable'),
      },
    };
    mockDoc.selection.replay.and.callFake((selection: any) => {
      mockDoc.selection.value = selection;
    });
    mgr = new DocUndoManger(mockDoc, yBlockMap);
  });

  afterEach(() => ydoc.destroy());

  const change = (key: string) => ydoc.transact(() => yBlockMap.set(key, new Y.Map()), null);

  it('clears the flag after undo()', () => {
    change('a');
    expect(mgr.isCanUndo()).toBeTrue();

    mgr.undo();

    expect((mgr as any).undoRedoing$.value).toBeFalse();
  });

  it('keeps a blocked undo item on top and allows it after unlock', () => {
    change('locked');
    const error = new BlockReadonlyError({
      operation: BlockReadonlyOperation.Undo,
      blockIds: ['locked'],
      source: {kind: 'self', blockId: 'locked'},
    });
    mockDoc.readonlyManager.assertUndoRedoWritable.and.throwError(error);

    mgr.undo();

    expect(yBlockMap.has('locked')).toBeTrue();
    expect(mgr.isCanUndo()).toBeTrue();
    expect(mgr.isCanRedo()).toBeFalse();
    expect(mockDoc.selection.replay).not.toHaveBeenCalled();
    expect(mockDoc.readonlyManager.assertUndoRedoWritable).toHaveBeenCalledWith(
      ['locked'],
      BlockReadonlyOperation.Undo,
    );

    mockDoc.readonlyManager.assertUndoRedoWritable.and.stub();
    mgr.undo();

    expect(yBlockMap.has('locked')).toBeFalse();
    expect(mgr.isCanUndo()).toBeFalse();
    expect(mgr.isCanRedo()).toBeTrue();
  });

  it('keeps a blocked redo item and allows it after unlock', () => {
    const yText = new Y.Text();
    ydoc.transact(() => {
      const yBlock = new Y.Map();
      yBlock.set('children', yText);
      yBlockMap.set('locked', yBlock);
    }, ORIGIN_BLOCK_READONLY_CONTROL);
    ydoc.transact(() => yText.insert(0, 'x'), null);
    mgr.undo();
    expect(mgr.isCanRedo()).toBeTrue();

    mockDoc.readonlyManager.assertUndoRedoWritable.and.throwError(new BlockReadonlyError({
      operation: BlockReadonlyOperation.Redo,
      blockIds: ['locked'],
      source: {kind: 'self', blockId: 'locked'},
    }));
    mgr.redo();

    expect(yText.toString()).toBe('');
    expect(mgr.isCanRedo()).toBeTrue();

    mockDoc.readonlyManager.assertUndoRedoWritable.and.stub();
    mgr.redo();

    expect(yText.toString()).toBe('x');
    expect(mgr.isCanRedo()).toBeFalse();
  });

  it('does not add readonly-control transactions to the content undo stack', () => {
    ydoc.transact(() => yBlockMap.set('lock-control', new Y.Map()), ORIGIN_BLOCK_READONLY_CONTROL);

    expect(mgr.isCanUndo()).toBeFalse();
  });

  it('unions affected block ids when Yjs merges nested changes into one stack item', () => {
    const textA = new Y.Text();
    const textB = new Y.Text();
    ydoc.transact(() => {
      const blockA = new Y.Map();
      blockA.set('children', textA);
      yBlockMap.set('a', blockA);
      const blockB = new Y.Map();
      blockB.set('children', textB);
      yBlockMap.set('b', blockB);
    }, ORIGIN_BLOCK_READONLY_CONTROL);
    ydoc.transact(() => textA.insert(0, 'a'), null);
    ydoc.transact(() => textB.insert(0, 'b'), null);
    mockDoc.readonlyManager.assertUndoRedoWritable.and.throwError(new BlockReadonlyError({
      operation: BlockReadonlyOperation.Undo,
      blockIds: ['a'],
      source: {kind: 'self', blockId: 'a'},
    }));

    mgr.undo();

    expect(mockDoc.readonlyManager.assertUndoRedoWritable).toHaveBeenCalledWith(
      ['a', 'b'],
      BlockReadonlyOperation.Undo,
    );
    expect(textA.toString()).toBe('a');
    expect(textB.toString()).toBe('b');
    expect(mgr.isCanUndo()).toBeTrue();
  });

  it('does not treat a structural parent as affected when only unlocked children changed', () => {
    const rootChildren = new Y.Array<string>();
    const textA = new Y.Text();
    ydoc.transact(() => {
      const root = new Y.Map();
      root.set('children', rootChildren);
      yBlockMap.set('root', root);

      const blockA = new Y.Map();
      blockA.set('children', textA);
      yBlockMap.set('a', blockA);
      yBlockMap.set('b', new Y.Map());
      yBlockMap.set('locked-sibling', new Y.Map());
      rootChildren.insert(0, ['a', 'b', 'locked-sibling']);
    }, ORIGIN_BLOCK_READONLY_CONTROL);

    ydoc.transact(() => {
      textA.insert(0, 'x');
      rootChildren.delete(1, 1);
      yBlockMap.delete('b');
    }, null);
    mockDoc.readonlyManager.assertUndoRedoWritable.and.callFake((blockIds: string[]) => {
      if (!blockIds.includes('root')) return;
      throw new BlockReadonlyError({
        operation: BlockReadonlyOperation.Undo,
        blockIds: ['root'],
        source: {kind: 'descendant', blockId: 'locked-sibling'},
      });
    });

    mgr.undo();

    expect(mockDoc.readonlyManager.assertUndoRedoWritable).toHaveBeenCalledWith(
      ['a'],
      BlockReadonlyOperation.Undo,
    );
    expect(textA.toString()).toBe('');
    expect(yBlockMap.has('b')).toBeTrue();
  });

  it('does not block a second undo across two stack items', () => {
    change('a');
    mgr.stopCapturing();   // force a separate undo item
    change('b');

    mgr.undo();            // reverts 'b'
    expect(mgr.isCanUndo()).toBeTrue();

    mgr.undo();            // would be a no-op if the flag had stuck true
    expect((mgr as any).undoRedoing$.value).toBeFalse();
    expect(yBlockMap.has('a')).toBeFalse();
    expect(yBlockMap.has('b')).toBeFalse();
  });

  it('captures one transaction as an independently undoable item', () => {
    change('before');

    const captured = mgr.captureUndoItem(() => {
      ydoc.transact(() => {
        yBlockMap.set('agent-a', new Y.Map());
        yBlockMap.set('agent-b', new Y.Map());
      }, null);
      return 'applied';
    });

    expect(captured.result).toBe('applied');
    expect(captured.token).not.toBeNull();
    expect(mgr.canUndoCapturedItem(captured.token!)).toBeTrue();
    expect(mgr.undoCapturedItem(captured.token!)).toBeTrue();
    expect(yBlockMap.has('agent-a')).toBeFalse();
    expect(yBlockMap.has('agent-b')).toBeFalse();
    expect(yBlockMap.has('before')).toBeTrue();
  });

  it('refuses to undo a captured item after a later local edit', () => {
    const captured = mgr.captureUndoItem(() => change('agent'));
    expect(captured.token).not.toBeNull();

    change('user');

    expect(mgr.canUndoCapturedItem(captured.token!)).toBeFalse();
    expect(mgr.undoCapturedItem(captured.token!)).toBeFalse();
    expect(yBlockMap.has('agent')).toBeTrue();
    expect(yBlockMap.has('user')).toBeTrue();
  });

  it('returns no token when the captured action makes no tracked change', () => {
    const captured = mgr.captureUndoItem(() => 42);

    expect(captured).toEqual({result: 42, token: null});
    expect(mgr.isCanUndo()).toBeFalse();
  });

  it('returns no atomic token when a callback creates several undo items', () => {
    const captured = mgr.captureUndoItem(() => {
      change('first');
      mgr.stopCapturing();
      change('second');
    });

    expect(captured.token).toBeNull();
    expect(yBlockMap.has('first')).toBeTrue();
    expect(yBlockMap.has('second')).toBeTrue();
  });

  it('clears the flag after redo()', () => {
    change('a');
    mgr.undo();
    expect(mgr.isCanRedo()).toBeTrue();

    mgr.redo();

    expect((mgr as any).undoRedoing$.value).toBeFalse();
    expect(yBlockMap.has('a')).toBeTrue();
  });

  it('clears the live selection before undo transaction observers run', () => {
    change('a');
    mockDoc.selection.value = {
      anchor: {type: 'selected', blockId: 'a'},
      head: {type: 'selected', blockId: 'a'},
      commonParent: 'a',
    };
    const order: string[] = [];
    mockDoc.selection.replay.and.callFake((selection: any) => {
      if (selection === null) {
        order.push('clear');
        mockDoc.selection.value = null;
      }
    });
    yBlockMap.observe(() => {
      order.push(mockDoc.selection.value ? 'observer:live' : 'observer:clear');
    });

    mgr.undo();

    expect(order[0]).toBe('clear');
    expect(order).toContain('observer:clear');
    expect(order).not.toContain('observer:live');
  });

  it('clears the live selection before redo transaction observers run', () => {
    change('a');
    mgr.undo();
    mockDoc.selection.value = {
      anchor: {type: 'selected', blockId: 'a'},
      head: {type: 'selected', blockId: 'a'},
      commonParent: 'a',
    };
    const order: string[] = [];
    mockDoc.selection.replay.and.callFake((selection: any) => {
      if (selection === null) {
        order.push('clear');
        mockDoc.selection.value = null;
      }
    });
    yBlockMap.observe(() => {
      order.push(mockDoc.selection.value ? 'observer:live' : 'observer:clear');
    });

    mgr.redo();

    expect(order[0]).toBe('clear');
    expect(order).toContain('observer:clear');
    expect(order).not.toContain('observer:live');
  });

  it('groups transactions across the elapsed capture window and stops merging after the group', () => {
    const yUndoManager = (mgr as any)._yUndoManager as Y.UndoManager;

    (mgr as any).beginCaptureGroup();
    change('group-a');
    (yUndoManager as any).lastChange = 1; // Simulate composition taking longer than the normal capture timeout.
    change('group-b');
    (mgr as any).endCaptureGroup();

    expect(yUndoManager.undoStack.length).toBe(1);
    expect(yUndoManager.captureTimeout).toBe(500);

    change('after-group');
    expect(yUndoManager.undoStack.length).toBe(2);

    mgr.undo();
    expect(yBlockMap.has('after-group')).toBeFalse();
    expect(yBlockMap.has('group-a')).toBeTrue();
    expect(yBlockMap.has('group-b')).toBeTrue();

    mgr.undo();
    expect(yBlockMap.has('group-a')).toBeFalse();
    expect(yBlockMap.has('group-b')).toBeFalse();
  });

  it('clears a pending selection snapshot when Yjs merges into an existing undo item', () => {
    mockDoc.selection.value = {
      anchor: {type: 'selected', blockId: 'first'},
      head: {type: 'selected', blockId: 'first'},
      commonParent: 'first',
    };
    mgr.captureSelectionBeforeChange();
    change('first-change');
    expect((mgr as any)._pendingUndoSnapshot).toBeUndefined();

    mockDoc.selection.value = {
      anchor: {type: 'selected', blockId: 'merged'},
      head: {type: 'selected', blockId: 'merged'},
      commonParent: 'merged',
    };
    mgr.captureSelectionBeforeChange();
    expect((mgr as any)._pendingUndoSnapshot.source).toEqual({
      anchor: {type: 'selected', blockId: 'merged'},
      head: {type: 'selected', blockId: 'merged'},
      commonParent: 'merged',
    });

    change('merged-change');

    expect((mgr as any)._pendingUndoSnapshot).toBeUndefined();
  });

  it('keeps the first pending selection when nested mutations capture again after blur', () => {
    const beforeSelection = {
      anchor: {type: 'selected' as const, blockId: 'before'},
      head: {type: 'selected' as const, blockId: 'before'},
      commonParent: 'before',
    };
    ydoc.transact(
      () => yBlockMap.set('before', new Y.Map()),
      ORIGIN_BLOCK_READONLY_CONTROL,
    );
    mockDoc.selection.value = beforeSelection;
    mgr.captureSelectionBeforeChange();

    // A nested delete path may blur the live selection and request another
    // capture before the same Yjs stack item is created. It must not replace
    // the outer action's before-selection with null.
    mockDoc.selection.value = null;
    mgr.captureSelectionBeforeChange();
    change('nested-replace');

    mgr.undo();

    const bookmark = mockDoc.selection.restoreBookmark.calls.mostRecent().args[0];
    expect(bookmark.source).toEqual(beforeSelection);
  });

  it('stores the pre-undo selection on the Yjs redo stack item', () => {
    const beforeChange = {
      anchor: {type: 'selected' as const, blockId: 'before'},
      head: {type: 'selected' as const, blockId: 'before'},
      commonParent: 'before',
    };
    const beforeUndo = {
      anchor: {type: 'selected' as const, blockId: 'after'},
      head: {type: 'selected' as const, blockId: 'after'},
      commonParent: 'after',
    };
    ydoc.transact(() => {
      yBlockMap.set('before', new Y.Map());
      yBlockMap.set('after', new Y.Map());
    }, ORIGIN_BLOCK_READONLY_CONTROL);
    mockDoc.selection.value = beforeChange;
    mgr.captureSelectionBeforeChange();
    change('history-change');
    mockDoc.selection.value = beforeUndo;

    mgr.undo();
    expect(mockDoc.selection.restoreBookmark.calls.mostRecent().args[0].source).toEqual(beforeChange);

    mgr.redo();
    expect(mockDoc.selection.restoreBookmark.calls.mostRecent().args[0].source).toEqual(beforeUndo);
  });

  it('keeps the live selection when a remote delete invalidates the undo bookmark', () => {
    const beforeChange = {
      anchor: {type: 'selected' as const, blockId: 'deleted'},
      head: {type: 'selected' as const, blockId: 'deleted'},
      commonParent: 'deleted',
    };
    const beforeUndo = {
      anchor: {type: 'selected' as const, blockId: 'live'},
      head: {type: 'selected' as const, blockId: 'live'},
      commonParent: 'live',
    };
    ydoc.transact(() => {
      yBlockMap.set('deleted', new Y.Map());
      yBlockMap.set('live', new Y.Map());
    }, ORIGIN_BLOCK_READONLY_CONTROL);
    mockDoc.selection.value = beforeChange;
    mgr.captureSelectionBeforeChange();
    change('history-change');

    ydoc.transact(() => yBlockMap.delete('deleted'), ORIGIN_BLOCK_READONLY_CONTROL);
    mockDoc.selection.value = beforeUndo;
    mgr.undo();

    const bookmark = mockDoc.selection.restoreBookmark.calls.mostRecent().args[0];
    expect(bookmark.source).toEqual(beforeUndo);
    expect(yBlockMap.has('deleted')).toBeFalse();
  });
});

/**
 * P6: undo/redo must round-trip a gap cursor's `side` (before/after) as
 * anchor/head selection JSON instead of degrading it to a whole-block `selected`
 * snapshot.
 */
describe('DocUndoManger – gap selection side round-trip', () => {
  let ydoc: Y.Doc;
  let yBlockMap: Y.Map<any>;
  let mgr: DocUndoManger;
  let mockDoc: any;

  const gapSelection = (blockId: string, side: 'before' | 'after') => {
    const point = {blockId, type: 'gap' as const, side};
    return {
      anchor: point,
      head: point,
      start: point,
      end: point,
      commonParent: blockId,
      isInSameBlock: true,
    };
  };

  beforeEach(() => {
    ydoc = new Y.Doc();
    yBlockMap = ydoc.getMap('blocks');
    mockDoc = {
      selection: {
        value: null,
        replay: jasmine.createSpy('replay'),
        recalculate: jasmine.createSpy('recalculate'),
        restoreBookmark: jasmine.createSpy('restoreBookmark'),
      },
      logger: {warn: jasmine.createSpy('warn')},
      // gap blocks are non-editable; getBlockById must succeed for the resolve guard.
      getBlockById: (id: string) => ({id, nodeType: 'void'}),
      isEditable: () => false,
      root: {hostElement: document.createElement('div')},
      yDoc: ydoc,
    };
    mgr = new DocUndoManger(mockDoc, yBlockMap);
  });

  afterEach(() => ydoc.destroy());

  it('captures the gap side in the selection snapshot', () => {
    mockDoc.selection.value = gapSelection('void-1', 'before');
    const snapshot = (mgr as any)._captureSelectionSnapshot();

    expect(snapshot).not.toBeNull();
    expect(snapshot.anchor.type).toBe('gap');
    expect(snapshot.anchor.blockId).toBe('void-1');
    expect(snapshot.anchor.side).toBe('before');
    expect(snapshot.head.type).toBe('gap');
    expect(snapshot.head.side).toBe('before');
    expect(snapshot.source.commonParent).toBe('void-1');
  });

  it('resolves a captured gap snapshot back to a collapsed gap selection (side preserved)', () => {
    mockDoc.selection.value = gapSelection('void-1', 'after');
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    const resolved = resolveRelativeSelectionBookmark(snapshot, mockDoc);

    expect(resolved).not.toBeNull();
    expect(resolved!.anchor.type).toBe('gap');
    expect(resolved!.anchor.side).toBe('after');
    expect(resolved!.anchor.blockId).toBe('void-1');
    expect(resolved!.head.type).toBe('gap');
    expect(resolved!.head.side).toBe('after');
    expect(resolved!.commonParent).toBe('void-1');
  });

  it('round-trips both sides distinctly', () => {
    for (const side of ['before', 'after'] as const) {
      mockDoc.selection.value = gapSelection('void-9', side);
      const snapshot = (mgr as any)._captureSelectionSnapshot();
      const resolved = resolveRelativeSelectionBookmark(snapshot, mockDoc);
      expect(resolved!.anchor.side).toBe(side);
      expect(resolved!.head.side).toBe(side);
    }
  });

  it('drops the gap snapshot when the block no longer exists', () => {
    mockDoc.selection.value = gapSelection('gone', 'before');
    mockDoc.getBlockById = () => { throw new Error('block not found'); };
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    // capture still records the gap (block ref not needed to capture)…
    expect(snapshot.anchor.type).toBe('gap');
    // …but resolve returns null because the block is gone.
    expect(resolveRelativeSelectionBookmark(snapshot, mockDoc)).toBeNull();
  });
});

describe('DocUndoManger – text and boundary selection snapshots', () => {
  let ydoc: Y.Doc;
  let yBlockMap: Y.Map<any>;
  let mgr: DocUndoManger;
  let mockDoc: any;
  let blocks: Record<string, any>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    yBlockMap = ydoc.getMap('blocks');
    blocks = {};
    mockDoc = {
      selection: {
        value: null,
        replay: jasmine.createSpy('replay'),
        recalculate: jasmine.createSpy('recalculate'),
        restoreBookmark: jasmine.createSpy('restoreBookmark'),
      },
      logger: {warn: jasmine.createSpy('warn')},
      getBlockById: (id: string) => blocks[id],
      isEditable: (block: any) => block.nodeType === BlockNodeType.editable,
      root: {hostElement: document.createElement('div')},
      yDoc: ydoc,
    };
    mockDoc.selection.replay.and.callFake((selection: any) => {
      mockDoc.selection.value = selection;
    });
    mgr = new DocUndoManger(mockDoc, yBlockMap, {captureTimeout: 0});
  });

  afterEach(() => ydoc.destroy());

  const createEditableBlock = (id: string, text: string, hostElement = document.createElement('p')) => {
    const yText = new Y.Text();
    const yBlock = new Y.Map<any>();
    yBlock.set('children', yText);
    yBlockMap.set(id, yBlock);
    yText.insert(0, text);
    const block = {
      id,
      nodeType: BlockNodeType.editable,
      parentId: null as string | null,
      parentBlock: null as any,
      yText,
      textLength: text.length,
      hostElement,
    };
    blocks[id] = block;
    return block;
  };

  const createCrossColumnSelection = () => {
    const rootHost = document.createElement('div');
    const leftHost = document.createElement('p');
    const rightHost = document.createElement('p');
    rootHost.setAttribute('contenteditable', 'true');
    rootHost.append(leftHost, rightHost);
    const left = createEditableBlock('left-p', 'left text', leftHost);
    const right = createEditableBlock('right-p', 'right text', rightHost);
    const columns = {
      id: 'columns-1',
      nodeType: BlockNodeType.block,
      hostElement: rootHost,
      childrenIds: ['left-p', 'right-p'],
    };
    blocks['columns-1'] = columns;
    left.parentId = 'columns-1';
    left.parentBlock = columns;
    right.parentId = 'columns-1';
    right.parentBlock = columns;
    const selection = new BlockSelection(
      {blockId: left.id, type: 'text', offset: 2, block: left} as any,
      {blockId: right.id, type: 'text', offset: 5, block: right} as any,
      'columns-1',
      id => blocks[id],
      (a, b) => {
        if (a === b) return 0;
        return a === left.id
          ? Node.DOCUMENT_POSITION_FOLLOWING
          : Node.DOCUMENT_POSITION_PRECEDING;
      },
    );
    const json = {
      anchor: {blockId: left.id, type: 'text' as const, offset: 2},
      head: {blockId: right.id, type: 'text' as const, offset: 5},
      commonParent: 'columns-1',
    };
    return {rootHost, selection, json};
  };

  it('preserves backward text anchor/head offsets', () => {
    const yText = new Y.Text();
    const yBlock = new Y.Map<any>();
    yBlock.set('children', yText);
    yBlockMap.set('p1', yBlock);
    yText.insert(0, 'hello');
    const block = {
      id: 'p1',
      nodeType: BlockNodeType.editable,
      yText,
      textLength: 5,
      hostElement: document.createElement('p'),
    };
    blocks['p1'] = block;
    mockDoc.selection.value = new BlockSelection(
      {blockId: 'p1', type: 'text', offset: 5, block} as any,
      {blockId: 'p1', type: 'text', offset: 1, block} as any,
      'p1',
      id => blocks[id],
      () => 0,
    );

    const resolved = resolveRelativeSelectionBookmark((mgr as any)._captureSelectionSnapshot(), mockDoc);

    expect(resolved).toEqual({
      anchor: {blockId: 'p1', type: 'text', offset: 5},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    });
  });

  it('binds cross-column text selection bookmarks to the undo stack item', () => {
    const {rootHost, selection, json} = createCrossColumnSelection();
    document.body.appendChild(rootHost);
    mockDoc.root.hostElement = rootHost;
    mgr.clearHistory();
    mockDoc.selection.value = selection;
    mgr.captureSelectionBeforeChange();
    ydoc.transact(() => yBlockMap.set('changed', new Y.Map()), null);
    mockDoc.selection.value = null;

    mgr.undo();

    const bookmark = mockDoc.selection.restoreBookmark.calls.mostRecent().args[0];
    expect(bookmark.source).toEqual(json);
    expect(mockDoc.selection.recalculate).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it('resolves boundary points through children relative positions', () => {
    const yChildren = new Y.Array<string>();
    const yBlock = new Y.Map<any>();
    yBlock.set('children', yChildren);
    yBlockMap.set('callout-1', yBlock);
    yChildren.insert(0, ['p1', 'p2', 'p3']);
    const hostElement = document.createElement('div');
    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      yBlock,
      hostElement,
      get childrenLength() {
        return yChildren.length;
      },
      get childrenIds() {
        return yChildren.toArray();
      },
    };
    blocks['callout-1'] = callout;
    mockDoc.selection.value = new BlockSelection(
      {blockId: 'callout-1', type: 'boundary', index: 2, block: callout} as any,
      {blockId: 'callout-1', type: 'boundary', index: 0, block: callout} as any,
      'callout-1',
      id => blocks[id],
      () => 0,
    );

    const snapshot = (mgr as any)._captureSelectionSnapshot();
    yChildren.delete(1, 1);
    const resolved = resolveRelativeSelectionBookmark(snapshot, mockDoc);

    expect(resolved).toEqual({
      anchor: {blockId: 'callout-1', type: 'boundary', index: 1},
      head: {blockId: 'callout-1', type: 'boundary', index: 0},
      commonParent: 'callout-1',
    });
  });
});

describe('DocUndoManger – table-cell selection round-trip', () => {
  let ydoc: Y.Doc;
  let yBlockMap: Y.Map<any>;
  let mgr: DocUndoManger;
  let mockDoc: any;
  let blocks: Record<string, any>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    yBlockMap = ydoc.getMap('blocks');
    const rootHost = document.createElement('div');
    rootHost.setAttribute('contenteditable', 'true');
    const tableHost = document.createElement('table');
    const row1Host = document.createElement('tr');
    const row2Host = document.createElement('tr');
    const c1Host = document.createElement('td');
    const c4Host = document.createElement('td');
    row1Host.appendChild(c1Host);
    row2Host.appendChild(c4Host);
    tableHost.append(row1Host, row2Host);
    rootHost.appendChild(tableHost);
    document.body.appendChild(rootHost);

    const table = {
      id: 'table-1',
      flavour: 'table',
      nodeType: BlockNodeType.block,
      hostElement: tableHost,
      childrenIds: ['row-1', 'row-2'],
    };
    const row1 = {
      id: 'row-1',
      flavour: 'table-row',
      nodeType: BlockNodeType.block,
      hostElement: row1Host,
      parentId: 'table-1',
      childrenIds: ['cell-1'],
    };
    const row2 = {
      id: 'row-2',
      flavour: 'table-row',
      nodeType: BlockNodeType.block,
      hostElement: row2Host,
      parentId: 'table-1',
      childrenIds: ['cell-4'],
    };
    const cell1 = {
      id: 'cell-1',
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
      hostElement: c1Host,
      parentId: 'row-1',
    };
    const cell4 = {
      id: 'cell-4',
      flavour: 'table-cell',
      nodeType: BlockNodeType.block,
      hostElement: c4Host,
      parentId: 'row-2',
    };
    blocks = {
      'table-1': table,
      'row-1': row1,
      'row-2': row2,
      'cell-1': cell1,
      'cell-4': cell4,
    };

    const selection = new BlockSelection(
      {blockId: 'cell-4', type: 'table-cell', tableId: 'table-1', block: cell4} as any,
      {blockId: 'cell-1', type: 'table-cell', tableId: 'table-1', block: cell1} as any,
      'table-1',
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );

    mockDoc = {
      selection: {
        value: selection,
        replay: jasmine.createSpy('replay'),
        recalculate: jasmine.createSpy('recalculate'),
        restoreBookmark: jasmine.createSpy('restoreBookmark'),
      },
      logger: {warn: jasmine.createSpy('warn')},
      getBlockById: (id: string) => {
        const block = blocks[id];
        if (!block) throw new Error(`Block not found: ${id}`);
        return block;
      },
      isEditable: () => false,
      root: {hostElement: rootHost},
      yDoc: ydoc,
    };
    mockDoc.selection.replay.and.callFake((selection: any) => {
      mockDoc.selection.value = selection;
    });
    mgr = new DocUndoManger(mockDoc, yBlockMap, {captureTimeout: 0});
  });

  afterEach(() => {
    mockDoc.root.hostElement.remove();
    ydoc.destroy();
  });

  it('captures and resolves table-cell endpoints with tableId', () => {
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    const resolved = resolveRelativeSelectionBookmark(snapshot, mockDoc);

    expect(resolved!.anchor).toEqual({
      type: 'table-cell',
      blockId: 'cell-4',
      tableId: 'table-1',
    });
    expect(resolved!.head).toEqual({
      type: 'table-cell',
      blockId: 'cell-1',
      tableId: 'table-1',
    });
    expect(resolved!.commonParent).toBe('table-1');
  });

  it('binds table-cell selection bookmarks to the undo stack item', () => {
    mgr.captureSelectionBeforeChange();
    ydoc.transact(() => yBlockMap.set('changed', new Y.Map()), null);
    mockDoc.selection.value = null;

    mgr.undo();

    const bookmark = mockDoc.selection.restoreBookmark.calls.mostRecent().args[0];
    expect(bookmark.source).toEqual({
      anchor: {
        type: 'table-cell',
        blockId: 'cell-4',
        tableId: 'table-1',
      },
      head: {
        type: 'table-cell',
        blockId: 'cell-1',
        tableId: 'table-1',
      },
      commonParent: 'table-1',
    });
  });

  it('leaves table-cell DOM normalization to the selection domain', () => {
    mgr.captureSelectionBeforeChange();
    ydoc.transact(() => yBlockMap.set('changed', new Y.Map()), null);
    mockDoc.selection.value = null;

    mgr.undo();

    expect(mockDoc.selection.restoreBookmark).toHaveBeenCalledTimes(1);
    expect(mockDoc.selection.recalculate).not.toHaveBeenCalled();
  });
});
