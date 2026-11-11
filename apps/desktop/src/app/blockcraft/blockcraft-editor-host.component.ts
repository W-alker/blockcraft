import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockCraftDoc,
  ConsoleLogger,
  createBundledEditorCapabilities,
  DOC_ADAPTER_SERVICE_TOKEN,
  DOC_FILE_SERVICE_TOKEN,
  DOC_LINK_PREVIEWER_SERVICE_TOKEN,
  DOC_MESSAGE_SERVICE_TOKEN,
  FixedTextToolbarComponent,
  generateId,
  IBlockSnapshot,
} from '@ccc/blockcraft';
import * as Y from 'yjs';
import {Subscription} from 'rxjs';
import {OverlayModule} from '@angular/cdk/overlay';
import {AssetStore} from '../file-format/asset-store';
import {
  OfflineAdapterService,
  OfflineBlockCreatorService,
  OfflineFileService,
  OfflineLinkPreviewerService,
  OfflineMessageService,
} from './offline-editor-services';

@Component({
  selector: 'bc-blockcraft-editor-host',
  standalone: true,
  imports: [FixedTextToolbarComponent, OverlayModule],
  template: `
    <div #surface class="editor-surface">
      <section class="editor-frame">
        <div class="document-page">
          <header class="document-page__header">
            <div class="document-page__icon" aria-hidden="true">B</div>
            <div class="document-page__heading">
              <h1>{{ documentTitle || '未命名' }}</h1>
              <div class="document-page__meta">离线文档 · 内容保存在本机</div>
            </div>
          </header>
          <div class="editor-toolbar-shell">
            <bc-fixed-toolbar [doc]="doc"></bc-fixed-toolbar>
          </div>
          <div #container class="editor-container"></div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host, .editor-surface, .editor-frame { display: block; min-height: 0; height: 100%; }
    .editor-frame { min-height: 100%; padding: 28px 34px 42px; overflow: auto; background: #f4f5f8; }
    .document-page { width: min(980px, 100%); min-height: calc(100vh - 154px); margin: 0 auto; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 3px; background: #fff; box-shadow: 0 8px 28px rgba(34, 44, 66, .08); }
    .document-page__header { display: flex; align-items: flex-start; gap: 12px; padding: 34px 72px 18px; }
    .document-page__icon { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 auto; border-radius: 8px; color: #fff; background: #4f5fe8; font-size: 17px; font-weight: 700; }
    .document-page__heading { min-width: 0; }
    .document-page__heading h1 { margin: -4px 0 6px; overflow: hidden; color: #30343b; font-size: 30px; font-weight: 600; line-height: 40px; text-overflow: ellipsis; white-space: nowrap; }
    .document-page__meta { color: #9aa1ad; font-size: 12px; }
    .editor-toolbar-shell { min-height: 44px; padding: 0 62px; border-top: 1px solid #f0f1f4; border-bottom: 1px solid #edf0f4; background: #fff; }
    .editor-toolbar-shell bc-fixed-toolbar { display: block; }
    .editor-container { min-height: 500px; padding: 18px 72px 72px; }
    @media (max-width: 800px) { .editor-frame { padding: 16px; } .document-page__header { padding: 26px 30px 16px; } .editor-toolbar-shell { padding: 0 20px; } .editor-container { padding: 18px 30px 54px; } }
  `],
  providers: [
    {provide: DOC_FILE_SERVICE_TOKEN, useClass: OfflineFileService},
    {provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: OfflineMessageService},
    {provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: OfflineBlockCreatorService},
    {provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useClass: OfflineLinkPreviewerService},
    {provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: OfflineAdapterService},
    ConsoleLogger,
  ],
})
export class BlockCraftEditorHostComponent implements AfterViewInit, OnDestroy {
  @Input() documentTitle = '未命名';
  @ViewChild('container', {read: ElementRef}) private container!: ElementRef<HTMLElement>;
  @Output() readonly ready = new EventEmitter<BlockCraftDoc>();
  @Output() readonly changed = new EventEmitter<void>();

  doc: BlockCraftDoc;
  private readonly documentId = generateId();
  private changes = new Subscription();
  private firstViewReady = false;

  constructor(
    private readonly injector: Injector,
    private readonly logger: ConsoleLogger,
    private readonly cdr: ChangeDetectorRef,
    private readonly assets: AssetStore,
  ) {
    this.doc = this.createDoc();
  }

  ngAfterViewInit(): void {
    this.firstViewReady = true;
  }

  async loadSnapshot(snapshot: IBlockSnapshot): Promise<void> {
    if (!this.firstViewReady) throw new Error('编辑器视图尚未就绪');
    this.changes.unsubscribe();
    this.changes = new Subscription();
    if (this.doc.isInitialized) this.doc.destroy();
    this.doc = this.createDoc();
    this.cdr.detectChanges();
    this.container.nativeElement.replaceChildren();
    this.doc.initBySnapshot(snapshot, this.container.nativeElement);
    this.changes.add(this.doc.model.contentChange$.subscribe(() => this.changed.emit()));
    this.changes.add(this.doc.model.structureChange$.subscribe(() => this.changed.emit()));
    this.ready.emit(this.doc);
  }

  createEmptySnapshot(): IBlockSnapshot {
    const paragraph = this.doc.schemas.createSnapshot('paragraph', ['']);
    return this.doc.schemas.createSnapshot('root', [this.documentId, [paragraph]]);
  }

  exportSnapshot(): IBlockSnapshot {
    const snapshot = this.doc.exportSnapshot();
    if (!snapshot) throw new Error('文档尚未初始化');
    return snapshot;
  }

  get fileService(): OfflineFileService {
    return this.doc.injector.get(DOC_FILE_SERVICE_TOKEN) as OfflineFileService;
  }

  async hydrateSnapshot(snapshot: IBlockSnapshot): Promise<IBlockSnapshot> {
    return this.assets.hydrateSnapshot(snapshot, this.fileService);
  }

  ngOnDestroy(): void {
    this.changes.unsubscribe();
    this.doc.destroy();
  }

  private createDoc(): BlockCraftDoc {
    const capabilities = createBundledEditorCapabilities({
      openLink: () => undefined,
      pagination: {enabled: false, printShortcut: false},
    });
    return new BlockCraftDoc({
      yDoc: new Y.Doc({guid: generateId(), gc: false}),
      docId: generateId(),
      currentUserId: 'offline-user',
      schemas: capabilities.schemas,
      logger: this.logger,
      injector: this.injector,
      virtualization: {enabled: false},
      embeds: [...capabilities.embeds] as [string, any][],
      plugins: [...capabilities.plugins],
    });
  }
}
