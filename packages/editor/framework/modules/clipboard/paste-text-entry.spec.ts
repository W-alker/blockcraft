import * as Y from 'yjs';
import {BlockNodeType, type DeltaInsert} from '../../model';
import type {IBlockSnapshot} from '../../block-std/types/block.type';
import {BlockSelection} from '../selection';
import {ClipboardManager} from './clipboard-manager';
import {ClipboardDataType, type ClipboardPasteCompletedEvent} from './types';
import {buildClipboardSnapshotMarkerHtml, serializeClipboardSnapshot} from './internal-clipboard';
import {BlockReadonlyError, BlockReadonlyOperation} from '../../doc/block-readonly.types';

const stacked = '我' + '\u0300'.repeat(12) + '你';
const paragraph = (children: DeltaInsert[]): IBlockSnapshot => ({
  id: 'incoming', flavour: 'paragraph', nodeType: BlockNodeType.editable, props: {}, meta: {}, children
});
const root = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'incoming-root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {}, children
});

function harness(plainTextOnly = false) {
  const yDoc = new Y.Doc();
  const host = document.createElement('div');
  host.setAttribute('contenteditable', 'true');
  document.body.append(host);
  const yText = yDoc.getText('anchor');
  yText.insert(0, 'headtail');
  const anchor = {
    id: 'anchor', parentId: 'root', flavour: 'paragraph', nodeType: BlockNodeType.editable,
    props: {depth: 0}, hostElement: host, plainTextOnly, yText,
    get textLength() { return yText.length; },
    replaceText: jasmine.createSpy('replaceText').and.callFake((offset: number, count: number, text: string) => {
      yText.delete(offset, count); yText.insert(offset, text);
    }),
    deleteText: (offset: number, count: number) => yText.delete(offset, count),
    applyDeltaOperations: (ops: any[]) => yText.applyDelta(ops)
  };
  const live = new Map<string, any>([[anchor.id, anchor]]);
  const selection = new BlockSelection(
    {blockId: anchor.id, type: 'text', offset: 4, block: anchor} as any,
    {blockId: anchor.id, type: 'text', offset: 4, block: anchor} as any,
    anchor.id, id => live.get(id), () => 0
  );
  const adapter = {clipboardSourceAdapters: [] as any[], getAdapter: jasmine.createSpy('getAdapter')};
  const inserted: IBlockSnapshot[] = [];
  const insert = (_anchor: unknown, snapshots: IBlockSnapshot[]) => snapshots.map(snapshot => {
    inserted.push(snapshot);
    const block = {...snapshot, textLength: 0, hostElement: host};
    live.set(block.id, block);
    return block;
  });
  let seq = 0;
  const doc = {
    config: {pasteTextPolicy: 'remove-stacked-marks' as 'preserve' | 'remove-stacked-marks' | undefined}, yDoc, event: {add() {}, bindHotkey() {}},
    injector: {get: () => adapter}, root: {hostElement: host},
    logger: {warn: jasmine.createSpy('warn')},
    isEditable: (block: any) => block.nodeType === BlockNodeType.editable,
    getBlockById: (id: string) => live.get(id),
    vm: {get: (id: string) => live.has(id) ? {instance: live.get(id)} : undefined},
    inputManger: {assertSelectionWritable: jasmine.createSpy('assertWritable')},
    selection: {value: selection, blur() {}, replay() {}, setCursorAt: jasmine.createSpy('cursor'),
      setSelection() {}, setCursorAtBlock() {}, scrollSelectionIntoView() {}},
    crud: {transact: (fn: () => void) => yDoc.transact(fn), insertBlocksAfter: insert, insertBlocksBefore: insert},
    schemas: {createSnapshot: (flavour: string, args: any[]) => flavour === 'root'
      ? {...root(args[1]), id: 'root-' + ++seq}
      : {...paragraph(args[0]), id: 'p-' + ++seq, props: args[1] || {}}}
  };
  const manager = new ClipboardManager(doc as any);
  const events: ClipboardPasteCompletedEvent[] = [];
  manager.pasteFormatData$.subscribe(event => { if (event) events.push(event); });
  const paste = (formats: Record<string, string>, gap = false) => {
    const point = {type: 'gap', side: 'after', block: anchor, blockId: anchor.id};
    const state = {
      selection: gap ? {start: point, end: point, firstBlock: anchor, collapsed: true} : selection,
      dataTypes: Object.keys(formats),
      clipboardData: {getData: (type: string) => formats[type] || ''},
      getData: (type: string) => formats[type] || null
    };
    return manager.onPaste({preventDefault() {}, get: () => state} as any);
  };
  return {manager, doc, anchor, adapter, events, paste, selection, inserted, host, yDoc};
}

