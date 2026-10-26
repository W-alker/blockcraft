import * as Y from 'yjs';
import {BehaviorSubject} from 'rxjs';
import {TypingFormatState} from './typing-format';
import {ParagraphFormatManager} from './paragraph-format';

describe('TypingFormatState', () => {
  const disposals: (() => void)[] = [];
  afterEach(() => disposals.splice(0).forEach(dispose => dispose()));

  function harness(deltas: any[] = []) {
    const yDoc = new Y.Doc();
    const text = yDoc.getText('text');
    const props = yDoc.getMap('props');
    text.applyDelta(deltas);
    const selectionChange$ = new BehaviorSubject<any>(null);
    const undoRedoing$ = new BehaviorSubject(false);
    const undo = new Y.UndoManager([text, props]);
    const init: (() => void)[] = [];
    const destroy: (() => void)[] = [];
    const doc: any = {
      yDoc,
      selection: {selectionChange$},
      model: {
        getYBlock: (id: string) => id === 'p' ? {get: () => text} : undefined,
        getProps: () => props.toJSON(),
      },
      isPlainTextBlock: () => false,
      afterInit: (fn: () => void) => init.push(fn),
      onDestroy: (fn: () => void) => destroy.push(fn),
      crud: {updateBlockProps: (_id: string, patch: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(patch)) value == null ? props.delete(key) : props.set(key, value);
      }, undoManager: {
        undoRedoing$,
        on: (name: any, listener: any) => undo.on(name, listener),
        off: (name: any, listener: any) => undo.off(name, listener),
      }},
    };
    const state = new TypingFormatState(doc);
    init.forEach(fn => fn());
    disposals.push(() => {destroy.forEach(fn => fn()); undo.destroy(); yDoc.destroy();});
    const select = (from: number, to = from) => selectionChange$.next({
      start: {blockId: 'p', type: 'text', offset: from},
      end: {blockId: 'p', type: 'text', offset: to},
      collapsed: from === to,
      isInSameBlock: true,
    });
    const attrs = (index: number) => state.get({blockId: 'p', index});
    const paragraphs = new ParagraphFormatManager(doc);
    const edit = (fn: () => void) => state.runEdit(() => {
      const before = state.getForBlock('p');
      yDoc.transact(() => {
        fn();
        if (text.length === 0) paragraphs.remember('p', before, true);
      });
    });
    return {yDoc, text, props, state, select, attrs, undo, undoRedoing$, selectionChange$, doc, edit};
  }

  it('retains explicit formatting through repeated insert/delete, including an empty text', () => {
    const h = harness();
    const format = {'t:px': 24, 't:ff': 'times', 'a:bold': true} as const;
    h.select(0);
    h.state.set(format, {blockId: 'p', index: 0}, true);
    for (const [index, char] of [...'ABC'].entries()) {
      h.edit(() => h.text.insert(index, char, h.attrs(index)));
      h.select(index + 1);
      expect(h.attrs(index + 1)).toEqual(format);
    }
    for (let index = 2; index >= 0; index--) {
      h.edit(() => h.text.delete(index, 1));
      h.select(index);
      expect(h.attrs(index)).toEqual(format);
    }
    h.edit(() => h.text.insert(0, 'D', h.attrs(0)));
    expect(h.text.toDelta()).toEqual([{insert: 'D', attributes: format}]);
  });

  it('retains the current style when deleting only part of the text', () => {
    const h = harness([
      {insert: 'A', attributes: {'a:bold': true}},
      {insert: 'B', attributes: {'a:italic': true}},
    ]);
    h.select(2);
    h.edit(() => h.text.delete(1, 1));
    h.select(1);
    expect(h.attrs(1)).toEqual({'a:italic': true});
    h.edit(() => h.text.insert(1, 'C', h.attrs(1)));
    expect(h.text.toDelta()).toEqual([
      {insert: 'A', attributes: {'a:bold': true}},
      {insert: 'C', attributes: {'a:italic': true}},
    ]);
  });

  it('re-inherits formatting on navigation and respects an explicit format removal', () => {
    const h = harness([{insert: 'A', attributes: {'a:bold': true}}, {insert: 'BC'}]);
    h.select(1);
    expect(h.attrs(1)).toEqual({'a:bold': true});
    h.state.set({}, {blockId: 'p', index: 1});
    h.edit(() => h.text.insert(1, 'X', h.attrs(1)));
    h.select(2);
    expect(h.attrs(2)).toEqual({});
    h.select(0);
    expect(h.attrs(0)).toEqual({'a:bold': true});
    h.select(4);
    expect(h.attrs(4)).toEqual({});
    h.selectionChange$.next(null);
    expect(h.state.active).toBeFalse();
  });

  it('reads shared selection formatting before deletion and follows remote changes', () => {
    const h = harness([
      {insert: 'A', attributes: {'t:px': 24, 'a:bold': true}},
      {insert: 'B', attributes: {'t:px': 24, 'a:italic': true}},
    ]);
    h.select(0, 2);
    h.edit(() => h.text.delete(0, 2));
    h.select(0);
    expect(h.attrs(0)).toEqual({'t:px': 24});
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(h.yDoc));
    remote.getText('text').insert(0, 'remote');
    Y.applyUpdate(h.yDoc, Y.encodeStateAsUpdate(remote));
    h.select(6);
    expect(h.attrs(6)).toEqual({'t:px': 24});
    remote.destroy();
  });

  it('distinguishes collapsing a selection from the caret recipe inside an edit', () => {
    const h = harness([
      {insert: 'A', attributes: {'a:bold': true, 't:px': 24}},
      {insert: 'B', attributes: {'a:italic': true, 't:px': 24}},
    ]);
    h.select(0, 2);
    h.select(0);
    expect(h.attrs(0)).toEqual({'a:bold': true, 't:px': 24});
    h.select(0, 2);
    h.edit(() => {
      h.select(0);
      h.text.delete(0, 2);
    });
    h.select(0);
    expect(h.attrs(0)).toEqual({'t:px': 24});
  });

  it('restores input formatting with undo/redo even when the restored text is empty', () => {
    const h = harness([{insert: 'A', attributes: {'a:bold': true}}]);
    h.select(1);
    h.edit(() => h.text.delete(0, 1));
    h.select(0);
    expect(h.attrs(0)).toEqual({'a:bold': true});
    h.undoRedoing$.next(true);
    h.selectionChange$.next(null);
    h.undo.undo();
    h.undoRedoing$.next(false);
    h.select(1);
    expect(h.attrs(1)).toEqual({'a:bold': true});
    h.undoRedoing$.next(true);
    h.selectionChange$.next(null);
    h.undo.redo();
    h.undoRedoing$.next(false);
    h.select(0);
    expect(h.attrs(0)).toEqual({'a:bold': true});
  });

  it('does not apply rich-text state to plain-text blocks or missing blocks', () => {
    const h = harness([{insert: 'A', attributes: {'a:bold': true}}]);
    h.doc.isPlainTextBlock = () => true;
    h.select(1);
    expect(h.attrs(1)).toBeUndefined();
    h.state.set({'a:bold': true}, {blockId: 'missing', index: 0});
    expect(h.state.active).toBeFalse();
  });

  it('inherits pasted/API content instead of forcing an earlier typing format onto it', () => {
    const h = harness([{insert: 'A', attributes: {'a:bold': true}}]);
    h.select(1);
    h.text.insert(1, 'paste', {'a:italic': true});
    h.select(6);
    expect(h.attrs(6)).toEqual({'a:italic': true});
  });

  it('reads empty paragraph defaults after navigation and follows remote defaults unless explicitly overridden', () => {
    const h = harness();
    h.props.set('textDefaults', {'t:px': 24, 'a:bold': true});
    h.select(0);
    expect(h.attrs(0)).toEqual({'t:px': 24, 'a:bold': true});
    h.selectionChange$.next(null);
    h.select(0);
    expect(h.attrs(0)).toEqual({'t:px': 24, 'a:bold': true});
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(h.yDoc));
    remote.getMap('props').set('textDefaults', {'t:px': 32});
    Y.applyUpdate(h.yDoc, Y.encodeStateAsUpdate(remote));
    expect(h.attrs(0)).toEqual({'t:px': 32});
    h.state.set({'a:italic': true}, {blockId: 'p', index: 0}, true);
    remote.getMap('props').set('textDefaults', {'t:px': 40});
    Y.applyUpdate(h.yDoc, Y.encodeStateAsUpdate(remote));
    expect(h.attrs(0)).toEqual({'a:italic': true});
    remote.destroy();
  });
});
