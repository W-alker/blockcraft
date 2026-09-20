import * as Y from 'yjs';
import {BlockNodeType} from '@ccc/blockcraft/framework/model';
import type {IBlockSnapshot} from '../../block-std/types/block.type';
import {DOC_FILE_SERVICE_TOKEN} from '../../angular/host-service-tokens';
import {ClipboardManager} from './index';
import {ClipboardDataType} from './types';
import type {ClipboardSourceAdapter, ClipboardSourceData} from './source-adapter';
import {buildClipboardSnapshotMarkerHtml, serializeClipboardSnapshot} from './internal-clipboard';
import {BUNDLED_CLIPBOARD_SOURCE_ADAPTERS} from '../../../editor/clipboard-source-adapters';

const root = (text: string): IBlockSnapshot => ({
  id: 'source-root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {},
  children: [{id: 'source-child', flavour: 'paragraph', nodeType: BlockNodeType.editable,
    props: {}, meta: {}, children: [{insert: text}]}],
});
const data = (values: Record<string, string>): ClipboardSourceData => ({
  dataTypes: Object.keys(values), getData: type => values[type] ?? null,
});
const yneJson = JSON.stringify([{blockType: 'paragraph', richText: {data: [{char: 'YNE'}]}}]);
const yneHtml = `<article data-content='[{"name":"paragraph","nodes":[{"type":"text","leaves":[{"text":"HTML YNE"}]}]}]'></article>`;

function harness(sources?: readonly ClipboardSourceAdapter[]) {
  const yDoc = new Y.Doc();
  const text = yDoc.getText('anchor');
  const anchor = {
    id: 'anchor', parentId: 'root', flavour: 'paragraph', nodeType: BlockNodeType.editable,
    props: {}, textLength: 0, yText: text,
    deleteText: jasmine.createSpy('deleteText'),
    applyDeltaOperations: jasmine.createSpy('applyDeltaOperations'),
  };
  const live = new Map<string, any>([[anchor.id, anchor]]);
  const inserted: IBlockSnapshot[] = [];
  let finishRehost!: () => void;
  const rehosted = new Promise<void>(resolve => { finishRehost = resolve; });
  const insert = (_block: unknown, snapshots: IBlockSnapshot[]) => snapshots.map(snapshot => {
    // 验证发生在实际写入入口，不能用插入之后的检查掩盖临时标记泄漏。
    expect(snapshot.meta['__yneRehost']).toBeUndefined();
    inserted.push(snapshot);
    const block = {...snapshot, textLength: 0, setInitProps: jasmine.createSpy('setInitProps').and.callFake(finishRehost)};
    live.set(snapshot.id, block);
    return block;
  });
  const toSnapshot = jasmine.createSpy('htmlToSnapshot').and.callFake(async () => root('ordinary HTML'));
  const adapter = {clipboardSourceAdapters: sources, getAdapter: () => ({toSnapshot})};
  const uploadAttachment = jasmine.createSpy('uploadAttachment').and.resolveTo({
    url: 'https://host/file.csv', name: 'file.csv', size: 10, type: 'text/csv',
  });
  const fileService = {uploadAttachment, createObjectURL: () => 'local:image'};
  const doc = {
    config: {}, event: {add() {}, bindHotkey() {}}, yDoc,
    injector: {get: (token: unknown) => token === DOC_FILE_SERVICE_TOKEN ? fileService : adapter},
    logger: {warn: jasmine.createSpy('warn')},
    root: {hostElement: {contains: () => false, focus() {}}},
    vm: {get: (id: string) => live.has(id) ? {instance: live.get(id)} : undefined},
    getBlockById: (id: string) => live.get(id),
    isEditable: (block: any) => block.nodeType === BlockNodeType.editable,
    crud: {transact: (fn: () => void) => fn(), insertBlocksAfter: insert, insertBlocksBefore: insert},
    selection: {setCursorAt() {}, setCursorAtBlock() {}, selectBlock() {}, setSelection() {}},
    schemas: {createSnapshot: (flavour: string, args: any[]) => flavour === 'root'
      ? {...root(''), children: args[1]}
      : {...(root('').children as IBlockSnapshot[])[0], children: args[0]}},
  };
  const manager = new ClipboardManager(doc as any);
  const paste = (state: ClipboardSourceData, gap = false) => {
    const point = gap ? {type: 'gap', side: 'after', block: anchor, blockId: anchor.id}
      : {type: 'text', offset: 0, block: anchor, blockId: anchor.id};
    const selection = {start: point, end: point, firstBlock: anchor, isInSameBlock: true, collapsed: true};
    return manager.onPaste({preventDefault() {}, get: () => ({...state, selection, clipboardData: null})} as any);
  };
  const collect = (state: ClipboardSourceData) => (manager as any)._collectGapPasteSnapshot(state, 0);
  return {manager, doc, adapter, anchor, live, inserted, uploadAttachment, toSnapshot, collect, paste, rehosted};
}

