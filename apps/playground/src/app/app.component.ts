import { AfterViewInit, ChangeDetectorRef, Component, ComponentRef, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';
import {
  BlockSelection,
  BlockNodeType,
  ClipboardDataType,
  DOC_ADAPTER_SERVICE_TOKEN,
  DOC_FILE_SERVICE_TOKEN,
  DocExportManager,
  EditableBlockComponent,
  EditorComponent,
  FixedTextToolbarComponent,
  IBlockSnapshot,
  ISelectionJSON,
  MarkdownStreamViewer,
  MarkdownStreamRenderer,
  PaginationPlugin,
  PresentationController,
  SnapshotViewerComponent,
  createMarkdownStreamViewer,
  generateId,
  replaceSnapshotsIdDeeply
} from '@ccc/blockcraft';
import {PaginationSettingsComponent} from './pagination-settings.component';
import {DocumentScaleSettingsComponent} from './document-scale-settings.component';
import { debugTableMerge, fixTable } from '@ccc/blockcraft/blocks/table-block/callback';
import { BlockCraftAwareness } from '@ccc/blockcraft/editor/awa';
import { Subject, Subscription } from 'rxjs';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { demoJSON } from './demo.data';
import { RouterLink } from '@angular/router';
import { resolveCollaborationRoot } from './collaboration-root';
import {
  DocumentAgentContext,
  DocumentAgentPanelComponent,
  DocumentAgentPlugin,
  DocumentAgentRequest,
  DocumentAgentResult,
  DocumentAgentRunner,
  DocumentAgentToolExecutor,
  BlockCraftEditorAgent,
  captureBlockCraftAgentDocumentContext,
} from 'blockcraft-agent';
import { PlaygroundDocumentAgentTransport } from './document-agent-transport';
import {
  IME_SCENARIO_LABELS,
  ImeCollaborationRunnerState,
  ImeCollaborationScenario,
  ImeCollaborationScenarioRunner,
  ShadowCollaborationSession,
  createInitialImeRunnerState,
} from './collaboration-simulator';

type CollaborationSimulationMode = 'random-text' | 'ime-race';

type DebugActionId =
  | 'init'
  | 'theme'
  | 'readonly'
  | 'toggleVirtualization'
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
  | 'toggleCopyFilter'
  | 'importHtml'
  | 'importMarkdown'
  | 'importBlockSnapshotTxt'
  | 'exportMarkdown'
  | 'exportPdf'
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

const BLOCK_SNAPSHOT_NODE_TYPES = new Set(['root', 'block', 'void', 'editable']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractFirstJsonObject(source: string): string {
  const input = source.trim().replace(/^\uFEFF/, '');
  const start = input.indexOf('{');
  if (start < 0) {
    throw new Error('未找到 JSON 对象');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  throw new Error('JSON 对象未闭合');
}

function isBlockSnapshotLike(value: unknown): value is IBlockSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value['id'] !== 'string' ||
    typeof value['flavour'] !== 'string' ||
    typeof value['nodeType'] !== 'string' ||
    !BLOCK_SNAPSHOT_NODE_TYPES.has(value['nodeType']) ||
    !isRecord(value['props']) ||
    !isRecord(value['meta']) ||
    !Array.isArray(value['children'])
  ) {
    return false;
  }

  if (value['nodeType'] === 'root' || value['nodeType'] === 'block') {
    return value['children'].every(isBlockSnapshotLike);
  }

  return true;
}

const ACTION_SECTIONS: DebugSection[] = [
  {
    title: '文档与编辑',
    actions: [
      { id: 'init', label: '初始化', tone: 'primary' },
      { id: 'theme', label: '主题' },
      { id: 'readonly', label: '只读' },
      { id: 'toggleVirtualization', label: '虚拟渲染' },
      { id: 'addData', label: '追加段落' }
    ]
  },
  {
    title: '导入导出',
    actions: [
      { id: 'importHtml', label: '导入 HTML' },
      { id: 'importMarkdown', label: '导入 Markdown' },
      { id: 'importBlockSnapshotTxt', label: '导入 TXT' },
      { id: 'exportMarkdown', label: '导出 Markdown' },
      { id: 'exportPdf', label: '导出 PDF' }
    ]
  },
  {
    title: '调试',
    actions: [
      { id: 'log', label: '打印数据' },
      { id: 'logSelection', label: '打印选区' },
      { id: 'listenUpdate', label: '监听更新' },
      { id: 'markdownStream', label: 'Markdown 流' },
      { id: 'logTable', label: '打印表格' },
      { id: 'toggleCopyFilter', label: '过滤链接(复制)' },
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
  selector: 'playground-home',
  standalone: true,
  imports: [
    EditorComponent,
    FixedTextToolbarComponent,
    SnapshotViewerComponent,
    PaginationSettingsComponent,
    DocumentScaleSettingsComponent,
    RouterLink,
  ],
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
              <span class="status-pill" [class.status-pill--active]="editorInitialized">{{ editorInitialized ? '已初始化' : '未初始化' }}</span>
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
            <div class="status-item">
              <span class="status-item__label">复制过滤</span>
              <span class="status-pill" [class.status-pill--active]="copyFilterActive">{{ copyFilterActive ? '过滤链接' : '关闭' }}</span>
            </div>
            <div class="status-item">
              <span class="status-item__label">虚拟渲染</span>
              <span class="status-pill" [class.status-pill--active]="virtualizationEnabled">
                {{ virtualizationEnabled ? '开启' : '关闭' }}
              </span>
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
            <div class="sim-mode" role="tablist" aria-label="协同模拟模式">
              <button
                type="button"
                class="sim-mode__button"
                [class.sim-mode__button--active]="simulationMode === 'random-text'"
                (click)="setSimulationMode('random-text')">
                随机文本
              </button>
              <button
                type="button"
                class="sim-mode__button"
                [class.sim-mode__button--active]="simulationMode === 'ime-race'"
                (click)="setSimulationMode('ime-race')">
                IME 竞态
              </button>
            </div>
            @if (simulationMode === 'random-text') {
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
            } @else {
              <div class="sim-row">
                <span class="sim-label">自动</span>
                <label class="sim-toggle">
                  <input type="checkbox" [checked]="imeAutoEnabled" (change)="onImeAutoChange($event)">
                  <span class="sim-toggle__track" aria-hidden="true"></span>
                  <span>{{ imeAutoEnabled ? '轮换' : '单步' }}</span>
                </label>
              </div>
              <div class="sim-row">
                <span class="sim-label">延迟</span>
                <input type="range" min="0" max="2000" step="100" [value]="imeScenarioDelayMs" (input)="onImeDelayChange($event)">
                <span class="sim-value">{{ imeScenarioDelayMs }}ms</span>
              </div>
              <div class="sim-state-grid">
                <span>当前</span>
                <strong>{{ imeScenarioLabel(imeRunnerState.pendingScenario ?? imeRunnerState.lastScenario) }}</strong>
                <span>下一项</span>
                <strong>{{ imeScenarioLabel(imeRunnerState.nextScenario) }}</strong>
                <span>结果</span>
                <strong>{{ imeRunnerState.appliedCount }} / {{ imeRunnerState.skippedCount }} / {{ imeRunnerState.errorCount }}</strong>
              </div>
              <div class="sim-message" [title]="imeRunnerState.message">{{ imeRunnerState.message }}</div>
              <div class="sim-actions">
                <button type="button" [disabled]="!canRunImeScenario" (pointerdown)="runImeScenario($event, 'remote-text-near-caret')">远端文本</button>
                <button type="button" [disabled]="!canRunImeScenario" (pointerdown)="runImeScenario($event, 'insert-root-before')">上方插入</button>
                <button type="button" [disabled]="!canRunImeScenario" (pointerdown)="runImeScenario($event, 'move-root-to-end')">移到末尾</button>
                <button type="button" class="sim-action--danger" [disabled]="!canRunImeScenario" (pointerdown)="runImeScenario($event, 'delete-selection-scope')">删除 scope</button>
              </div>
            }
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

        <section class="sidebar-card agent-card">
          <div class="selection-header">
            <span class="section-title">文档 Agent</span>
            <span class="status-pill" [class.status-pill--active]="!!agentContext">{{ agentContext ? (agentContext.scope === 'document' ? '整篇文档' : '当前选区') : '初始化中' }}</span>
          </div>
          <p class="agent-card__hint">打开浮动对话框后，选区会被锁定，输入时不会丢失上下文。</p>
          @if (agentBusy) {
            <div class="agent-status agent-status--busy">Codex 正在生成建议…</div>
          }
          @if (agentResult) {
            <div class="agent-status">有待应用的修改建议，请点击左上角 Agent 按钮查看。</div>
          }
          @if (agentError && !agentDialogOpen) {
            <div class="agent-status agent-status--error">{{ agentError }}</div>
          }
        </section>
      </aside>

      <main class="editor-main">
        <div class="editor-header">
          <div>
            <h2>编辑器主内容区</h2>
            <p>左侧面板负责调试控制，右侧可在完整编辑器与 snapshot-viewer demo 间切换。</p>
          </div>
          <div class="editor-header__actions">
            @if (activeMainTab === 'editor') {
              <div class="main-tabs" role="group" aria-label="编辑器布局切换">
                <button
                  class="main-tab"
                  type="button"
                  [disabled]="!editorInitialized"
                  [attr.aria-pressed]="!paginationEnabled"
                  [class.main-tab--active]="!paginationEnabled"
                  (click)="setPaginationEnabled(false)">
                  连续布局
                </button>
                <button
                  class="main-tab"
                  type="button"
                  [disabled]="!editorInitialized"
                  [attr.aria-pressed]="paginationEnabled"
                  [class.main-tab--active]="paginationEnabled"
                  (click)="setPaginationEnabled(true)">
                  分页布局
                </button>
              </div>
            }
            <div class="main-tabs" role="tablist" aria-label="主内容切换">
              <button
                class="main-tab"
                type="button"
                role="tab"
                [attr.aria-selected]="activeMainTab === 'editor'"
                [class.main-tab--active]="activeMainTab === 'editor'"
                (click)="setMainTab('editor')">
                编辑器
              </button>
              <button
                class="main-tab"
                type="button"
                role="tab"
                [attr.aria-selected]="activeMainTab === 'viewer'"
                [class.main-tab--active]="activeMainTab === 'viewer'"
                (click)="setMainTab('viewer')">
                Snapshot Viewer
              </button>
              <button
                class="main-tab"
                type="button"
                routerLink="/template">
                模板装饰 →
              </button>
            </div>
            <span class="editor-header__hint">
              {{ activeMainTab === 'editor' ? 'Selection 实时刷新' : snapshotViewerSourceLabel }}
            </span>
          </div>
        </div>

        @if (activeMainTab === 'editor') {
          @if (editorDoc; as doc) {
            <bc-fixed-toolbar
              class="playground-editor-toolbar"
              [doc]="doc"
              [stickyTop]="0">
            </bc-fixed-toolbar>
          }
          <section
            class="editor-stage"
            [class.editor-stage--flow]="!paginationEnabled">
            <article #documentHeader class="playground-document-header">
              <div class="playground-document-header__eyebrow">宿主文档头 · root 外部</div>
              <h1>BlockCraft 分页坐标验证文档</h1>
              <div class="playground-document-header__meta">
                <span class="playground-document-header__avatar">BC</span>
                <span>BlockCraft Playground</span>
                <span class="playground-document-header__divider" aria-hidden="true"></span>
                <span>连续布局与分页布局复用同一 DOM</span>
              </div>
            </article>
            @if (virtualizationEnabled) {
              <block-craft-editor
                #editor
                [stickyTop]="0"
                [showFixedToolbar]="false"
                [virtualizationEnabled]="true"
                [paginationSparseView]="true"
                [paginationDocumentHeader]="paginationDocumentHeaderOptions">
              </block-craft-editor>
            } @else {
              <block-craft-editor
                #editor
                [stickyTop]="0"
                [showFixedToolbar]="false"
                [virtualizationEnabled]="false"
                [paginationSparseView]="false"
                [paginationDocumentHeader]="paginationDocumentHeaderOptions">
              </block-craft-editor>
            }
          </section>
        }

        @if (activeMainTab === 'editor' && paginationEnabled && paginationPlugin) {
          <bc-pagination-settings
            class="pagination-settings-float"
            [plugin]="paginationPlugin!">
          </bc-pagination-settings>
        }

        @if (
          activeMainTab === 'editor' &&
          editorInitialized &&
          editor &&
          documentScaleViewport &&
          documentScaleStage &&
          documentScaleSurface
        ) {
          <bc-document-scale-settings
            class="document-scale-settings-float"
            [manager]="editor.doc.viewScale"
            [viewport]="documentScaleViewport"
            [stage]="documentScaleStage"
            [surface]="documentScaleSurface">
          </bc-document-scale-settings>
        }

        @if (activeMainTab === 'viewer') {
          <section class="viewer-demo-panel">
            <div class="viewer-demo-panel__header">
              <div>
                <h3>Snapshot Viewer Demo</h3>
                <p>独立于 Doc / Plugin / Yjs 的显示路径，支持 snapshot 和 Markdown 流式两种演示模式。</p>
              </div>

              <div class="viewer-demo-panel__actions">
                <div class="viewer-mode-tabs" role="tablist" aria-label="viewer mode">
                  <button
                    class="viewer-mode-tab"
                    type="button"
                    [class.viewer-mode-tab--active]="activeViewerMode === 'snapshot'"
                    (click)="setViewerMode('snapshot')">
                    Snapshot
                  </button>
                  <button
                    class="viewer-mode-tab"
                    type="button"
                    [class.viewer-mode-tab--active]="activeViewerMode === 'markdown-stream'"
                    (click)="setViewerMode('markdown-stream')">
                    Markdown Stream
                  </button>
                </div>

                @if (activeViewerMode === 'snapshot') {
                  <span class="status-pill status-pill--solid">{{ snapshotViewerSourceLabel }}</span>
                  <button class="panel-btn" type="button" (click)="loadSnapshotViewerDemo()">加载 Demo</button>
                  <button class="panel-btn panel-btn--primary" type="button" (click)="syncSnapshotViewerFromEditor()">同步当前文档</button>
                } @else {
                  <span class="status-pill status-pill--solid">{{ markdownStreamStatusLabel }}</span>
                  <button class="panel-btn" type="button" (click)="startMarkdownStreamDemo()">开始流式 Demo</button>
                  <button class="panel-btn" type="button" (click)="appendNextMarkdownChunk()">逐段追加</button>
                  <button class="panel-btn" type="button" (click)="rewriteMarkdownStreamDemo()">模拟回改</button>
                  <button class="panel-btn panel-btn--primary" type="button" (click)="finishMarkdownStreamDemo()">完成</button>
                }
              </div>
            </div>

            <div class="viewer-demo-panel__stage">
              @if (activeViewerMode === 'snapshot') {
                <bc-snapshot-viewer
                  [snapshot]="snapshotViewerSnapshot"
                  [options]="snapshotViewerOptions">
                </bc-snapshot-viewer>
              } @else {
                <div class="markdown-stream-demo">
                  <div class="markdown-stream-demo__controls">
                    <label class="markdown-stream-demo__label" for="markdown-stream-source">Markdown Source</label>
                    <textarea
                      id="markdown-stream-source"
                      class="markdown-stream-demo__input"
                      [value]="markdownStreamSource"
                      (input)="onMarkdownStreamSourceInput($event)"></textarea>

                    <section class="chunk-preview">
                      <div class="chunk-preview__header">
                        <span class="section-title">模拟分片数据</span>
                        <div class="chunk-preview__header-actions">
                          <div class="chunk-mode-tabs" role="tablist" aria-label="chunk mode">
                            <button
                              class="chunk-mode-tab"
                              type="button"
                              [class.chunk-mode-tab--active]="markdownStreamChunkMode === 'paragraph'"
                              (click)="setMarkdownChunkMode('paragraph')">
                              按段切块
                            </button>
                            <button
                              class="chunk-mode-tab"
                              type="button"
                              [class.chunk-mode-tab--active]="markdownStreamChunkMode === 'random'"
                              (click)="setMarkdownChunkMode('random')">
                              随机字符级
                            </button>
                          </div>
                          <span class="status-pill status-pill--solid">{{ markdownStreamChunks.length }} chunks</span>
                        </div>
                      </div>

                      <div class="chunk-preview__list">
                        @for (chunk of markdownStreamChunks; track $index) {
                          <article
                            class="chunk-preview__item"
                            [class.chunk-preview__item--done]="$index < markdownStreamIndex"
                            [class.chunk-preview__item--active]="$index === markdownStreamIndex">
                            <div class="chunk-preview__meta">
                              <strong>Chunk {{ $index + 1 }}</strong>
                              <span>{{ getMarkdownChunkState($index) }}</span>
                            </div>
                            <pre class="chunk-preview__text">{{ chunk }}</pre>
                          </article>
                        }
                      </div>
                    </section>
                  </div>
                  <div class="markdown-stream-demo__viewer" #markdownStreamHost></div>
                </div>
              }
            </div>
          </section>
        }

        @if (isMonitorActive && activeMainTab === 'editor') {
          <section class="monitor-panel" [class.monitor-panel--error]="monitorStatus === 'error'">
            <div class="monitor-header">
              <span class="section-title">INLINE 一致性</span>
              <span class="monitor-stats">
                @if (isSimulationRunning) {
                  @if (simulationMode === 'random-text') {
                    <span class="status-pill status-pill--active">{{ simUserCount }}人 · {{ simIntervalMs }}ms · {{ simOpCount }} ops</span>
                  } @else {
                    <span class="status-pill status-pill--active">IME · {{ imeRunnerState.phase }} · {{ imeRunnerState.appliedCount }} ops</span>
                  }
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

      <button
        type="button"
        class="agent-launcher"
        aria-label="打开文档 Agent"
        title="打开文档 Agent"
        (click)="openAgentDialog($event)">
        Agent
      </button>
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

    .editor-header__actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .main-tabs {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px;
      border-radius: 999px;
      background: var(--bc-bg-secondary);
      border: 1px solid var(--bc-border-color-light);
    }

    .main-tab {
      min-height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--bc-color-light);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all .2s ease;
    }

    .main-tab:hover {
      color: var(--bc-color);
      background: var(--bc-bg-hover);
    }

    .main-tab--active {
      color: #fff;
      background: var(--bc-active-color);
      box-shadow: 0 8px 18px rgba(72, 87, 226, 0.22);
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

    .viewer-demo-panel {
      display: flex;
      flex-direction: column;
      gap: 14px;
      flex: 1;
      min-height: 0;
      padding: 18px;
      border-radius: 20px;
      background: var(--bc-bg-elevated);
      border: 1px solid var(--bc-border-color-light);
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
    }

    .viewer-demo-panel__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .viewer-demo-panel__header h3 {
      margin: 0;
      font-size: 18px;
      color: var(--bc-color);
    }

    .viewer-demo-panel__header p {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--bc-color-light);
    }

    .viewer-demo-panel__actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
    }

    .viewer-mode-tabs {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px;
      border-radius: 999px;
      background: var(--bc-bg-secondary);
      border: 1px solid var(--bc-border-color-light);
    }

    .viewer-mode-tab {
      min-height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--bc-color-light);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all .2s ease;
    }

    .viewer-mode-tab:hover {
      color: var(--bc-color);
      background: var(--bc-bg-hover);
    }

    .viewer-mode-tab--active {
      color: #fff;
      background: var(--bc-active-color);
    }

    .panel-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-secondary);
      color: var(--bc-color);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all .2s ease;
    }

    .panel-btn:hover {
      border-color: var(--bc-active-color-light);
      background: var(--bc-active-color-lighter);
    }

    .panel-btn--primary {
      border-color: var(--bc-active-color);
      background: var(--bc-active-color);
      color: #fff;
    }

    .panel-btn--primary:hover {
      background: var(--bc-active-color);
      opacity: 0.92;
    }

    .viewer-demo-panel__stage {
      flex: 1;
      min-height: 0;
      padding: 18px;
      border-radius: 16px;
      border: 1px dashed var(--bc-border-color);
      background:
        linear-gradient(180deg, var(--bc-bg-primary) 0%, var(--bc-bg-muted) 100%);
      overflow-x: hidden;
      overflow-y: auto;
    }

    .viewer-demo-panel__stage bc-snapshot-viewer {
      display: block;
      min-height: 100%;
      min-width: 0;
      max-width: 100%;
    }

    .markdown-stream-demo {
      display: grid;
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      gap: 18px;
      min-height: 100%;
    }

    .markdown-stream-demo__controls {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .markdown-stream-demo__label {
      display: none;
    }

    .markdown-stream-demo__input {
      width: 100%;
      min-height: 420px;
      padding: 16px;
      border-radius: 14px;
      border: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-elevated);
      color: var(--bc-color);
      font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      resize: vertical;
      box-sizing: border-box;
    }

    .markdown-stream-demo__viewer {
      min-width: 0;
      min-height: 420px;
      padding: 18px;
      border-radius: 14px;
      border: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-elevated);
      overflow: auto;
    }

    .chunk-preview {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
      padding: 14px;
      border-radius: 14px;
      border: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-elevated);
    }

    .chunk-preview__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .chunk-preview__header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .chunk-mode-tabs {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      background: var(--bc-bg-secondary);
      border: 1px solid var(--bc-border-color-light);
    }

    .chunk-mode-tab {
      min-height: 28px;
      padding: 0 10px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--bc-color-light);
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all .2s ease;
    }

    .chunk-mode-tab:hover {
      color: var(--bc-color);
      background: var(--bc-bg-hover);
    }

    .chunk-mode-tab--active {
      color: #fff;
      background: var(--bc-active-color);
    }

    .chunk-preview__list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 320px;
      overflow: auto;
    }

    .chunk-preview__item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-secondary);
    }

    .chunk-preview__item--done {
      border-color: var(--bc-active-color-light);
      background: rgba(72, 87, 226, 0.08);
    }

    .chunk-preview__item--active {
      border-color: var(--bc-active-color);
      box-shadow: 0 0 0 1px rgba(72, 87, 226, 0.12);
    }

    .chunk-preview__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 11px;
      color: var(--bc-color-light);
    }

    .chunk-preview__meta strong {
      font-size: 12px;
      color: var(--bc-color);
    }

    .chunk-preview__text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: var(--bc-color);
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

      .viewer-demo-panel__header {
        flex-direction: column;
      }

      .viewer-demo-panel__actions {
        justify-content: flex-start;
      }

      .editor-header {
        flex-direction: column;
      }

      .editor-header__actions {
        justify-content: flex-start;
      }

      .markdown-stream-demo {
        grid-template-columns: 1fr;
      }

      .chunk-preview__header {
        flex-direction: column;
        align-items: flex-start;
      }

      .chunk-preview__header-actions {
        justify-content: flex-start;
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
  @ViewChild('documentHeader', {read: ElementRef}) documentHeader?: ElementRef<HTMLElement>;
  @ViewChild('markdownStreamHost') markdownStreamHost?: ElementRef<HTMLElement>;

  readonly actionSections = ACTION_SECTIONS;

  private readonly iconRegistry = inject(MatIconRegistry);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private _markdownStreamRenderer?: MarkdownStreamRenderer;
  private _markdownTestTimer: number | null = null;
  private _autoInitTimer: number | null = null;
  private _demoController: PresentationController | null = null;
  private _collabInitHandler?: () => void;
  private _collabSyncHandler?: (isSynced: boolean) => void;
  private _collabAmbiguousRootLogged = false;
  private _awareness?: BlockCraftAwareness;
  private _selectionSub?: Subscription;
  private _agentContextSub?: Subscription;
  private _agentPlugin?: DocumentAgentPlugin;
  private _editorAgent?: BlockCraftEditorAgent;
  private _agentOverlayRef?: OverlayRef;
  private _agentDialogComponent?: ComponentRef<DocumentAgentPanelComponent>;
  private _agentDialogClose$?: Subject<void>;
  private _agentFakeRange?: {destroy: () => void};
  private readonly agentRunner = new DocumentAgentRunner(new PlaygroundDocumentAgentTransport());

  readonly updateList: Uint8Array[] = [];
  editorInitialized = false;
  isListeningUpdate = false;
  virtualizationEnabled = true;
  documentScaleViewport: HTMLElement | null = null;
  documentScaleStage: HTMLElement | null = null;
  documentScaleSurface: HTMLElement | null = null;
  readonly paginationDocumentHeaderOptions = {
    element: () => this.documentHeader?.nativeElement ?? null,
    placement: 'content' as const,
    gap: 24,
  };

  // 临时调试：复制时过滤行内链接属性（a:link），可开关
  copyFilterActive = false;
  private _disposeCopyFilter: (() => void) | null = null;
  provider?: WebsocketProvider;
  selectionJson: string | null = null;
  selectionMeta: DebugMetaItem[] = [];
  agentContext: DocumentAgentContext | null = null;
  agentResult: DocumentAgentResult | null = null;
  private agentResultContext: DocumentAgentContext | null = null;
  private agentApplyContext: DocumentAgentContext | null = null;
  agentError: string | null = null;
  agentBusy = false;
  agentDialogOpen = false;
  activeMainTab: 'editor' | 'viewer' = 'editor';
  activeViewerMode: 'snapshot' | 'markdown-stream' = 'snapshot';
  snapshotViewerSnapshot: IBlockSnapshot = this.createDemoSnapshot();
  snapshotViewerSource: 'demo' | 'current' = 'demo';
  readonly snapshotViewerOptions = {
    resourcePolicy: 'eager' as const
  };
  markdownStreamSource = `# Old title

Streaming paragraph intro.

\`\`\`ts
const answer = 42;
\`\`\`

\`\`\`mermaid
graph TD
  A-->B
\`\`\`

| Name | Status |
| --- | --- |
| stream | ready |
`;
  markdownStreamChunkMode: 'paragraph' | 'random' = 'paragraph';
  markdownStreamChunks = this.buildMarkdownStreamChunks(this.markdownStreamSource);
  markdownStreamIndex = 0;
  private _markdownStreamPlayTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _markdownStreamPlayIntervalMs = 700;
  private _markdownStreamViewer: MarkdownStreamViewer | null = null;

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
  simulationMode: CollaborationSimulationMode = 'random-text';
  imeAutoEnabled = true;
  imeScenarioDelayMs = 500;
  imeRunnerState: ImeCollaborationRunnerState = createInitialImeRunnerState();
  private _simTimer: ReturnType<typeof setInterval> | null = null;
  private _shadowSession: ShadowCollaborationSession | null = null;
  private _imeScenarioRunner: ImeCollaborationScenarioRunner | null = null;

  constructor() {
    this.iconRegistry.addSvgIconSet(
      this.sanitizer.bypassSecurityTrustResourceUrl('https://at.alicdn.com/t/c/font_4682833_9f8nqslb5uf.js')
    );
  }

  ngAfterViewInit(): void {
    // 外置工具栏依赖子编辑器在 ngOnInit 中创建的 Doc；ViewChild 就绪后补一轮
    // 检测，让工具栏从首屏开始位于 .editor-stage 外，而不是等首次用户操作。
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    if (this._autoInitTimer !== null) {
      window.clearTimeout(this._autoInitTimer);
      this._autoInitTimer = null;
    }
    this.stopMarkdownStreamTest();
    this._markdownStreamRenderer?.destroy();
    this._demoController?.destroy();
    this.quitRoom();
    this._selectionSub?.unsubscribe();
    this._agentContextSub?.unsubscribe();
    this.closeAgentDialog();
    this._agentPlugin?.destroy();
    this._agentPlugin = undefined;
    this._editorAgent = undefined;
    this.stopMonitor();
    this.stopSimulation();
    this.stopMarkdownStreamPlayback();
    this._markdownStreamViewer?.destroy();
    this._markdownStreamViewer = null;
    this._disposeCopyFilter?.();
    this._disposeCopyFilter = null;
  }

  get isReadonly() {
    return this.editor?.doc.isReadonly ?? true;
  }

  get editorDoc() {
    return this.editor?.doc ?? null;
  }

  get paginationPlugin(): PaginationPlugin | null {
    return this.editor?.doc.plugins.find(
      plugin => plugin instanceof PaginationPlugin,
    ) ?? null;
  }

  get paginationEnabled(): boolean {
    return this.paginationPlugin?.enabled ?? false;
  }

  setPaginationEnabled(enabled: boolean): void {
    const editor = this.ensureEditorInitialized();
    const plugin = editor.doc.plugins.find(
      candidate => candidate instanceof PaginationPlugin,
    );
    if (!plugin) {
      throw new Error('PaginationPlugin is not registered.');
    }
    enabled ? plugin.enable() : plugin.disable();
    this.cdr.markForCheck();
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

  get snapshotViewerSourceLabel() {
    return this.snapshotViewerSource === 'current' ? '当前文档快照' : '内置 Demo 快照';
  }

  get markdownStreamStatusLabel() {
    return `${this.markdownStreamIndex}/${this.markdownStreamChunks.length} chunks${this._markdownStreamPlayTimer ? ' · 自动播放中' : ''}`;
  }

  getMarkdownChunkState(index: number) {
    if (index < this.markdownStreamIndex) {
      return '已推送';
    }
    if (index === this.markdownStreamIndex && this._markdownStreamPlayTimer) {
      return '下一段';
    }
    return '待发送';
  }

  setMarkdownChunkMode(mode: 'paragraph' | 'random') {
    this.markdownStreamChunkMode = mode;
    this.markdownStreamChunks = this.buildMarkdownStreamChunks(this.markdownStreamSource);
    this.markdownStreamIndex = 0;
    this.stopMarkdownStreamPlayback();
    this.cdr.markForCheck();
  }

  setMainTab(tab: 'editor' | 'viewer') {
    this.activeMainTab = tab;
    this.cdr.markForCheck();
    if (tab === 'viewer' && this.activeViewerMode === 'markdown-stream') {
      queueMicrotask(() => this.ensureMarkdownStreamViewer());
    }
  }

  setViewerMode(mode: 'snapshot' | 'markdown-stream') {
    this.activeViewerMode = mode;
    this.cdr.markForCheck();
    if (mode === 'markdown-stream') {
      queueMicrotask(() => this.ensureMarkdownStreamViewer());
    }
  }

  private getFocusedEditableBlock(): EditableBlockComponent | null {
    const editor = this.editor;
    if (!editor?.doc.isInitialized) return null;
    const sel = editor.doc.selection.value;
    if (!sel) return null;
    const block = sel.firstBlock;
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

  private _describeSelectionSpan(selection: ISelectionJSON) {
    const from = this._formatSelectionPoint(selection.anchor);
    const to = this._formatSelectionPoint(selection.head);
    return from === to ? from : `${from} → ${to}`;
  }

  private _formatSelectionPoint(point: ISelectionJSON['anchor']) {
    if (point.type === 'selected') {
      return `${point.blockId} · block`;
    }

    return `${point.blockId} · offset:${point.offset ?? 0}`;
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
      case 'toggleVirtualization':
        this.toggleVirtualization();
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
      case 'toggleCopyFilter':
        this.toggleCopyFilter();
        return;
      case 'importHtml':
        void this.importHTML();
        return;
      case 'importMarkdown':
        void this.importMarkdown();
        return;
      case 'importBlockSnapshotTxt':
        void this.importBlockSnapshotTxt();
        return;
      case 'exportMarkdown':
        this.exportMarkdown();
        return;
      case 'exportPdf':
        void this.exportPdf().catch(error => {
          const message = error instanceof Error ? error.message : '未知错误';
          this.ensureEditorInitialized().doc.messageService.error(`PDF 导出失败：${message}`);
          console.warn('[playground] PDF export failed', error);
        });
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

  /**
   * Playground 的文档缩放面：外层 editorContainer 保持固定并负责滚动，分页
   * 背景与 root 一起挂在内层 surface，避免缩放时把滚动视口本身也缩小。
   */
  private get editorDocumentSurface(): HTMLElement {
    const editor = this.requireEditor();
    const viewport = this.editorContainer;
    let stage = viewport.querySelector<HTMLElement>(':scope > .playground-scale-stage');
    let surface = stage?.querySelector<HTMLElement>(':scope > .playground-scale-surface') ?? null;

    if (!stage) {
      stage = viewport.ownerDocument.createElement('div');
      stage.className = 'playground-scale-stage';
      stage.style.position = 'relative';
      stage.style.boxSizing = 'border-box';
      viewport.appendChild(stage);
    }
    if (!surface) {
      surface = viewport.ownerDocument.createElement('div');
      surface.className = 'playground-scale-surface';
      surface.style.position = 'relative';
      surface.style.boxSizing = 'border-box';
      stage.appendChild(surface);
    }

    // 虚拟渲染监听固定视口；分页纸张定位面则跟 root 一起留在 surface。
    viewport.style.overflowX = 'auto';
    editor.doc.config.scrollContainer = viewport;
    this.documentScaleViewport = viewport;
    this.documentScaleStage = stage;
    this.documentScaleSurface = surface;
    return surface;
  }

  private createDemoSnapshot(): IBlockSnapshot {
    return JSON.parse(JSON.stringify(demoJSON)) as IBlockSnapshot;
  }

  private ensureEditorInitialized(snapshot: IBlockSnapshot = this.createDemoSnapshot()) {
    const editor = this.requireEditor();
    this.ensureAgentPlugin(editor);
    if (!editor.doc.isInitialized) {
      editor.doc.initBySnapshot(snapshot, this.editorDocumentSurface);
    }
    this.ensureSelectionDebugSubscription(editor);
    this.agentContext = this._agentPlugin?.getContext() ?? this.agentContext;
    return editor;
  }

  private ensureEmptyEditorReady() {
    const editor = this.requireEditor();
    this.ensureAgentPlugin(editor);
    if (!editor.doc.isInitialized) {
      const rootSnapshot = editor.doc.schemas.createSnapshot('root', [
        editor.rootId,
        [editor.doc.schemas.createSnapshot('paragraph', [])]
      ]);
      editor.doc.initBySnapshot(rootSnapshot, this.editorDocumentSurface);
    }
    this.ensureSelectionDebugSubscription(editor);
    this.agentContext = this._agentPlugin?.getContext() ?? this.agentContext;
    return editor;
  }

  private ensureSelectionDebugSubscription(editor: EditorComponent): void {
    if (!editor.doc.isInitialized || this._selectionSub) return;
    this._subscribeSelection();
  }

  private ensureAgentPlugin(editor: EditorComponent): void {
    if (this._agentPlugin) return;

    const plugin = new DocumentAgentPlugin();
    plugin.register(editor.doc);
    this._agentPlugin = plugin;
    this._editorAgent = new BlockCraftEditorAgent(editor.doc, this.agentRunner);
    this._agentContextSub = plugin.contextChange$.subscribe(context => {
      this.zone.run(() => {
        this.agentContext = context;
        if (context) this.agentError = null;
        this.syncAgentDialogState();
        this.cdr.markForCheck();
      });
    });
    this.agentContext = plugin.getContext();
  }

  openAgentDialog(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this._agentOverlayRef || this._agentDialogComponent) return;

    const editor = this.editor;
    if (!editor) return;
    if (!editor.doc.isInitialized) this.ensureEditorInitialized();
    this.ensureAgentPlugin(editor);
    const liveContext = this._editorAgent?.getContext() ?? this.agentContext;
    const context = this.agentResultContext ?? liveContext;
    if (!context) {
      this.agentError = '文档上下文还没有准备好，请稍后再试。';
      this.cdr.markForCheck();
      return;
    }

    if (context) this.renderAgentFakeRange(editor, context);
    this._agentDialogClose$ = new Subject<void>();
    const {componentRef, overlayRef} = editor.doc.overlayService.createGlobalOverlay<DocumentAgentPanelComponent>({
      component: DocumentAgentPanelComponent,
      backdrop: false,
      top: '72px',
      end: '24px',
    }, this._agentDialogClose$, () => {
      this._agentDialogClose$?.complete();
      this._agentDialogClose$ = undefined;
      this.destroyAgentFakeRange();
      this._agentOverlayRef = undefined;
      this._agentDialogComponent = undefined;
      this.agentDialogOpen = false;
      this.cdr.markForCheck();
    });

    this._agentOverlayRef = overlayRef;
    this._agentDialogComponent = componentRef;
    this.agentDialogOpen = true;
    componentRef.setInput('context', context);
    componentRef.setInput('liveContext', liveContext);
    componentRef.setInput('task', 'rewrite');
    this.syncAgentDialogState();

    componentRef.instance.request.subscribe(request => void this.runAgentRequest(request));
    componentRef.instance.apply.subscribe(() => this.applyAgentResult());
    componentRef.instance.discard.subscribe(() => this.discardAgentResult());
    componentRef.instance.close.subscribe(() => this.closeAgentDialog());
  }

  closeAgentDialog(): void {
    const overlayRef = this._agentOverlayRef;
    const close$ = this._agentDialogClose$;
    this._agentDialogClose$ = undefined;
    this._agentOverlayRef = undefined;
    this._agentDialogComponent = undefined;
    if (close$) {
      close$.next();
      close$.complete();
    }
    overlayRef?.dispose();
    this.destroyAgentFakeRange();
    this.agentDialogOpen = false;
    this.cdr.markForCheck();
  }

  private renderAgentFakeRange(editor: EditorComponent, context: DocumentAgentContext): void {
    this.destroyAgentFakeRange();
    if (!context.selection) return;
    try {
      this._agentFakeRange = editor.doc.selection.createFakeRange(context.selection, {
        bgColor: 'var(--bc-select-background-color)',
      });
    } catch (error) {
      editor.doc.logger.warn(`Agent 伪选区创建失败: ${error}`);
    }
  }

  private destroyAgentFakeRange(): void {
    this._agentFakeRange?.destroy();
    this._agentFakeRange = undefined;
  }

  private syncAgentDialogState(): void {
    const componentRef = this._agentDialogComponent;
    if (!componentRef) return;

    componentRef.setInput('liveContext', this.agentContext);
    componentRef.setInput('busy', this.agentBusy);
    componentRef.setInput('error', this.agentError);
    componentRef.setInput('result', this.agentResult);
  }

  async runAgentRequest(request: DocumentAgentRequest): Promise<void> {
    const context = this._editorAgent?.getContext(request.context.scope) ?? request.context;
    const editorAgent = this._editorAgent;
    if (!context || !editorAgent || this.agentBusy) return;

    this.agentBusy = true;
    this.agentError = null;
    this.agentResult = null;
    this.agentResultContext = null;
    this.agentApplyContext = this.editor
      ? captureBlockCraftAgentDocumentContext(this.editor.doc)
      : null;
    this.syncAgentDialogState();
    this.cdr.markForCheck();

    try {
      this.agentResult = await editorAgent.run({
        ...request,
        context,
      });
      this.agentResultContext = context;
      this._agentDialogComponent?.instance.addAssistantResult(this.agentResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent 请求失败';
      this.agentError = message;
      this._agentDialogComponent?.instance.addAssistantError(message);
    } finally {
      this.agentBusy = false;
      this.syncAgentDialogState();
      this.cdr.markForCheck();
    }
  }

  applyAgentResult(): void {
    const editor = this.editor;
    const context = this.agentResultContext;
    const applyContext = this.agentApplyContext ?? context;
    const result = this.agentResult;
    if (!editor || !context || !applyContext || !result) return;
    if (!result.operations.length) {
      this.agentError = '这次建议没有可应用的修改。请让 Agent 返回具体的文案或排版调整。';
      this._agentDialogComponent?.instance.addAssistantError(this.agentError);
      this.syncAgentDialogState();
      this.cdr.markForCheck();
      return;
    }

    const execution = this._editorAgent?.executeTool({
      name: 'blockcraft.apply_changes',
      arguments: result,
    }, {allowWrite: true}, applyContext) ?? new DocumentAgentToolExecutor(editor.doc, applyContext).execute({
      name: 'blockcraft.apply_changes',
      arguments: result,
    }, {allowWrite: true});
    if (execution.ok) {
      const appliedCount = typeof execution.data === 'object' && execution.data !== null &&
        'applied' in execution.data && typeof execution.data.applied === 'number'
        ? execution.data.applied
        : result.operations.length;
      this.agentResult = null;
      this.agentResultContext = null;
      this.agentApplyContext = null;
      this.agentError = null;
      this._agentDialogComponent?.instance.addAssistantNotice(`已应用 ${appliedCount} 项修改。`);
      this.syncAgentDialogState();
    } else {
      this.agentError = execution.error || 'Agent 修改应用失败';
      this._agentDialogComponent?.instance.addAssistantError(this.agentError);
      this.syncAgentDialogState();
    }
    this.cdr.markForCheck();
  }

  discardAgentResult(): void {
    this.agentResult = null;
    this.agentResultContext = null;
    this.agentApplyContext = null;
    this.agentError = null;
    this.syncAgentDialogState();
    this.cdr.markForCheck();
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
    const selected = editor.doc.selection.value?.firstBlock;
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
    const tableElement = editor.doc.selection.value?.firstBlock.hostElement.closest('.table-block');
    const id = tableElement?.getAttribute('data-block-id');
    return id ? editor.doc.getBlockById(id) : null;
  }

  initializeEditor() {
    const editor = this.ensureEditorInitialized();
    this.editorInitialized = editor.doc.isInitialized;
    this.syncPageTheme();
    this._subscribeSelection();
    this.cdr.markForCheck();
  }

  toggleVirtualization() {
    const editor = this.editor;
    if (this.provider || editor?.doc.isInitialized) {
      editor?.doc.messageService.warn('虚拟渲染模式只能在文档初始化前切换');
      return;
    }
    this.virtualizationEnabled = !this.virtualizationEnabled;
    this.cdr.detectChanges();
  }

  loadSnapshotViewerDemo() {
    this.snapshotViewerSnapshot = this.createDemoSnapshot();
    this.snapshotViewerSource = 'demo';
    this.activeMainTab = 'viewer';
    this.activeViewerMode = 'snapshot';
    this.cdr.markForCheck();
  }

  syncSnapshotViewerFromEditor() {
    const editor = this.ensureEditorInitialized();
    const snapshot = editor.doc.exportSnapshot();
    if (!snapshot) {
      return;
    }

    this.snapshotViewerSnapshot = JSON.parse(JSON.stringify(snapshot)) as IBlockSnapshot;
    this.snapshotViewerSource = 'current';
    this.activeMainTab = 'viewer';
    this.activeViewerMode = 'snapshot';
    this.cdr.markForCheck();
  }

  startMarkdownStreamDemo() {
    this.activeMainTab = 'viewer';
    this.activeViewerMode = 'markdown-stream';
    this.markdownStreamChunks = this.buildMarkdownStreamChunks(this.markdownStreamSource);
    this.markdownStreamIndex = 0;
    this.cdr.detectChanges();

    const viewer = this.ensureMarkdownStreamViewer(true);
    this.stopMarkdownStreamPlayback();
    viewer.replace('');
    if (this.markdownStreamChunks.length) {
      viewer.append(this.markdownStreamChunks[0]!);
      this.markdownStreamIndex = 1;
      this.scheduleMarkdownStreamPlayback();
    } else {
      viewer.finish();
    }
    this.cdr.markForCheck();
  }

  appendNextMarkdownChunk() {
    this.stopMarkdownStreamPlayback();
    const viewer = this.ensureMarkdownStreamViewer();
    if (this.markdownStreamIndex >= this.markdownStreamChunks.length) {
      return;
    }

    viewer.append(this.markdownStreamChunks[this.markdownStreamIndex]!);
    this.markdownStreamIndex += 1;
    this.cdr.markForCheck();
  }

  rewriteMarkdownStreamDemo() {
    this.stopMarkdownStreamPlayback();
    const viewer = this.ensureMarkdownStreamViewer();
    const rewritten = this.markdownStreamSource.replace('# Old title', '# New title');
    this.markdownStreamSource = rewritten;
    viewer.replace(rewritten);
    this.markdownStreamIndex = this.markdownStreamChunks.length;
    this.cdr.markForCheck();
  }

  finishMarkdownStreamDemo() {
    this.stopMarkdownStreamPlayback();
    const viewer = this.ensureMarkdownStreamViewer();
    viewer.finish();
    this.cdr.markForCheck();
  }

  onMarkdownStreamSourceInput(event: Event) {
    this.markdownStreamSource = (event.target as HTMLTextAreaElement).value;
    this.markdownStreamChunks = this.buildMarkdownStreamChunks(this.markdownStreamSource);
    this.markdownStreamIndex = 0;
    this.stopMarkdownStreamPlayback();
  }

  private buildMarkdownStreamChunks(source: string) {
    if (this.markdownStreamChunkMode === 'random') {
      return this.buildRandomMarkdownChunks(source);
    }

    const paragraphs = source.split(/(\n\n)/).filter(Boolean);
    const chunks: string[] = [];
    let buffer = '';

    for (const part of paragraphs) {
      buffer += part;
      if (part === '\n\n') {
        chunks.push(buffer);
        buffer = '';
      }
    }

    if (buffer) {
      chunks.push(buffer);
    }

    return chunks.length ? chunks : [source];
  }

  private buildRandomMarkdownChunks(source: string) {
    if (!source) {
      return [''];
    }

    const chunks: string[] = [];
    let cursor = 0;
    let seed = source.length || 1;

    while (cursor < source.length) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const step = 4 + (seed % 18);
      chunks.push(source.slice(cursor, cursor + step));
      cursor += step;
    }

    return chunks;
  }

  private ensureMarkdownStreamViewer(reset = false) {
    const host = this.markdownStreamHost?.nativeElement;
    if (!host) {
      throw new Error('Markdown stream host is not ready yet.');
    }

    if (reset && this._markdownStreamViewer) {
      this._markdownStreamViewer.destroy();
      this._markdownStreamViewer = null;
      host.replaceChildren();
    }

    if (!this._markdownStreamViewer) {
      this._markdownStreamViewer = createMarkdownStreamViewer({
        container: host,
        viewerOptions: this.snapshotViewerOptions,
      });
    }

    return this._markdownStreamViewer;
  }

  private scheduleMarkdownStreamPlayback() {
    this.stopMarkdownStreamPlayback();
    if (this.markdownStreamIndex >= this.markdownStreamChunks.length) {
      this.finishMarkdownStreamDemo();
      return;
    }

    this._markdownStreamPlayTimer = setTimeout(() => {
      this._markdownStreamPlayTimer = null;
      const viewer = this.ensureMarkdownStreamViewer();
      if (this.markdownStreamIndex >= this.markdownStreamChunks.length) {
        viewer.finish();
        this.cdr.markForCheck();
        return;
      }

      viewer.append(this.markdownStreamChunks[this.markdownStreamIndex]!);
      this.markdownStreamIndex += 1;
      this.cdr.markForCheck();
      this.scheduleMarkdownStreamPlayback();
    }, this._markdownStreamPlayIntervalMs);
  }

  private stopMarkdownStreamPlayback() {
    if (this._markdownStreamPlayTimer !== null) {
      clearTimeout(this._markdownStreamPlayTimer);
      this._markdownStreamPlayTimer = null;
    }
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

  toggleCopyFilter() {
    const editor = this.requireEditor();
    if (this.copyFilterActive) {
      this._disposeCopyFilter?.();
      this._disposeCopyFilter = null;
      this.copyFilterActive = false;
    } else {
      // 复制时清除行内链接属性 a:link（其余内容保留）
      this._disposeCopyFilter = editor.doc.clipboard.registerCopyFilter({
        stripAttributes: ['a:link'],
      });
      this.copyFilterActive = true;
    }
    this.cdr.markForCheck();
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
    editor.doc.crud.insertBlockSnapshots(editor.doc.rootId, 0, snapshots);
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

  async exportPdf() {
    const editor = this.ensureEditorInitialized();
    const result = await new DocExportManager(editor.doc).exportToPdf('blockcraft-export-test.pdf', {
      // 不传 pagination：分页启用时复用当前稳定布局；连续布局时复用插件当前配置重新排版。
    });
    if (result.warnings.length) {
      editor.doc.messageService.warn(
        `PDF 打印面包含 ${result.warnings.length} 项降级资源`,
      );
    }
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

    editor.doc.crud.insertBlockSnapshots(editor.doc.rootId, 0, snapshot.children as IBlockSnapshot[]);
  }

  async importBlockSnapshotTxt() {
    const editor = this.ensureEditorInitialized();
    const files = await editor.doc.injector.get(DOC_FILE_SERVICE_TOKEN).inputFiles('.txt', false);
    if (!files?.length) {
      return;
    }

    try {
      const text = await files[0]!.text();
      const rootSnapshot = this.parseBlockSnapshotText(text);
      const children = this.prepareImportedSnapshotChildren(rootSnapshot, editor.doc);

      if (!children.length) {
        editor.doc.messageService.warn('TXT 中没有可导入的 blocks');
        return;
      }

      editor.doc.crud.insertBlockSnapshots(editor.doc.rootId, editor.doc.root.childrenLength, children);
      editor.doc.messageService.success(`已导入 ${children.length} 个 blocks`);
      this.editorInitialized = true;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Import block snapshot txt failed:', error);
      editor.doc.messageService.error(
        error instanceof Error ? `导入失败：${error.message}` : '导入失败：无法解析 TXT Snapshot'
      );
    }
  }

  private parseBlockSnapshotText(text: string): IBlockSnapshot {
    const jsonText = extractFirstJsonObject(text);
    const value = JSON.parse(jsonText) as unknown;
    if (!isBlockSnapshotLike(value) || value.flavour !== 'root' || value.nodeType !== 'root') {
      throw new Error('文件内容不是 root BlockSnapshot');
    }

    return value;
  }

  private prepareImportedSnapshotChildren(rootSnapshot: IBlockSnapshot, doc: BlockCraft.Doc): IBlockSnapshot[] {
    const unsupported = this.collectUnsupportedSnapshotFlavours(rootSnapshot, doc);
    if (unsupported.length) {
      throw new Error(`存在未注册 block：${unsupported.join(', ')}`);
    }

    const children = JSON.parse(JSON.stringify(rootSnapshot.children || [])) as IBlockSnapshot[];
    replaceSnapshotsIdDeeply(children);
    return children;
  }

  private collectUnsupportedSnapshotFlavours(rootSnapshot: IBlockSnapshot, doc: BlockCraft.Doc): string[] {
    const unsupported = new Set<string>();
    const visit = (snapshot: IBlockSnapshot) => {
      if (!doc.schemas.has(snapshot.flavour)) {
        unsupported.add(snapshot.flavour);
      }
      if (snapshot.nodeType === 'root' || snapshot.nodeType === 'block') {
        snapshot.children.forEach(visit);
      }
    };

    visit(rootSnapshot);
    return [...unsupported];
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
    if (this.provider) this.quitRoom();

    const editor = this.requireEditor();
    this._collabAmbiguousRootLogged = false;

    const provider = this.provider = new WebsocketProvider(
      // 'ws://ws-doc-v2.cses7.com/collaboration',
      "ws://196.168.1.153:1234",
      // 'ws://196.168.1.153:1234',
      // 'ws://ws-doc.cses7.com',
      // "ws://ws-doc-pre.cses7.com/collaboration",
      // 'ws://193.168.2.100:30204/collaborate',
      editor.docId,
      editor.doc.yDoc,
      {
        disableBc: false,
      },
    );

    const initializeFromCollaboration = () => {
      if (this.provider !== provider) return;
      if (editor.doc.isInitialized) {
        this._completeCollaborationInitialization();
        return;
      }

      const resolution = resolveCollaborationRoot(editor.doc.yBlockMap, editor.docId);
      if (resolution.status === 'missing') return;
      if (resolution.status === 'ambiguous') {
        if (!this._collabAmbiguousRootLogged) {
          this._collabAmbiguousRootLogged = true;
          console.error(
            'Collaboration room contains multiple root blocks; initialization aborted:',
            resolution.rootIds,
          );
        }
        return;
      }

      editor.doc.initByYBlock(resolution.root, this.editorDocumentSurface);
      this.editorInitialized = editor.doc.isInitialized;
      this.syncPageTheme();
      this._subscribeSelection();
      this.cdr.markForCheck();
      this._completeCollaborationInitialization();
    };

    let initializationScheduled = false;
    const scheduleInitialization = () => {
      if (initializationScheduled) return;
      initializationScheduled = true;
      queueMicrotask(() => {
        initializationScheduled = false;
        initializeFromCollaboration();
      });
    };

    this._collabInitHandler = scheduleInitialization;
    editor.doc.yDoc.on('update', scheduleInitialization);

    this._collabSyncHandler = isSynced => {
      if (isSynced) scheduleInitialization();
    };
    provider.on('sync', this._collabSyncHandler);

    // Handles data that was already present before provider listeners were attached.
    scheduleInitialization();

    const uid = generateId(11)
    const awa = this._awareness = new BlockCraftAwareness(editor.doc, provider.awareness)
    awa.setLocalUser({
      id: uid,
      name: uid,
    })
  }

  quitRoom() {
    this._clearCollaborationInitializationListeners();
    this._awareness?.destroy();
    this._awareness = undefined;
    this.provider?.destroy();
    this.provider = undefined;
  }

  private _completeCollaborationInitialization() {
    this._clearCollaborationInitializationListeners();
  }

  private _clearCollaborationInitializationListeners() {
    const editor = this.editor;
    if (editor && this._collabInitHandler) {
      editor.doc.yDoc.off('update', this._collabInitHandler);
    }
    if (this.provider && this._collabSyncHandler) {
      this.provider.off('sync', this._collabSyncHandler);
    }
    this._collabInitHandler = undefined;
    this._collabSyncHandler = undefined;
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
    if (this.isSimulationRunning && this.simulationMode === 'random-text') {
      this.restartSimTimer();
    }
  }

  setSimulationMode(mode: CollaborationSimulationMode) {
    if (mode === this.simulationMode) return;
    const shouldRestart = this.isSimulationRunning;
    if (shouldRestart) this.stopSimulation();
    this.simulationMode = mode;
    if (shouldRestart) this.startSimulation();
  }

  onImeAutoChange(event: Event) {
    this.imeAutoEnabled = (event.target as HTMLInputElement).checked;
    this._imeScenarioRunner?.setAutoEnabled(this.imeAutoEnabled);
  }

  onImeDelayChange(event: Event) {
    this.imeScenarioDelayMs = +(event.target as HTMLInputElement).value;
    this._imeScenarioRunner?.setDelayMs(this.imeScenarioDelayMs);
  }

  get canRunImeScenario() {
    return this.isSimulationRunning &&
      this.simulationMode === 'ime-race' &&
      this.imeRunnerState.hasActiveComposition;
  }

  imeScenarioLabel(scenario: ImeCollaborationScenario | null) {
    return scenario ? IME_SCENARIO_LABELS[scenario] : '等待 IME';
  }

  runImeScenario(event: PointerEvent, scenario: ImeCollaborationScenario) {
    // Keep the native composition target focused while the sidebar command runs.
    event.preventDefault();
    this._imeScenarioRunner?.runNow(scenario);
  }

  startSimulation() {
    if (this.isSimulationRunning) return;
    const editor = this.ensureEditorInitialized();
    const session = new ShadowCollaborationSession(
      editor.doc.yDoc,
      (direction, error) => console.warn(`[playground] ${direction} bridge failed`, error),
    );

    this._shadowSession = session;
    this.isSimulationRunning = true;
    this.simOpCount = 0;
    try {
      if (this.simulationMode === 'random-text') {
        this.restartSimTimer();
      } else {
        this.imeRunnerState = createInitialImeRunnerState();
        this._imeScenarioRunner = new ImeCollaborationScenarioRunner({
          doc: editor.doc,
          host: editor.doc.root.hostElement,
          session,
          autoEnabled: this.imeAutoEnabled,
          delayMs: this.imeScenarioDelayMs,
          onStateChange: state => {
            this.imeRunnerState = state;
            this.simOpCount = state.appliedCount;
            this.cdr.markForCheck();
          },
          onError: error => console.warn('[playground] IME scenario failed', error),
        });
        this._imeScenarioRunner.start();
      }
    } catch (error) {
      this.stopSimulation();
      throw error;
    }
    this.cdr.markForCheck();
  }

  stopSimulation() {
    this.isSimulationRunning = false;
    if (this._simTimer) {
      clearInterval(this._simTimer);
      this._simTimer = null;
    }
    this._imeScenarioRunner?.stop();
    this._imeScenarioRunner = null;
    this._shadowSession?.destroy();
    this._shadowSession = null;
    this.cdr.markForCheck();
  }

  private restartSimTimer() {
    if (this._simTimer) clearInterval(this._simTimer);
    if (!this.isSimulationRunning || this.simulationMode !== 'random-text') {
      this._simTimer = null;
      return;
    }
    this._simTimer = setInterval(() => {
      for (let i = 0; i < this.simUserCount; i++) {
        this.performRandomOp();
      }
    }, this.simIntervalMs);
  }

  private performRandomOp() {
    const editor = this.editor;
    const session = this._shadowSession;
    if (!session || !editor?.doc.isInitialized) return;
    const shadowDoc = session.shadowDoc;

    const activeEditableIds = new Set<string>();
    const pendingBlockIds = [editor.doc.rootId];
    while (pendingBlockIds.length) {
      const blockId = pendingBlockIds.pop()!;
      if (editor.doc.model.getNodeType(blockId) === BlockNodeType.editable) {
        activeEditableIds.add(blockId);
        continue;
      }
      pendingBlockIds.push(...editor.doc.model.getChildrenIds(blockId));
    }

    const shadowBlockMap = shadowDoc.getMap<Y.Map<any>>('blocks');
    const editableEntries: { id: string; yText: Y.Text }[] = [];
    shadowBlockMap.forEach((yBlock, id) => {
      if (!activeEditableIds.has(id)) return;
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

    session.transact(() => {
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
