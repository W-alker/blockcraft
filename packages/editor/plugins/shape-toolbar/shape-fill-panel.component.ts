import {FormsModule} from '@angular/forms'
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {
  CsColorPickerComponent,
  CsInputNumberComponent,
  CsSegmentedComponent,
  CsTooltipDirective,
  type CsSegmentedOptions,
} from '@cses/ui'
import {
  DEFAULT_SHAPE_GRADIENT,
  resolveShapeFillGradient,
  shapeGradientToCss,
  SHAPE_FILL_GRADIENT_PRESETS,
  type NormalizedShapeBlockProps,
  type ShapeFillGradientPreset,
  type ShapeGradientFill,
} from '../../blocks/shape-block'

/** 一次填充变更的完整值对象；插件端用一次 updateProps 原子写入。 */
export type ShapeFillChange =
  | {fillType: 'solid'; fillColor: string}
  | {
      fillType: 'linear-gradient'
      gradientAngle: number
      gradientColors: string[]
      gradientStops: number[]
    }

@Component({
  selector: 'bc-shape-fill-panel',
  standalone: true,
  imports: [
    FormsModule,
    CsColorPickerComponent,
    CsInputNumberComponent,
    CsSegmentedComponent,
    CsTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="shape-fill-panel" aria-label="形状填充">
      <cs-segmented
        csSize="small"
        [csBlock]="true"
        [csOptions]="fillTypeOptions"
        [ngModel]="props.fillType"
        (ngModelChange)="setFillType($event)"
        csAriaLabel="形状填充类型">
      </cs-segmented>

      @if (props.fillType === 'solid') {
        <div class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">颜色</span>
          <cs-color-picker
            csMode="palette"
            csSize="sm"
            [csValue]="props.fillColor"
            [csAllowClear]="false"
            [csShowText]="true"
            [csShowAlpha]="false"
            (csChangeComplete)="setSolidColor($event.value)">
          </cs-color-picker>
        </div>
      } @else {
        <div
          class="shape-fill-panel__presets"
          role="listbox"
          aria-label="内置渐变">
          @for (preset of presets; track preset.id) {
            <button
              type="button"
              role="option"
              class="shape-fill-panel__preset"
              [class.active]="isPresetActive(preset)"
              [attr.aria-selected]="isPresetActive(preset)"
              [attr.aria-label]="preset.label"
              [csTooltip]="preset.label"
              [style.background]="presetCss(preset)"
              (click)="applyPreset(preset)">
            </button>
          }
        </div>

        <div class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">起始颜色</span>
          <cs-color-picker
            csMode="palette"
            csSize="sm"
            [csValue]="gradientStart"
            [csAllowClear]="false"
            [csShowText]="true"
            [csShowAlpha]="false"
            (csChangeComplete)="setGradientEdgeColor('start', $event.value)">
          </cs-color-picker>
        </div>
        <div class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">结束颜色</span>
          <cs-color-picker
            csMode="palette"
            csSize="sm"
            [csValue]="gradientEnd"
            [csAllowClear]="false"
            [csShowText]="true"
            [csShowAlpha]="false"
            (csChangeComplete)="setGradientEdgeColor('end', $event.value)">
          </cs-color-picker>
        </div>
        <label class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">渐变角度</span>
          <cs-input-number
            csSize="sm"
            [csMin]="0"
            [csMax]="360"
            [csStep]="15"
            [csValue]="gradient.angle"
            (csValueChange)="setGradientAngle($event)">
          </cs-input-number>
          <span class="shape-fill-panel__unit">°</span>
        </label>
      }
    </section>
  `,
  styles: [`
    /* 内嵌片段：外壳（宽度/边框/阴影）由宿主面板提供。 */
    .shape-fill-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
      color: var(--bc-color, #1f2937);
      font-size: 12px;
    }

    .shape-fill-panel__row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .shape-fill-panel__label {
      flex: none;
      width: 52px;
      color: var(--bc-color-secondary, #64748b);
    }

    .shape-fill-panel__unit {
      color: var(--bc-color-secondary, #64748b);
    }

    .shape-fill-panel__presets {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
    }

    .shape-fill-panel__preset {
      box-sizing: border-box;
      aspect-ratio: 1;
      padding: 0;
      border: 1px solid var(--bc-border-color, #e2e8f0);
      border-radius: 6px;
      cursor: pointer;
    }

    .shape-fill-panel__preset:hover {
      border-color: var(--bc-active-color, #4857e2);
    }

    .shape-fill-panel__preset.active {
      border-color: var(--bc-active-color, #4857e2);
      box-shadow:
        0 0 0 2px var(--bc-active-color-lighter, rgba(72, 87, 226, .18));
    }
  `],
})
export class ShapeFillPanelComponent {
  @Input({required: true})
  props!: NormalizedShapeBlockProps

  @Output()
  readonly fillChange = new EventEmitter<ShapeFillChange>()

  readonly presets = SHAPE_FILL_GRADIENT_PRESETS
  readonly fillTypeOptions: CsSegmentedOptions = [
    {value: 'solid', label: '纯色'},
    {value: 'linear-gradient', label: '渐变'},
  ]

  /** 当前渐变值；纯色时回退到已存配置或默认渐变，供切换预览。 */
  get gradient(): ShapeGradientFill {
    return resolveShapeFillGradient(this.props) ?? {
      angle: this.props.gradientAngle ?? DEFAULT_SHAPE_GRADIENT.angle,
      colors: this.props.gradientColors ?? [...DEFAULT_SHAPE_GRADIENT.colors],
      stops: this.props.gradientStops ?? [...DEFAULT_SHAPE_GRADIENT.stops],
    }
  }

  get gradientStart(): string {
    return this.gradient.colors[0]
  }

  get gradientEnd(): string {
    const colors = this.gradient.colors
    return colors[colors.length - 1]
  }

  presetCss(preset: ShapeFillGradientPreset): string {
    return shapeGradientToCss(preset)
  }

  isPresetActive(preset: ShapeFillGradientPreset): boolean {
    const current = this.gradient
    return current.angle === preset.angle &&
      current.colors.length === preset.colors.length &&
      current.colors.every((color, index) => color === preset.colors[index]) &&
      current.stops.every((stop, index) => stop === preset.stops[index])
  }

  setFillType(value: unknown): void {
    if (value !== 'solid' && value !== 'linear-gradient') return
    if (value === this.props.fillType) return
    if (value === 'solid') {
      this.fillChange.emit({fillType: 'solid', fillColor: this.props.fillColor})
      return
    }
    this.emitGradient(this.gradient)
  }

  setSolidColor(value: string | null): void {
    if (!value) return
    this.fillChange.emit({fillType: 'solid', fillColor: value})
  }

  applyPreset(preset: ShapeFillGradientPreset): void {
    this.emitGradient(preset)
  }

  setGradientEdgeColor(edge: 'start' | 'end', value: string | null): void {
    if (!value) return
    const current = this.gradient
    const colors = [...current.colors]
    colors[edge === 'start' ? 0 : colors.length - 1] = value
    this.emitGradient({...current, colors})
  }

  setGradientAngle(value: number | null): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    this.emitGradient({...this.gradient, angle: value})
  }

  private emitGradient(gradient: ShapeGradientFill): void {
    this.fillChange.emit({
      fillType: 'linear-gradient',
      gradientAngle: gradient.angle,
      gradientColors: [...gradient.colors],
      gradientStops: [...gradient.stops],
    })
  }
}
