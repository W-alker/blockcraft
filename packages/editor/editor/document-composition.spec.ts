import {ApplicationRef, Injector, NgZone} from '@angular/core';
import {Overlay} from '@angular/cdk/overlay';
import * as Y from 'yjs';
import * as publicApi from '@ccc/blockcraft';
import {BlockCraftDoc as LegacyDocument} from '../framework/doc';
import {BlockCraftDoc as CoreDocument, type DocConfig} from '../framework/doc/document';
import {ClipboardManager as LegacyClipboard} from '../framework/modules/clipboard';
import {ClipboardManager as CoreClipboard} from '../framework/modules/clipboard/clipboard-manager';
import {BlockCraftDocBuilder as LegacyBuilder} from '../framework/chain/doc-builder';
import {SchemaManager} from '../framework/block-std/schema';
import {UIEventDispatcher} from '../framework/block-std/event/dispatcher';
import {DOC_ADAPTER_SERVICE_TOKEN, DOC_MESSAGE_SERVICE_TOKEN} from '../framework/angular/host-service-tokens';
import {NoopLogger} from '@ccc/blockcraft/global/logger';
import {inlineImageEmbedConverter} from '../embeds/image';
import {inlineIconEmbedConverter} from '../embeds/icon';
import {BlockCraftDoc} from './document';
import {ClipboardManager} from './clipboard-manager';
import {BlockCraftDocBuilder} from './doc-builder';
import {BUNDLED_CLIPBOARD_SOURCE_ADAPTERS} from './clipboard-source-adapters';

describe('默认文档装配与领域实现', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); });

  function config(): DocConfig {
    const yDoc = new Y.Doc();
    const injector = Injector.create({providers: [
      {provide: NgZone, useValue: new NgZone({enableLongStackTrace: false})},
      {provide: ApplicationRef, useValue: {injector: Injector.NULL}},
      {provide: Overlay, useValue: {}},
      {provide: DOC_ADAPTER_SERVICE_TOKEN, useValue: {supportedAdapters: []}},
      {provide: DOC_MESSAGE_SERVICE_TOKEN, useValue: {warn() {}, info() {}, error() {}, success() {}}},
    ]});
    cleanups.push(() => { injector.destroy(); yDoc.destroy(); });
    return {docId: 'composition', yDoc, injector, schemas: new SchemaManager([]), logger: new NoopLogger()};
  }
  function own<T extends CoreDocument>(doc: T): T {
    cleanups.push(() => { doc.onDestroy$.next(undefined); doc.destroy(); });
    return doc;
  }

  it('主入口、旧路径与默认装配导出同一个构造器', () => {
    expect(publicApi.BlockCraftDoc).toBe(BlockCraftDoc);
    expect(LegacyDocument).toBe(BlockCraftDoc);
    expect(publicApi.ClipboardManager).toBe(ClipboardManager);
    expect(LegacyClipboard).toBe(ClipboardManager);
    expect(publicApi.BlockCraftDocBuilder).toBe(BlockCraftDocBuilder);
    expect(LegacyBuilder).toBe(BlockCraftDocBuilder);
  });

  it('旧构造器保留默认来源、Embed 覆盖规则和 config 引用', () => {
    const options = config();
    const override = {...inlineImageEmbedConverter};
    options.embeds = [['image', override]];
    const doc = own(new LegacyDocument(options));
    expect(doc.config).toBe(options);
    expect(doc).toBeInstanceOf(CoreDocument);
    expect(doc.clipboard).toBeInstanceOf(LegacyClipboard);
    expect((doc.clipboard as any)._sourceAdapters).toBe(BUNDLED_CLIPBOARD_SOURCE_ADAPTERS);
    expect(new Map(doc.config.embeds).get('image')).toBe(override);
    expect(new Map(doc.config.embeds).get('icon')).toBe(inlineIconEmbedConverter);
  });

  it('领域文档只使用显式装配；来源列表和 Embed 可以为空', () => {
    const createClipboard = jasmine.createSpy('createClipboard').and.callFake((doc: BlockCraft.Doc) => new CoreClipboard(doc, []));
    const resolveEmbeds = jasmine.createSpy('resolveEmbeds').and.returnValue([]);
    const doc = own(new CoreDocument(config(), {createClipboard, resolveEmbeds}));
    expect(createClipboard).toHaveBeenCalledOnceWith(doc);
    expect(resolveEmbeds).toHaveBeenCalledOnceWith(undefined);
    expect((doc.clipboard as any)._sourceAdapters).toEqual([]);
    expect(doc.clipboard).not.toBeInstanceOf(LegacyClipboard);
    expect(doc.config.embeds).toEqual([]);
  });

  it('Builder 保持默认装配，剪贴板事件每个实例只注册一次', () => {
    const options = config();
    const add = spyOn(UIEventDispatcher.prototype, 'add').and.callThrough();
    const doc = own(LegacyBuilder.create()
      .docId(options.docId).schemas(options.schemas).injector(options.injector)
      .logger(options.logger).yDoc(options.yDoc).build());
    expect(doc).toBeInstanceOf(LegacyDocument);
    expect(doc.clipboard).toBeInstanceOf(LegacyClipboard);
    expect(new Map(doc.config.embeds).get('image')).toBe(inlineImageEmbedConverter);
    // 装饰器位于核心类上；兼容子类不能再注册同一组事件。
    const clipboardEvents = add.calls.allArgs().filter(([name]) => name === 'copy' || name === 'cut' || name === 'paste');
    expect(clipboardEvents.map(([name]) => name).sort()).toEqual(['copy', 'cut', 'paste']);
  });
});
