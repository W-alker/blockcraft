import {
  AfterViewInit,
  Component,
  HostListener,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import {AssetStore} from './file-format/asset-store';
import {BlockCraftEditorHostComponent} from './blockcraft/blockcraft-editor-host.component';
import {TauriDocumentFilePort} from './platform/desktop-file-port';
import {DocumentSession} from './session/document-session';

@Component({
  selector: 'bc-desktop-app',
  standalone: true,
  imports: [BlockCraftEditorHostComponent],
  providers: [AssetStore],
  template: `
    <main class="desktop-shell">
      <header class="top-bar">
        <div class="top-bar__left">
          <button type="button" class="back-button" aria-label="返回文档列表" title="返回文档列表">‹</button>
          <span class="divider-line" aria-hidden="true"></span>
          <div class="breadcrumb" aria-label="当前位置">
            <span>本地文档</span>
            <span class="breadcrumb__separator">/</span>
            <strong>{{ session.title }}</strong>
            @if (session.dirty) { <i aria-label="未保存">*</i> }
          </div>
          <span class="local-badge">仅本地</span>
        </div>
        <nav class="actions" aria-label="文档操作">
          <button type="button" (click)="newDocument()">新建</button>
          <button type="button" (click)="openDocument()">打开</button>
          <button type="button" class="primary" (click)="saveDocument()">保存</button>
          <button type="button" (click)="saveAs()">另存为</button>
          <button type="button" class="more-button" aria-label="更多操作">···</button>
        </nav>
      </header>

      @if (recoveryNotice) {
        <section class="recovery-banner">
          <span>{{ recoveryNotice }}</span>
          <button type="button" (click)="dismissRecovery()">知道了</button>
        </section>
      }

      <section class="workspace">
        <bc-blockcraft-editor-host
          [documentTitle]="session.title"
          (changed)="onDocumentChanged()"
          (ready)="editorReady = true">
        </bc-blockcraft-editor-host>
      </section>

      <footer class="status-bar">
        <span>{{ status }}</span>
        <span>{{ session.path || '尚未保存' }}</span>
      </footer>
    </main>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .desktop-shell { display: grid; grid-template-rows: 56px 1fr 28px; height: 100%; min-height: 640px; color: #30343b; background: #fff; }
    .top-bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-width: 0; padding: 0 18px; background: #fff; border-bottom: 1px solid #e5e7eb; }
    .top-bar__left, .actions, .breadcrumb { display: flex; align-items: center; }
    .top-bar__left { min-width: 0; gap: 12px; }
    .back-button { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; color: #6b7280; background: transparent; font-size: 25px; line-height: 1; }
    .back-button:hover { color: #4857e2; background: #f1f3ff; }
    .divider-line { width: 1px; height: 18px; background: #dfe3ea; }
    .breadcrumb { min-width: 0; gap: 8px; color: #6b7280; font-size: 13px; white-space: nowrap; }
    .breadcrumb strong { max-width: 260px; overflow: hidden; color: #30343b; text-overflow: ellipsis; font-weight: 600; }
    .breadcrumb i { color: #e36a35; font-style: normal; }
    .breadcrumb__separator { color: #b6bdc9; }
    .local-badge { padding: 3px 8px; border: 1px solid #dce2f8; border-radius: 10px; color: #4857e2; background: #f4f5ff; font-size: 11px; }
    .actions { flex: 0 0 auto; gap: 7px; }
    button { min-height: 30px; border: 1px solid #dce1eb; border-radius: 6px; padding: 0 11px; color: #3a4359; background: #fff; cursor: pointer; font-size: 12px; }
    button:hover { border-color: #8a95ee; color: #3946c5; }
    button.primary { border-color: #4f5fe8; color: #fff; background: #4f5fe8; }
    button.more-button { width: 30px; padding: 0; color: #6b7280; font-size: 16px; letter-spacing: 1px; }
    .workspace { min-height: 0; overflow: hidden; }
    .recovery-banner { display: flex; align-items: center; justify-content: space-between; padding: 8px 22px; color: #6e4b14; background: #fff6dc; border-bottom: 1px solid #f1dfaa; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-width: 0; padding: 0 14px; color: #8992a5; background: #fff; border-top: 1px solid #e2e6ee; font-size: 11px; }
    .status-bar span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 800px) { .local-badge, .more-button, .actions button:nth-child(1) { display: none; } .breadcrumb strong { max-width: 140px; } }
  `],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild(BlockCraftEditorHostComponent) private host!: BlockCraftEditorHostComponent;

  readonly session = new DocumentSession(new TauriDocumentFilePort(), this.assets);
  editorReady = false;
  status = '准备就绪';
  recoveryNotice = '';
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private unlistenOpenPath: (() => void) | null = null;
  private destroyed = false;

  constructor(private readonly assets: AssetStore) {
    this.session.startNew();
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.host.loadSnapshot(this.host.createEmptySnapshot());
      await this.listenForAssociatedFiles();
      await this.offerRecoveryDraft();
    } catch (error) {
      this.showError(error);
    }
  }

  async newDocument(): Promise<void> {
    if (!await this.confirmDiscard()) return;
    this.session.startNew();
    await this.host.loadSnapshot(this.host.createEmptySnapshot());
    this.status = '已创建新文档';
  }

  async openDocument(): Promise<void> {
    if (!await this.confirmDiscard()) return;
    try {
      const opened = await new TauriDocumentFilePort().open();
      if (!opened) return;
      this.session.adoptOpened(opened);
      const snapshot = await this.host.hydrateSnapshot(opened.document.snapshot);
      await this.host.loadSnapshot(snapshot);
      this.status = '已打开 ' + this.session.title;
    } catch (error) {
      this.showError(error);
    }
  }

  async saveDocument(): Promise<void> {
    await this.save();
  }

  async saveAs(): Promise<void> {
    try {
      const result = await this.session.saveAs(this.host.exportSnapshot(), this.host.fileService);
      await this.session.removeRecoveryDraft();
      this.status = '已保存 ' + result.bytes + ' 字节';
    } catch (error) {
      if (error instanceof Error && error.message === '已取消保存') return;
      this.showError(error);
    }
  }

  onDocumentChanged(): void {
    if (!this.editorReady) return;
    this.session.markDirty();
    this.status = '有未保存修改';
    this.scheduleRecovery();
  }

  dismissRecovery(): void {
    this.recoveryNotice = '';
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.session.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.saveDocument();
    } else if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      void this.openDocument();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      void this.newDocument();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.unlistenOpenPath?.();
  }

  private async save(path?: string): Promise<void> {
    try {
      const result = await this.session.save(this.host.exportSnapshot(), this.host.fileService, path);
      await this.session.removeRecoveryDraft();
      this.status = '已保存 ' + result.bytes + ' 字节';
    } catch (error) {
      if (error instanceof Error && error.message === '已取消保存') return;
      this.showError(error);
    }
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => {
      void this.writeRecovery();
    }, 1200);
  }

  private async writeRecovery(): Promise<void> {
    if (this.destroyed || !this.session.dirty) return;
    try {
      await this.session.saveRecovery(this.host.exportSnapshot(), this.host.fileService);
    } catch (error) {
      console.warn('恢复草稿保存失败', error);
    }
  }

  private async offerRecoveryDraft(): Promise<void> {
    const drafts = await this.session.loadRecoveryDrafts();
    const latest = drafts.at(-1);
    if (!latest) return;
    const recover = window.confirm('发现未保存的恢复草稿“' + latest.document.manifest.title + '”，是否恢复？');
    if (!recover) {
      await this.session.removeRecoveryDraft();
      return;
    }
    this.session.adoptRecovery(latest.document);
    const snapshot = await this.host.hydrateSnapshot(latest.document.snapshot);
    await this.host.loadSnapshot(snapshot);
    this.recoveryNotice = '已恢复上次未保存内容，保存后会写入新的 .bcdoc 文件。';
    this.status = '已恢复草稿';
  }

  private async listenForAssociatedFiles(): Promise<void> {
    const tauri = window.__TAURI__;
    const initialPaths = await this.getInitialDocumentPaths();
    if (tauri?.event?.listen) {
      this.unlistenOpenPath = await tauri.event.listen('open-document-path', event => {
        const paths = Array.isArray(event.payload) ? event.payload : [event.payload];
        const path = paths.find(value => typeof value === 'string' && value.toLowerCase().endsWith('.bcdoc'));
        if (path) void this.openAssociatedDocument(path);
      });
    }
    const firstPath = initialPaths[0];
    if (firstPath) await this.openAssociatedDocument(firstPath);
  }

  private async getInitialDocumentPaths(): Promise<string[]> {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return [];
    const paths = await invoke('initial_document_paths', {});
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [];
  }

  private async openAssociatedDocument(path: string): Promise<void> {
    if (!await this.confirmDiscard()) return;
    try {
      const opened = await new TauriDocumentFilePort().openPath(path);
      this.session.adoptOpened(opened);
      const snapshot = await this.host.hydrateSnapshot(opened.document.snapshot);
      await this.host.loadSnapshot(snapshot);
      this.status = '已打开 ' + this.session.title;
    } catch (error) {
      this.showError(error);
    }
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.session.dirty) return true;
    return window.confirm('当前文档有未保存修改，确定继续吗？');
  }

  private showError(error: unknown): void {
    this.status = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
}
