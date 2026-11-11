import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';

export type VirtualDocumentHeightState = 'estimated' | 'measured' | 'stale';
export type VirtualDocumentViewState =
  | 'unmounted'
  | 'retained'
  | 'mounted'
  | 'near'
  | 'sweep'
  | 'viewport';

export interface VirtualDocumentRootSnapshot {
  readonly id: string;
  readonly index: number;
  readonly flavour: string;
  readonly offset: number;
  readonly height: number;
  readonly heightState: VirtualDocumentHeightState;
  readonly viewState: VirtualDocumentViewState;
}

export interface VirtualDocumentSnapshot {
  readonly revision: number;
  readonly projectionKind: 'continuous' | 'custom';
  readonly projectionRevision: number;
  readonly totalHeight: number;
  readonly viewportTop: number;
  readonly viewportHeight: number;
  readonly roots: readonly VirtualDocumentRootSnapshot[];
}

interface VirtualDocumentSummary {
  readonly roots: number;
  readonly estimated: number;
  readonly measured: number;
  readonly stale: number;
  readonly unmounted: number;
  readonly retained: number;
  readonly mounted: number;
  readonly near: number;
  readonly sweep: number;
  readonly viewport: number;
}

interface TrackPalette {
  readonly background: string;
  readonly border: string;
  readonly unmounted: string;
  readonly retained: string;
  readonly mounted: string;
  readonly near: string;
  readonly sweep: string;
  readonly viewport: string;
  readonly estimated: string;
  readonly measured: string;
  readonly stale: string;
  readonly viewportStroke: string;
  readonly selected: string;
  readonly labelText: string;
  readonly labelBackground: string;
}

interface TrackHeightLabel {
  readonly root: VirtualDocumentRootSnapshot;
  readonly desiredY: number;
}

const EMPTY_SUMMARY: VirtualDocumentSummary = {
  roots: 0,
  estimated: 0,
  measured: 0,
  stale: 0,
  unmounted: 0,
  retained: 0,
  mounted: 0,
  near: 0,
  sweep: 0,
  viewport: 0,
};
const TRACK_HORIZONTAL_PADDING = 10;
const TRACK_VERTICAL_PADDING = 7;
const TRACK_LABEL_LIMIT = 7;
const TRACK_LABEL_HEIGHT = 13;
const TRACK_LABEL_GAP = 3;

const VIEW_STATE_LABELS: Readonly<Record<VirtualDocumentViewState, string>> = {
  unmounted: '未创建',
  retained: '已保留',
  mounted: '已挂载',
  near: '近邻预热',
  sweep: '扫尾预热',
  viewport: '视口',
};

const HEIGHT_STATE_LABELS: Readonly<Record<VirtualDocumentHeightState, string>> = {
  estimated: '估算',
  measured: '已测量',
  stale: '已失效',
};

