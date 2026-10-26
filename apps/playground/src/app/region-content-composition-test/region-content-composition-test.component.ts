import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Injector, NgZone, OnDestroy, ViewChild, inject, signal} from '@angular/core';
import {
  AdapterService, BLOCK_CREATOR_SERVICE_TOKEN, BlockCraftDoc, BlockNodeType,
  DOC_ADAPTER_SERVICE_TOKEN, DOC_FILE_SERVICE_TOKEN, DOC_LINK_PREVIEWER_SERVICE_TOKEN,
  DOC_MESSAGE_SERVICE_TOKEN, DOC_WEATHER_SERVICE_TOKEN, DocLinkPreviewerService,
  DocWeatherService, DocumentCompositionSession, DocumentPersonalData, IBlockSnapshot,
  YBlock, createBundledEditorCapabilities, generateId, native2YBlock,
} from '@ccc/blockcraft';
import {NoopLogger} from '@ccc/blockcraft/global/logger';
import {MyDocFileService} from '@ccc/blockcraft/editor/services/doc-file-service';
import {MyDocMessageService} from '@ccc/blockcraft/editor/services/doc-message.service';
import {MyBlockCreatorService} from '@ccc/blockcraft/editor/services/block-creator.service';
import {Subscription} from 'rxjs';
import {WebsocketProvider} from 'y-websocket';
import * as Y from 'yjs';

