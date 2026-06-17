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
