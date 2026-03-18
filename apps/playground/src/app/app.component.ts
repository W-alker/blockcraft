import { AfterViewInit, ChangeDetectorRef, Component, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';
import {
  BlockSelection,
  ClipboardDataType,
  DOC_ADAPTER_SERVICE_TOKEN,
  DOC_FILE_SERVICE_TOKEN,
  DocExportManager,
  EditableBlockComponent,
  EditorComponent,
  IBlockSnapshot,
  IBlockSelectionJSON,
  MarkdownStreamRenderer,
  PresentationController,
  generateId
} from '@ccc/blockcraft';
import { debugTableMerge, fixTable } from '@ccc/blockcraft/blocks/table-block/callback';
import { BlockCraftAwareness } from '@ccc/blockcraft/editor/awa';
import { Subscription } from 'rxjs';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { demoJSON } from './demo.data';

type DebugActionId =
  | 'init'
  | 'theme'
  | 'readonly'
  | 'insert'
  | 'undo'
  | 'redo'
  | 'addData'
  | 'log'
  | 'logSelection'
  | 'listenUpdate'
  | 'test'
  | 'markdownStream'
  | 'logTable'
  | 'fixTable'
  | 'importHtml'
  | 'importMarkdown'
  | 'exportMarkdown'
  | 'exportPdf'
  | 'exportImage'
  | 'enterRoom'
  | 'quitRoom'
  | 'demo'
  | 'toggleMonitor'
  | 'startSim'
  | 'stopSim';

type MonitorStatus = 'ok' | 'error' | 'none';

interface DebugAction {
  id: DebugActionId;
  label: string;
  tone?: 'primary' | 'neutral' | 'danger';
}

interface DebugSection {
  title: string;
  actions: DebugAction[];
}

interface DebugMetaItem {
  label: string;
  value: string;
}

const ACTION_SECTIONS: DebugSection[] = [
  {
    title: '文档与编辑',
    actions: [
      { id: 'init', label: '初始化', tone: 'primary' },
      { id: 'theme', label: '主题' },
      { id: 'readonly', label: '只读' },
      { id: 'insert', label: '插入文本' },
      { id: 'undo', label: '撤销' },
      { id: 'redo', label: '重做' },
      { id: 'addData', label: '追加段落' }
    ]
  },
  {
    title: '导入导出',
    actions: [
      { id: 'importHtml', label: '导入 HTML' },
      { id: 'importMarkdown', label: '导入 Markdown' },
      { id: 'exportMarkdown', label: '导出 Markdown' },
      { id: 'exportPdf', label: '导出 PDF' },
      { id: 'exportImage', label: '导出图片' }
    ]
  },
  {
    title: '调试',
    actions: [
      { id: 'log', label: '打印数据' },
      { id: 'logSelection', label: '打印选区' },
      { id: 'listenUpdate', label: '监听更新' },
      { id: 'test', label: 'Yjs 测试' },
      { id: 'markdownStream', label: 'Markdown 流' },
      { id: 'logTable', label: '打印表格' },
      { id: 'fixTable', label: '修复表格' }
    ]
  },
  {
    title: '一致性检测',
    actions: [
      { id: 'toggleMonitor', label: '开关监控' },
      { id: 'startSim', label: '模拟协同', tone: 'primary' },
      { id: 'stopSim', label: '停止模拟', tone: 'danger' }
    ]
  },
  {
    title: '协同与演示',
    actions: [
      { id: 'enterRoom', label: '进入协同', tone: 'primary' },
      { id: 'quitRoom', label: '退出协同', tone: 'danger' },
      { id: 'demo', label: '演示模式' }
    ]
  }
];

@Component({
  selector: 'bc-root',
  standalone: true,
  imports: [EditorComponent],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div>
            <h1>Blockcraft</h1>
            <p>Playground Debug</p>
          </div>
          <span class="sidebar-badge">Editor</span>
        </div>

        <section class="sidebar-card">
          <span class="section-title">状态</span>
          <div class="status-grid">
            <div class="status-item">
              <span class="status-item__label">文档</span>
              <span class="status-pill" [class.status-pill--active]="isInitialized">{{ isInitialized ? '已初始化' : '未初始化' }}</span>
            </div>
            <div class="status-item">
              <span class="status-item__label">编辑</span>
              <span class="status-pill" [class.status-pill--active]="!isReadonly">{{ isReadonly ? '只读' : '可编辑' }}</span>
            </div>
            <div class="status-item">
              <span class="status-item__label">主题</span>
              <span class="status-pill status-pill--solid">{{ currentTheme }}</span>
            </div>
            <div class="status-item">
              <span class="status-item__label">协同</span>
              <span class="status-pill" [class.status-pill--active]="provider">{{ collabStatus }}</span>
            </div>
            <div class="status-item status-item--wide">
              <span class="status-item__label">更新监听</span>
              <span class="status-pill" [class.status-pill--active]="isListeningUpdate">{{ updateStatus }}</span>
            </div>
          </div>
        </section>

        <section class="sidebar-card sidebar-card--grow">
          <span class="section-title">调试操作</span>
          <nav class="action-nav">
            @for (section of actionSections; track section.title) {
              <div class="nav-section">
                <span class="nav-label">{{ section.title }}</span>
                <div class="nav-grid">
                  @for (action of section.actions; track action.id) {
                    <button
                      type="button"
                      class="nav-button"
                      [class.nav-button--primary]="action.tone === 'primary'"
                      [class.nav-button--danger]="action.tone === 'danger'"
                      (click)="runAction(action.id)"
                    >
                      {{ action.label }}
                    </button>
                  }
                </div>
              </div>
            }
          </nav>

          <div class="sim-controls">
            <span class="nav-label">模拟参数</span>
            <div class="sim-row">
              <span class="sim-label">用户数</span>
              <input type="range" min="1" max="5" [value]="simUserCount" (input)="onSimSettingChange('users', $event)">
              <span class="sim-value">{{ simUserCount }}</span>
            </div>
            <div class="sim-row">
              <span class="sim-label">间隔</span>
              <input type="range" min="100" max="2000" step="100" [value]="simIntervalMs" (input)="onSimSettingChange('interval', $event)">
              <span class="sim-value">{{ simIntervalMs }}ms</span>
            </div>
          </div>
        </section>

        <section class="sidebar-card selection-panel">
          <div class="selection-header">
            <span class="section-title">实时 Selection</span>
            <span class="status-pill" [class.status-pill--active]="hasSelection">{{ hasSelection ? '已同步' : '无选区' }}</span>
          </div>

          @if (selectionMeta.length) {
            <div class="selection-meta">
              @for (item of selectionMeta; track item.label) {
                <div class="selection-meta__item">
                  <span class="selection-meta__label">{{ item.label }}</span>
                  <strong class="selection-meta__value">{{ item.value }}</strong>
                </div>
              }
            </div>
          }

          <div class="selection-content">
            @if (selectionJson) {
              <pre class="selection-pre">{{ selectionJson }}</pre>
            } @else {
              <span class="selection-empty">当前没有可展示的选区数据</span>
            }
          </div>
        </section>
      </aside>

      <main class="editor-main">
        <div class="editor-header">
          <div>
            <h2>编辑器主内容区</h2>
            <p>左侧面板负责调试控制，右侧保留完整编辑操作空间。</p>
          </div>
          <span class="editor-header__hint">Selection 实时刷新</span>
        </div>

        <section class="editor-stage">
          <block-craft-editor #editor [stickyTop]="0"></block-craft-editor>
        </section>

        @if (isMonitorActive) {
          <section class="monitor-panel" [class.monitor-panel--error]="monitorStatus === 'error'">
            <div class="monitor-header">
              <span class="section-title">INLINE 一致性</span>
              <span class="monitor-stats">
                @if (isSimulationRunning) {
                  <span class="status-pill status-pill--active">{{ simUserCount }}人 · {{ simIntervalMs }}ms · {{ simOpCount }} ops</span>
                }
                @switch (monitorStatus) {
                  @case ('ok') { <span class="status-pill status-pill--active">✓ 一致</span> }
                  @case ('error') { <span class="status-pill monitor-pill--error">✗ 不一致</span> }
                  @default { <span class="status-pill">无聚焦块</span> }
                }
              </span>
            </div>
            <pre class="monitor-output">{{ monitorOutput }}</pre>
          </section>
        }
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
      color: var(--bc-color);
      background: var(--bc-bg-primary);
    }

    .app-shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
      color: var(--bc-color);
      background:
        radial-gradient(circle at top left, var(--bc-active-color-lighter) 0, transparent 24%),
        linear-gradient(180deg, var(--bc-bg-muted) 0%, var(--bc-bg-primary) 100%);
    }

    .sidebar {
      width: 360px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px 16px;
      color: var(--bc-color);
      background: var(--bc-bg-primary);
      border-right: 1px solid var(--bc-border-color-light);
      backdrop-filter: blur(16px);
      overflow-y: auto;
      overflow-x: hidden;
      box-sizing: border-box;
    }

    .sidebar-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .sidebar-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--bc-color);
    }

    .sidebar-header p {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--bc-color-lighter);
    }

    .sidebar-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 0 10px;
      border-radius: 999px;
      background: var(--bc-active-color-lighter);
      color: var(--bc-active-color);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .sidebar-card {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      gap: 12px;
      padding: 14px;
      background: var(--bc-bg-elevated);
      border: 1px solid var(--bc-border-color-light);
      border-radius: 16px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    }

    .sidebar-card--grow {
      flex: 1 0 auto;
      min-height: auto;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--bc-color-lighter);
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .status-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .status-item--wide {
      grid-column: 1 / -1;
    }

    .status-item__label {
      font-size: 11px;
      color: var(--bc-color-lighter);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      max-width: 100%;
      padding: 4px 9px;
      border-radius: 999px;
      background: var(--bc-bg-secondary);
      border: 1px solid var(--bc-border-color-light);
      color: var(--bc-color-light);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-pill--active {
      color: var(--bc-color);
      border-color: var(--bc-active-color-light);
      background: var(--bc-active-color-lighter);
    }

    .status-pill--solid {
      color: var(--bc-color);
      background: var(--bc-bg-hover);
    }

    .action-nav {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
    }

    .nav-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .nav-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--bc-color-lighter);
    }

    .nav-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .nav-button {
      appearance: none;
      width: 100%;
      text-align: center;
      border: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-secondary);
      color: var(--bc-color);
      border-radius: 12px;
      padding: 9px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.1s ease, border-color 0.1s ease, transform 0.1s ease;
    }

    .nav-button:hover {
      background: var(--bc-bg-hover);
      border-color: var(--bc-active-color-light);
      transform: translateY(-1px);
    }

    .nav-button--primary {
      background: var(--bc-active-color);
      color: var(--bc-color-dark, #fff);
      border-color: var(--bc-active-color);
    }

    .nav-button--primary:hover {
      background: var(--bc-active-color-light);
    }

    .nav-button--danger {
      background: #fff1f2;
      color: #be123c;
      border-color: rgba(244, 63, 94, 0.18);
    }

    .nav-button--danger:hover {
      background: #ffe4e6;
    }

    .selection-panel {
      margin-top: 0;
    }

    .selection-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .selection-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .selection-meta__item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding: 10px;
      border-radius: 12px;
      background: var(--bc-bg-secondary);
      border: 1px solid var(--bc-border-color-light);
    }

    .selection-meta__label {
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--bc-color-lighter);
    }

    .selection-meta__value {
      font-size: 12px;
      line-height: 1.4;
      color: var(--bc-color);
      word-break: break-word;
    }

    .selection-content {
      background: var(--bc-bg-secondary);
      border: 1px solid var(--bc-border-color-light);
      border-radius: 12px;
      padding: 10px 12px;
      min-height: 120px;
      max-height: 280px;
      overflow-y: auto;
    }

    .selection-pre {
      margin: 0;
      font-size: 10px;
      line-height: 1.5;
      color: var(--bc-color);
      white-space: pre-wrap;
      word-break: break-all;
      font-family: ui-monospace, monospace;
    }

    .selection-empty {
      font-size: 11px;
      color: var(--bc-color-lighter);
    }

    .editor-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
      padding: 24px 28px;
      box-sizing: border-box;
    }

    .editor-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    .editor-header h2 {
      margin: 0;
      font-size: 22px;
      line-height: 1.25;
      color: var(--bc-color);
    }

    .editor-header p {
      margin: 6px 0 0;
      font-size: 13px;
      color: var(--bc-color-light);
    }

    .editor-header__hint {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      padding: 7px 10px;
      border-radius: 999px;
      background: var(--bc-bg-hover);
      color: var(--bc-color-light);
      font-size: 12px;
      font-weight: 600;
    }

    .editor-stage {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 20px;
      border-radius: 24px;
      background: var(--bc-bg-elevated);
      border: 1px solid var(--bc-border-color-light);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
    }

    .monitor-panel {
      flex-shrink: 0;
      margin-top: 16px;
      border-radius: 16px;
      background: var(--bc-bg-elevated);
      border: 1px solid var(--bc-border-color-light);
      overflow: hidden;
    }

    .monitor-panel--error {
      border-color: #f43f5e;
    }

    .monitor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-secondary);
    }

    .monitor-stats {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .monitor-pill--error {
      color: #be123c;
      border-color: #f43f5e;
      background: #fff1f2;
    }

    .monitor-output {
      margin: 0;
      padding: 12px 16px;
      font-size: 11px;
      line-height: 1.6;
      font-family: ui-monospace, monospace;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--bc-color);
      max-height: 320px;
      overflow-y: auto;
    }

    .sim-controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 14px;
      border-top: 1px solid var(--bc-border-color-light);
    }

    .sim-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sim-label {
      font-size: 11px;
      color: var(--bc-color-lighter);
      width: 42px;
      flex-shrink: 0;
    }

    .sim-row input[type="range"] {
      flex: 1;
      height: 4px;
      accent-color: var(--bc-active-color);
    }

    .sim-value {
      font-size: 11px;
      font-weight: 600;
      color: var(--bc-color);
      width: 48px;
      text-align: right;
    }

    @media (max-width: 1200px) {
      .sidebar {
        width: 320px;
      }

      .nav-grid,
      .selection-meta,
      .status-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editor') editor?: EditorComponent;

  readonly actionSections = ACTION_SECTIONS;

  private readonly iconRegistry = inject(MatIconRegistry);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private _markdownStreamRenderer?: MarkdownStreamRenderer;
  private _markdownTestTimer: number | null = null;
  private _demoController: PresentationController | null = null;
  private _collabInitHandler?: () => void;
  private _selectionSub?: Subscription;

  readonly updateList: Uint8Array[] = [];
  isListeningUpdate = false;
  provider?: WebsocketProvider;
  selectionJson: string | null = null;
  selectionMeta: DebugMetaItem[] = [];

  // Monitor — focused block only
  isMonitorActive = false;
  monitorOutput = '';
  monitorStatus: MonitorStatus = 'none';
  private _monitorTimer: ReturnType<typeof setInterval> | null = null;

  // Simulation
  isSimulationRunning = false;
  simOpCount = 0;
  simUserCount = 1;
  simIntervalMs = 800;
  private _simTimer: ReturnType<typeof setInterval> | null = null;
  private _shadowDoc: Y.Doc | null = null;
  private _shadowCleanup: (() => void) | null = null;

  constructor() {
    this.iconRegistry.addSvgIconSet(
      this.sanitizer.bypassSecurityTrustResourceUrl('https://at.alicdn.com/t/c/font_4682833_9f8nqslb5uf.js')
    );
  }

  ngAfterViewInit(): void {
    // queueMicrotask(() => {
    //   try {
    //     this.initializeEditor();
    //   } catch (error) {
    //     console.error('Auto init editor failed:', error);
    //   }
    // });
  }

  ngOnDestroy(): void {
    this.stopMarkdownStreamTest();
    this._markdownStreamRenderer?.destroy();
    this._demoController?.destroy();
    this.quitRoom();
    this._selectionSub?.unsubscribe();
    this.stopMonitor();
    this.stopSimulation();
  }

  get isInitialized() {
    return this.editor?.doc.isInitialized ?? false;
  }

  get isReadonly() {
    return this.editor?.doc.isReadonly ?? false;
  }

  get currentTheme() {
    return this.editor?.doc.theme ?? 'light';
  }

  get collabStatus() {
    if (!this.provider) {
      return '未连接';
    }

    return (this.provider as unknown as { wsconnected?: boolean }).wsconnected ? '已连接' : '连接中';
  }

  get updateStatus() {
    if (!this.isListeningUpdate) {
      return '未开启';
    }

    return `已开启 · ${this.updateList.length} 次`;
  }

  get hasSelection() {
    return !!this.selectionJson;
  }

  private getFocusedEditableBlock(): EditableBlockComponent | null {
    const editor = this.editor;
    if (!editor?.doc.isInitialized) return null;
    const sel = editor.doc.selection.value;
    if (!sel) return null;
    const block = sel.from.block;
    return editor.doc.isEditable(block) ? block as EditableBlockComponent : null;
  }

  private _subscribeSelection() {
    const editor = this.editor;
    if (!editor) {
      return;
    }

    this._selectionSub?.unsubscribe();
    this._selectionSub = editor.doc.selection.changeObserve().subscribe(selection => {
      this.zone.run(() => {
        this._syncSelectionData(selection);
      });
    });
    this._syncSelectionData(editor.doc.selection.value);
  }

  private _syncSelectionData(selection: BlockSelection | null) {
    if (!selection) {
      this.selectionMeta = [];
      this.selectionJson = null;
      this.cdr.markForCheck();
      return;
    }

    const json = selection.toJSON();
    const direction = this._resolveSelectionDirection(selection);
    const span = this._describeSelectionSpan(json);

    this.selectionMeta = [
      { label: '状态', value: selection.collapsed ? '折叠光标' : '范围选中' },
      { label: '方向', value: direction },
      { label: '共同父级', value: json.commonParent || '-' },
      { label: '跨度', value: span }
    ];
    this.selectionJson = JSON.stringify({
      ...json,
      direction,
      isInSameBlock: selection.isInSameBlock,
      isStartOfBlock: selection.isStartOfBlock,
      isEndOfBlock: selection.isEndOfBlock,
      isAllSelected: selection.isAllSelected,
      isEmpty: selection.isEmpty
    }, null, 2);
    this.cdr.markForCheck();
  }

  private _resolveSelectionDirection(selection: BlockSelection) {
    try {
      return selection.getDirection() === 'backward' ? '反向' : '正向';
    } catch {
      return '未知';
    }
  }

  private _describeSelectionSpan(selection: IBlockSelectionJSON) {
    const from = this._formatSelectionPoint(selection.from);
    const to = selection.to ? this._formatSelectionPoint(selection.to) : from;
    return from === to ? from : `${from} → ${to}`;
  }

  private _formatSelectionPoint(point: IBlockSelectionJSON['from']) {
    if (point.type === 'selected') {
      return `${point.blockId} · block`;
    }

    return `${point.blockId} · ${point.index}:${point.length}`;
  }

  runAction(actionId: DebugActionId) {
    switch (actionId) {
      case 'init':
        this.initializeEditor();
        return;
      case 'theme':
        this.toggleTheme();
        return;
      case 'readonly':
        this.toggleReadonly();
        return;
      case 'insert':
        this.insertTestText();
        return;
      case 'undo':
        this.requireEditor().doc.crud.undoManager.undo();
        return;
      case 'redo':
        this.requireEditor().doc.crud.undoManager.redo();
        return;
      case 'addData':
        this.appendDebugParagraphs();
        return;
      case 'log':
        this.logDocument();
        return;
      case 'logSelection':
        this.logSelection();
        return;
      case 'listenUpdate':
        this.listenUpdate();
        return;
      case 'test':
        this.runYjsTest();
        return;
      case 'markdownStream':
        this.startMarkdownStreamTest();
        return;
      case 'logTable':
        this.logTable();
        return;
      case 'fixTable':
        this.fixTable();
        return;
      case 'importHtml':
        void this.importHTML();
        return;
      case 'importMarkdown':
        void this.importMarkdown();
        return;
      case 'exportMarkdown':
        this.exportMarkdown();
        return;
      case 'exportPdf':
        this.exportPdf();
        return;
      case 'exportImage':
        this.exportImage();
        return;
      case 'enterRoom':
        this.enterRoom();
        return;
      case 'quitRoom':
        this.quitRoom();
        return;
      case 'demo':
        this.startDemo();
        return;
      case 'toggleMonitor':
        this.toggleMonitor();
        return;
      case 'startSim':
        this.startSimulation();
        return;
      case 'stopSim':
        this.stopSimulation();
        return;
    }
  }

  private requireEditor() {
    if (!this.editor) {
      throw new Error('Editor component is not ready yet.');
    }

    return this.editor;
  }

  private get editorContainer() {
    const editor = this.requireEditor();
    if (!editor.container?.nativeElement) {
      throw new Error('Editor container is not ready yet.');
    }

    return editor.container.nativeElement as HTMLElement;
  }

  private createDemoSnapshot(): IBlockSnapshot {
    return JSON.parse(JSON.stringify(demoJSON)) as IBlockSnapshot;
  }

  private ensureEditorInitialized(snapshot: IBlockSnapshot = this.createDemoSnapshot()) {
    const editor = this.requireEditor();
    if (!editor.doc.isInitialized) {
      editor.doc.initBySnapshot(snapshot, this.editorContainer);
    }
    return editor;
  }

  private ensureEmptyEditorReady() {
    const editor = this.requireEditor();
    if (!editor.doc.isInitialized) {
      const rootSnapshot = editor.doc.schemas.createSnapshot('root', [
        editor.rootId,
        [editor.doc.schemas.createSnapshot('paragraph', [])]
      ]);
      editor.doc.initBySnapshot(rootSnapshot, this.editorContainer);
    }
    return editor;
  }

  private get markdownStreamRenderer() {
    const editor = this.ensureEmptyEditorReady();
    const adapter = editor.doc.injector
      .get(DOC_ADAPTER_SERVICE_TOKEN)
      .getAdapter(ClipboardDataType.RTF);

    if (!adapter) {
      throw new Error('Markdown adapter is not registered.');
    }

    return this._markdownStreamRenderer ??= new MarkdownStreamRenderer(editor.doc, adapter);
  }

  private getCurrentEditableBlock() {
    const editor = this.ensureEditorInitialized();
    const selected = editor.doc.selection.value?.from.block;
    if (selected && editor.doc.isEditable(selected)) {
      return selected as EditableBlockComponent;
    }

    const firstChild = editor.doc.root.firstChildren;
    if (firstChild && editor.doc.isEditable(firstChild)) {
      return firstChild as EditableBlockComponent;
    }

    return null;
  }

  private getCurrentTable() {
    const editor = this.ensureEditorInitialized();
    const tableElement = editor.doc.selection.value?.from.block.hostElement.closest('.table-block');
    const id = tableElement?.getAttribute('data-block-id');
    return id ? editor.doc.getBlockById(id) : null;
  }

  initializeEditor() {
    this.ensureEditorInitialized();
    this.syncPageTheme();
    this._subscribeSelection();
  }

  toggleTheme() {
    const editor = this.ensureEditorInitialized();
    editor.doc.toggleTheme(editor.doc.theme === 'dark' ? 'light' : 'dark');
    this.syncPageTheme();
  }

  private syncPageTheme() {
    document.body.style.backgroundColor = 'var(--bc-bg-primary)';
    document.body.style.color = 'var(--bc-color)';
  }

  toggleReadonly() {
    const editor = this.ensureEditorInitialized();
    editor.doc.toggleReadonly(!editor.doc.isReadonly);
  }

  insertTestText() {
    const block = this.getCurrentEditableBlock();
    if (!block) {
      return;
    }

    block.yText.applyDelta([
      { insert: 'aa ' },
      { retain: 5 },
      { retain: 6, attributes: { 's:color': 'red' } },
      { insert: ' bb ', attributes: { 's:color': 'red' } },
      { retain: 5 },
      { insert: ' cc.    ', attributes: { 'a:bold': true } }
    ]);
  }

  appendDebugParagraphs() {
    const editor = this.ensureEditorInitialized();
    const snapshots = Array.from({ length: 100 }, (_, index) =>
      editor.doc.schemas.createSnapshot('paragraph', [[{ insert: `hello {${index}}` }]])
    );
    editor.doc.crud.insertBlocks(editor.doc.rootId, 0, snapshots);
  }

  logDocument() {
    const editor = this.ensureEditorInitialized();
    // @ts-ignore
    console.log(editor.doc.crud.yBlockMap.toJSON(), editor.doc.vm.store);
    console.log(editor.doc.exportSnapshot());
  }

  logSelection() {
    const editor = this.ensureEditorInitialized();
    const selection = document.getSelection();
    const domRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    console.log(editor.doc.selection.value, domRange);
  }

  listenUpdate() {
    if (this.isListeningUpdate) {
      return;
    }

    const editor = this.ensureEditorInitialized();
    this.isListeningUpdate = true;
    editor.doc.crud.yDoc.on('update', (update: Uint8Array) => {
      this.updateList.push(update);
    });
  }

  runYjsTest() {
    const doc = new Y.Doc({ gc: false });
    const text = doc.getText('t');
    text.insert(0, 'Hello');

    const snapshot = Y.snapshot(doc);
    text.insert(5, ' World');
    const fullUpdate = Y.encodeStateAsUpdate(doc);

    const restoredBase = new Y.Doc({ gc: false });
    Y.applyUpdate(restoredBase, fullUpdate);

    const tempDoc = new Y.Doc({ gc: false });
    Y.applyUpdate(tempDoc, fullUpdate);
    const snapshotDoc = Y.createDocFromSnapshot(tempDoc, snapshot);
    const snapshotUpdate = Y.encodeStateAsUpdate(snapshotDoc);

    const restoredSnapshotDoc = new Y.Doc({ gc: false });
    Y.applyUpdate(restoredSnapshotDoc, snapshotUpdate);

    console.log('当前文档完整内容:', doc.getText('t').toString());
    console.log('从 snapshot 恢复内容:', restoredSnapshotDoc.getText('t').toString());
  }

  async renderMarkdown(markdown: string) {
    await this.markdownStreamRenderer.replace(markdown, {
      immediate: true
    });
  }

  appendMarkdownChunk(chunk: string) {
    return this.markdownStreamRenderer.append(chunk);
  }

  flushMarkdownStream() {
    return this.markdownStreamRenderer.flush();
  }

  clearMarkdownStream() {
    return this.markdownStreamRenderer.clear({
      immediate: true
    });
  }

  startMarkdownStreamTest() {
    this.stopMarkdownStreamTest();
    void this.clearMarkdownStream();

    const markdown = `# BlockCraft Markdown Stream Test

这是第一段，模拟 AI 持续输出内容。

## 列表
- 第一项
- 第二项
- 第三项

## 任务列表
- [x] 已完成事项
- [ ] 待处理事项

## 嵌套列表
1. 第一层
   1. 第二层 A
   2. 第二层 B
2. 另一项

## 代码块

\`\`\`ts
const message = "hello blockcraft";
console.log(message);
\`\`\`

## 表格

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| Markdown 流 | 已接入 | 逐块写入 |
| Diff 渲染 | 已接入 | 块级与文本级 |
| 表格 | 测试中 | 覆盖 GFM table |

## 引用
> 差异渲染应该只更新变化的部分。

---

## 公式

$$
E = mc^2
$$

最后一段：**加粗**、\`inline code\`、以及普通文本。
`;

    const chunkSize = 4;
    const chars = Array.from(markdown);
    const chunks = Array.from(
      { length: Math.ceil(chars.length / chunkSize) },
      (_, index) => chars.slice(index * chunkSize, (index + 1) * chunkSize).join('')
    );

    let cursor = 0;
    const tick = () => {
      if (cursor >= chunks.length) {
        this._markdownTestTimer = null;
        void this.flushMarkdownStream();
        return;
      }

      void this.appendMarkdownChunk(chunks[cursor]!);
      cursor += 1;
      this._markdownTestTimer = window.setTimeout(tick, 90);
    };

    tick();
  }

  private stopMarkdownStreamTest() {
    if (this._markdownTestTimer === null) {
      return;
    }

    clearTimeout(this._markdownTestTimer);
    this._markdownTestTimer = null;
  }

  exportPdf() {
    const editor = this.ensureEditorInitialized();
    new DocExportManager(editor.doc).exportToPdf('blockcraft-export-test.pdf', {
      bgcolor: '#fff',
      scale: 1,
      pdfPageSize: 'A2',
      paging: true
    });
  }

  exportImage() {
    const editor = this.ensureEditorInitialized();
    new DocExportManager(editor.doc).exportToJpeg('blockcraft-export-test.png', {
      bgcolor: '#fff',
      scale: 2
    });
  }

  async importMarkdown() {
    const editor = this.ensureEditorInitialized();
    const files = await editor.doc.injector.get(DOC_FILE_SERVICE_TOKEN).inputFiles('.md', false);
    if (!files?.length) {
      return;
    }

    const text = await files[0]!.text();
    await this.renderMarkdown(text);
  }

  exportMarkdown() {
    const editor = this.ensureEditorInitialized();
    new DocExportManager(editor.doc).exportToMarkdown('blockcraft-export-test.md');
  }

  async importHTML() {
    const editor = this.ensureEditorInitialized();
    const files = await editor.doc.injector.get(DOC_FILE_SERVICE_TOKEN).inputFiles('.html', false);
    if (!files?.length) {
      return;
    }

    const text = await files[0]!.text();
    const adapter = editor.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN).getAdapter(ClipboardDataType.HTML);
    if (!adapter) {
      return;
    }

    const snapshot = await adapter.toSnapshot(text);
    if (!snapshot) {
      return;
    }

    editor.doc.crud.insertBlocks(editor.doc.rootId, 0, snapshot.children as IBlockSnapshot[]);
  }

  fixTable() {
    const table = this.getCurrentTable();
    if (table) {
      fixTable.call(table as any);
    }
  }

  logTable() {
    const table = this.getCurrentTable();
    if (table) {
      debugTableMerge.call(table as any);
    }
  }

  enterRoom() {
    const initFn = () => {
      const yRoot = this.editor?.doc.yBlockMap?.get(this.editor?.docId)
      if (yRoot) {
        this.editor?.doc.initByYBlock(yRoot, this.editor?.container.nativeElement)
        this.editor?.doc.yDoc.off('update', initFn)
      }
    }

    this.editor?.doc.yDoc.on('update', initFn)

    this.provider = new WebsocketProvider(
      // 'ws://localhost:1234',
      'ws://196.168.1.153:1234',
      // 'ws://ws-doc.cses7.com',
      // 'ws://ws-doc-pre.cses7.com',
      // 'ws://193.168.2.100:30204/collaborate',
      this.editor!.docId,
      this.editor!.doc.yDoc, {
        disableBc: false
      })

    const uid = generateId(11)
    const awa = new BlockCraftAwareness(this.editor!.doc, this.provider.awareness)
    awa.setLocalUser({
      id: uid,
      name: uid,
    })
  }

  quitRoom() {
    const editor = this.editor;
    if (editor && this._collabInitHandler) {
      editor.doc.yDoc.off('update', this._collabInitHandler);
      this._collabInitHandler = undefined;
    }

    this.provider?.destroy();
    this.provider = undefined;
  }

  startDemo() {
    const editor = this.ensureEditorInitialized();
    this._demoController?.destroy();
    this._demoController = new PresentationController(editor.doc, {
      cover: {
        banner: {
          url: 'https://picsum.photos/1920/1080?random'
        },
        author: {
          name: 'Demo Author',
          avatar: 'https://picsum.photos/200/300?random',
          info: 'Demo Author Description'
        },
        title: 'Demo Presentation'
      }
    });
    this._demoController.start();
  }

  // ─── Consistency Monitor (focused block only) ───

  toggleMonitor() {
    if (this.isMonitorActive) {
      this.stopMonitor();
    } else {
      this.startMonitor();
    }
  }

  private startMonitor() {
    this.ensureEditorInitialized();
    this.isMonitorActive = true;
    this.refreshMonitor();
    this._monitorTimer = setInterval(() => {
      this.zone.run(() => this.refreshMonitor());
    }, 300);
  }

  private stopMonitor() {
    this.isMonitorActive = false;
    this.monitorOutput = '';
    this.monitorStatus = 'none';
    if (this._monitorTimer) {
      clearInterval(this._monitorTimer);
      this._monitorTimer = null;
    }
  }

  private refreshMonitor() {
    const block = this.getFocusedEditableBlock();
    if (!block) {
      this.monitorOutput = '(光标不在可编辑块上)';
      this.monitorStatus = 'none';
      this.cdr.markForCheck();
      return;
    }

    try {
      this.monitorOutput = this.buildMonitorOutput(block);
    } catch (e) {
      this.monitorOutput = `ERROR: ${(e as Error).message}`;
      this.monitorStatus = 'error';
    }
    this.cdr.markForCheck();
  }

  private buildMonitorOutput(block: EditableBlockComponent): string {
    const lines: string[] = [];
    const yDeltas = block.yText.toDelta() as any[];
    const leaves = (block as any).runtime.scrollBlot.leaves as any[];
    const container = (block as any).runtime.container as HTMLElement;
    const cElements = Array.from(container.querySelectorAll('c-element'))
      .filter((el: Element) => !el.classList.contains('bc-end-break'));

    lines.push(`${block.flavour} · ${block.id.slice(0, 8)}`);
    lines.push('');

    const fmtAttrs = (a: any) => {
      if (!a || !Object.keys(a).length) return '';
      const short = Object.entries(a).map(([k, v]) => v === true ? k : `${k}:${v}`).join(',');
      return ` {${short}}`;
    };

    // Delta
    lines.push(`Delta (${yDeltas.length})`);
    yDeltas.forEach((d: any, i: number) => {
      if (typeof d.insert === 'string') {
        lines.push(`  [${i}] "${this.truncate(d.insert, 30)}"${fmtAttrs(d.attributes)}  len=${d.insert.length}`);
      } else {
        const key = Object.keys(d.insert)[0];
        lines.push(`  [${i}] □${key}${fmtAttrs(d.attributes)}  len=1`);
      }
    });

    // Blot
    lines.push(`Blot (${leaves.length})`);
    leaves.forEach((l: any, i: number) => {
      if ('text' in l && typeof l.text === 'string') {
        lines.push(`  [${i}] "${this.truncate(l.text, 30)}"${fmtAttrs(l.attrs)}  len=${l.length}`);
      } else {
        lines.push(`  [${i}] □embed${fmtAttrs(l.attrs)}  len=${l.length}`);
      }
    });

    // DOM
    lines.push(`DOM (${cElements.length})`);
    cElements.forEach((el: Element, i: number) => {
      const ct = el.querySelector('c-text');
      if (ct) {
        lines.push(`  [${i}] "${this.truncate(ct.textContent || '', 30)}"  len=${(ct.textContent || '').length}`);
      } else {
        lines.push(`  [${i}] □embed  len=1`);
      }
    });

    // Diff
    const diffs: string[] = [];
    if (yDeltas.length !== leaves.length) diffs.push(`段数: Delta(${yDeltas.length}) ≠ Blot(${leaves.length})`);
    if (yDeltas.length !== cElements.length) diffs.push(`段数: Delta(${yDeltas.length}) ≠ DOM(${cElements.length})`);

    const minLen = Math.min(yDeltas.length, leaves.length, cElements.length);
    for (let i = 0; i < minLen; i++) {
      const yd = yDeltas[i];
      const leaf = leaves[i] as any;
      const el = cElements[i];

      const yStr = typeof yd.insert === 'string' ? yd.insert : null;
      const bStr = 'text' in leaf ? leaf.text : null;
      const ct = el.querySelector('c-text');
      const dStr = ct ? (ct.textContent || '') : null;

      if (yStr !== null && bStr !== null && yStr !== bStr)
        diffs.push(`[${i}] text: Delta="${this.truncate(yStr, 20)}" ≠ Blot="${this.truncate(bStr, 20)}"`);
      if (yStr !== null && dStr !== null && yStr !== dStr)
        diffs.push(`[${i}] text: Delta="${this.truncate(yStr, 20)}" ≠ DOM="${this.truncate(dStr, 20)}"`);
      if (bStr !== null && dStr !== null && bStr !== dStr)
        diffs.push(`[${i}] text: Blot="${this.truncate(bStr, 20)}" ≠ DOM="${this.truncate(dStr, 20)}"`);
    }

    const maxSegs = Math.max(yDeltas.length, leaves.length, cElements.length);
    for (let i = minLen; i < maxSegs; i++) {
      const has = [i < yDeltas.length ? 'Delta' : null, i < leaves.length ? 'Blot' : null, i < cElements.length ? 'DOM' : null].filter(Boolean);
      const missing = [i >= yDeltas.length ? 'Delta' : null, i >= leaves.length ? 'Blot' : null, i >= cElements.length ? 'DOM' : null].filter(Boolean);
      diffs.push(`[${i}] 仅存在于 ${has.join(',')}，缺失于 ${missing.join(',')}`);
    }

    lines.push('');
    if (diffs.length) {
      lines.push(`✗ ${diffs.length} 处不一致:`);
      diffs.forEach(d => lines.push(`  ${d}`));
      this.monitorStatus = 'error';
    } else {
      lines.push('✓ Delta / Blot / DOM 三方一致');
      this.monitorStatus = 'ok';
    }

    return lines.join('\n');
  }

  private truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  // ─── Collaborative Simulation ───

  onSimSettingChange(type: 'users' | 'interval', event: Event) {
    const val = +(event.target as HTMLInputElement).value;
    if (type === 'users') this.simUserCount = val;
    else this.simIntervalMs = val;
    if (this.isSimulationRunning) this.restartSimTimer();
  }

  startSimulation() {
    if (this.isSimulationRunning) return;
    this.ensureEditorInitialized();

    const mainDoc = this.editor!.doc.yDoc;
    this._shadowDoc = new Y.Doc();
    Y.applyUpdate(this._shadowDoc, Y.encodeStateAsUpdate(mainDoc));

    const syncToShadow = (update: Uint8Array, origin: any) => {
      if (origin !== 'shadow') {
        try { Y.applyUpdate(this._shadowDoc!, update, 'main'); } catch {}
      }
    };
    const syncToMain = (update: Uint8Array, origin: any) => {
      if (origin !== 'main') {
        try { Y.applyUpdate(mainDoc, update, 'shadow'); } catch {}
      }
    };
    mainDoc.on('update', syncToShadow);
    this._shadowDoc.on('update', syncToMain);

    this._shadowCleanup = () => {
      mainDoc.off('update', syncToShadow);
      this._shadowDoc?.off('update', syncToMain);
      this._shadowDoc?.destroy();
      this._shadowDoc = null;
    };

    this.isSimulationRunning = true;
    this.simOpCount = 0;
    this.restartSimTimer();
  }

  stopSimulation() {
    this.isSimulationRunning = false;
    if (this._simTimer) {
      clearInterval(this._simTimer);
      this._simTimer = null;
    }
    this._shadowCleanup?.();
    this._shadowCleanup = null;
  }

  private restartSimTimer() {
    if (this._simTimer) clearInterval(this._simTimer);
    this._simTimer = setInterval(() => {
      for (let i = 0; i < this.simUserCount; i++) {
        this.performRandomOp();
      }
    }, this.simIntervalMs);
  }

  private performRandomOp() {
    if (!this._shadowDoc) return;

    const shadowBlockMap = this._shadowDoc.getMap<Y.Map<any>>('blocks');
    const editableEntries: { id: string; yText: Y.Text }[] = [];
    shadowBlockMap.forEach((yBlock, id) => {
      try {
        const children = yBlock.get('children');
        if (children instanceof Y.Text) editableEntries.push({ id, yText: children });
      } catch {}
    });
    if (!editableEntries.length) return;

    // 80% chance to operate on the focused paragraph
    const focusedBlock = this.getFocusedEditableBlock();
    let target: { id: string; yText: Y.Text };
    if (focusedBlock && Math.random() < 0.8) {
      const match = editableEntries.find(e => e.id === focusedBlock.id);
      target = match || editableEntries[Math.floor(Math.random() * editableEntries.length)];
    } else {
      target = editableEntries[Math.floor(Math.random() * editableEntries.length)];
    }

    const textLen = target.yText.length;
    const chars = 'abcdefghij ';

    this._shadowDoc.transact(() => {
      if (textLen === 0 || Math.random() < 0.7) {
        const pos = Math.floor(Math.random() * (textLen + 1));
        const len = 1 + Math.floor(Math.random() * 3);
        let text = '';
        for (let i = 0; i < len; i++) text += chars[Math.floor(Math.random() * chars.length)];
        target.yText.insert(pos, text);
      } else {
        const maxDel = Math.min(3, textLen);
        const count = 1 + Math.floor(Math.random() * maxDel);
        const start = Math.floor(Math.random() * (textLen - count + 1));
        target.yText.delete(start, count);
      }
    });

    this.simOpCount++;
    this.cdr.markForCheck();
  }
}
