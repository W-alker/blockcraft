import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BLOCK_OBJECT_PLANE_ALIGNMENT_OPTIONS,
  type BlockObjectLayout,
  type BlockObjectPlaneAlignment,
} from '../../framework'
import {
  normalizeShapeProps,
  type NormalizedShapeBlockProps,
  type ShapeKind,
  type ShapeStrokeStyle,
  type ShapeTextAlign,
  type ShapeVerticalAlign,
} from '../../blocks/shape-block'
import {
  CsButtonComponent,
  CsColorPickerComponent,
  CsTooltipDirective,
} from '@cses/ui'
import {
  INLINE_OBJECT_WRAP_LAYOUT_OPTION,
} from '../object-layout/inline-object-toolbar.component'
import {
  ShapeFillPanelComponent,
  type ShapeFillChange,
} from './shape-fill-panel.component'

export type ShapeObjectLayout = BlockObjectLayout | 'wrap'
export type ShapeToolbarPanel = 'layout' | 'style'
export type ShapeToolbarSide = 'left' | 'right'

export type ShapeToolbarAction =
  | {name: 'shape-type'; value: ShapeKind}
  /** @deprecated 纯色填充的旧动作，UI 已改发 fill-style；保留以兼容既有调用方。 */
  | {name: 'fill-color'; value: string}
  | {name: 'fill-style'; value: ShapeFillChange}
  | {name: 'fill-opacity'; value: number}
  | {name: 'stroke-color'; value: string}
  | {name: 'stroke-width'; value: number}
  | {name: 'stroke-style'; value: ShapeStrokeStyle}
  | {name: 'text-color'; value: string}
  | {name: 'text-align'; value: ShapeTextAlign}
  | {name: 'vertical-align'; value: ShapeVerticalAlign}
  | {name: 'object-layout'; value: ShapeObjectLayout}
  | {name: 'plane-align'; value: BlockObjectPlaneAlignment}
  | {name: 'move-forward'}
  | {name: 'move-backward'}
  | {name: 'delete'}