@Component({
  selector: 'playground-idle-prefetch-virtual-document',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="virtual-document"
      data-testid="idle-prefetch-virtual-document"
      [attr.data-root-count]="summary().roots"
      [attr.data-measured-count]="summary().measured"
      [attr.data-estimated-count]="summary().estimated"
      [attr.data-stale-count]="summary().stale"
      [attr.data-unmounted-count]="summary().unmounted"
      [attr.data-retained-count]="summary().retained"
      [attr.data-mounted-count]="summary().mounted"
      [attr.data-active-view-count]="summary().mounted + summary().near + summary().sweep + summary().viewport"
      [attr.data-near-count]="summary().near"
      [attr.data-sweep-count]="summary().sweep"
      [attr.data-viewport-count]="summary().viewport"
      data-inline-height-labels="representative"
      aria-label="虚拟文档块与高度视图">
      <header class="virtual-document__header">
        <div>
          <strong>虚拟文档轨道</strong>
          <span>Projection height × view lifecycle</span>
        </div>
        @if (snapshot) {
          <span class="virtual-document__projection">
            {{ snapshot.projectionKind === 'continuous' ? '连续' : '分页' }}
            · r{{ snapshot.projectionRevision }}
          </span>
        }
      </header>

      @if (!snapshot || snapshot.roots.length === 0) {
        <div class="virtual-document__empty" data-testid="idle-prefetch-virtual-document-empty">
          文档初始化后，这里会按实际投影高度绘制每个 Root。
        </div>
      } @else {
        <div class="virtual-document__summary" data-testid="idle-prefetch-virtual-document-summary">
          <span><strong>{{ summary().roots }}</strong> Root</span>
          <span><strong>{{ formatHeight(snapshot.totalHeight) }}</strong> 总高</span>
          <span><strong>{{ summary().measured }}</strong> 已测量</span>
          <span><strong>{{ summary().mounted + summary().near + summary().sweep + summary().viewport }}</strong> 活跃视图</span>
          <span class="virtual-document__summary-wide">
            <strong>{{ formatHeight(snapshot.viewportTop) }}–{{ formatHeight(snapshot.viewportTop + snapshot.viewportHeight) }}</strong>
            视口
          </span>
        </div>

        <div class="virtual-document__canvas-shell">
          <canvas
            #canvas
            class="virtual-document__canvas"
            data-testid="idle-prefetch-virtual-document-canvas"
            tabindex="0"
            aria-label="虚拟文档高度轨道；移动指针查看 Root，点击聚焦对应事件">
          </canvas>
          <span class="virtual-document__edge virtual-document__edge--top">0</span>
          <span class="virtual-document__edge virtual-document__edge--bottom">
            {{ formatHeight(snapshot.totalHeight) }}
          </span>
        </div>

        <div
          class="virtual-document__legend"
          data-testid="idle-prefetch-virtual-document-legend"
          aria-label="虚拟文档轨道图例">
          <span><i class="is-viewport"></i>视口</span>
          <span><i class="is-near"></i>近邻</span>
          <span><i class="is-sweep"></i>扫尾</span>
          <span><i class="is-mounted"></i>已挂载</span>
          <span><i class="is-retained"></i>保留</span>
          <span><i class="is-measured"></i>实测高度</span>
          <span><i class="is-estimated"></i>估算高度</span>
          <span><i class="is-stale"></i>失效高度</span>
          <span class="virtual-document__legend-note">图内：#序号 估/实/旧 px</span>
        </div>

        @if (inspectedRoot(); as root) {
          <article
            class="virtual-document__root-detail"
            data-testid="idle-prefetch-virtual-document-root-detail"
            [attr.data-root-id]="root.id"
            [attr.data-height-state]="root.heightState"
            [attr.data-view-state]="root.viewState">
            <div>
              <strong>#{{ root.index }} · {{ root.flavour || 'unknown' }}</strong>
              <code [title]="root.id">{{ shortenRootId(root.id) }}</code>
            </div>
            <dl>
              <div><dt>位置</dt><dd>{{ formatHeight(root.offset) }}</dd></div>
              <div><dt>块高</dt><dd>{{ formatHeight(root.height) }}</dd></div>
              <div><dt>高度</dt><dd>{{ heightStateLabel(root.heightState) }}</dd></div>
              <div><dt>视图</dt><dd>{{ viewStateLabel(root.viewState) }}</dd></div>
            </dl>
            @if (selectedRootId) {
              <button type="button" (click)="clearSelection()">清除事件聚焦</button>
            } @else {
              <span>点击该段可聚焦对应流水</span>
            }
          </article>
        } @else {
          <div class="virtual-document__hint">移动指针查看真实高度，点击 block 聚焦事件。</div>
        }
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
      --virtual-track-unmounted: rgba(135, 144, 163, 0.28);
      --virtual-track-retained: #9271d4;
      --virtual-track-mounted: #2c9db2;
      --virtual-track-near: #18a779;
      --virtual-track-sweep: #b04fc7;
      --virtual-track-viewport: var(--bc-active-color, #5b63f6);
      --virtual-height-estimated: #a5adbb;
      --virtual-height-measured: var(--bc-success-color, #16865c);
      --virtual-height-stale: #e19a31;
    }

    .virtual-document {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      background: color-mix(in srgb, var(--bc-bg-secondary, #f5f7fa) 72%, transparent);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 11px;
    }

    .virtual-document__header,
    .virtual-document__header > div,
    .virtual-document__summary,
    .virtual-document__legend,
    .virtual-document__root-detail > div {
      display: flex;
      align-items: center;
    }

    .virtual-document__header {
      justify-content: space-between;
      gap: 8px;
    }

    .virtual-document__header > div {
      min-width: 0;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
    }

    .virtual-document__header strong {
      font-size: 11px;
    }

    .virtual-document__header span,
    .virtual-document__projection,
    .virtual-document__hint,
    .virtual-document__root-detail > span,
    .virtual-document__root-detail button {
      color: var(--bc-color-lighter, #8790a3);
      font-size: 9px;
    }

    .virtual-document__projection {
      flex: none;
      padding: 3px 6px;
      background: var(--bc-bg-elevated, #fff);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 999px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .virtual-document__summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 8px;
      font-size: 9px;
    }

    .virtual-document__summary span {
      overflow: hidden;
      color: var(--bc-color-lighter, #8790a3);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .virtual-document__summary strong {
      color: var(--bc-color-light, #667085);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
    }

    .virtual-document__summary-wide {
      grid-column: 1 / -1;
    }

    .virtual-document__canvas-shell {
      position: relative;
      height: 250px;
      min-height: 180px;
      overflow: hidden;
      background: var(--bc-bg-elevated, #fff);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 8px;
    }

    .virtual-document__canvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: crosshair;
      touch-action: none;
    }

    .virtual-document__canvas:focus-visible {
      outline: 2px solid var(--bc-active-color, #5b63f6);
      outline-offset: -3px;
    }

    .virtual-document__edge {
      position: absolute;
      left: 5px;
      padding: 1px 3px;
      color: var(--bc-color-lighter, #8790a3);
      background: color-mix(in srgb, var(--bc-bg-elevated, #fff) 86%, transparent);
      border-radius: 3px;
      font: 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      pointer-events: none;
    }

    .virtual-document__edge--top { top: 5px; }
    .virtual-document__edge--bottom { bottom: 5px; }

    .virtual-document__legend {
      flex-wrap: wrap;
      gap: 5px 8px;
      color: var(--bc-color-light, #667085);
      font-size: 8px;
    }

    .virtual-document__legend span {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .virtual-document__legend i {
      width: 7px;
      height: 7px;
      background: var(--legend-color);
      border-radius: 2px;
    }

    .virtual-document__legend .is-viewport { --legend-color: var(--virtual-track-viewport); }
    .virtual-document__legend .is-near { --legend-color: var(--virtual-track-near); }
    .virtual-document__legend .is-sweep { --legend-color: var(--virtual-track-sweep); }
    .virtual-document__legend .is-mounted { --legend-color: var(--virtual-track-mounted); }
    .virtual-document__legend .is-retained { --legend-color: var(--virtual-track-retained); }
    .virtual-document__legend .is-measured { --legend-color: var(--virtual-height-measured); }
    .virtual-document__legend .is-estimated { --legend-color: var(--virtual-height-estimated); }
    .virtual-document__legend .is-stale { --legend-color: var(--virtual-height-stale); }

    .virtual-document__legend-note {
      width: 100%;
      color: var(--bc-color-lighter, #8790a3);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .virtual-document__root-detail {
      padding: 8px;
      background: var(--bc-bg-elevated, #fff);
      border: 1px solid var(--bc-border-color-light, #e5e9f2);
      border-radius: 8px;
    }

    .virtual-document__root-detail > div {
      justify-content: space-between;
      gap: 8px;
      font-size: 9px;
    }

    .virtual-document__root-detail code {
      overflow: hidden;
      color: var(--bc-color-lighter, #8790a3);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .virtual-document__root-detail dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 8px;
      margin: 7px 0 5px;
      font-size: 9px;
    }

    .virtual-document__root-detail dt { color: var(--bc-color-lighter, #8790a3); }
    .virtual-document__root-detail dd {
      margin: 1px 0 0;
      color: var(--bc-color-light, #667085);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
    }

    .virtual-document__root-detail button {
      padding: 0;
      background: transparent;
      border: 0;
      cursor: pointer;
      text-decoration: underline;
    }

    .virtual-document__empty,
    .virtual-document__hint {
      padding: 14px 8px;
      text-align: center;
      border: 1px dashed var(--bc-border-color, #d7dce6);
      border-radius: 8px;
    }
  `],
})
export class IdlePrefetchVirtualDocumentComponent implements OnDestroy {
  @ViewChild('canvas')
  set canvasRef(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.bindCanvas(value?.nativeElement ?? null);
  }
  @Output() readonly rootSelected = new EventEmitter<string | null>();

  readonly hoveredRootId = signal<string | null>(null);
  readonly summary = signal<VirtualDocumentSummary>(EMPTY_SUMMARY);
  private readonly documentSnapshotSignal = signal<VirtualDocumentSnapshot | null>(null);
  private readonly selectedRootIdSignal = signal<string | null>(null);
  readonly inspectedRoot = computed(() => {
    const snapshot = this.documentSnapshotSignal();
    const id = this.selectedRootIdSignal() ?? this.hoveredRootId();
    return id && snapshot
      ? snapshot.roots.find(root => root.id === id) ?? null
      : null;
  });

  private readonly zone = inject(NgZone);
  private resizeObserver: ResizeObserver | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private paintFrame: number | null = null;
  private pointerFrame: number | null = null;
  private pendingPointer: PointerEvent | null = null;
  private canvasCssHeight = 0;
  private destroyed = false;

  @Input()
  set snapshot(value: VirtualDocumentSnapshot | null) {
    this.documentSnapshotSignal.set(value);
    this.summary.set(summarizeVirtualDocument(value));
    this.schedulePaint();
  }

  get snapshot(): VirtualDocumentSnapshot | null {
    return this.documentSnapshotSignal();
  }

  @Input()
  set selectedRootId(value: string | null) {
    this.selectedRootIdSignal.set(value);
    this.schedulePaint();
  }

  get selectedRootId(): string | null {
    return this.selectedRootIdSignal();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unbindCanvas();
  }

  private bindCanvas(canvas: HTMLCanvasElement | null): void {
    if (canvas === this.canvasElement) return;
    this.unbindCanvas();
    this.canvasElement = canvas;
    if (!canvas || this.destroyed) return;
    this.zone.runOutsideAngular(() => {
      canvas.addEventListener('pointermove', this.onPointerMove, {passive: true});
      canvas.addEventListener('pointerleave', this.onPointerLeave, {passive: true});
      canvas.addEventListener('click', this.onClick);
      const ownerWindow = canvas.ownerDocument.defaultView;
      const ResizeObserverCtor = ownerWindow?.ResizeObserver ?? globalThis.ResizeObserver;
      if (typeof ResizeObserverCtor !== 'undefined') {
        this.resizeObserver = new ResizeObserverCtor(() => this.schedulePaint());
        this.resizeObserver.observe(canvas);
      }
      this.schedulePaint();
    });
  }

  private unbindCanvas(): void {
    const canvas = this.canvasElement;
    canvas?.removeEventListener('pointermove', this.onPointerMove);
    canvas?.removeEventListener('pointerleave', this.onPointerLeave);
    canvas?.removeEventListener('click', this.onClick);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const ownerWindow = canvas?.ownerDocument.defaultView ?? window;
    if (this.paintFrame !== null) ownerWindow.cancelAnimationFrame(this.paintFrame);
    if (this.pointerFrame !== null) ownerWindow.cancelAnimationFrame(this.pointerFrame);
    this.paintFrame = null;
    this.pointerFrame = null;
    this.pendingPointer = null;
    this.canvasCssHeight = 0;
    this.canvasElement = null;
  }

  clearSelection(): void {
    this.rootSelected.emit(null);
  }

  formatHeight(value: number): string {
    return value >= 1000
      ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k px`
      : `${value.toFixed(value >= 100 ? 0 : 1)} px`;
  }

  shortenRootId(rootId: string): string {
    return rootId.length <= 15
      ? rootId
      : `${rootId.slice(0, 8)}…${rootId.slice(-4)}`;
  }

  heightStateLabel(state: VirtualDocumentHeightState): string {
    return HEIGHT_STATE_LABELS[state];
  }

  viewStateLabel(state: VirtualDocumentViewState): string {
    return VIEW_STATE_LABELS[state];
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pendingPointer = event;
    if (this.pointerFrame !== null) return;
    const ownerWindow = event.currentTarget instanceof HTMLCanvasElement
      ? event.currentTarget.ownerDocument.defaultView ?? window
      : window;
    this.pointerFrame = ownerWindow.requestAnimationFrame(() => {
      this.pointerFrame = null;
      const pending = this.pendingPointer;
      this.pendingPointer = null;
      if (!pending) return;
      this.setHoveredRoot(this.hitTestRoot(pending));
    });
  };

  private readonly onPointerLeave = (): void => {
    this.pendingPointer = null;
    this.setHoveredRoot(null);
  };

  private readonly onClick = (event: MouseEvent): void => {
    const snapshot = this.documentSnapshotSignal();
    const hoveredRootId = this.hoveredRootId();
    const root = hoveredRootId && snapshot
      ? snapshot.roots.find(candidate => candidate.id === hoveredRootId) ?? null
      : this.hitTestRoot(event);
    if (!root) return;
    this.zone.run(() => this.rootSelected.emit(
      root.id === this.selectedRootId ? null : root.id,
    ));
  };

  private setHoveredRoot(root: VirtualDocumentRootSnapshot | null): void {
    const id = root?.id ?? null;
    if (id === this.hoveredRootId()) return;
    this.zone.run(() => this.hoveredRootId.set(id));
    this.schedulePaint();
  }

  private hitTestRoot(event: MouseEvent): VirtualDocumentRootSnapshot | null {
    const canvas = this.canvasElement;
    const snapshot = this.documentSnapshotSignal();
    if (!canvas || !snapshot?.roots.length || snapshot.totalHeight <= 0) return null;
    const canvasHeight = this.canvasCssHeight || canvas.clientHeight;
    if (canvasHeight <= 0) return null;
    const trackHeight = Math.max(1, canvasHeight - TRACK_VERTICAL_PADDING * 2);
    const ratio = Math.min(1, Math.max(
      0,
      (event.offsetY - TRACK_VERTICAL_PADDING) / trackHeight,
    ));
    const offset = ratio * snapshot.totalHeight;
    let low = 0;
    let high = snapshot.roots.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const root = snapshot.roots[middle]!;
      if (root.offset <= offset) low = middle + 1;
      else high = middle - 1;
    }
    return snapshot.roots[Math.max(0, high)] ?? null;
  }

  private schedulePaint(): void {
    if (this.destroyed || this.paintFrame !== null) return;
    const canvas = this.canvasElement;
    if (!canvas) return;
    const ownerWindow = canvas.ownerDocument.defaultView ?? window;
    this.zone.runOutsideAngular(() => {
      this.paintFrame = ownerWindow.requestAnimationFrame(() => {
        this.paintFrame = null;
        this.paint(canvas);
      });
    });
  }

  private paint(canvas: HTMLCanvasElement): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.canvasCssHeight = height;
    const ownerWindow = canvas.ownerDocument.defaultView ?? window;
    const dpr = Math.max(1, ownerWindow.devicePixelRatio || 1);
    const bitmapWidth = Math.max(1, Math.round(width * dpr));
    const bitmapHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
    if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const palette = readTrackPalette(canvas);
    context.fillStyle = palette.background;
    context.fillRect(0, 0, width, height);

    const snapshot = this.documentSnapshotSignal();
    if (!snapshot?.roots.length || snapshot.totalHeight <= 0) return;
    const trackX = TRACK_HORIZONTAL_PADDING;
    const trackY = TRACK_VERTICAL_PADDING;
    const trackWidth = Math.max(1, width - TRACK_HORIZONTAL_PADDING * 2);
    const trackHeight = Math.max(1, height - TRACK_VERTICAL_PADDING * 2);
    const scale = trackHeight / snapshot.totalHeight;
    const viewportCenter = snapshot.viewportTop + snapshot.viewportHeight / 2;
    const inspectedId = this.selectedRootId ?? this.hoveredRootId();
    let inspected: VirtualDocumentRootSnapshot | null = null;
    let nearestSweep: VirtualDocumentRootSnapshot | null = null;
    let nearestNear: VirtualDocumentRootSnapshot | null = null;
    let nearestViewport: VirtualDocumentRootSnapshot | null = null;
    let nearestEstimated: VirtualDocumentRootSnapshot | null = null;
    let nearestMeasured: VirtualDocumentRootSnapshot | null = null;
    let nearestStale: VirtualDocumentRootSnapshot | null = null;
    context.save();
    context.beginPath();
    context.rect(trackX, trackY, trackWidth, trackHeight);
    context.clip();

    for (const root of snapshot.roots) {
      const y = trackY + root.offset * scale;
      const rootHeight = Math.max(0.7, root.height * scale);
      context.fillStyle = palette[root.viewState];
      context.fillRect(trackX, y, trackWidth, rootHeight);
      context.fillStyle = palette[root.heightState];
      context.fillRect(trackX + trackWidth - 4, y, 4, rootHeight);
      if (root.id === inspectedId) inspected = root;
      if (root.viewState === 'sweep') {
        nearestSweep = closerToProjectionOffset(nearestSweep, root, viewportCenter);
      } else if (root.viewState === 'near') {
        nearestNear = closerToProjectionOffset(nearestNear, root, viewportCenter);
      } else if (root.viewState === 'viewport') {
        nearestViewport = closerToProjectionOffset(nearestViewport, root, viewportCenter);
      }
      if (root.heightState === 'estimated') {
        nearestEstimated = closerToProjectionOffset(nearestEstimated, root, viewportCenter);
      } else if (root.heightState === 'measured') {
        nearestMeasured = closerToProjectionOffset(nearestMeasured, root, viewportCenter);
      } else {
        nearestStale = closerToProjectionOffset(nearestStale, root, viewportCenter);
      }
    }

    const viewportY = trackY + snapshot.viewportTop * scale;
    const viewportHeight = Math.max(2, snapshot.viewportHeight * scale);
    context.save();
    context.globalAlpha = 0.13;
    context.fillStyle = palette.viewportStroke;
    context.fillRect(trackX, viewportY, trackWidth, viewportHeight);
    context.restore();
    context.strokeStyle = palette.viewportStroke;
    context.lineWidth = 1.5;
    context.strokeRect(trackX + 0.75, viewportY + 0.75, trackWidth - 1.5, Math.max(1, viewportHeight - 1.5));

    if (inspected) {
      const y = trackY + inspected.offset * scale;
      const rootHeight = Math.max(1.5, inspected.height * scale);
      context.strokeStyle = palette.selected;
      context.lineWidth = 2;
      context.strokeRect(trackX + 1, y, trackWidth - 2, rootHeight);
    }
    context.restore();
    context.strokeStyle = palette.border;
    context.lineWidth = 1;
    context.strokeRect(trackX + 0.5, trackY + 0.5, trackWidth - 1, trackHeight - 1);
    paintHeightLabels(
      context,
      [
        inspected,
        nearestSweep,
        nearestNear,
        nearestViewport,
        nearestEstimated,
        nearestMeasured,
        nearestStale,
      ],
      {trackX, trackY, trackWidth, trackHeight, scale},
      palette,
      inspected?.id ?? null,
    );
  }
}

function closerToProjectionOffset(
  current: VirtualDocumentRootSnapshot | null,
  candidate: VirtualDocumentRootSnapshot,
  offset: number,
): VirtualDocumentRootSnapshot {
  if (!current) return candidate;
  const currentCenter = current.offset + current.height / 2;
  const candidateCenter = candidate.offset + candidate.height / 2;
  return Math.abs(candidateCenter - offset) < Math.abs(currentCenter - offset)
    ? candidate
    : current;
}

function paintHeightLabels(
  context: CanvasRenderingContext2D,
  roots: readonly (VirtualDocumentRootSnapshot | null)[],
  track: {
    readonly trackX: number;
    readonly trackY: number;
    readonly trackWidth: number;
    readonly trackHeight: number;
    readonly scale: number;
  },
  palette: TrackPalette,
  inspectedId: string | null,
): void {
  const uniqueRoots: VirtualDocumentRootSnapshot[] = [];
  const rootIds = new Set<string>();
  for (const root of roots) {
    if (!root || rootIds.has(root.id)) continue;
    rootIds.add(root.id);
    uniqueRoots.push(root);
    if (uniqueRoots.length === TRACK_LABEL_LIMIT) break;
  }
  if (!uniqueRoots.length) return;

  const labels: TrackHeightLabel[] = uniqueRoots
    .map(root => ({
      root,
      desiredY: track.trackY + (root.offset + root.height / 2) * track.scale,
    }))
    .sort((left, right) => left.desiredY - right.desiredY);
  const minimumY = track.trackY + 2;
  const maximumY = track.trackY + track.trackHeight - TRACK_LABEL_HEIGHT - 2;
  const labelYs = labels.map((label, index) => Math.max(
    index === 0 ? minimumY : 0,
    label.desiredY - TRACK_LABEL_HEIGHT / 2,
  ));
  for (let index = 1; index < labelYs.length; index++) {
    labelYs[index] = Math.max(
      labelYs[index]!,
      labelYs[index - 1]! + TRACK_LABEL_HEIGHT + TRACK_LABEL_GAP,
    );
  }
  labelYs[labelYs.length - 1] = Math.min(labelYs[labelYs.length - 1]!, maximumY);
  for (let index = labelYs.length - 2; index >= 0; index--) {
    labelYs[index] = Math.max(minimumY, Math.min(
      labelYs[index]!,
      labelYs[index + 1]! - TRACK_LABEL_HEIGHT - TRACK_LABEL_GAP,
    ));
  }

  context.save();
  context.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.textBaseline = 'middle';
  for (let index = 0; index < labels.length; index++) {
    const {root, desiredY} = labels[index]!;
    const label = `#${root.index} ${compactHeightState(root.heightState)} ${compactHeight(root.height)}`;
    const labelWidth = Math.min(
      track.trackWidth - 16,
      Math.ceil(context.measureText(label).width) + 8,
    );
    const labelX = track.trackX + track.trackWidth - labelWidth - 7;
    const labelY = labelYs[index]!;
    const color = palette[root.heightState];
    context.strokeStyle = color;
    context.lineWidth = root.id === inspectedId ? 1.5 : 1;
    context.beginPath();
    context.moveTo(track.trackX + track.trackWidth - 3, desiredY);
    context.lineTo(labelX + labelWidth, labelY + TRACK_LABEL_HEIGHT / 2);
    context.stroke();
    context.save();
    context.globalAlpha = 0.92;
    context.fillStyle = palette.labelBackground;
    context.fillRect(labelX, labelY, labelWidth, TRACK_LABEL_HEIGHT);
    context.restore();
    context.strokeRect(labelX + 0.5, labelY + 0.5, labelWidth - 1, TRACK_LABEL_HEIGHT - 1);
    context.fillStyle = root.id === inspectedId ? palette.selected : palette.labelText;
    context.fillText(label, labelX + 4, labelY + TRACK_LABEL_HEIGHT / 2 + 0.5);
  }
  context.restore();
}

function compactHeightState(state: VirtualDocumentHeightState): string {
  if (state === 'estimated') return '估';
  if (state === 'measured') return '实';
  return '旧';
}

function compactHeight(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}kpx`;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)}px`;
}

function summarizeVirtualDocument(
  snapshot: VirtualDocumentSnapshot | null,
): VirtualDocumentSummary {
  if (!snapshot) return EMPTY_SUMMARY;
  const summary = {...EMPTY_SUMMARY, roots: snapshot.roots.length};
  for (const root of snapshot.roots) {
    summary[root.heightState]++;
    if (root.viewState === 'unmounted') summary.unmounted++;
    else if (root.viewState === 'retained') summary.retained++;
    else if (root.viewState === 'mounted') summary.mounted++;
    else if (root.viewState === 'near') summary.near++;
    else if (root.viewState === 'sweep') summary.sweep++;
    else if (root.viewState === 'viewport') summary.viewport++;
  }
  return summary;
}

function readTrackPalette(canvas: HTMLCanvasElement): TrackPalette {
  const styles = getComputedStyle(canvas);
  const variable = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const active = variable('--bc-active-color', '#5b63f6');
  return {
    background: variable('--bc-bg-elevated', '#fff'),
    border: variable('--bc-border-color-light', '#e5e9f2'),
    unmounted: variable('--virtual-track-unmounted', 'rgba(135, 144, 163, 0.25)'),
    retained: variable('--virtual-track-retained', '#9271d4'),
    mounted: variable('--virtual-track-mounted', '#2c9db2'),
    near: variable('--virtual-track-near', '#18a779'),
    sweep: variable('--virtual-track-sweep', '#b04fc7'),
    viewport: variable('--virtual-track-viewport', active),
    estimated: variable('--virtual-height-estimated', '#a5adbb'),
    measured: variable('--virtual-height-measured', '#16865c'),
    stale: variable('--virtual-height-stale', '#e19a31'),
    viewportStroke: active,
    selected: variable('--bc-warning-color', '#f0a020'),
    labelText: variable('--bc-color-light', '#667085'),
    labelBackground: variable('--bc-bg-elevated', '#fff'),
  };
}
