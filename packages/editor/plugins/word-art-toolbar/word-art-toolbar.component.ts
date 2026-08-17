import {FormsModule} from '@angular/forms'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {
  CsButtonComponent,
  CsColorPickerComponent,
  CsInputNumberComponent,
  CsOptionComponent,
  CsSegmentedComponent,
  CsSelectComponent,
  CsSliderComponent,
  CsSwitchComponent,
  CsTooltipDirective,
  type CsSegmentedOptions,
  type CsSliderValue,
} from '@cses/ui'
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  type BlockObjectLayout,
} from '../../framework'
import {
  type WordArtBlockProps,
  type WordArtEffect,
  type WordArtFillType,
  type WordArtFontId,
  type WordArtHorizontalAlign,
  type WordArtVerticalAlign,
  WORD_ART_FONT_OPTIONS,
} from '../../blocks/word-art-block'
import {INLINE_OBJECT_WRAP_LAYOUT_OPTION} from '../object-layout/inline-object-toolbar.component'

export type WordArtObjectLayout = BlockObjectLayout | 'wrap'
export type WordArtToolbarPanel = 'layout' | 'format'
export type WordArtToolbarSide = 'left' | 'right'
export type WordArtFormatSection = 'font' | 'fill' | 'effects'

export type WordArtToolbarAction =
  | {name: 'update-props'; value: Partial<WordArtBlockProps>}
  | {name: 'object-layout'; value: WordArtObjectLayout}
  | {name: 'move-forward'}
  | {name: 'move-backward'}
  | {name: 'delete'}