@Component({
  selector: 'bc-shape-toolbar',
  standalone: true,
  imports: [
    CsButtonComponent,
    CsColorPickerComponent,
    CsTooltipDirective,
    ShapeFillPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="shape-toolbar"
      [class.shape-toolbar--left]="side === 'left'"
      contenteditable="false"
      data-bc-shape-toolbar>
      <nav class="shape-toolbar__rail" aria-label="形状快捷工具">
        @if (!isGrouped) {
          <button
            cs-button
            csType="text"
            csSize="sm"
            type="button"
            class="shape-toolbar__rail-button"
            [class.active]="activePanel === 'layout'"
            [attr.aria-expanded]="activePanel === 'layout'"
            aria-controls="bc-shape-layout-panel"
            csTooltip="布局选项"
            [csTooltipPlacement]="tooltipPlacement"
            aria-label="布局选项"
            (click)="togglePanel('layout')">
            <i class="bc_icon bc_buju" aria-hidden="true"></i>
          </button>
        }

        <button
          cs-button
          csType="text"
          csSize="sm"
          type="button"
          class="shape-toolbar__rail-button"
          [class.active]="activePanel === 'style'"
          [attr.aria-expanded]="activePanel === 'style'"
          aria-controls="bc-shape-style-panel"
          csTooltip="形状样式"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="形状样式"
          (click)="togglePanel('style')">
          <i class="bc_icon bc_sepan" aria-hidden="true"></i>
        </button>

        <span class="shape-toolbar__rail-divider"></span>

        <button
          cs-button
          csType="text"
          csSize="sm"
          type="button"
          class="shape-toolbar__rail-button shape-toolbar__rail-button--danger"
          csTooltip="删除形状"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="删除形状"
          (click)="action.emit({name: 'delete'})">
          <i class="bc_icon bc_shanchu" aria-hidden="true"></i>
        </button>
      </nav>

      @if (!isGrouped && activePanel === 'layout') {
        <section
          id="bc-shape-layout-panel"
          class="shape-toolbar__panel"
          aria-label="布局选项">
          <header class="shape-toolbar__panel-header">
            <div>
              <strong>布局选项</strong>
              <span>控制形状与正文的关系</span>
            </div>
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              aria-label="关闭布局选项"
              (click)="closePanel()">
              <i class="bc_icon bc_guanbi" aria-hidden="true"></i>
            </button>
          </header>

          <div class="shape-toolbar__section-label">文字环绕</div>
          <div
            class="shape-toolbar__layout-grid"
            role="radiogroup"
            aria-label="文字环绕方式">
            @for (item of layoutOptions; track item.value) {
              <button
                cs-button
                csType="text"
                csSize="sm"
                type="button"
                role="radio"
                class="shape-toolbar__layout-option"
                [class.active]="objectLayout === item.value"
                [attr.aria-checked]="objectLayout === item.value"
                [attr.aria-label]="item.label"
                (click)="action.emit({name: 'object-layout', value: item.value})">
                <i [class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
                <span>{{ item.label }}</span>
              </button>
            }
          </div>

          @if (isAbsolute) {
            <div class="shape-toolbar__section-label">排列</div>
            <div class="shape-toolbar__stack-actions">
              <button
                cs-button
                csType="secondary"
                csSize="sm"
                type="button"
                [disabled]="!canMoveForward"
                (click)="action.emit({name: 'move-forward'})">
                <i class="bc_icon bc_cengji-shangyi" aria-hidden="true"></i>
                上移一层
              </button>
              <button
                cs-button
                csType="secondary"
                csSize="sm"
                type="button"
                [disabled]="!canMoveBackward"
                (click)="action.emit({name: 'move-backward'})">
                <i class="bc_icon bc_cengji-xiayi" aria-hidden="true"></i>
                下移一层
              </button>
            </div>

            <div class="shape-toolbar__section-label">页面对齐</div>
            <div
              class="shape-toolbar__plane-align-actions"
              role="group"
              aria-label="页面对齐">
              @for (item of planeAlignOptions; track item.value) {
                <button
                  cs-button
                  csType="secondary"
                  csSize="sm"
                  type="button"
                  class="shape-toolbar__plane-align-option"
                  [attr.aria-label]="item.label"
                  [disabled]="!canAlignToPlane"
                  (click)="selectPlaneAlign(item.value)">
                  <i [class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
                  {{ item.label }}
                </button>
              }
            </div>
          }
        </section>
      } @else if (activePanel === 'style') {
        <section
          id="bc-shape-style-panel"
          class="shape-toolbar__panel"
          aria-label="形状样式">
          <header class="shape-toolbar__panel-header">
            <div>
              <strong>形状样式</strong>
              <span>填充、透明度与轮廓</span>
            </div>
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              aria-label="关闭形状样式"
              (click)="closePanel()">
              <i class="bc_icon bc_guanbi" aria-hidden="true"></i>
            </button>
          </header>

          <div class="shape-toolbar__section-label">形状填充</div>
          <bc-shape-fill-panel
            [props]="shapeProps"
            (fillChange)="onFillChange($event)">
          </bc-shape-fill-panel>

          <label class="shape-toolbar__row shape-toolbar__range">
            <span class="shape-toolbar__row-label">透明度</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              aria-label="填充透明度"
              [value]="shapeBlock.props.fillOpacity"
              [style.--shape-range-progress]="fillOpacityProgress"
              (input)="syncRangeProgress($event)"
              (change)="emitNumber('fill-opacity', $event)">
            <output>{{ fillOpacityPercent }}</output>
          </label>

          <div class="shape-toolbar__section-label">轮廓</div>
          <div class="shape-toolbar__row">
            <span class="shape-toolbar__row-label">颜色</span>
            <cs-color-picker
              csMode="palette"
              csSize="sm"
              aria-label="轮廓颜色"
              [csValue]="shapeBlock.props.strokeColor"
              [csAllowClear]="false"
              [csShowText]="true"
              [csShowAlpha]="false"
              (csChangeComplete)="setStrokeColor($event.value)">
            </cs-color-picker>
          </div>
          <div class="shape-toolbar__row">
            <span class="shape-toolbar__row-label">粗细</span>
            <div
              class="shape-toolbar__option-row"
              role="radiogroup"
              aria-label="轮廓粗细">
              @for (item of strokeWidthOptions; track item.value) {
                <button
                  type="button"
                  role="radio"
                  class="shape-toolbar__option"
                  [class.active]="shapeBlock.props.strokeWidth === item.value"
                  [attr.aria-checked]="shapeBlock.props.strokeWidth === item.value"
                  (click)="setStrokeWidth(item.value)">
                  {{ item.label }}
                </button>
              }
            </div>
          </div>
          <div class="shape-toolbar__row">
            <span class="shape-toolbar__row-label">线型</span>
            <div
              class="shape-toolbar__option-row"
              role="radiogroup"
              aria-label="轮廓线型">
              <button
                type="button"
                role="radio"
                class="shape-toolbar__option"
                [class.active]="shapeBlock.props.strokeStyle !== 'dashed'"
                [attr.aria-checked]="shapeBlock.props.strokeStyle !== 'dashed'"
                (click)="setStrokeStyle('solid')">
                实线
              </button>
              <button
                type="button"
                role="radio"
                class="shape-toolbar__option"
                [class.active]="shapeBlock.props.strokeStyle === 'dashed'"
                [attr.aria-checked]="shapeBlock.props.strokeStyle === 'dashed'"
                (click)="setStrokeStyle('dashed')">
                虚线
              </button>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      max-width: calc(100vw - 16px);
    }

    .shape-toolbar {
      --shape-settings-panel-width: 288px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      box-sizing: border-box;
      width: max-content;
      max-width: 100%;
      color: var(--bc-float-toolbar-item-color, #1f2937);
      font-size: 12px;
    }

    .shape-toolbar--left {
      flex-direction: row-reverse;
    }

    .shape-toolbar__rail {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      box-sizing: border-box;
      width: 42px;
      padding: 5px;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      border-radius: 11px;
      background: var(--bc-float-toolbar-bg, #fff);
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 8px 24px rgba(15, 23, 42, .16));
    }

    .shape-toolbar__rail-button.cs-btn {
      width: 32px;
      min-width: 32px;
      height: 32px;
      padding: 0;
      color: inherit;
    }

    .shape-toolbar__rail-button .bc_icon {
      font-size: 16px;
    }

    .shape-toolbar__rail-button.active {
      background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
      color: var(--bc-active-color, #4857e2);
      box-shadow: inset 2px 0 0 var(--bc-active-color, #4857e2);
    }

    .shape-toolbar--left .shape-toolbar__rail-button.active {
      box-shadow: inset -2px 0 0 var(--bc-active-color, #4857e2);
    }

    .shape-toolbar__rail-button--danger:hover {
      background: var(--bc-error-background-color, #fef2f2);
      color: var(--bc-error-color, #dc2626);
    }

    .shape-toolbar__rail-divider {
      width: 24px;
      height: 1px;
      background: var(--bc-float-toolbar-divider-color, #e2e8f0);
    }

    .shape-toolbar__panel {
      box-sizing: border-box;
      width: min(var(--shape-settings-panel-width), calc(100vw - 86px));
      max-width: 100%;
      max-height: min(520px, calc(100vh - 24px));
      padding: 10px;
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      border-radius: 12px;
      background: var(--bc-float-toolbar-bg, #fff);
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 10px 28px rgba(15, 23, 42, .16));
    }

    .shape-toolbar__panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .shape-toolbar__panel-header strong,
    .shape-toolbar__panel-header span {
      display: block;
    }

    .shape-toolbar__panel-header strong {
      font-size: 13px;
      line-height: 18px;
    }

    .shape-toolbar__panel-header span {
      margin-top: 2px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      line-height: 16px;
    }

    .shape-toolbar__section-label {
      margin: 12px 0 7px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      font-weight: 600;
    }

    .shape-toolbar__layout-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .shape-toolbar__layout-option.cs-btn {
      display: flex;
      flex-direction: column;
      gap: 5px;
      height: 62px;
      padding: 6px;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      font-size: 10px;
    }

    .shape-toolbar__layout-option .bc_icon {
      font-size: 20px;
    }

    .shape-toolbar__layout-option.active {
      border-color: var(--bc-active-color, #4857e2);
      background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
      color: var(--bc-active-color, #4857e2);
    }

    .shape-toolbar__stack-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .shape-toolbar__stack-actions button {
      min-width: 0;
    }

    .shape-toolbar__stack-actions .bc_icon {
      margin-right: 4px;
    }

    .shape-toolbar__plane-align-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .shape-toolbar__plane-align-actions button {
      min-width: 0;
      padding: 0 4px;
      font-size: 11px;
    }

    .shape-toolbar__plane-align-actions .bc_icon {
      margin-right: 2px;
    }

    .shape-toolbar__row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .shape-toolbar__row-label {
      flex: none;
      width: 40px;
      color: var(--bc-color-secondary, #64748b);
    }

    .shape-toolbar__option-row {
      display: flex;
      flex: 1;
      gap: 4px;
      min-width: 0;
    }

    .shape-toolbar__option {
      flex: 1;
      min-width: 0;
      padding: 4px 0;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    .shape-toolbar__option:hover {
      background: var(--bc-bg-hover, #f1f5f9);
    }

    .shape-toolbar__option.active {
      border-color: var(--bc-active-color, #4857e2);
      background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
      color: var(--bc-active-color, #4857e2);
    }

    .shape-toolbar__range input {
      --shape-range-progress: 100%;
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      height: 16px;
      margin: 0;
      padding: 0;
      appearance: none;
      -webkit-appearance: none;
      border: 0;
      outline: 0;
      background: transparent;
      cursor: pointer;
    }

    .shape-toolbar__range output {
      flex: none;
      width: 34px;
      color: var(--bc-color-secondary, #64748b);
      text-align: right;
    }

    .shape-toolbar__range input::-webkit-slider-runnable-track {
      box-sizing: border-box;
      width: 100%;
      height: 4px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(
        to right,
        var(--bc-active-color, #4857e2) 0,
        var(--bc-active-color, #4857e2) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) 100%
      );
    }

    .shape-toolbar__range input::-moz-range-track {
      box-sizing: border-box;
      width: 100%;
      height: 4px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(
        to right,
        var(--bc-active-color, #4857e2) 0,
        var(--bc-active-color, #4857e2) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) 100%
      );
    }

    .shape-toolbar__range input::-moz-range-progress {
      height: 4px;
      border-radius: 999px;
      background: transparent;
    }

    .shape-toolbar__range input::-webkit-slider-thumb {
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      margin-top: -5px;
      appearance: none;
      -webkit-appearance: none;
      border: 2px solid var(--bc-active-color, #4857e2);
      border-radius: 50%;
      background: var(--bc-bg-primary, #fff);
      box-shadow: 0 1px 2px rgba(15, 23, 42, .16);
    }

    .shape-toolbar__range input::-moz-range-thumb {
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      border: 2px solid var(--bc-active-color, #4857e2);
      border-radius: 50%;
      background: var(--bc-bg-primary, #fff);
      box-shadow: 0 1px 2px rgba(15, 23, 42, .16);
    }
  `],
})
export class ShapeToolbarComponent {
  @Input({required: true})
  shapeBlock!: BlockCraft.IBlockComponents['shape']

  @Input()
  side: ShapeToolbarSide = 'right'

  @Output()
  readonly action = new EventEmitter<ShapeToolbarAction>()

  /** 仅面板开合的视觉尺寸变化；不改文档数据。 */
  @Output()
  readonly panelChange = new EventEmitter<ShapeToolbarPanel | null>()

  readonly layoutOptions = [
    BLOCK_OBJECT_LAYOUT_OPTIONS[0],
    INLINE_OBJECT_WRAP_LAYOUT_OPTION,
    ...BLOCK_OBJECT_LAYOUT_OPTIONS.slice(1),
  ] as const
  readonly strokeWidthOptions = [
    {value: 0, label: '无'},
    {value: 1, label: '1'},
    {value: 2, label: '2'},
    {value: 3, label: '3'},
    {value: 4, label: '4'},
    {value: 6, label: '6'},
  ]
  readonly planeAlignOptions = BLOCK_OBJECT_PLANE_ALIGNMENT_OPTIONS
  activePanel: ShapeToolbarPanel | null = null

  constructor(readonly cdr: ChangeDetectorRef) {}

  /** 本组件独立归一化，避免依赖 block 组件实例的私有 getter。 */
  get shapeProps(): NormalizedShapeBlockProps {
    return normalizeShapeProps(this.shapeBlock.props)
  }

  get tooltipPlacement(): 'left' | 'right' {
    return this.side === 'right' ? 'left' : 'right'
  }

  togglePanel(panel: ShapeToolbarPanel): void {
    this.activePanel = this.activePanel === panel ? null : panel
    this.panelChange.emit(this.activePanel)
  }

  closePanel(): void {
    this.activePanel = null
    this.panelChange.emit(null)
  }

  onFillChange(change: ShapeFillChange): void {
    this.action.emit({name: 'fill-style', value: change})
  }

  setStrokeColor(value: string | null): void {
    if (!value) return
    this.action.emit({name: 'stroke-color', value})
  }

  setStrokeWidth(value: number): void {
    if (!Number.isFinite(value)) return
    this.action.emit({name: 'stroke-width', value})
  }

  setStrokeStyle(value: ShapeStrokeStyle): void {
    if (value === this.shapeBlock.props.strokeStyle) return
    this.action.emit({name: 'stroke-style', value})
  }

  get objectLayout(): BlockObjectLayout {
    return this.shapeBlock.doc.placement.getObjectLayout(this.shapeBlock)
  }

  get isAbsolute(): boolean {
    return this.shapeBlock.doc.placement.getState(this.shapeBlock).mode ===
      'absolute'
  }

  get isGrouped(): boolean {
    return this.shapeBlock.doc.placement.isInObjectGroup?.(this.shapeBlock) ?? false
  }

  get canMoveForward(): boolean {
    return this.shapeBlock.doc.placement.canMoveForward(this.shapeBlock)
  }

  get canMoveBackward(): boolean {
    return this.shapeBlock.doc.placement.canMoveBackward(this.shapeBlock)
  }

  /** 页面对齐依赖已测量的 plane 宽度；未就绪时按钮禁用而非静默空点。 */
  get canAlignToPlane(): boolean {
    return this.shapeBlock.doc.placement.canAlignObjectsToPlane(
      [this.shapeBlock.id],
    )
  }

  get fillOpacityProgress(): string {
    const value = Number(this.shapeBlock.props.fillOpacity)
    const opacity = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 1
    return `${opacity * 100}%`
  }

  get fillOpacityPercent(): string {
    return `${Math.round(Number.parseFloat(this.fillOpacityProgress))}%`
  }

  syncRangeProgress(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null
    if (!input) return

    const min = Number(input.min)
    const max = Number(input.max)
    const value = Number(input.value)
    const range = max - min
    const progress = Number.isFinite(value) && range > 0
      ? Math.min(100, Math.max(0, ((value - min) / range) * 100))
      : 0
    input.style.setProperty('--shape-range-progress', `${progress}%`)
  }

  emitString(name: ShapeToolbarAction['name'], event: Event): void {
    const value = (event.target as HTMLInputElement).value
    this.action.emit({name, value} as ShapeToolbarAction)
  }

  emitNumber(name: ShapeToolbarAction['name'], event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    this.action.emit({name, value} as ShapeToolbarAction)
  }

  selectPlaneAlign(value: BlockObjectPlaneAlignment): void {
    this.action.emit({name: 'plane-align', value})
  }
}
