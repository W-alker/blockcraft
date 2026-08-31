import {
  ChangeDetectionStrategy,
  Component,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import type {BlockCraftDoc} from '@ccc/blockcraft';
import {
  IdlePrefetchVirtualDocumentComponent,
  type VirtualDocumentRootSnapshot,
  type VirtualDocumentSnapshot,
} from './idle-prefetch-virtual-document.component';

type TraceFilter =
  | 'all'
  | 'create'
  | 'calculate'
  | 'measure'
  | 'release'
  | 'handoff'
  | 'error';
type TraceCategory = Exclude<TraceFilter, 'all'>;

interface TraceFilterOption {
  readonly id: TraceFilter;
  readonly label: string;
}

interface IdlePrefetchCounters {
  readonly candidates: number;
  readonly nearMounts: number;
  readonly sweepMounts: number;
  readonly hits: number;
  readonly cancellations: number;
  readonly failures: number;
}

interface IdlePrefetchTraceRow {
  readonly key: string;
  readonly kind: string;
  readonly kindLabel: string;
  readonly category: TraceCategory;
  readonly sequenceLabel: string | null;
  readonly timestampLabel: string | null;
  readonly laneLabel: string | null;
  readonly rootId: string | null;
  readonly rootIdLabel: string | null;
  readonly flavour: string | null;
  readonly durationLabel: string | null;
  readonly heightLabel: string | null;
  readonly projectionLabel: string | null;
  readonly reason: string | null;
  readonly epochLabel: string | null;
}

interface IdlePrefetchConsoleSnapshot {
  readonly connected: boolean;
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly counters: IdlePrefetchCounters;
  readonly events: readonly IdlePrefetchTraceRow[];
  readonly virtualDocument: VirtualDocumentSnapshot | null;
  readonly captureError: string | null;
}

interface ConsoleStatus {
  readonly label: string;
  readonly tone: 'active' | 'disabled' | 'idle' | 'error';
}

const POLL_INTERVAL_MS = 160;
const MAX_VISIBLE_EVENTS = 100;
const ONE_DECIMAL_FORMATTER = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const TWO_DECIMAL_FORMATTER = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const ZERO_COUNTERS: IdlePrefetchCounters = {
  candidates: 0,
  nearMounts: 0,
  sweepMounts: 0,
  hits: 0,
  cancellations: 0,
  failures: 0,
};

const EMPTY_SNAPSHOT: IdlePrefetchConsoleSnapshot = {
  connected: false,
  enabled: false,
  disabled: false,
  counters: ZERO_COUNTERS,
  events: [],
  virtualDocument: null,
  captureError: null,
};

const FILTERS: readonly TraceFilterOption[] = [
  {id: 'all', label: '全部'},
  {id: 'create', label: '创建'},
  {id: 'calculate', label: '计算'},
  {id: 'measure', label: '测量'},
  {id: 'release', label: '释放'},
  {id: 'handoff', label: '接管'},
  {id: 'error', label: '异常'},
];

const KIND_CATEGORIES: Readonly<Record<string, TraceCategory>> = {
  'episode-start': 'calculate',
  'slice-start': 'calculate',
  'near-window-calculated': 'calculate',
  'candidate-selected': 'calculate',
  'prefetch-mount-start': 'create',
  'component-created': 'create',
  'component-reused': 'create',
  'mount-complete': 'create',
  'measurement-accepted': 'measure',
  'measurement-stale': 'measure',
  'lease-released': 'release',
  'component-destroyed': 'release',
  'release-deferred': 'release',
  'viewport-handoff': 'handoff',
  cancelled: 'error',
  invalidated: 'error',
  failure: 'error',
  disabled: 'error',
};

const KIND_LABELS: Readonly<Record<string, string>> = {
  'episode-start': '开始轮次',
  'slice-start': '开始分片',
  'near-window-calculated': '近邻窗口',
  'candidate-selected': '选中候选',
  'prefetch-mount-start': '开始预挂载',
  'component-created': '创建组件',
  'component-reused': '复用组件',
  'mount-complete': '挂载完成',
  'measurement-accepted': '接受测量',
  'measurement-stale': '测量过期',
  'lease-released': '释放租约',
  'component-destroyed': '销毁组件',
  'release-deferred': '延后释放',
  'viewport-handoff': '视口接管',
  cancelled: '已取消',
  invalidated: '已失效',
  failure: '失败',
  disabled: '已禁用',
};

@Component({
  selector: 'playground-idle-prefetch-debug-console',
  standalone: true,
  imports: [IdlePrefetchVirtualDocumentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="prefetch-console"
      data-testid="idle-prefetch-debug-console"
      aria-label="虚拟预热流水调试台">
      <header class="prefetch-console__header">
        <div>
          <span class="prefetch-console__eyebrow">Virtual idle pipeline</span>
          <h2>虚拟预热流水</h2>
        </div>
        <span
          class="prefetch-console__status"
          [class.prefetch-console__status--active]="status().tone === 'active'"
          [class.prefetch-console__status--disabled]="status().tone === 'disabled'"
          [class.prefetch-console__status--error]="status().tone === 'error'"
          [attr.aria-label]="'虚拟预热状态：' + status().label">
          <span class="prefetch-console__status-dot" aria-hidden="true"></span>
          {{ status().label }}
        </span>
      </header>

      <div class="prefetch-console__metrics" aria-label="虚拟预热状态计数">
        <div class="prefetch-console__metric">
          <span>候选</span>
          <strong>{{ snapshot().counters.candidates }}</strong>
        </div>
        <div class="prefetch-console__metric">
          <span>近邻</span>
          <strong>{{ snapshot().counters.nearMounts }}</strong>
        </div>
        <div class="prefetch-console__metric">
          <span>扫尾</span>
          <strong>{{ snapshot().counters.sweepMounts }}</strong>
        </div>
        <div class="prefetch-console__metric">
          <span>接管</span>
          <strong>{{ snapshot().counters.hits }}</strong>
        </div>
        <div class="prefetch-console__metric">
          <span>取消</span>
          <strong>{{ snapshot().counters.cancellations }}</strong>
        </div>
        <div class="prefetch-console__metric" [class.prefetch-console__metric--alert]="snapshot().counters.failures > 0">
          <span>异常</span>
          <strong>{{ snapshot().counters.failures }}</strong>
        </div>
      </div>

      <playground-idle-prefetch-virtual-document
        [snapshot]="snapshot().virtualDocument"
        [selectedRootId]="focusedRootId()"
        (rootSelected)="selectRoot($event)" />

      <div class="prefetch-console__filters" aria-label="虚拟预热事件筛选">
        @for (option of filters; track option.id) {
          <button
            type="button"
            class="prefetch-console__filter"
            [class.prefetch-console__filter--active]="selectedFilter() === option.id"
            [attr.aria-label]="'筛选：' + option.label"
            [attr.aria-pressed]="selectedFilter() === option.id"
            (click)="selectFilter(option.id)">
            {{ option.label }}
            <span>{{ filterCount(option.id) }}</span>
          </button>
        }
      </div>

      <div class="prefetch-console__toolbar">
        <span>
          @if (focusedRootId()) {
            已聚焦 {{ shortenRootId(focusedRootId()!) }}
          } @else {
            {{ paused() ? '跟随已暂停' : '每 160ms 跟随最新事件' }}
          }
        </span>
        <div class="prefetch-console__toolbar-actions">
          @if (focusedRootId()) {
            <button
              type="button"
              class="prefetch-console__icon-button"
              aria-label="清除虚拟文档 Root 事件聚焦"
              title="清除 Root 聚焦"
              (click)="selectRoot(null)">
              <span>取消聚焦</span>
            </button>
          }
          <button
            type="button"
            class="prefetch-console__icon-button"
            [attr.aria-label]="paused() ? '继续虚拟预热流水跟随' : '暂停虚拟预热流水跟随'"
            [attr.title]="paused() ? '继续跟随' : '暂停跟随'"
            (click)="togglePaused()">
            <span>{{ paused() ? '继续' : '暂停' }}</span>
          </button>
          <button
            type="button"
            class="prefetch-console__icon-button"
            aria-label="清空虚拟预热流水视图"
            title="清空视图"
            (click)="clearView()">
            <i class="bc_icon bc_shanchu" aria-hidden="true"></i>
            <span>清空</span>
          </button>
        </div>
      </div>

      <div class="prefetch-console__timeline" aria-label="虚拟预热事件时间线">
        @if (snapshot().captureError) {
          <div class="prefetch-console__empty prefetch-console__empty--error" aria-label="虚拟预热流水读取异常">
            <strong>诊断快照读取失败</strong>
            <span>{{ snapshot().captureError }}</span>
          </div>
        } @else if (filteredEvents().length === 0) {
          <div class="prefetch-console__empty" aria-label="虚拟预热流水空态">
            <span class="prefetch-console__empty-dot" aria-hidden="true"></span>
            <strong>{{ emptyStateTitle() }}</strong>
            <span>{{ emptyStateDetail() }}</span>
          </div>
        } @else {
          @for (event of filteredEvents(); track event.key) {
            <article
              class="prefetch-console__event"
              [class.prefetch-console__event--error]="event.category === 'error'"
              data-testid="idle-prefetch-trace-event"
              [attr.data-kind]="event.kind"
              [attr.data-root-id]="event.rootId">
              <div class="prefetch-console__event-rail" aria-hidden="true">
                <span></span>
              </div>
              <div class="prefetch-console__event-body">
                <div class="prefetch-console__event-heading">
                  <div>
                    <strong>{{ event.kindLabel }}</strong>
                    <code>{{ event.kind }}</code>
                  </div>
                  <span>{{ event.sequenceLabel ?? event.timestampLabel ?? '—' }}</span>
                </div>
                @if (event.rootIdLabel || event.flavour || event.laneLabel) {
                  <div class="prefetch-console__chips">
                    @if (event.rootIdLabel) {
                      <code title="Root ID">{{ event.rootIdLabel }}</code>
                    }
                    @if (event.flavour) {
                      <span>{{ event.flavour }}</span>
                    }
                    @if (event.laneLabel) {
                      <span class="prefetch-console__lane">{{ event.laneLabel }}</span>
                    }
                  </div>
                }
                @if (event.durationLabel || event.heightLabel || event.projectionLabel || event.epochLabel) {
                  <dl class="prefetch-console__details">
                    @if (event.durationLabel) {
                      <div><dt>耗时</dt><dd>{{ event.durationLabel }}</dd></div>
                    }
                    @if (event.heightLabel) {
                      <div><dt>估算 → 实测</dt><dd>{{ event.heightLabel }}</dd></div>
                    }
                    @if (event.projectionLabel) {
                      <div><dt>投影 / 视口</dt><dd>{{ event.projectionLabel }}</dd></div>
                    }
                    @if (event.epochLabel) {
                      <div><dt>Epoch</dt><dd>{{ event.epochLabel }}</dd></div>
                    }
                  </dl>
                }
                @if (event.reason) {
                  <p class="prefetch-console__reason" [title]="event.reason">{{ event.reason }}</p>
                }
                @if (event.timestampLabel && event.sequenceLabel) {
                  <span class="prefetch-console__time">{{ event.timestampLabel }}</span>
                }
              </div>
            </article>
          }
        }
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
      scroll-margin-top: 76px;
    }

    .prefetch-console {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      overflow: hidden;
      color: var(--bc-color, #172033);
      background:
        radial-gradient(circle at 100% 0, color-mix(in srgb, var(--bc-active-color, #5b63f6) 11%, transparent), transparent 46%),
        var(--bc-bg-elevated, #fff);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 16px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    }

    .prefetch-console__header,
    .prefetch-console__toolbar,
    .prefetch-console__event-heading,
    .prefetch-console__toolbar-actions {
      display: flex;
      align-items: center;
    }

    .prefetch-console__header,
    .prefetch-console__toolbar,
    .prefetch-console__event-heading {
      justify-content: space-between;
      gap: 10px;
    }

    .prefetch-console__header {
      min-height: 42px;
      padding-left: 76px;
      box-sizing: border-box;
    }

    .prefetch-console__eyebrow {
      display: block;
      margin-bottom: 3px;
      color: var(--bc-color-lighter, #8790a3);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h2 {
      margin: 0;
      font-size: 14px;
      line-height: 1.3;
    }

    .prefetch-console__status {
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: 6px;
      min-height: 24px;
      padding: 0 8px;
      color: var(--bc-color-light, #667085);
      background: var(--bc-bg-secondary, #f5f7fa);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
    }

    .prefetch-console__status-dot,
    .prefetch-console__empty-dot {
      width: 6px;
      height: 6px;
      background: currentColor;
      border-radius: 50%;
    }

    .prefetch-console__status--active {
      color: var(--bc-success-color, #16865c);
      background: color-mix(in srgb, var(--bc-success-color, #16865c) 10%, transparent);
    }

    .prefetch-console__status--disabled,
    .prefetch-console__status--error {
      color: var(--bc-danger-color, #d33d52);
      background: color-mix(in srgb, var(--bc-danger-color, #d33d52) 9%, transparent);
    }

    .prefetch-console__metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .prefetch-console__metric {
      min-width: 0;
      padding: 8px;
      background: color-mix(in srgb, var(--bc-bg-secondary, #f5f7fa) 88%, transparent);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 9px;
    }

    .prefetch-console__metric span,
    .prefetch-console__toolbar > span,
    .prefetch-console__time {
      color: var(--bc-color-lighter, #8790a3);
      font-size: 9px;
    }

    .prefetch-console__metric strong {
      display: block;
      margin-top: 2px;
      overflow: hidden;
      font-size: 14px;
      line-height: 1;
      text-overflow: ellipsis;
    }

    .prefetch-console__metric--alert strong {
      color: var(--bc-danger-color, #d33d52);
    }

    .prefetch-console__filters {
      display: flex;
      gap: 5px;
      padding-bottom: 2px;
      overflow-x: auto;
      scrollbar-width: thin;
    }

    button {
      font: inherit;
    }

    .prefetch-console__filter,
    .prefetch-console__icon-button {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      color: var(--bc-color-light, #667085);
      background: transparent;
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      cursor: pointer;
    }

    .prefetch-console__filter {
      gap: 4px;
      min-height: 26px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 10px;
      white-space: nowrap;
    }

    .prefetch-console__filter span {
      color: var(--bc-color-lighter, #8790a3);
      font-size: 9px;
      font-variant-numeric: tabular-nums;
    }

    .prefetch-console__filter--active {
      color: var(--bc-active-color, #5b63f6);
      background: var(--bc-active-color-lighter, #eef0ff);
      border-color: color-mix(in srgb, var(--bc-active-color, #5b63f6) 30%, transparent);
      font-weight: 700;
    }

    .prefetch-console__toolbar {
      min-height: 28px;
    }

    .prefetch-console__toolbar-actions {
      gap: 5px;
    }

    .prefetch-console__icon-button {
      gap: 4px;
      min-height: 26px;
      padding: 0 7px;
      border-radius: 7px;
      font-size: 10px;
    }

    .prefetch-console__icon-button:hover,
    .prefetch-console__filter:hover {
      color: var(--bc-active-color, #5b63f6);
      border-color: color-mix(in srgb, var(--bc-active-color, #5b63f6) 38%, transparent);
    }

    .prefetch-console__icon-button:focus-visible,
    .prefetch-console__filter:focus-visible {
      outline: 2px solid var(--bc-active-color, #5b63f6);
      outline-offset: 2px;
    }

    .prefetch-console__timeline {
      max-height: 430px;
      padding: 3px 3px 3px 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .prefetch-console__empty {
      display: flex;
      min-height: 112px;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      color: var(--bc-color-lighter, #8790a3);
      text-align: center;
      background: color-mix(in srgb, var(--bc-bg-secondary, #f5f7fa) 70%, transparent);
      border: 1px dashed var(--bc-border-color, #d7dce6);
      border-radius: 10px;
      font-size: 10px;
    }

    .prefetch-console__empty strong {
      color: var(--bc-color-light, #667085);
      font-size: 11px;
    }

    .prefetch-console__empty--error,
    .prefetch-console__empty--error strong {
      color: var(--bc-danger-color, #d33d52);
    }

    .prefetch-console__event {
      display: grid;
      grid-template-columns: 12px minmax(0, 1fr);
      min-width: 0;
    }

    .prefetch-console__event-rail {
      position: relative;
      display: flex;
      justify-content: center;
    }

    .prefetch-console__event-rail::after {
      position: absolute;
      top: 12px;
      bottom: -5px;
      width: 1px;
      background: var(--bc-border-color-light, #e5e9f2);
      content: '';
    }

    .prefetch-console__event:last-child .prefetch-console__event-rail::after {
      display: none;
    }

    .prefetch-console__event-rail span {
      z-index: 1;
      width: 7px;
      height: 7px;
      margin-top: 11px;
      background: var(--bc-active-color, #5b63f6);
      border: 2px solid var(--bc-bg-elevated, #fff);
      border-radius: 50%;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--bc-active-color, #5b63f6) 25%, transparent);
    }

    .prefetch-console__event--error .prefetch-console__event-rail span {
      background: var(--bc-danger-color, #d33d52);
    }

    .prefetch-console__event-body {
      min-width: 0;
      margin: 0 0 7px 3px;
      padding: 8px 9px;
      background: color-mix(in srgb, var(--bc-bg-secondary, #f5f7fa) 66%, transparent);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 9px;
    }

    .prefetch-console__event-heading {
      align-items: flex-start;
    }

    .prefetch-console__event-heading > div {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }

    .prefetch-console__event-heading strong {
      font-size: 10px;
    }

    .prefetch-console__event-heading code,
    .prefetch-console__event-heading > span,
    .prefetch-console__chips,
    .prefetch-console__details,
    .prefetch-console__reason {
      font-size: 9px;
    }

    .prefetch-console__event-heading code {
      overflow: hidden;
      color: var(--bc-color-lighter, #8790a3);
      text-overflow: ellipsis;
    }

    .prefetch-console__event-heading > span {
      flex: none;
      color: var(--bc-color-lighter, #8790a3);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
    }

    .prefetch-console__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }

    .prefetch-console__chips > * {
      max-width: 100%;
      padding: 2px 5px;
      overflow: hidden;
      color: var(--bc-color-light, #667085);
      background: var(--bc-bg-elevated, #fff);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 5px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .prefetch-console__chips .prefetch-console__lane {
      color: var(--bc-active-color, #5b63f6);
    }

    .prefetch-console__details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 8px;
      margin: 7px 0 0;
    }

    .prefetch-console__details div {
      min-width: 0;
    }

    .prefetch-console__details dt {
      color: var(--bc-color-lighter, #8790a3);
    }

    .prefetch-console__details dd {
      margin: 1px 0 0;
      overflow: hidden;
      color: var(--bc-color-light, #667085);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .prefetch-console__reason {
      margin: 7px 0 0;
      padding: 5px 6px;
      overflow: hidden;
      color: var(--bc-danger-color, #d33d52);
      background: color-mix(in srgb, var(--bc-danger-color, #d33d52) 7%, transparent);
      border-radius: 5px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .prefetch-console__time {
      display: block;
      margin-top: 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        scroll-behavior: auto !important;
      }
    }
  `],
})
export class IdlePrefetchDebugConsoleComponent implements OnInit, OnDestroy {
  readonly filters = FILTERS;
  readonly snapshot = signal<IdlePrefetchConsoleSnapshot>(EMPTY_SNAPSHOT);
  readonly selectedFilter = signal<TraceFilter>('all');
  readonly focusedRootId = signal<string | null>(null);
  readonly paused = signal(false);
  readonly filteredEvents = computed(() => {
    const filter = this.selectedFilter();
    const rootId = this.focusedRootId();
    const events = rootId
      ? this.snapshot().events.filter(event => event.rootId === rootId)
      : this.snapshot().events;
    const filtered = filter === 'all'
      ? events
      : events.filter(event => event.category === filter);
    return filtered.slice(0, MAX_VISIBLE_EVENTS);
  });
  readonly status = computed<ConsoleStatus>(() => {
    const snapshot = this.snapshot();
    if (snapshot.captureError) return {label: '读取异常', tone: 'error'};
    if (!snapshot.connected) return {label: '等待文档', tone: 'idle'};
    if (!snapshot.enabled) return {label: '未启用', tone: 'idle'};
    if (snapshot.disabled) return {label: '已禁用', tone: 'disabled'};
    return {label: '运行中', tone: 'active'};
  });

  private readonly zone = inject(NgZone);
  private document: BlockCraftDoc | null = null;
  private pollTimer: number | null = null;
  private started = false;
  private destroyed = false;
  private documentGeneration = 0;
  private lastTraceToken: string | null = null;
  private latestCapturedKeys: readonly string[] = [];
  private hiddenEventKeys = new Set<string>();

  @Input()
  set doc(value: BlockCraftDoc | null) {
    if (value === this.document) return;
    this.document = value;
    this.documentGeneration++;
    this.lastTraceToken = null;
    this.latestCapturedKeys = [];
    this.hiddenEventKeys.clear();
    this.focusedRootId.set(null);
    if (this.started) {
      this.zone.runOutsideAngular(() => this.capture(true));
    }
  }

  ngOnInit(): void {
    this.started = true;
    this.zone.runOutsideAngular(() => {
      this.capture(true);
      this.pollTimer = window.setInterval(() => this.capture(), POLL_INTERVAL_MS);
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  selectFilter(filter: TraceFilter): void {
    this.selectedFilter.set(filter);
  }

  selectRoot(rootId: string | null): void {
    this.focusedRootId.set(rootId);
  }

  shortenRootId(rootId: string): string {
    return shortenRootId(rootId);
  }

  togglePaused(): void {
    const next = !this.paused();
    this.paused.set(next);
    if (!next) {
      this.zone.runOutsideAngular(() => this.capture());
    }
  }

  clearView(): void {
    this.hiddenEventKeys = new Set(this.latestCapturedKeys);
    this.snapshot.update(snapshot => ({...snapshot, events: []}));
  }

  filterCount(filter: TraceFilter): number {
    const rootId = this.focusedRootId();
    const events = rootId
      ? this.snapshot().events.filter(event => event.rootId === rootId)
      : this.snapshot().events;
    return filter === 'all'
      ? events.length
      : events.filter(event => event.category === filter).length;
  }

  emptyStateTitle(): string {
    if (!this.snapshot().connected) return '等待编辑器文档';
    if (!this.snapshot().enabled) return 'Playground 虚拟渲染未开启';
    if (this.focusedRootId()) return '当前 Root 暂无保留事件';
    if (this.selectedFilter() !== 'all') return '当前分类暂无事件';
    return '等待空闲预热事件';
  }

  emptyStateDetail(): string {
    if (!this.snapshot().connected) return '文档创建后会自动连接诊断流。';
    if (!this.snapshot().enabled) return '初始化前开启虚拟渲染即可观察预热流水。';
    if (this.focusedRootId()) return '环形流水只保留最近 256 条；清除聚焦可查看全部事件。';
    if (this.selectedFilter() !== 'all') return '切换“全部”可查看其他流水阶段。';
    return '滚动、停顿或视口接管后，最新事件会显示在这里。';
  }

  private capture(force = false): void {
    if (this.destroyed || this.paused()) return;
    const document = this.document;
    if (!document) {
      const token = `${this.documentGeneration}:no-document`;
      if (!force && token === this.lastTraceToken) return;
      this.lastTraceToken = token;
      this.publish(EMPTY_SNAPSHOT);
      return;
    }

    try {
      const diagnostics = document.virtualization.captureIdlePrefetchDiagnostics() as any;
      const trace: readonly unknown[] = Array.isArray(diagnostics?.trace)
        ? diagnostics.trace
        : [];
      const token = createTraceToken(
        this.documentGeneration,
        trace,
        diagnostics,
      );
      if (!force && token === this.lastTraceToken) return;
      const normalizedEvents = trace.map((entry: unknown, index: number) =>
        normalizeTraceEvent(entry, index),
      );
      const virtualDocument = normalizeVirtualDocument(diagnostics?.virtualDocument);
      this.lastTraceToken = token;
      this.latestCapturedKeys = normalizedEvents.map(event => event.key);
      const visibleEvents = normalizedEvents
        .filter(event => !this.hiddenEventKeys.has(event.key))
        .reverse();
      this.publish({
        connected: true,
        enabled: readBoolean(diagnostics?.enabled),
        disabled: readBoolean(diagnostics?.disabled),
        counters: {
          candidates: readCount(diagnostics?.candidates),
          nearMounts: readCount(diagnostics?.nearMounts),
          sweepMounts: readCount(diagnostics?.sweepMounts),
          hits: readCount(diagnostics?.hits),
          cancellations: readCount(diagnostics?.cancellations),
          failures: readCount(diagnostics?.failures),
        },
        virtualDocument,
        events: visibleEvents,
        captureError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const token = `${this.documentGeneration}:error:${message}`;
      if (!force && token === this.lastTraceToken) return;
      this.lastTraceToken = token;
      this.publish({
        connected: true,
        enabled: false,
        disabled: false,
        counters: ZERO_COUNTERS,
        virtualDocument: null,
        events: [],
        captureError: message,
      });
    }
  }

  private publish(snapshot: IdlePrefetchConsoleSnapshot): void {
    this.zone.run(() => this.snapshot.set(snapshot));
  }
}

function normalizeTraceEvent(entry: unknown, index: number): IdlePrefetchTraceRow {
  const record = isRecord(entry) ? entry : {};
  const sequence = readFiniteNumber(record['sequence']);
  const timestamp = readFiniteNumber(record['timestamp']);
  const kind = readString(record['kind']) ?? 'unknown';
  const lane = readString(record['lane']);
  const rootId = readString(record['rootId']);
  const flavour = readString(record['flavour']);
  const duration = readFiniteNumber(record['durationMs']);
  const projected = readFiniteNumber(record['projectedHeight']);
  const viewport = readFiniteNumber(record['viewportHeight']);
  const estimated = readFiniteNumber(record['estimatedHeight']);
  const measured = readFiniteNumber(record['measuredHeight']);
  const reason = readString(record['reason']);
  const epoch = readFiniteNumber(record['epoch']);
  const category = classifyKind(kind);
  const key = sequence !== null
    ? `sequence:${sequence}`
    : [
      'fallback',
      timestamp ?? 'no-time',
      kind,
      lane ?? 'no-lane',
      rootId ?? 'no-root',
      index,
    ].join(':');

  return {
    key,
    kind,
    kindLabel: KIND_LABELS[kind] ?? humanizeKind(kind),
    category,
    sequenceLabel: sequence === null ? null : `#${Math.trunc(sequence)}`,
    timestampLabel: timestamp === null ? null : `t+${formatNumber(timestamp, 1)} ms`,
    laneLabel: lane === 'near' ? '近邻' : lane === 'sweep' ? '扫尾' : lane,
    rootId,
    rootIdLabel: rootId ? shortenRootId(rootId) : null,
    flavour,
    durationLabel: duration === null ? null : `${formatNumber(duration, 2)} ms`,
    heightLabel: estimated === null && measured === null
      ? null
      : `${formatHeight(estimated)} → ${formatHeight(measured)}`,
    projectionLabel: projected === null && viewport === null
      ? null
      : `${formatHeight(projected)} / ${formatHeight(viewport)}`,
    reason,
    epochLabel: epoch === null ? null : String(Math.trunc(epoch)),
  };
}

function createTraceToken(
  generation: number,
  trace: readonly unknown[],
  diagnostics: any,
): string {
  const last = trace.at(-1);
  let traceToken: string;
  if (isRecord(last)) {
    const sequence = readFiniteNumber(last['sequence']);
    traceToken = sequence !== null
      ? `${generation}:sequence:${sequence}`
      : [
        generation,
        'fallback',
        trace.length,
        readFiniteNumber(last['timestamp']) ?? 'no-time',
        readString(last['kind']) ?? 'unknown',
        readString(last['rootId']) ?? 'no-root',
      ].join(':');
  } else {
    traceToken = [
      generation,
      'empty',
      readBoolean(diagnostics?.enabled),
      readBoolean(diagnostics?.disabled),
    ].join(':');
  }
  const virtualDocument = isRecord(diagnostics?.virtualDocument)
    ? diagnostics.virtualDocument
    : {};
  return [
    traceToken,
    'virtual',
    readFiniteNumber(virtualDocument['revision']) ?? 'none',
    readFiniteNumber(virtualDocument['projectionRevision']) ?? 'none',
    readFiniteNumber(virtualDocument['viewportTop']) ?? 'none',
    readFiniteNumber(virtualDocument['viewportHeight']) ?? 'none',
  ].join(':');
}

function normalizeVirtualDocument(value: unknown): VirtualDocumentSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value['roots'])) return null;
  const revision = readFiniteNumber(value['revision']);
  const projectionRevision = readFiniteNumber(value['projectionRevision']);
  const totalHeight = readFiniteNumber(value['totalHeight']);
  const viewportTop = readFiniteNumber(value['viewportTop']);
  const viewportHeight = readFiniteNumber(value['viewportHeight']);
  const projectionKind = value['projectionKind'];
  if (
    revision === null ||
    projectionRevision === null ||
    totalHeight === null ||
    viewportTop === null ||
    viewportHeight === null ||
    (projectionKind !== 'continuous' && projectionKind !== 'custom')
  ) {
    return null;
  }
  const roots: VirtualDocumentRootSnapshot[] = [];
  for (const entry of value['roots']) {
    if (!isRecord(entry)) continue;
    const id = readString(entry['id']);
    const index = readFiniteNumber(entry['index']);
    const offset = readFiniteNumber(entry['offset']);
    const height = readFiniteNumber(entry['height']);
    const heightState = entry['heightState'];
    const viewState = entry['viewState'];
    if (
      !id ||
      index === null ||
      offset === null ||
      height === null ||
      !isVirtualDocumentHeightState(heightState) ||
      !isVirtualDocumentViewState(viewState)
    ) {
      continue;
    }
    roots.push({
      id,
      index: Math.max(0, Math.trunc(index)),
      flavour: readString(entry['flavour']) ?? '',
      offset: Math.max(0, offset),
      height: Math.max(0, height),
      heightState,
      viewState,
    });
  }
  return {
    revision: Math.max(0, Math.trunc(revision)),
    projectionKind,
    projectionRevision: Math.max(0, Math.trunc(projectionRevision)),
    totalHeight: Math.max(0, totalHeight),
    viewportTop: Math.max(0, viewportTop),
    viewportHeight: Math.max(0, viewportHeight),
    roots,
  };
}

function isVirtualDocumentHeightState(
  value: unknown,
): value is VirtualDocumentRootSnapshot['heightState'] {
  return value === 'estimated' || value === 'measured' || value === 'stale';
}

function isVirtualDocumentViewState(
  value: unknown,
): value is VirtualDocumentRootSnapshot['viewState'] {
  return value === 'unmounted' ||
    value === 'retained' ||
    value === 'mounted' ||
    value === 'near' ||
    value === 'sweep' ||
    value === 'viewport';
}

function classifyKind(kind: string): TraceCategory {
  const exact = KIND_CATEGORIES[kind];
  if (exact) return exact;
  const value = kind.toLowerCase();
  if (/(fail|error|cancel|invalid|disable|stale|denied)/.test(value)) return 'error';
  if (/(handoff|viewport|adopt|claim|hit)/.test(value)) return 'handoff';
  if (/(release|destroy|evict|detach|dispose)/.test(value)) return 'release';
  if (/(measure|height|geometry|exact)/.test(value)) return 'measure';
  if (/(mount|create|reuse|prefetch|retain)/.test(value)) return 'create';
  return 'calculate';
}

function humanizeKind(kind: string): string {
  if (kind === 'unknown') return '未知事件';
  return kind.replace(/[-_]+/g, ' ');
}

function shortenRootId(rootId: string): string {
  if (rootId.length <= 13) return rootId;
  return `${rootId.slice(0, 7)}…${rootId.slice(-4)}`;
}

function formatHeight(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value, 1)} px`;
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return (maximumFractionDigits === 2 ? TWO_DECIMAL_FORMATTER : ONE_DECIMAL_FORMATTER)
    .format(value);
}

function readCount(value: unknown): number {
  const number = readFiniteNumber(value);
  return number === null ? 0 : Math.max(0, Math.trunc(number));
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