@Component({
  selector: 'bc-word-art-toolbar',
  standalone: true,
  imports: [
    FormsModule,
    CsButtonComponent,
    CsColorPickerComponent,
    CsInputNumberComponent,
    CsOptionComponent,
    CsSegmentedComponent,
    CsSelectComponent,
    CsSliderComponent,
    CsSwitchComponent,
    CsTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="word-art-toolbar"
      [class.word-art-toolbar--left]="side === 'left'"
      contenteditable="false"
      data-bc-word-art-toolbar>
      <nav class="word-art-toolbar__rail" aria-label="艺术字快捷工具">
        @if (!isGrouped) {
          <button
            cs-button
            csType="text"
            csSize="sm"
            type="button"
            class="word-art-toolbar__rail-button"
            [class.active]="activePanel === 'layout'"
            [attr.aria-expanded]="activePanel === 'layout'"
            aria-controls="bc-word-art-layout-panel"
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
          class="word-art-toolbar__rail-button"
          [class.active]="activePanel === 'format'"
          [attr.aria-expanded]="activePanel === 'format'"
          aria-controls="bc-word-art-format-panel"
          csTooltip="艺术字格式"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="艺术字格式"
          (click)="togglePanel('format')">
          <i class="bc_icon bc_yishuzishengcheng" aria-hidden="true"></i>
        </button>

        <span class="word-art-toolbar__rail-divider"></span>

        <button
          cs-button
          csType="text"
          csSize="sm"
          type="button"
          class="word-art-toolbar__rail-button word-art-toolbar__rail-button--danger"
          csTooltip="删除艺术字"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="删除艺术字"
          (click)="action.emit({name: 'delete'})">
          <i class="bc_icon bc_shanchu" aria-hidden="true"></i>
        </button>
      </nav>

      @if (!isGrouped && activePanel === 'layout') {
        <section
          id="bc-word-art-layout-panel"
          class="word-art-toolbar__panel"
          aria-label="布局选项">
          <header class="word-art-toolbar__panel-header">
            <div>
              <strong>布局选项</strong>
              <span>控制艺术字与正文的关系</span>
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

          <div class="word-art-toolbar__section-label">文字环绕</div>
          <div
            class="word-art-toolbar__layout-grid"
            role="radiogroup"
            aria-label="文字环绕方式">
            @for (item of layoutOptions; track item.value) {
              <button
                cs-button
                csType="text"
                csSize="sm"
                type="button"
                role="radio"
                class="word-art-toolbar__layout-option"
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
            <div class="word-art-toolbar__section-label">排列</div>
            <div class="word-art-toolbar__stack-actions">
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
          }
        </section>
      } @else if (activePanel === 'format') {
        <section
          id="bc-word-art-format-panel"
          class="word-art-toolbar__panel word-art-toolbar__format-panel"
          aria-label="艺术字格式">
          <header class="word-art-toolbar__panel-header">
            <div>
              <strong>艺术字格式</strong>
              <span>调整整段艺术字的字体与视觉效果</span>
            </div>
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              aria-label="关闭艺术字格式"
              (click)="closePanel()">
              <i class="bc_icon bc_guanbi" aria-hidden="true"></i>
            </button>
          </header>

          <cs-segmented
            class="word-art-toolbar__tabs"
            csSize="small"
            [csBlock]="true"
            [csOptions]="sectionOptions"
            [ngModel]="activeSection"
            (ngModelChange)="setFormatSection($event)"
            csAriaLabel="艺术字格式分类">
          </cs-segmented>

          @if (activeSection === 'font') {
            <div class="word-art-toolbar__form">
              <label class="word-art-toolbar__row word-art-toolbar__row--stacked">
                <span class="word-art-toolbar__label">字体</span>
                <cs-select
                  csSize="sm"
                  csVariant="outlined"
                  aria-label="艺术字字体"
                  [csValue]="props.fontFamily"
                  (csValueChange)="setFontFamily($event)">
                  @for (font of fontFamilies; track font.id) {
                    <cs-option [csValue]="font.id" [csLabel]="font.label">
                    </cs-option>
                  }
                </cs-select>
              </label>

              <div class="word-art-toolbar__row">
                <span class="word-art-toolbar__label">字号</span>
                <cs-input-number
                  csSize="sm"
                  [csMin]="8"
                  [csMax]="512"
                  [csStep]="1"
                  [csValue]="props.fontSize"
                  (csValueChange)="setFontSize($event)">
                </cs-input-number>
                <span class="word-art-toolbar__unit">px</span>
              </div>

              <div class="word-art-toolbar__row word-art-toolbar__row--stacked">
                <span class="word-art-toolbar__label">水平对齐</span>
                <cs-segmented
                  csSize="small"
                  [csBlock]="true"
                  [csOptions]="horizontalAlignOptions"
                  [ngModel]="props.horizontalAlign"
                  (ngModelChange)="setHorizontalAlign($event)"
                  csAriaLabel="艺术字水平对齐">
                </cs-segmented>
              </div>

              <div class="word-art-toolbar__row word-art-toolbar__row--stacked">
                <span class="word-art-toolbar__label">垂直对齐</span>
                <cs-segmented
                  csSize="small"
                  [csBlock]="true"
                  [csOptions]="verticalAlignOptions"
                  [ngModel]="props.verticalAlign"
                  (ngModelChange)="setVerticalAlign($event)"
                  csAriaLabel="艺术字垂直对齐">
                </cs-segmented>
              </div>

              <div class="word-art-toolbar__row word-art-toolbar__row--range">
                <span class="word-art-toolbar__label">字间距</span>
                <cs-slider
                  [csMin]="-0.2"
                  [csMax]="1"
                  [csStep]="0.02"
                  csAriaLabel="艺术字字间距"
                  [csValue]="letterSpacingValue"
                  (csValueChange)="draftLetterSpacing($event)"
                  (pointerup)="commitLetterSpacing()"
                  (keyup)="commitLetterSpacing()"
                  (blur)="commitLetterSpacing()">
                </cs-slider>
                <output>{{ letterSpacingValue.toFixed(2) }}em</output>
              </div>
            </div>
          } @else if (activeSection === 'fill') {
            <div class="word-art-toolbar__form">
              <div class="word-art-toolbar__row word-art-toolbar__row--stacked">
                <span class="word-art-toolbar__label">文字填充</span>
                <cs-segmented
                  csSize="small"
                  [csBlock]="true"
                  [csOptions]="fillTypeOptions"
                  [ngModel]="props.fillType"
                  (ngModelChange)="setFillType($event)"
                  csAriaLabel="艺术字填充类型">
                </cs-segmented>
              </div>

              @if (props.fillType === 'solid') {
                <div class="word-art-toolbar__row">
                  <span class="word-art-toolbar__label">填充颜色</span>
                  <cs-color-picker
                    csMode="palette"
                    csSize="sm"
                    [csValue]="props.fillColor"
                    [csAllowClear]="false"
                    [csShowText]="true"
                    [csShowAlpha]="false"
                    (csChangeComplete)="setFillColor($event.value)">
                  </cs-color-picker>
                </div>
              } @else {
                @for (color of props.gradientColors; track $index) {
                  <div class="word-art-toolbar__row">
                    <span class="word-art-toolbar__label">渐变色 {{ $index + 1 }}</span>
                    <cs-color-picker
                      csMode="palette"
                      csSize="sm"
                      [csValue]="color"
                      [csAllowClear]="false"
                      [csShowText]="true"
                      [csShowAlpha]="false"
                      (csChangeComplete)="setGradientColor($index, $event.value)">
                    </cs-color-picker>
                  </div>
                }
                <div class="word-art-toolbar__row">
                  <span class="word-art-toolbar__label">渐变角度</span>
                  <cs-input-number
                    csSize="sm"
                    [csMin]="0"
                    [csMax]="360"
                    [csStep]="15"
                    [csValue]="props.gradientAngle"
                    (csValueChange)="setGradientAngle($event)">
                  </cs-input-number>
                  <span class="word-art-toolbar__unit">°</span>
                </div>
              }

              <div class="word-art-toolbar__subsection">
                <div class="word-art-toolbar__row">
                  <span class="word-art-toolbar__label">轮廓颜色</span>
                  <cs-color-picker
                    csMode="palette"
                    csSize="sm"
                    [csValue]="props.outlineColor"
                    [csAllowClear]="false"
                    [csShowText]="true"
                    [csShowAlpha]="false"
                    (csChangeComplete)="setOutlineColor($event.value)">
                  </cs-color-picker>
                </div>
                <div class="word-art-toolbar__row word-art-toolbar__row--range">
                  <span class="word-art-toolbar__label">轮廓宽度</span>
                  <cs-slider
                    [csMin]="0"
                    [csMax]="0.2"
                    [csStep]="0.01"
                    csAriaLabel="艺术字轮廓宽度"
                    [csValue]="outlineWidthValue"
                    (csValueChange)="draftOutlineWidth($event)"
                    (pointerup)="commitOutlineWidth()"
                    (keyup)="commitOutlineWidth()"
                    (blur)="commitOutlineWidth()">
                  </cs-slider>
                  <output>{{ outlineWidthValue.toFixed(2) }}em</output>
                </div>
              </div>
            </div>
          } @else {
            <div class="word-art-toolbar__form">
              <label class="word-art-toolbar__row word-art-toolbar__row--stacked">
                <span class="word-art-toolbar__label">文字转换</span>
                <cs-select
                  csSize="sm"
                  csVariant="outlined"
                  aria-label="艺术字效果"
                  [csValue]="props.effect"
                  (csValueChange)="setEffect($event)">
                  @for (effect of effects; track effect.value) {
                    <cs-option [csValue]="effect.value" [csLabel]="effect.label">
                    </cs-option>
                  }
                </cs-select>
              </label>

              <div class="word-art-toolbar__row">
                <span class="word-art-toolbar__label">
                  <i class="bc_icon bc_wenziyinying" aria-hidden="true"></i>
                  投影
                </span>
                <cs-switch
                  csSize="sm"
                  [csChecked]="props.shadowEnabled"
                  (csCheckedChange)="setShadowEnabled($event)">
                </cs-switch>
                <span class="word-art-toolbar__hint">
                  {{ props.shadowEnabled ? '已开启' : '已关闭' }}
                </span>
              </div>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      max-width: calc(100vw - 16px);
    }

    .word-art-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      width: max-content;
      max-width: 100%;
      color: var(--bc-float-toolbar-item-color, #1f2937);
      font-size: 12px;
    }

    .word-art-toolbar--left {
      flex-direction: row-reverse;
    }

    .word-art-toolbar__rail {
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

    .word-art-toolbar__rail-button.cs-btn {
      width: 32px;
      min-width: 32px;
      height: 32px;
      padding: 0;
      color: inherit;
    }

    .word-art-toolbar__rail-button .bc_icon {
      font-size: 16px;
    }

    .word-art-toolbar__rail-button.active {
      background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
      color: var(--bc-active-color, #4857e2);
      box-shadow: inset 2px 0 0 var(--bc-active-color, #4857e2);
    }

    .word-art-toolbar--left .word-art-toolbar__rail-button.active {
      box-shadow: inset -2px 0 0 var(--bc-active-color, #4857e2);
    }

    .word-art-toolbar__rail-button--danger:hover {
      background: var(--bc-error-background-color, #fef2f2);
      color: var(--bc-error-color, #dc2626);
    }

    .word-art-toolbar__rail-divider {
      width: 24px;
      height: 1px;
      background: var(--bc-float-toolbar-divider-color, #e2e8f0);
    }

    .word-art-toolbar__panel {
      box-sizing: border-box;
      width: min(288px, calc(100vw - 86px));
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

    .word-art-toolbar__panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .word-art-toolbar__panel-header strong,
    .word-art-toolbar__panel-header span {
      display: block;
    }

    .word-art-toolbar__panel-header strong {
      font-size: 13px;
      line-height: 18px;
    }

    .word-art-toolbar__panel-header span {
      margin-top: 2px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      line-height: 16px;
    }

    .word-art-toolbar__section-label {
      margin: 12px 0 7px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      font-weight: 600;
    }

    .word-art-toolbar__layout-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .word-art-toolbar__layout-option.cs-btn {
      display: flex;
      flex-direction: column;
      gap: 5px;
      height: 62px;
      padding: 6px;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      font-size: 10px;
    }

    .word-art-toolbar__layout-option .bc_icon {
      font-size: 20px;
    }

    .word-art-toolbar__layout-option.active {
      border-color: var(--bc-active-color, #4857e2);
      background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
      color: var(--bc-active-color, #4857e2);
    }

    .word-art-toolbar__stack-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .word-art-toolbar__stack-actions button {
      min-width: 0;
    }

    .word-art-toolbar__stack-actions .bc_icon {
      margin-right: 4px;
    }

    .word-art-toolbar__tabs {
      display: block;
    }

    .word-art-toolbar__form {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }

    .word-art-toolbar__row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
    }

    .word-art-toolbar__row--stacked {
      align-items: stretch;
      flex-direction: column;
      gap: 4px;
    }

    .word-art-toolbar__row--range cs-slider {
      flex: 1 1 auto;
      min-width: 0;
    }

    .word-art-toolbar__row output {
      min-width: 44px;
      color: var(--bc-color-secondary, #64748b);
      text-align: right;
    }

    .word-art-toolbar__label {
      flex: 0 0 66px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      font-weight: 500;
    }

    .word-art-toolbar__row--stacked .word-art-toolbar__label {
      flex-basis: auto;
    }

    .word-art-toolbar__row cs-select,
    .word-art-toolbar__row cs-color-picker,
    .word-art-toolbar__row cs-input-number {
      flex: 1 1 auto;
      min-width: 0;
    }

    .word-art-toolbar__unit {
      color: var(--bc-color-secondary, #64748b);
    }

    .word-art-toolbar__label .bc_icon {
      margin-right: 4px;
    }

    .word-art-toolbar__hint {
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
    }

    .word-art-toolbar__subsection {
      display: grid;
      gap: 8px;
      margin-top: 2px;
      padding-top: 8px;
      border-top: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
    }

  `],
})
export class WordArtToolbarComponent {
  @Input({required: true})
  wordArtBlock!: BlockCraft.IBlockComponents['word-art']

  @Input()
  side: WordArtToolbarSide = 'right'

  @Output()
  readonly action = new EventEmitter<WordArtToolbarAction>()

  /** Emits only when local panel geometry changes; it never mutates document data. */
  @Output()
  readonly panelChange = new EventEmitter<WordArtToolbarPanel | null>()

  readonly fillTypes: ReadonlyArray<{
    value: WordArtFillType
    label: string
  }> = [
    {value: 'solid', label: '纯色'},
    {value: 'linear-gradient', label: '渐变'},
  ]
  readonly fontFamilies = WORD_ART_FONT_OPTIONS
  readonly effects: ReadonlyArray<{
    value: WordArtEffect
    label: string
  }> = [
    {value: 'none', label: '无效果'},
    {value: 'slant-left', label: '左倾'},
    {value: 'slant-right', label: '右倾'},
    {value: 'slant-up', label: '上斜'},
    {value: 'slant-down', label: '下斜'},
    {value: 'perspective-left', label: '左透视'},
    {value: 'perspective-right', label: '右透视'},
    {value: 'perspective-up', label: '上透视'},
    {value: 'perspective-down', label: '下透视'},
    {value: 'wide', label: '横向拉伸'},
    {value: 'narrow', label: '横向收窄'},
    {value: 'tall', label: '纵向拉伸'},
    {value: 'short', label: '纵向压缩'},
    {value: 'inflate', label: '放大'},
    {value: 'deflate', label: '缩小'},
  ]
  readonly layoutOptions = [
    BLOCK_OBJECT_LAYOUT_OPTIONS[0],
    INLINE_OBJECT_WRAP_LAYOUT_OPTION,
    ...BLOCK_OBJECT_LAYOUT_OPTIONS.slice(1),
  ] as const
  readonly horizontalAligns: ReadonlyArray<{
    value: WordArtHorizontalAlign
    label: string
    icon: string
  }> = [
    {value: 'left', label: '左对齐', icon: 'bc_zuoduiqi'},
    {value: 'center', label: '居中对齐', icon: 'bc_juzhongduiqi'},
    {value: 'right', label: '右对齐', icon: 'bc_youduiqi'},
  ]
  readonly verticalAligns: ReadonlyArray<{
    value: WordArtVerticalAlign
    label: string
    icon: string
  }> = [
    {value: 'top', label: '顶部对齐', icon: 'bc_dingbuduiqi'},
    {value: 'middle', label: '垂直居中', icon: 'bc_juzhongduiqi1'},
    {value: 'bottom', label: '底部对齐', icon: 'bc_dibuduiqi'},
  ]
  readonly sectionOptions: CsSegmentedOptions = [
    {value: 'font', label: '字体'},
    {value: 'fill', label: '填充'},
    {value: 'effects', label: '效果'},
  ]
  readonly horizontalAlignOptions: CsSegmentedOptions = [
    {value: 'left', label: '左'},
    {value: 'center', label: '中'},
    {value: 'right', label: '右'},
  ]
  readonly verticalAlignOptions: CsSegmentedOptions = [
    {value: 'top', label: '顶端'},
    {value: 'middle', label: '居中'},
    {value: 'bottom', label: '底端'},
  ]
  readonly fillTypeOptions: CsSegmentedOptions = this.fillTypes.map(item => ({
    value: item.value,
    label: item.label,
  }))

  activePanel: WordArtToolbarPanel | null = null
  activeSection: WordArtFormatSection = 'font'

  private letterSpacingDraft: number | null = null
  private outlineWidthDraft: number | null = null

  constructor(readonly cdr: ChangeDetectorRef) {}

  get props() {
    return this.wordArtBlock.wordArtProps
  }

  get objectLayout(): BlockObjectLayout {
    return this.wordArtBlock.doc.placement.getObjectLayout(this.wordArtBlock)
  }

  get isAbsolute(): boolean {
    return this.wordArtBlock.doc.placement.getState(this.wordArtBlock).mode ===
      'absolute'
  }

  get isGrouped(): boolean {
    return this.wordArtBlock.doc.placement.isInObjectGroup?.(
      this.wordArtBlock,
    ) ?? false
  }

  get canMoveForward(): boolean {
    return this.wordArtBlock.doc.placement.canMoveForward(this.wordArtBlock)
  }

  get canMoveBackward(): boolean {
    return this.wordArtBlock.doc.placement.canMoveBackward(this.wordArtBlock)
  }

  get tooltipPlacement(): 'left' | 'right' {
    return this.side === 'right' ? 'left' : 'right'
  }

  get fillTypeLabel(): string {
    return this.fillTypes.find(item => item.value === this.props.fillType)
      ?.label ?? '填充'
  }

  get fontFamilyLabel(): string {
    return this.fontFamilies.find(item => item.id === this.props.fontFamily)
      ?.label ?? '字体'
  }

  get effectLabel(): string {
    return this.effects.find(item => item.value === this.props.effect)?.label ??
      '效果'
  }

  get horizontalAlignIcon(): string {
    return this.horizontalAligns.find(
      item => item.value === this.props.horizontalAlign,
    )?.icon ?? 'bc_zuoduiqi'
  }

  get verticalAlignIcon(): string {
    return this.verticalAligns.find(
      item => item.value === this.props.verticalAlign,
    )?.icon ?? 'bc_juzhongduiqi1'
  }

  get outlineWidthProgress(): string {
    return this.rangeProgress(this.props.outlineWidthEm, 0, 0.2)
  }

  get letterSpacingProgress(): string {
    return this.rangeProgress(this.props.letterSpacingEm, -0.2, 1)
  }

  get letterSpacingValue(): number {
    return this.letterSpacingDraft ?? this.props.letterSpacingEm
  }

  get outlineWidthValue(): number {
    return this.outlineWidthDraft ?? this.props.outlineWidthEm
  }

  togglePanel(panel: WordArtToolbarPanel): void {
    this.activePanel = this.activePanel === panel ? null : panel
    this.panelChange.emit(this.activePanel)
  }

  closePanel(): void {
    if (this.activePanel === null) return
    this.activePanel = null
    this.panelChange.emit(null)
  }

  setFormatSection(section: string | number): void {
    if (section !== 'font' && section !== 'fill' && section !== 'effects') {
      return
    }
    if (this.activeSection === section) return
    this.activeSection = section
    this.cdr.markForCheck()
    this.panelChange.emit(this.activePanel)
  }

  setFontFamily(value: unknown): void {
    if (!this.fontFamilies.some(item => item.id === value)) return
    this.emitProps({fontFamily: value as WordArtFontId})
  }

  setFontSize(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return
    this.emitProps({fontSize: value})
  }

  setHorizontalAlign(value: string | number): void {
    if (value !== 'left' && value !== 'center' && value !== 'right') return
    this.emitProps({horizontalAlign: value as WordArtHorizontalAlign})
  }

  setVerticalAlign(value: string | number): void {
    if (value !== 'top' && value !== 'middle' && value !== 'bottom') return
    this.emitProps({verticalAlign: value as WordArtVerticalAlign})
  }

  draftLetterSpacing(value: CsSliderValue): void {
    this.letterSpacingDraft = normalizeSlider(value, -0.2, 1, 2)
  }

  commitLetterSpacing(): void {
    if (this.letterSpacingDraft === null) return
    const value = this.letterSpacingDraft
    this.letterSpacingDraft = null
    this.emitProps({letterSpacingEm: value})
  }

  setFillType(value: string | number): void {
    if (value !== 'solid' && value !== 'linear-gradient') return
    this.emitProps({fillType: value as WordArtFillType})
  }

  setFillColor(value: string | null): void {
    if (value) this.emitProps({fillColor: value})
  }

  setGradientColor(index: number, value: string | null | Event): void {
    const color = typeof value === 'string'
      ? value
      : value instanceof Event
        ? (value.target as HTMLInputElement | null)?.value
        : null
    if (!color || index < 0 || index >= this.props.gradientColors.length) {
      return
    }
    const gradientColors = [...this.props.gradientColors]
    gradientColors[index] = color
    this.emitProps({gradientColors})
  }

  setGradientAngle(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return
    this.emitProps({gradientAngle: value})
  }

  setOutlineColor(value: string | null): void {
    if (value) this.emitProps({outlineColor: value})
  }

  draftOutlineWidth(value: CsSliderValue): void {
    this.outlineWidthDraft = normalizeSlider(value, 0, 0.2, 2)
  }

  commitOutlineWidth(): void {
    if (this.outlineWidthDraft === null) return
    const value = this.outlineWidthDraft
    this.outlineWidthDraft = null
    this.emitProps({outlineWidthEm: value})
  }

  setEffect(value: unknown): void {
    if (!this.effects.some(item => item.value === value)) return
    this.emitProps({effect: value as WordArtEffect})
  }

  setShadowEnabled(value: boolean): void {
    this.emitProps({shadowEnabled: value})
  }

  selectFillType(
    item: {value: unknown},
    trigger: {closePanel(): void},
  ): void {
    this.setFillType(String(item.value))
    trigger.closePanel()
  }

  selectFontFamily(
    item: {value: unknown},
    trigger: {closePanel(): void},
  ): void {
    this.setFontFamily(item.value)
    trigger.closePanel()
  }

  selectEffect(
    item: {value: unknown},
    trigger: {closePanel(): void},
  ): void {
    this.setEffect(item.value)
    trigger.closePanel()
  }

  setColor(key: 'fillColor' | 'outlineColor', event: Event): void {
    this.emitProps({[key]: (event.target as HTMLInputElement).value})
  }

  setNumber(
    key: 'fontSize' | 'gradientAngle' | 'outlineWidthEm' | 'letterSpacingEm',
    event: Event,
  ): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return
    this.emitProps({[key]: value})
  }

  syncRangeProgress(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null
    if (!input) return
    input.style.setProperty(
      '--word-art-range-progress',
      this.rangeProgress(Number(input.value), Number(input.min), Number(input.max)),
    )
  }

  toggleShadow(): void {
    this.setShadowEnabled(!this.props.shadowEnabled)
  }

  selectHorizontalAlign(
    item: {value: unknown},
    trigger: {closePanel(): void},
  ): void {
    this.setHorizontalAlign(String(item.value))
    trigger.closePanel()
  }

  selectVerticalAlign(
    item: {value: unknown},
    trigger: {closePanel(): void},
  ): void {
    this.setVerticalAlign(String(item.value))
    trigger.closePanel()
  }

  private rangeProgress(value: number, min: number, max: number): string {
    const range = max - min
    const progress = Number.isFinite(value) && range > 0
      ? Math.min(100, Math.max(0, ((value - min) / range) * 100))
      : 0
    return `${progress}%`
  }

  private emitProps(value: Partial<WordArtBlockProps>): void {
    this.action.emit({name: 'update-props', value})
  }
}

function normalizeSlider(
  value: CsSliderValue,
  minimum: number,
  maximum: number,
  precision: number,
): number {
  const source = Array.isArray(value) ? value[0] : value
  const bounded = Math.min(maximum, Math.max(minimum, Number(source) || 0))
  const scale = 10 ** precision
  return Math.round(bounded * scale) / scale
}