/** Framework fixture: real local WebSocket collaboration; personal JSON is browser-local. */
@Component({
  selector: 'bc-region-content-composition-test',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './region-content-composition-test.component.html',
  styleUrl: './region-content-composition-test.component.scss',
  providers: [
    {provide: DOC_FILE_SERVICE_TOKEN, useClass: MyDocFileService},
    {provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: MyDocMessageService},
    {provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: MyBlockCreatorService},
    {provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: AdapterService},
    {provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useClass: DocLinkPreviewerService},
    {provide: DOC_WEATHER_SERVICE_TOKEN, useClass: DocWeatherService},
  ],
})
export class RegionContentCompositionTestComponent implements AfterViewInit, OnDestroy {
  @ViewChild('surface', {static: true}) surface!: ElementRef<HTMLDivElement>;
  @ViewChild('viewport', {static: true}) viewport!: ElementRef<HTMLDivElement>;
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly query = new URLSearchParams(location.search);
  readonly shell = this.query.get('shell') === 'text-box' ? 'text-box' : 'render-unit';
  readonly plainMode = this.query.get('mode') === 'plain';
  readonly user = this.query.get('user') === 'B' ? 'B' : 'A';
  readonly room = this.query.get('room') || 'region-content-composition-demo';
  readonly ready = signal(false);
  readonly connected = signal(false);
  readonly dirty = signal(false);
  readonly savedCount = signal(0);
  readonly openCount = signal(0);
  readonly error = signal('');
  readonly sharedUpdates = signal(0);
  private readonly sharedDoc = new Y.Doc({gc: false});
  private provider?: WebsocketProvider;
  private session?: DocumentCompositionSession;
  private doc?: BlockCraftDoc;
  private personalSubscription?: Subscription;
  private destroyed = false;
  private rootId = '';
  private regionId = '';
  private sharedTextId = '';
  private tailTextId = '';

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.sharedDoc.on('update', this.onSharedUpdate);
      // Only the shared source reaches the provider. editorDoc/Awareness never do.
      this.provider = new WebsocketProvider('ws://127.0.0.1:12345', this.room, this.sharedDoc, {disableBc: true});
      this.provider.on('status', this.onStatus);
      this.provider.on('sync', this.onSync);
    });
  }

  private readonly onStatus = ({status}: {status: string}) => {
    this.zone.run(() => this.connected.set(status === 'connected'));
  };
  private readonly onSharedUpdate = () => {
    this.zone.run(() => this.sharedUpdates.update(value => value + 1));
  };
  private readonly onSync = (synced: boolean) => {
    if (!synced || this.destroyed || this.doc) return;
    try {
      if (!this.sharedDoc.getMap('blocks').size) this.seedSharedDocument();
      this.openDocument();
    } catch (error) {
      this.report(error);
    }
  };

  private seedSharedDocument(): void {
    const capabilities = createBundledEditorCapabilities();
    const shared = capabilities.schemas.createSnapshot('paragraph', ['共享正文']);
    const region = this.shell === 'text-box'
      ? capabilities.schemas.createSnapshot('text-box', ['', {width: 320, height: 80, textAutoFit: 'resize-shape'}])
      : capabilities.schemas.createSnapshot('render-unit', [{}, {border: '1px solid #6575db'}]);
    const tail = capabilities.schemas.createSnapshot('paragraph', ['共享尾部']);
    region.children = [capabilities.schemas.createSnapshot('paragraph', ['默认记录'])];
    const root = capabilities.schemas.createSnapshot('root', [generateId(), [shared, region, tail]]);
    const map = this.sharedDoc.getMap<YBlock>('blocks');
    const write = (snapshot: IBlockSnapshot): void => {
      const container = snapshot.nodeType === BlockNodeType.root || snapshot.nodeType === BlockNodeType.block;
      map.set(snapshot.id, native2YBlock({...snapshot, children: container
        ? (snapshot.children as IBlockSnapshot[]).map(child => child.id) : snapshot.children} as Parameters<typeof native2YBlock>[0]));
      if (container) (snapshot.children as IBlockSnapshot[]).forEach(write);
    };
    this.sharedDoc.transact(() => write(root));
  }

  private openDocument(): void {
    this.closeEditor();
    const blocks = this.sharedDoc.getMap<YBlock>('blocks');
    const root = [...blocks.values()].find(block => block.get('nodeType') === BlockNodeType.root);
    const region = [...blocks.values()].find(block => block.get('flavour') === this.shell);
    if (!root || !region) throw new Error('测试共享文档缺少根或区域');
    this.rootId = root.get('id');
    this.regionId = region.get('id');
    const rootChildren = root.get('children') as Y.Array<string>;
    this.sharedTextId = rootChildren.get(0);
    this.tailTextId = rootChildren.get(rootChildren.length - 1);
    const capabilities = createBundledEditorCapabilities({pagination: {enabled: false, printShortcut: false}});
    const saved = localStorage.getItem(this.storageKey);
    const personalData: DocumentPersonalData = saved ? JSON.parse(saved) : {
      formatVersion: 1,
      regions: {notes: {children: [capabilities.schemas.createSnapshot('paragraph', [`${this.user} 的记录`])]}},
    };
    this.session = this.plainMode ? undefined : new DocumentCompositionSession({
      sharedDoc: this.sharedDoc, rootId: this.rootId,
      regions: [{id: 'notes', blockId: this.regionId}], personalData,
    });
    const editorDoc = this.session?.editorDoc ?? this.sharedDoc;
    this.doc = new BlockCraftDoc({
      docId: this.rootId, yDoc: editorDoc, contentComposition: this.session,
      schemas: capabilities.schemas, embeds: [...capabilities.embeds], plugins: [...capabilities.plugins],
      injector: this.injector, logger: new NoopLogger(), currentUserId: `fixture-user-${this.user}`,
      scrollContainer: this.viewport.nativeElement, virtualization: {enabled: false},
    });
    const editorRoot = editorDoc.getMap<YBlock>('blocks').get(this.rootId);
    if (!editorRoot) throw new Error('组合文档缺少根');
    this.doc.initByYBlock(editorRoot, this.surface.nativeElement);
    this.personalSubscription = this.session?.personalChanges$.subscribe(() => this.zone.run(() => this.dirty.set(true)));
    this.zone.run(() => {
      this.ready.set(true);
      this.dirty.set(false);
      this.error.set('');
      this.openCount.update(value => value + 1);
    });
  }

  savePersonalData(): void {
    if (!this.session) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.session.exportPersonalData()));
      this.dirty.set(false);
      this.savedCount.update(value => value + 1);
    } catch (error) { this.report(error); }
  }

  reopen(): void {
    try { this.zone.runOutsideAngular(() => this.openDocument()); }
    catch (error) { this.report(error); }
  }

  toggleConnection(): void {
    if (this.connected()) this.provider?.disconnect();
    else this.provider?.connect();
  }

  /** Read-only evidence for browser tests; never repairs selection or mutates model. */
  inspect() {
    const doc = this.doc;
    const native = document.getSelection();
    const node = native?.focusNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const selection = doc?.selection as unknown as {
      _suppressRecalculate: boolean;
      _suppressProgrammaticSelectionChangeUntil: number;
      _projectionFrame: number | null;
      _projectionMountRequest: unknown;
    } | undefined;
    const suppressionRemaining = Math.max(0, (selection?._suppressProgrammaticSelectionChangeUntil ?? 0) - performance.now());
    return {
      mode: this.plainMode ? 'plain' : 'composition',
      selectionSettled: !!selection && !selection._suppressRecalculate && suppressionRemaining === 0
        && selection._projectionFrame === null && selection._projectionMountRequest === null,
      selectionSuppressionRemaining: suppressionRemaining,
      selectionProjectionPending: selection?._projectionFrame !== null || selection?._projectionMountRequest !== null,
      user: this.user, rootId: this.rootId, regionId: this.regionId,
      sharedTextId: this.sharedTextId, tailTextId: this.tailTextId,
      sharedVector: [...Y.encodeStateVector(this.sharedDoc)],
      sharedSnapshot: this.session?.exportSharedSnapshot(),
      sharedBlocks: this.sharedDoc.getMap('blocks').toJSON(),
      personal: this.session?.exportPersonalData(),
      snapshot: doc?.exportSnapshot(),
      selection: doc?.selection.value?.toJSON() ?? null,
      nativeBlockId: element?.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null,
      focused: !!doc?.root.hostElement.contains(document.activeElement),
      saved: localStorage.getItem(this.storageKey),
      initialized: doc?.isInitialized ?? false,
    };
  }

  private get storageKey(): string { return `blockcraft:composition-fixture:${this.room}:${this.user}`; }
  private report(error: unknown): void {
    this.zone.run(() => this.error.set(error instanceof Error ? error.message : String(error)));
  }
  private closeEditor(): void {
    this.personalSubscription?.unsubscribe();
    this.personalSubscription = undefined;
    this.doc?.destroy();
    this.doc = undefined;
    this.session?.dispose();
    this.session = undefined;
    this.surface.nativeElement.replaceChildren();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.closeEditor();
    this.provider?.off('status', this.onStatus);
    this.provider?.off('sync', this.onSync);
    this.provider?.destroy();
    this.sharedDoc.off('update', this.onSharedUpdate);
    this.sharedDoc.destroy();
  }
}
