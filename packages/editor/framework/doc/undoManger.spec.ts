import * as Y from "yjs";
import {DocUndoManger} from "./undoManger";
import {BlockNodeType} from "../block-std";
import {BlockSelection} from "../modules/selection";
import {nextTick} from "../../global";

const waitFrames = async (count: number) => {
  for (let i = 0; i < count; i++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

beforeEach(() => {
  spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
    const id = window.setTimeout(() => callback(performance.now()), 0);
    return id;
  });
});

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
      selection: {value: null, replay: jasmine.createSpy('replay'), recalculate: jasmine.createSpy('recalculate')},
      logger: {warn: jasmine.createSpy('warn')},
      getBlockById: () => { throw new Error('no block in test'); },
      isEditable: () => false,
      root: {hostElement: document.createElement('div')},
      yDoc: ydoc,
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

  it('clears selection without warning when an undo selection snapshot no longer resolves', async () => {
    (mgr as any)._replaySelectionAfterUndoRedo({
      anchor: {type: 'selected', blockId: 'gone'},
      head: {type: 'selected', blockId: 'gone'},
      commonParent: 'gone',
    });

    await nextTick();
    await waitFrames(3);

    expect(mockDoc.selection.replay).toHaveBeenCalledWith(null);
    expect(mockDoc.selection.recalculate).not.toHaveBeenCalled();
    expect(mockDoc.logger.warn).not.toHaveBeenCalled();
  });

  it('clears selection instead of sampling DOM when snapshot resolution keeps throwing', async () => {
    spyOn<any>(mgr, '_resolveSelectionSnapshot').and.throwError('resolver failed');

    (mgr as any)._replaySelectionAfterUndoRedo({
      anchor: {type: 'selected', blockId: 'broken'},
      head: {type: 'selected', blockId: 'broken'},
      commonParent: 'broken',
    });

    await nextTick();
    await waitFrames(3);

    expect(mockDoc.selection.replay).toHaveBeenCalledWith(null);
    expect(mockDoc.selection.recalculate).not.toHaveBeenCalled();
  });

  it('clears selection instead of sampling DOM when projection keeps throwing', async () => {
    const selection = {
      anchor: {type: 'selected' as const, blockId: 'broken'},
      head: {type: 'selected' as const, blockId: 'broken'},
      commonParent: 'broken',
    };
    mockDoc.selection.replay.and.callFake((value: any) => {
      if (value) throw new Error('projection failed');
      mockDoc.selection.value = null;
    });

    const version = (mgr as any)._nextSelectionReplayVersion();
    (mgr as any)._replayResolvedSelectionAfterUndoRedo(selection, 3, version);
    await waitFrames(3);

    expect(mockDoc.selection.replay).toHaveBeenCalledWith(null);
    expect(mockDoc.selection.recalculate).not.toHaveBeenCalled();
  });

  it('retries undo selection replay until restored block components are available', async () => {
    const host = document.createElement('div');
    const blockHost = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.appendChild(blockHost);
    document.body.appendChild(host);
    mockDoc.root.hostElement = host;
    let attempts = 0;
    mockDoc.getBlockById = jasmine.createSpy('getBlockById').and.callFake((id: string) => {
      if (id !== 'late') throw new Error('missing');
      if (attempts++ === 0) throw new Error('not mounted yet');
      return {
        id,
        hostElement: blockHost,
      };
    });

    (mgr as any)._replaySelectionAfterUndoRedo({
      anchor: {type: 'selected', blockId: 'late'},
      head: {type: 'selected', blockId: 'late'},
      commonParent: 'late',
    });

    await nextTick();
    expect(mockDoc.selection.replay).not.toHaveBeenCalledWith(null);
    await waitFrames(1);

    expect(mockDoc.selection.replay).toHaveBeenCalledWith({
      anchor: {type: 'selected', blockId: 'late'},
      head: {type: 'selected', blockId: 'late'},
      commonParent: 'late',
    });
    host.remove();
  });

  it('replays restored selection again when the browser drops focus after undo', async () => {
    const host = document.createElement('div');
    const blockHost = document.createElement('div');
    const outside = document.createElement('button');
    host.setAttribute('contenteditable', 'true');
    host.appendChild(blockHost);
    document.body.append(host, outside);
    mockDoc.root.hostElement = host;
    mockDoc.getBlockById = jasmine.createSpy('getBlockById').and.callFake((id: string) => {
      if (id !== 'block-1') throw new Error('missing');
      return {
        id,
        hostElement: blockHost,
      };
    });
    let replayCount = 0;
    mockDoc.selection.replay.and.callFake((selection: any) => {
      mockDoc.selection.value = selection;
      if (selection) {
        replayCount += 1;
        if (replayCount === 1) outside.focus();
      }
    });

    (mgr as any)._replaySelectionAfterUndoRedo({
      anchor: {type: 'selected', blockId: 'block-1'},
      head: {type: 'selected', blockId: 'block-1'},
      commonParent: 'block-1',
    });

    await nextTick();
    expect(replayCount).toBe(1);
    await waitFrames(1);

    expect(replayCount).toBe(2);
    expect(document.activeElement).toBe(host);
    host.remove();
    outside.remove();
  });

  it('replays restored selection again when DOM normalization does not match the restored model', async () => {
    const host = document.createElement('div');
    const blockHost = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.appendChild(blockHost);
    document.body.appendChild(host);
    mockDoc.root.hostElement = host;
    mockDoc.getBlockById = jasmine.createSpy('getBlockById').and.callFake((id: string) => {
      if (id !== 'block-1') throw new Error('missing');
      return {
        id,
        hostElement: blockHost,
      };
    });

    const expected = {
      anchor: {type: 'selected' as const, blockId: 'block-1'},
      head: {type: 'selected' as const, blockId: 'block-1'},
      commonParent: 'block-1',
    };
    const mismatchedDom = {
      anchor: {type: 'text' as const, blockId: 'block-1', offset: 0},
      head: {type: 'text' as const, blockId: 'block-1', offset: 0},
      commonParent: 'block-1',
    };
    mockDoc.selection.recalculate.and.returnValues(
      {value: mismatchedDom},
      {value: expected},
    );
    let replayCount = 0;
    mockDoc.selection.replay.and.callFake((selection: any) => {
      mockDoc.selection.value = selection;
      if (selection) replayCount += 1;
    });

    (mgr as any)._replaySelectionAfterUndoRedo({
      anchor: {type: 'selected', blockId: 'block-1'},
      head: {type: 'selected', blockId: 'block-1'},
      commonParent: 'block-1',
    });

    await nextTick();
    expect(replayCount).toBe(1);
    await waitFrames(2);

    expect(replayCount).toBe(2);
    expect(mockDoc.selection.recalculate).toHaveBeenCalledTimes(2);
    host.remove();
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

  it('refocuses the editor synchronously after undo so rapid repeated undo is still captured', () => {
    const host = document.createElement('div');
    const outside = document.createElement('button');
    host.setAttribute('contenteditable', 'true');
    document.body.append(host, outside);
    mockDoc.root.hostElement = host;
    change('focus-drop');
    yBlockMap.observe(() => outside.focus());

    mgr.undo();

    expect(document.activeElement).toBe(host);
    host.remove();
    outside.remove();
  });

  it('cancels stale async selection replay when a newer undo/redo restore starts', async () => {
    const firstHost = document.createElement('div');
    const secondHost = document.createElement('div');
    mockDoc.getBlockById = jasmine.createSpy('getBlockById').and.callFake((id: string) => {
      if (id === 'first') return {id, hostElement: firstHost};
      if (id === 'second') return {id, hostElement: secondHost};
      throw new Error('missing');
    });
    const replayed: string[] = [];
    mockDoc.selection.replay.and.callFake((selection: any) => {
      mockDoc.selection.value = selection;
      if (selection) replayed.push(selection.anchor.blockId);
    });

    (mgr as any)._replaySelectionAfterUndoRedo({
      anchor: {type: 'selected', blockId: 'first'},
      head: {type: 'selected', blockId: 'first'},
      commonParent: 'first',
    });
    (mgr as any)._replaySelectionAfterUndoRedo({
      anchor: {type: 'selected', blockId: 'second'},
      head: {type: 'selected', blockId: 'second'},
      commonParent: 'second',
    });

    await nextTick();

    expect(replayed).toEqual(['second']);
  });

  it('clears a pending selection snapshot when Yjs merges into an existing undo item', () => {
    mockDoc.selection.value = {
      anchor: {type: 'selected', blockId: 'first'},
      head: {type: 'selected', blockId: 'first'},
      commonParent: 'first',
    };
    mgr.captureSelectionBeforeChange();
    change('first-change');
    expect((mgr as any)._pendingSnapshot).toBeUndefined();

    mockDoc.selection.value = {
      anchor: {type: 'selected', blockId: 'merged'},
      head: {type: 'selected', blockId: 'merged'},
      commonParent: 'merged',
    };
    mgr.captureSelectionBeforeChange();
    expect((mgr as any)._pendingSnapshot).toEqual({
      anchor: {type: 'selected', blockId: 'merged'},
      head: {type: 'selected', blockId: 'merged'},
      commonParent: 'merged',
    });

    change('merged-change');

    expect((mgr as any)._pendingSnapshot).toBeUndefined();
  });

  it('keeps the first pending selection when nested mutations capture again after blur', () => {
    const beforeSelection = {
      anchor: {type: 'selected' as const, blockId: 'before'},
      head: {type: 'selected' as const, blockId: 'before'},
      commonParent: 'before',
    };
    mockDoc.selection.value = beforeSelection;
    mgr.captureSelectionBeforeChange();

    // A nested delete path may blur the live selection and request another
    // capture before the same Yjs stack item is created. It must not replace
    // the outer action's before-selection with null.
    mockDoc.selection.value = null;
    mgr.captureSelectionBeforeChange();
    change('nested-replace');

    expect((mgr as any)._undoSelectionStack.at(-1)).toEqual(beforeSelection);
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
      selection: {value: null, replay: jasmine.createSpy('replay'), recalculate: jasmine.createSpy('recalculate')},
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
    expect(snapshot.commonParent).toBe('void-1');
  });

  it('resolves a captured gap snapshot back to a collapsed gap selection (side preserved)', () => {
    mockDoc.selection.value = gapSelection('void-1', 'after');
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    const resolved = (mgr as any)._resolveSelectionSnapshot(snapshot);

    expect(resolved).not.toBeNull();
    expect(resolved.anchor.type).toBe('gap');
    expect(resolved.anchor.side).toBe('after');
    expect(resolved.anchor.blockId).toBe('void-1');
    expect(resolved.head.type).toBe('gap');
    expect(resolved.head.side).toBe('after');
    expect(resolved.commonParent).toBe('void-1');
  });

  it('round-trips both sides distinctly', () => {
    for (const side of ['before', 'after'] as const) {
      mockDoc.selection.value = gapSelection('void-9', side);
      const snapshot = (mgr as any)._captureSelectionSnapshot();
      const resolved = (mgr as any)._resolveSelectionSnapshot(snapshot);
      expect(resolved.anchor.side).toBe(side);
      expect(resolved.head.side).toBe(side);
    }
  });

  it('drops the gap snapshot when the block no longer exists', () => {
    mockDoc.selection.value = gapSelection('gone', 'before');
    mockDoc.getBlockById = () => { throw new Error('block not found'); };
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    // capture still records the gap (block ref not needed to capture)…
    expect(snapshot.anchor.type).toBe('gap');
    // …but resolve returns null because the block is gone.
    expect((mgr as any)._resolveSelectionSnapshot(snapshot)).toBeNull();
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
      selection: {value: null, replay: jasmine.createSpy('replay'), recalculate: jasmine.createSpy('recalculate')},
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
    blocks['columns-1'] = {
      id: 'columns-1',
      nodeType: BlockNodeType.block,
      hostElement: rootHost,
    };
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

    const resolved = (mgr as any)._resolveSelectionSnapshot((mgr as any)._captureSelectionSnapshot());

    expect(resolved).toEqual({
      anchor: {blockId: 'p1', type: 'text', offset: 5},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    });
  });

  it('replays cross-column text selection snapshots after undo', async () => {
    const {rootHost, selection, json} = createCrossColumnSelection();
    document.body.appendChild(rootHost);
    mockDoc.root.hostElement = rootHost;
    mgr.clearHistory();
    mockDoc.selection.value = selection;
    mockDoc.selection.recalculate.and.returnValue({value: json});

    mgr.captureSelectionBeforeChange();
    ydoc.transact(() => yBlockMap.set('changed', new Y.Map()), null);
    mockDoc.selection.value = null;

    mgr.undo();
    await nextTick();
    await waitFrames(1);

    expect(mockDoc.selection.replay).toHaveBeenCalledWith(json);
    expect(mockDoc.selection.recalculate).toHaveBeenCalledWith(false);
    rootHost.remove();
  });

  it('retries cross-column text replay when DOM normalization is still stale', async () => {
    const {rootHost, selection, json} = createCrossColumnSelection();
    document.body.appendChild(rootHost);
    mockDoc.root.hostElement = rootHost;
    mockDoc.selection.value = selection;
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    const staleDom = {
      anchor: {blockId: 'left-p', type: 'text' as const, offset: 2},
      head: {blockId: 'left-p', type: 'text' as const, offset: 2},
      commonParent: 'left-p',
    };
    mockDoc.selection.recalculate.and.returnValues(
      {value: staleDom},
      {value: json},
    );
    let replayCount = 0;
    mockDoc.selection.replay.and.callFake((selectionJson: any) => {
      mockDoc.selection.value = selectionJson;
      if (selectionJson) replayCount += 1;
    });

    (mgr as any)._replaySelectionAfterUndoRedo(snapshot);

    await nextTick();
    expect(replayCount).toBe(1);
    await waitFrames(2);

    expect(replayCount).toBe(2);
    expect(mockDoc.selection.recalculate).toHaveBeenCalledTimes(2);
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
    const resolved = (mgr as any)._resolveSelectionSnapshot(snapshot);

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
    const resolved = (mgr as any)._resolveSelectionSnapshot(snapshot);

    expect(resolved.anchor).toEqual({
      type: 'table-cell',
      blockId: 'cell-4',
      tableId: 'table-1',
    });
    expect(resolved.head).toEqual({
      type: 'table-cell',
      blockId: 'cell-1',
      tableId: 'table-1',
    });
    expect(resolved.commonParent).toBe('table-1');
  });

  it('replays table-cell selection after undo', async () => {
    mgr.captureSelectionBeforeChange();
    ydoc.transact(() => yBlockMap.set('changed', new Y.Map()), null);
    mockDoc.selection.value = null;

    mgr.undo();
    await nextTick();

    expect(mockDoc.selection.replay).toHaveBeenCalledWith({
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

  it('does not require DOM normalization for restored table-cell selections', async () => {
    mgr.captureSelectionBeforeChange();
    ydoc.transact(() => yBlockMap.set('changed', new Y.Map()), null);
    mockDoc.selection.value = null;

    mgr.undo();
    await nextTick();
    await waitFrames(1);

    expect(mockDoc.selection.replay).toHaveBeenCalledWith({
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
    expect(mockDoc.selection.recalculate).not.toHaveBeenCalled();
  });

  it('clears table-cell selection after undo when a captured cell no longer exists', async () => {
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    delete blocks['cell-4'];

    (mgr as any)._replaySelectionAfterUndoRedo(snapshot);
    await nextTick();
    await waitFrames(3);

    expect(mockDoc.selection.replay).toHaveBeenCalledWith(null);
    expect(mockDoc.selection.recalculate).not.toHaveBeenCalled();
    expect(mockDoc.logger.warn).not.toHaveBeenCalled();
  });
});
