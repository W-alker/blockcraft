import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";

/** 预设缩放比例档位（1 = 默认/正文大小）。 */
const FONT_SCALE_PRESETS = [0.5, 0.8, 1, 1.2, 1.5, 2] as const
const MIN_SCALE = 0.5
const MAX_SCALE = 3
const STEP = 0.1

/**
 * 字体相对缩放选择器：预设档位 + 步进。
 *
 * 纯展示组件：通过 `current` 回显当前比例，通过 `pick` 派发用户选定的比例
 * （`1` 表示恢复默认）。比例语义为相对所在块基准字号的倍数，由调用方写成
 * CSS `em`（如 `1.2` → `1.2em`）；步进每次 ±0.1（即 ±0.1em）。
 */
@Component({
  selector: 'bc-font-scale-picker',
  template: `
    <div class="bc-font-scale-picker">
      <div class="bc-font-scale-stepper">
        <button type="button" class="bc-font-scale-step" title="缩小 0.1"
                [disabled]="atMin" (click)="step(-1)">−</button>
        <span class="bc-font-scale-value">{{ displayValue }}×</span>
        <button type="button" class="bc-font-scale-step" title="放大 0.1"
                [disabled]="atMax" (click)="step(1)">+</button>
      </div>
      <div class="bc-font-scale-presets">
        @for (preset of presets; track preset) {
          <button type="button" class="bc-font-scale-preset"
                  [class.active]="isActive(preset)"
                  (click)="onPick(preset)">{{ label(preset) }}</button>
        }
      </div>
    </div>
  `,
  standalone: true,
  styles: [`
    :host {
      display: block;
    }

    .bc-font-scale-picker {
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      background: var(--bc-float-toolbar-bg);
      box-shadow: var(--bc-float-toolbar-shadow);
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: max-content;
    }

    .bc-font-scale-stepper {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .bc-font-scale-step {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      color: var(--bc-float-toolbar-item-color);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      transition: all var(--bc-transition-fast);
    }

    .bc-font-scale-step:hover:not(:disabled) {
      border-color: var(--bc-active-color);
    }

    .bc-font-scale-step:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .bc-font-scale-value {
      flex: 1;
      text-align: center;
      font-size: 13px;
      color: var(--bc-float-toolbar-item-color);
    }

    .bc-font-scale-presets {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }

    .bc-font-scale-preset {
      height: 28px;
      min-width: 52px;
      padding: 0 8px;
      border-radius: 6px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      color: var(--bc-float-toolbar-item-color);
      font-size: 12px;
      cursor: pointer;
      transition: all var(--bc-transition-fast);
    }

    .bc-font-scale-preset:hover {
      border-color: var(--bc-active-color);
    }

    .bc-font-scale-preset.active {
      border-color: var(--bc-active-color);
      background: var(--bc-float-toolbar-item-active-bg);
      color: var(--bc-active-color);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(mousedown)': 'onMouseDown($event)'
  }
})
export class BcFontScalePickerComponent {
  /** 当前生效的缩放比例（回显高亮 + 步进起点）。 */
  @Input()
  current = 1

  /** 用户选定一个比例时派发（1 表示恢复默认）。 */
  @Output()
  pick = new EventEmitter<number>()

  protected readonly presets = FONT_SCALE_PRESETS
  protected readonly min = MIN_SCALE
  protected readonly max = MAX_SCALE
  protected readonly stepSize = STEP

  protected get displayValue(): number {
    return this.round(this.clamp(this.current))
  }

  protected get atMin(): boolean {
    return this.round(this.current) <= this.min
  }

  protected get atMax(): boolean {
    return this.round(this.current) >= this.max
  }

  protected isActive(preset: number): boolean {
    return Math.abs(this.current - preset) < 1e-6
  }

  protected label(preset: number): string {
    return preset === 1 ? '默认' : `${preset}×`
  }

  protected onMouseDown(evt: MouseEvent): void {
    // 阻止点击夺走编辑器选区焦点（与工具栏其它 picker 的交互保持一致）。
    evt.preventDefault()
    evt.stopPropagation()
  }

  protected step(direction: 1 | -1): void {
    this.pick.emit(this.clamp(this.round(this.current + direction * this.stepSize)))
  }

  protected onPick(preset: number): void {
    this.pick.emit(preset)
  }

  private clamp(value: number): number {
    return Math.min(this.max, Math.max(this.min, value))
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100
  }
}
