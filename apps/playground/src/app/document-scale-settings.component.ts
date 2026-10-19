import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  inject,
} from '@angular/core';
import {DocumentViewScaleManager} from '@ccc/blockcraft';
import {Subscription} from 'rxjs';

type ScaleMode = 'percent' | 'fit-width' | 'fit-page';

const SCALE_PRESETS = [50, 75, 100, 125, 150, 200] as const;
const VIEWPORT_GUTTER = 32;

/**
 * Playground 专用文档缩放调试面板。
 *
 * 它只负责宿主层能力：缩放 UI、适合宽度/整页计算，以及缩放面在固定滚动
 * 视口中的居中。缩放状态仍由 DocumentViewScaleManager 统一持有。
 */
@Component({
  selector: 'bc-document-scale-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (collapsed) {
      <button
        type="button"
        class="scale-launcher"
        title="展开文档缩放调试"
        (click)="collapsed = false">
        <span class="scale-launcher__icon">⌕</span>
        {{ percent }}%
      </button>
    } @else {
      <section class="scale-panel" aria-label="文档缩放调试">
        <header class="scale-titlebar">
          <div>
            <strong>文档缩放</strong>
            <span>{{ modeLabel }}</span>
          </div>
          <button type="button" class="icon-button" title="收起" (click)="collapsed = true">×</button>
        </header>

        <div class="scale-main-row">
          <button
            type="button"
            class="step-button"
            title="缩小 10%"
            [disabled]="percent <= minPercent"
            (click)="zoomOut()">−</button>
          <input
            class="scale-range"
            type="range"
            [min]="minPercent"
            [max]="maxPercent"
            step="10"
            [value]="percent"
            aria-label="文档缩放百分比"
            (input)="onRangeInput($event)" />
          <button
            type="button"
            class="step-button"
            title="放大 10%"
            [disabled]="percent >= maxPercent"
            (click)="zoomIn()">＋</button>
          <button type="button" class="percent-button" title="恢复 100%" (click)="setPercent(100)">
            {{ percent }}%
          </button>
        </div>

        <div class="scale-modes" role="group" aria-label="自适应缩放模式">
          <button
            type="button"
            [class.active]="mode === 'fit-width'"
            (click)="setFitMode('fit-width')">
            适合宽度
          </button>
          <button
            type="button"
            [class.active]="mode === 'fit-page'"
            (click)="setFitMode('fit-page')">
            整页
          </button>
        </div>

        <div class="scale-presets" aria-label="缩放预设">
          @for (preset of presets; track preset) {
            <button
              type="button"
              [class.active]="mode === 'percent' && percent === preset"
              (click)="setPercent(preset)">
              {{ preset }}%
            </button>
          }
        </div>

        <p class="scale-hint">Ctrl/Cmd + 滚轮也会按 10% 调整；缩放不写入文档数据。</p>
      </section>
    }
  `,
  styles: [`
    :host {
      position: fixed;
      right: 24px;
      bottom: 20px;
      z-index: 120;
      display: block;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #172033;
    }

    button,
    input {
      font: inherit;
    }

    button {
      appearance: none;
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: .42;
    }

    .scale-launcher {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 38px;
      padding: 0 13px;
      border: 1px solid rgba(15, 23, 42, .12);
      border-radius: 12px;
      background: #fff;
      color: #334155;
      font-weight: 700;
      box-shadow: 0 12px 30px rgba(15, 23, 42, .18);
    }

    .scale-launcher__icon {
      font-size: 18px;
      line-height: 1;
      transform: rotate(-18deg);
    }

    .scale-panel {
      width: 320px;
      box-sizing: border-box;
      padding: 14px;
      border: 1px solid rgba(15, 23, 42, .11);
      border-radius: 16px;
      background: rgba(255, 255, 255, .96);
      box-shadow: 0 18px 48px rgba(15, 23, 42, .2);
      backdrop-filter: blur(18px);
    }

    .scale-titlebar,
    .scale-main-row {
      display: flex;
      align-items: center;
    }

    .scale-titlebar {
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 13px;
    }

    .scale-titlebar > div {
      display: flex;
      align-items: baseline;
      gap: 9px;
    }

    .scale-titlebar strong {
      font-size: 14px;
    }

    .scale-titlebar span,
    .scale-hint {
      color: #7c879b;
      font-size: 11px;
    }

    .icon-button,
    .step-button,
    .percent-button,
    .scale-modes button,
    .scale-presets button {
      border: 1px solid rgba(15, 23, 42, .12);
      background: #f8fafc;
      color: #334155;
    }

    .icon-button {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      font-size: 18px;
    }

    .icon-button:hover,
    .step-button:hover,
    .percent-button:hover,
    .scale-modes button:hover,
    .scale-presets button:hover {
      border-color: rgba(72, 87, 226, .46);
      background: #eef0ff;
      color: #4857e2;
    }

    .scale-main-row {
      gap: 8px;
    }

    .step-button {
      flex: 0 0 32px;
      height: 32px;
      border-radius: 9px;
      font-size: 18px;
      line-height: 1;
    }

    .scale-range {
      min-width: 0;
      flex: 1;
      accent-color: #4857e2;
    }

    .percent-button {
      min-width: 58px;
      height: 32px;
      padding: 0 8px;
      border-radius: 9px;
      font-weight: 700;
    }

    .scale-modes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      margin-top: 12px;
    }

    .scale-modes button {
      height: 32px;
      border-radius: 9px;
      font-weight: 650;
    }

    .scale-presets {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 5px;
      margin-top: 9px;
    }

    .scale-presets button {
      min-width: 0;
      height: 27px;
      padding: 0 2px;
      border-radius: 7px;
      font-size: 10px;
    }

    .scale-modes button.active,
    .scale-presets button.active {
      border-color: #4857e2;
      background: #4857e2;
      color: #fff;
    }

    .scale-hint {
      margin: 10px 0 0;
    }
  `],
})
export class DocumentScaleSettingsComponent implements OnChanges, OnDestroy {
  @Input({required: true}) manager!: DocumentViewScaleManager;
  @Input({required: true}) viewport!: HTMLElement;
  @Input({required: true}) stage!: HTMLElement;
  @Input({required: true}) surface!: HTMLElement;

  readonly presets = SCALE_PRESETS;
  collapsed = false;
  mode: ScaleMode = 'percent';
  percent = 100;

  private readonly cdr = inject(ChangeDetectorRef);
  private scaleSubscription: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private detachScale: (() => void) | null = null;
  private frameId = 0;
  private boundManager: DocumentViewScaleManager | null = null;
  private baseSurfaceWidth = 0;

  get minPercent(): number {
    return Math.round(this.manager.min * 100);
  }

  get maxPercent(): number {
    return Math.round(this.manager.max * 100);
  }

  get modeLabel(): string {
    if (this.mode === 'fit-width') return '适合宽度';
    if (this.mode === 'fit-page') return '整页';
    return '自定义比例';
  }

  ngOnChanges(): void {
    this.bind();
  }

  ngOnDestroy(): void {
    this.release();
  }

  zoomIn(): void {
    this.mode = 'percent';
    this.manager.zoomIn();
  }

  zoomOut(): void {
    this.mode = 'percent';
    this.manager.zoomOut();
  }

  setPercent(percent: number): void {
    this.mode = 'percent';
    this.manager.setScale(percent / 100);
  }

  onRangeInput(event: Event): void {
    this.setPercent(Number((event.target as HTMLInputElement).value));
  }

  setFitMode(mode: Exclude<ScaleMode, 'percent'>): void {
    this.mode = mode;
    this.scheduleLayout(true);
  }

  private bind(): void {
    if (!this.manager || !this.viewport || !this.stage || !this.surface) return;

    this.release();
    this.boundManager = this.manager;
    this.baseSurfaceWidth = Math.max(1, this.viewport.clientWidth);
    this.detachScale = this.manager.attach(this.surface, {wheel: true});
    this.scaleSubscription = this.manager.change$.subscribe(change => {
      this.percent = Math.round(change.scale * 100);
      if (change.source === 'wheel') this.mode = 'percent';
      this.scheduleLayout(false);
      this.cdr.markForCheck();
    });

    const ResizeObserverCtor = this.viewport.ownerDocument.defaultView?.ResizeObserver;
    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(() => {
        this.baseSurfaceWidth = Math.max(1, this.viewport.clientWidth);
        this.scheduleLayout(this.mode !== 'percent');
      });
      this.resizeObserver.observe(this.viewport);
    }
    this.scheduleLayout(false);
  }

  private release(): void {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.scaleSubscription?.unsubscribe();
    this.scaleSubscription = null;
    this.detachScale?.();
    this.detachScale = null;
    this.boundManager = null;
  }

  private scheduleLayout(recalculateFit: boolean): void {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = requestAnimationFrame(() => {
      this.frameId = 0;
      if (this.boundManager !== this.manager) return;
      if (recalculateFit && this.mode !== 'percent') this.applyFitScale();
      this.layoutScaleSurface();
    });
  }

  private applyFitScale(): void {
    const target = this.resolveFitTarget();
    if (!target.width || !target.height) return;

    const availableWidth = Math.max(1, this.viewport.clientWidth - VIEWPORT_GUTTER);
    const availableHeight = Math.max(1, this.viewport.clientHeight - VIEWPORT_GUTTER);
    const widthScale = availableWidth / target.width;
    const scale = this.mode === 'fit-page'
      ? Math.min(widthScale, availableHeight / target.height)
      : widthScale;
    this.manager.setScale(scale);
  }

  private resolveFitTarget(): {width: number; height: number} {
    const page = this.surface.querySelector<HTMLElement>('.bc-page-sheet');
    if (page) {
      return {width: page.offsetWidth, height: page.offsetHeight};
    }

    const root = this.surface.querySelector<HTMLElement>('[data-blockcraft-root="true"]');
    if (root) {
      return {width: root.offsetWidth, height: root.scrollHeight};
    }
    return {width: this.baseSurfaceWidth, height: this.surface.scrollHeight};
  }

  /** 保持外层滚动视口不缩放，并让缩小后的文档面仍位于视口中央。 */
  private layoutScaleSurface(): void {
    const scale = Math.max(.0001, this.manager.value);
    const viewportWidth = Math.max(1, this.viewport.clientWidth);
    const viewportHeight = Math.max(1, this.viewport.clientHeight);
    const baseWidth = Math.max(1, this.baseSurfaceWidth || viewportWidth);
    const visualWidth = baseWidth * scale;

    this.surface.style.width = `${baseWidth}px`;
    this.surface.style.minHeight = `${viewportHeight / scale}px`;
    this.surface.style.marginLeft = `${Math.max(0, viewportWidth - visualWidth) / (2 * scale)}px`;
    this.stage.style.width = `${Math.max(viewportWidth, visualWidth)}px`;
    this.stage.style.minHeight = `${viewportHeight}px`;
  }
}