describe('clipboard paste text safety at the write boundary', () => {
  const cleanups: Array<() => void> = [];
  const create = (plainTextOnly = false) => {
    const result = harness(plainTextOnly);
    cleanups.push(() => { result.yDoc.destroy(); result.host.remove(); });
    return result;
  };
  afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

  for (const policy of [undefined, 'preserve'] as const) {
    it(`keeps original paste content when policy is ${String(policy)}`, async () => {
      const {paste, anchor, doc, manager, selection} = create();
      doc.config.pasteTextPolicy = policy;
      await paste({'text/plain': stacked});
      expect(anchor.yText.toString()).toBe('head' + stacked + 'tail');
      const snapshot = root([paragraph([{insert: stacked}])]);
      await manager.applyPasteOption({type: 'html', label: '格式', payload: {kind: 'snapshot', snapshot}}, selection);
      expect(anchor.yText.toString()).toBe('head' + stacked.repeat(2) + 'tail');
    });
  }

  for (const plainTextOnly of [false, true]) {
    it(`normalizes before the first model write in ${plainTextOnly ? 'plain-only' : 'ordinary'} blocks`, async () => {
      const {paste, anchor} = create(plainTextOnly);
      await paste({'text/plain': stacked});
      expect(anchor.replaceText).toHaveBeenCalledWith(4, 0, '我你');
      expect(anchor.yText.toString()).toBe('head我你tail');
    });
  }

  it('does not erase a target when plain text normalizes to empty', async () => {
    const {paste, anchor} = create();
    expect(await paste({'text/plain': '\u0300'.repeat(12)})).toBeFalse();
    expect(anchor.replaceText).not.toHaveBeenCalled();
    expect(anchor.yText.toString()).toBe('headtail');
  });

  for (const format of ['internal', 'web-internal', 'html-marker']) {
    it(`normalizes ${format} snapshots across formatting before merge and alternative caching`, async () => {
      const {paste, anchor, events} = create();
      const snapshot = root([paragraph([
        {insert: '我' + '\u0300'.repeat(5), attributes: {'a:bold': true}},
        {insert: '\u0300'.repeat(7) + '你', attributes: {'a:italic': true}}
      ])]);
      const formats: Record<string, string> = format === 'html-marker'
        ? {'text/html': buildClipboardSnapshotMarkerHtml(snapshot)}
        : {[format === 'internal' ? ClipboardDataType.BLOCKCRAFT_SNAPSHOT
          : `web ${ClipboardDataType.BLOCKCRAFT_SNAPSHOT}`]: serializeClipboardSnapshot(snapshot)};
      await paste({...formats, 'text/plain': stacked, 'text/markdown': '# ' + stacked});
      expect(anchor.yText.toString()).toBe('head我你tail');
      expect(anchor.yText.toDelta().filter((op: any) => op.attributes)).toEqual([
        {insert: '我', attributes: {'a:bold': true}}, {insert: '你', attributes: {'a:italic': true}}
      ]);
      expect(events[0].plainText).toBe('我你');
      expect(events[0].markdownText).toBe('# 我你');
      expect((events[0].htmlSnapshot!.children as IBlockSnapshot[])[0].children).toEqual([
        {insert: '我', attributes: {'a:bold': true}}, {insert: '你', attributes: {'a:italic': true}}
      ]);
    });
  }

  it('normalizes an asynchronously parsed HTML snapshot before its first write', async () => {
    const {paste, anchor, adapter} = create();
    adapter.getAdapter.and.returnValue({toSnapshot: async () => root([paragraph([{insert: stacked}])])});
    await paste({'text/html': '<p>' + stacked + '</p>'});
    expect(anchor.yText.toString()).toBe('head我你tail');
  });

  it('normalizes after source preparation so a source hook cannot reintroduce a run', async () => {
    const {paste, anchor, adapter} = create();
    adapter.clipboardSourceAdapters = [{
      parseStructured: () => root([paragraph([{insert: 'before'}])]),
      prepareSnapshot: (snapshot: IBlockSnapshot) => {
        (snapshot.children as IBlockSnapshot[])[0].children = [{insert: stacked}];
      }
    }];
    await paste({'application/custom': 'source'});
    expect(anchor.yText.toString()).toBe('head我你tail');
  });

  it('normalizes gap paste paragraphs before structural insertion', async () => {
    const {paste, inserted} = create();
    await paste({'text/plain': stacked + '\n普通 cafe\u0301'}, true);
    expect(inserted.map(block => block.children)).toEqual([[{insert: '我你'}], [{insert: '普通 cafe\u0301'}]]);
  });

  it('normalizes text and snapshot format options while keeping reusable options unchanged', async () => {
    const {manager, selection, anchor} = create();
    const snapshot = root([paragraph([{insert: stacked, attributes: {'a:bold': true}}])]);
    await manager.applyPasteOption({type: 'html', label: '格式', payload: {kind: 'snapshot', snapshot}}, selection);
    expect(anchor.yText.toString()).toBe('head我你tail');
    expect((snapshot.children as IBlockSnapshot[])[0].children).toEqual([{insert: stacked, attributes: {'a:bold': true}}]);
    await manager.applyPasteOption({type: 'plain-text', label: '文本', payload: {kind: 'text', text: stacked}}, selection);
    expect(anchor.yText.toString()).toBe('head我你我你tail');
  });

  it('respects existing readonly rejection before a paste write', async () => {
    const {paste, anchor, doc} = create();
    doc.inputManger.assertSelectionWritable.and.callFake(() => {
      throw new BlockReadonlyError({operation: BlockReadonlyOperation.Paste, blockIds: ['anchor'], source: {kind: 'document'}});
    });
    expect(await paste({'text/plain': stacked})).toBeFalse();
    expect(anchor.yText.toString()).toBe('headtail');
  });
});
