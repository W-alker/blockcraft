import * as Y from "yjs";
import {DocUndoManger} from "./undoManger";

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
});

/**
 * P6: undo/redo must round-trip a gap cursor's `side` (before/after) instead of
 * degrading it to a whole-block `selected` snapshot. Captured snapshots feed back
 * through _resolveSelectionPoint, which returns the legacy gap JSON shape that
 * _buildDomRange restores.
 */
describe('DocUndoManger – gap selection side round-trip', () => {
  let ydoc: Y.Doc;
  let yBlockMap: Y.Map<any>;
  let mgr: DocUndoManger;
  let mockDoc: any;

  const gapSelection = (blockId: string, side: 'before' | 'after') => {
    const point = {blockId, type: 'gap' as const, side};
    return {
      start: point,
      end: point,
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
    expect(snapshot.from.type).toBe('gap');
    expect(snapshot.from.blockId).toBe('void-1');
    expect(snapshot.from.side).toBe('before');
    expect(snapshot.to).toBeNull();
  });

  it('resolves a captured gap snapshot back to a collapsed gap selection (side preserved)', () => {
    mockDoc.selection.value = gapSelection('void-1', 'after');
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    const resolved = (mgr as any)._resolveSelectionSnapshot(snapshot);

    expect(resolved).not.toBeNull();
    expect(resolved.from.type).toBe('gap');
    expect(resolved.from.side).toBe('after');
    expect(resolved.from.blockId).toBe('void-1');
    expect(resolved.to).toBeNull();
    expect(resolved.collapsed).toBeTrue();
  });

  it('round-trips both sides distinctly', () => {
    for (const side of ['before', 'after'] as const) {
      mockDoc.selection.value = gapSelection('void-9', side);
      const snapshot = (mgr as any)._captureSelectionSnapshot();
      const resolved = (mgr as any)._resolveSelectionSnapshot(snapshot);
      expect(resolved.from.side).toBe(side);
    }
  });

  it('drops the gap snapshot when the block no longer exists', () => {
    mockDoc.selection.value = gapSelection('gone', 'before');
    mockDoc.getBlockById = () => { throw new Error('block not found'); };
    const snapshot = (mgr as any)._captureSelectionSnapshot();
    // capture still records the gap (block ref not needed to capture)…
    expect(snapshot.from.type).toBe('gap');
    // …but resolve returns null because the block is gone.
    expect((mgr as any)._resolveSelectionSnapshot(snapshot)).toBeNull();
  });
});
