import * as Y from 'yjs';
import {BlockNodeType} from '../model';
import {TextToolbarHelper} from './text-toolbar-helper';

describe('heading size reset', () => {
  function harness(empty = false) {
    const yDoc = new Y.Doc();
    const blocks = yDoc.getMap<Y.Map<any>>('blocks');
    for (const id of ['a', 'b']) {
      const block = new Y.Map<any>();
      blocks.set(id, block);
      const props = new Y.Map<any>();
      block.set('props', props);
      Object.entries({fs: 28, pfs: 1.5, lh: 2, psb: 12, psa: 8, textDefaults: {
        't:px': 22, 't:fs': 2, 's:fontSize': '32px', 'a:bold': true, 's:color': 'red',
      }}).forEach(([key, value]) => props.set(key, value));
      const text = new Y.Text();
      block.set('children', text);
      if (!empty) text.applyDelta([
        {insert: 'AB', attributes: {'t:px': 24, 't:fs': 2, 'a:bold': true, 'a:link': 'https://example.com'}},
        {insert: 'CD', attributes: {'s:fontSize': '30px', 's:lineHeight': '2', 's:color': 'red'}},
      ]);
    }
    const props = (id: string) => blocks.get(id)!.get('props') as Y.Map<any>;
    const text = (id: string) => blocks.get(id)!.get('children') as Y.Text;
    const undo = new Y.UndoManager(blocks);
    const doc = {
      model: {
        exists: (id: string) => blocks.has(id),
        getNodeType: () => BlockNodeType.editable,
        getProps: (id: string) => props(id).toJSON(),
        getTextLength: (id: string) => text(id).length,
      },
      isPlainTextBlock: (id: string) => id === 'code',
      getBlockById: jasmine.createSpy().and.throwError('must not materialize offscreen blocks'),
      readonlyManager: {
        assertPropsWritable: jasmine.createSpy(), assertTextWritable: jasmine.createSpy(),
      },
      selection: {value: null as any},
      inputManger: {
        peekNextInsertAttrs: jasmine.createSpy().and.returnValue({'t:px': 99, 'a:italic': true}),
        setNextInsertAttrs: jasmine.createSpy(),
      },
      crud: {
        transact: (fn: () => void) => yDoc.transact(fn),
        updateBlockProps: (id: string, patch: Record<string, any>) => {
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) props(id).delete(key); else props(id).set(key, value);
          }
        },
        formatText: (id: string, index: number, length: number, attrs: any) => text(id).format(index, length, attrs),
      },
    };
    return {yDoc, blocks, props, text, undo, doc, helper: new TextToolbarHelper(doc as any)};
  }

  it('resets only sizes on complete blocks and restores everything in one undo/redo', () => {
    const h = harness();
    const before = h.blocks.toJSON();
    h.helper.applyHeadingToBlocks(2, ['a', 'b']);
    const after = h.blocks.toJSON();
    for (const id of ['a', 'b']) {
      expect(h.props(id).toJSON()).toEqual({heading: 2, psb: 12, psa: 8, textDefaults: {'a:bold': true, 's:color': 'red'}});
      expect(h.text(id).toDelta()).toEqual([
        {insert: 'AB', attributes: {'a:bold': true, 'a:link': 'https://example.com'}},
        {insert: 'CD', attributes: {'s:color': 'red'}},
      ]);
    }
    expect(h.doc.getBlockById).not.toHaveBeenCalled();
    expect(h.undo.undoStack.length).toBe(1);
    h.undo.undo();
    expect(h.blocks.toJSON()).toEqual(before);
    h.undo.redo();
    expect(h.blocks.toJSON()).toEqual(after);
    h.yDoc.destroy();
  });

  it('resets pending empty-paragraph input without discarding other typing attributes', () => {
    const h = harness(true);
    h.doc.selection.value = {collapsed: true, start: {type: 'text', blockId: 'a', offset: 0}};
    h.helper.applyHeadingToBlocks(1, ['a']);
    expect(h.props('a').get('textDefaults')).toEqual({'a:bold': true, 's:color': 'red'});
    expect(h.doc.inputManger.setNextInsertAttrs).toHaveBeenCalledWith({'a:italic': true}, {blockId: 'a', index: 0});
    h.yDoc.destroy();
  });

  it('preflights all targets so a locked later paragraph cannot leave a partial write', () => {
    const h = harness();
    const before = h.blocks.toJSON();
    h.doc.readonlyManager.assertTextWritable.and.callFake((id: string) => {if (id === 'b') throw new Error('readonly');});
    expect(() => h.helper.applyHeadingToBlocks(3, ['a', 'b'])).toThrowError('readonly');
    expect(h.blocks.toJSON()).toEqual(before);
    expect(h.undo.undoStack.length).toBe(0);
    h.yDoc.destroy();
  });

  it('keeps body conversion and low-level property updates independent from heading application', () => {
    const h = harness();
    const before = h.blocks.toJSON();
    h.helper.applyHeadingToBlocks(null, ['a']);
    expect(h.blocks.toJSON()).toEqual(before);
    h.helper.applyHeadingToBlocks(5, ['a']);
    expect(h.blocks.toJSON()).toEqual(before);
    h.yDoc.destroy();
  });
});