describe('clipboard source composition', () => {
  it('preserves structured YNE for old hosts without the new property', async () => {
    const {collect, toSnapshot} = harness();
    const result = await collect(data({'text/yne-json': yneJson, 'text/html': '<p>lossy</p>'}));
    expect(result.rootSnapshot.children[0].children).toEqual([{insert: 'YNE', attributes: undefined}]);
    expect(toSnapshot).not.toHaveBeenCalled();
  });

  it('keeps HTML-only YNE and malformed-source fallback to the ordinary adapter', async () => {
    const {collect, toSnapshot} = harness();
    const result = await collect(data({'text/html': yneHtml}));
    expect(result.rootSnapshot.children[0].children).toEqual([{insert: 'HTML YNE'}]);
    expect(toSnapshot).not.toHaveBeenCalled();
    await collect(data({'text/yne-json': '{bad', 'text/html': '<p>fallback</p>'}));
    expect(toSnapshot).toHaveBeenCalledOnceWith('<p>fallback</p>');
  });

  it('uses an explicit empty list instead of legacy defaults', async () => {
    const {collect, toSnapshot} = harness([]);
    await collect(data({'text/yne-json': yneJson, 'text/html': yneHtml}));
    expect(toSnapshot).toHaveBeenCalledOnceWith(yneHtml);
  });

  it('honors source order, skips empty structured results and short-circuits matches', async () => {
    const empty = {...root(''), children: []} as IBlockSnapshot;
    const first = jasmine.createSpy('first').and.returnValue(empty);
    const second = jasmine.createSpy('second').and.returnValue(root('custom'));
    const last = jasmine.createSpy('last').and.returnValue(root('unused'));
    const {collect, toSnapshot} = harness([
      {parseStructured: first}, {parseStructured: second}, {parseStructured: last},
    ]);
    const result = await collect(data({'application/custom': 'value', 'text/html': '<p>fallback</p>'}));
    expect(result.rootSnapshot.children[0].children).toEqual([{insert: 'custom'}]);
    expect(first).toHaveBeenCalledBefore(second);
    expect(last).not.toHaveBeenCalled();
    expect(toSnapshot).not.toHaveBeenCalled();
  });

  it('retains internal snapshot and HTML-marker precedence', async () => {
    const parseStructured = jasmine.createSpy('structured').and.returnValue(null);
    const parseHtml = jasmine.createSpy('html').and.returnValue(root('custom'));
    const {collect} = harness([{parseStructured, parseHtml}]);
    const internal = root('internal');
    for (const type of [ClipboardDataType.BLOCKCRAFT_SNAPSHOT, `web ${ClipboardDataType.BLOCKCRAFT_SNAPSHOT}`]) {
      expect((await collect(data({[type]: serializeClipboardSnapshot(internal), 'text/html': yneHtml}))).rootSnapshot)
        .toEqual(internal);
    }
    expect(parseStructured).not.toHaveBeenCalled();
    expect((await collect(data({'text/html': buildClipboardSnapshotMarkerHtml(internal)}))).rootSnapshot)
      .toEqual(internal);
    expect(parseHtml).not.toHaveBeenCalled();
  });

  for (const gap of [false, true]) {
    it(`preserves YNE attachment preparation and final-ID re-host in ${gap ? 'gap' : 'text'} paste`, async () => {
      const {manager, paste, inserted, live, uploadAttachment, rehosted} = harness();
      const events: any[] = [];
      manager.pasteFormatData$.subscribe(event => event && events.push(event));
      spyOn(window, 'fetch').and.resolveTo(new Response('file'));
      const payload = JSON.stringify([{blockType: 'attachment', source: 'https://note.youdao/file.csv', fileName: 'file.csv'}]);
      await paste(data({'text/yne-json': payload}), gap);
      await rehosted;
      expect(inserted.length).toBe(1);
      expect(uploadAttachment).toHaveBeenCalledTimes(1);
      expect(live.get(inserted[0].id).setInitProps).toHaveBeenCalledWith({url: 'https://host/file.csv', size: 10, name: 'file.csv'});
      expect(events.length).toBe(1);
      expect(events[0].htmlSnapshot.children[0].meta['__yneRehost']).toBeUndefined();
      expect(events[0].htmlSnapshot.children[0].id).not.toBe(inserted[0].id);
    });
  }

  it('keeps synchronous custom source parsing in the text paste path', async () => {
    const parseStructured = jasmine.createSpy('parse').and.returnValue(root('custom text'));
    const {anchor, paste, toSnapshot} = harness([{parseStructured}]);
    await paste(data({'application/custom': 'value'}));
    expect(anchor.applyDeltaOperations).toHaveBeenCalledWith([{retain: 0}, {insert: 'custom text'}]);
    expect(toSnapshot).not.toHaveBeenCalled();
  });

  it('does not invoke source parsers for file paste', async () => {
    const parseStructured = jasmine.createSpy('parse').and.returnValue(root('unused'));
    const {paste} = harness([{parseStructured}]);
    expect(await paste(data({Files: ''}))).toBeFalse();
    expect(parseStructured).not.toHaveBeenCalled();
  });

  it('keeps the default composition immutable and reusable across documents', () => {
    expect(Object.isFrozen(BUNDLED_CLIPBOARD_SOURCE_ADAPTERS)).toBeTrue();
    expect(Object.isFrozen(BUNDLED_CLIPBOARD_SOURCE_ADAPTERS[0])).toBeTrue();
  });
});
