import {FormsModule} from '@angular/forms'
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
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
  type CsSegmentedOptions,
  type CsSliderValue,
} from '@cses/ui'
import {
  normalizeTextBoxWordArtStyle,
  serializeTextBoxWordArtStyle,
  type TextBoxBlockProps,
  type TextBoxWordArtStyle,
  type TextBoxWritingMode,
} from '../../blocks/text-box-block'
import {
  WORD_ART_FONT_OPTIONS,
  type WordArtEffect,
  type WordArtFillType,
  type WordArtFontId,
  type WordArtFontWeight,
  type WordArtHorizontalAlign,
  type WordArtPresetId,
  type WordArtVerticalAlign,
} from '../../blocks/word-art-block'
import {WordArtPresetPickerComponent} from '../fixed-toolbar/widgets/word-art-preset-picker.component'
import {serializeTextBoxWordArtPreset} from './text-box-word-art-preset'

type TextPanelSection = 'preset' | 'font' | 'fill' | 'effects'

const NEUTRAL_TEXT_BOX_WORD_ART: Readonly<TextBoxWordArtStyle> = {
  fontFamily: 'cjk-hei',
  fontSize: 16,
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacingEm: 0,
  lineHeight: 1.5,
  horizontalAlign: 'left',
  verticalAlign: 'top',
  fillType: 'solid',
  fillColor: '#1F2937',
  gradientAngle: 180,
  gradientColors: ['#60A5FA', '#7C3AED'],
  gradientStops: [0, 1],
  outlineColor: '#1F2937',
  outlineWidthEm: 0,
  shadowEnabled: false,
  shadowColor: '#0F172A',
  shadowOpacity: 0.25,
  shadowOffsetXEm: 0.04,
  shadowOffsetYEm: 0.08,
  shadowBlurEm: 0.04,
  effect: 'none',
}

const EFFECT_OPTIONS: ReadonlyArray<{value: WordArtEffect; label: string}> = [
  {value: 'none', label: '无转换'},
  {value: 'slant-left', label: '向左倾斜'},
  {value: 'slant-right', label: '向右倾斜'},
  {value: 'perspective-left', label: '左透视'},
  {value: 'perspective-right', label: '右透视'},
  {value: 'wide', label: '加宽'},
  {value: 'narrow', label: '压窄'},
  {value: 'tall', label: '拉高'},
  {value: 'short', label: '压低'},
  {value: 'inflate', label: '膨胀'},
  {value: 'deflate', label: '收缩'},
]

@Component({
  selector: 'bc-text-box-text-panel',
  standalone: true,
  imports: [
    FormsModule,
    WordArtPresetPickerComponent,
    CsButtonComponent,
    CsColorPickerComponent,
    CsInputNumberComponent,
    CsOptionComponent,
    CsSegmentedComponent,
    CsSelectComponent,
    CsSliderComponent,
    CsSwitchComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="text-box-text-panel" aria-label="设置文本框文字">
      <header class="text-box-text-panel__header">
        <div>
          <strong>文字格式</strong>
          <span>文字样式独立于背景形状</span>
        </div>
        @if (style) {
          <button
            cs-button
            csType="text"
            csSize="sm"
            type="button"
            (click)="clearStyle()">
            清除效果
          </button>
        }
      </header>

      <cs-segmented
        class="text-box-text-panel__tabs"
        csSize="small"
        [csBlock]="true"
        [csOptions]="sectionOptions"
        [ngModel]="activeSection"
        (ngModelChange)="setSection($event)"
        csAriaLabel="文字格式分类">
      </cs-segmented>

      @if (activeSection === 'preset') {
        <bc-word-art-preset-picker
          [embedded]="true"
          (pick)="applyPreset($event)">
        </bc-word-art-preset-picker>
      } @else if (activeSection === 'font') {
        <div class="text-box-text-panel__form">
          <label class="text-box-text-panel__row text-box-text-panel__row--stacked">
            <span class="text-box-text-panel__label">字体</span>
            <cs-select
              csSize="sm"
              csVariant="outlined"
              aria-label="文本框字体"
              [csValue]="currentStyle.fontFamily"
              (csValueChange)="setFontFamily($event)">
              @for (font of fontOptions; track font.id) {
                <cs-option [csValue]="font.id" [csLabel]="font.label">
                </cs-option>
              }
            </cs-select>
          </label>

          <div class="text-box-text-panel__row">
            <span class="text-box-text-panel__label">字号</span>
            <cs-input-number
              csSize="sm"
              [csMin]="8"
              [csMax]="512"
              [csStep]="1"
              [csValue]="currentStyle.fontSize"
              (csValueChange)="setFontSize($event)">
            </cs-input-number>
            <span class="text-box-text-panel__unit">px</span>
            <button
              cs-button
              csType="secondary"
              csSize="sm"
              type="button"
              aria-label="粗体"
              [class.active]="currentStyle.fontWeight >= 700"
              (click)="toggleBold()">
              <strong>B</strong>
            </button>
            <button
              cs-button
              csType="secondary"
              csSize="sm"
              type="button"
              aria-label="斜体"
              [class.active]="currentStyle.fontStyle === 'italic'"
              (click)="toggleItalic()">
              <em>I</em>
            </button>
          </div>

          <div class="text-box-text-panel__row text-box-text-panel__row--stacked">
            <span class="text-box-text-panel__label">文字方向</span>
            <cs-segmented
              csSize="small"
              [csBlock]="true"
              [csOptions]="writingModeOptions"
              [ngModel]="wm"
              (ngModelChange)="setWritingMode($event)"
              csAriaLabel="文本框文字方向">
            </cs-segmented>
          </div>

          <div class="text-box-text-panel__row text-box-text-panel__row--stacked">
            <span class="text-box-text-panel__label">{{ inlineAlignLabel }}</span>
            <cs-segmented
              csSize="small"
              [csBlock]="true"
              [csOptions]="inlineAlignOptions"
              [ngModel]="currentStyle.horizontalAlign"
              (ngModelChange)="setHorizontalAlign($event)"
              [csAriaLabel]="'文本框文字' + inlineAlignLabel">
            </cs-segmented>
          </div>

          <div class="text-box-text-panel__row text-box-text-panel__row--stacked">
            <span class="text-box-text-panel__label">{{ blockAlignLabel }}</span>
            <cs-segmented
              csSize="small"
              [csBlock]="true"
              [csOptions]="blockAlignOptions"
              [ngModel]="currentStyle.verticalAlign"
              (ngModelChange)="setVerticalAlign($event)"
              [csAriaLabel]="'文本框文字' + blockAlignLabel">
            </cs-segmented>
          </div>

          <div class="text-box-text-panel__row text-box-text-panel__row--slider">
            <span class="text-box-text-panel__label">字间距</span>
            <cs-slider
              [csMin]="-0.2"
              [csMax]="1"
              [csStep]="0.02"
              csAriaLabel="文本框文字字间距"
              [csValue]="letterSpacing"
              (csValueChange)="draftLetterSpacing($event)"
              (pointerup)="commitLetterSpacing()"
              (keyup)="commitLetterSpacing()"
              (blur)="commitLetterSpacing()">
            </cs-slider>
            <output>{{ letterSpacing.toFixed(2) }}em</output>
          </div>

          <div class="text-box-text-panel__row text-box-text-panel__row--slider">
            <span class="text-box-text-panel__label">行高</span>
            <cs-slider
              [csMin]="0.8"
              [csMax]="3"
              [csStep]="0.1"
              csAriaLabel="文本框文字行高"
              [csValue]="lineHeight"
              (csValueChange)="draftLineHeight($event)"
              (pointerup)="commitLineHeight()"
              (keyup)="commitLineHeight()"
              (blur)="commitLineHeight()">
            </cs-slider>
            <output>{{ lineHeight.toFixed(1) }}</output>
          </div>
        </div>
      } @else if (activeSection === 'fill') {
        <div class="text-box-text-panel__form">
          <div class="text-box-text-panel__row text-box-text-panel__row--stacked">
            <span class="text-box-text-panel__label">文字填充</span>
            <cs-segmented
              csSize="small"
              [csBlock]="true"
              [csOptions]="fillTypeOptions"
              [ngModel]="currentStyle.fillType"
              (ngModelChange)="setFillType($event)"
              csAriaLabel="文字填充类型">
            </cs-segmented>
          </div>

          @if (currentStyle.fillType === 'solid') {
            <div class="text-box-text-panel__row">
              <span class="text-box-text-panel__label">颜色</span>
              <cs-color-picker
                csMode="palette"
                csSize="sm"
                [csValue]="currentStyle.fillColor"
                [csAllowClear]="false"
                [csShowText]="true"
                [csShowAlpha]="false"
                (csChangeComplete)="setTextColor($event.value)">
              </cs-color-picker>
            </div>
          } @else {
            <div class="text-box-text-panel__row">
              <span class="text-box-text-panel__label">起始颜色</span>
              <cs-color-picker
                csMode="palette"
                csSize="sm"
                [csValue]="gradientStart"
                [csAllowClear]="false"
                [csShowText]="true"
                [csShowAlpha]="false"
                (csChangeComplete)="setGradientColor(0, $event.value)">
              </cs-color-picker>
            </div>
            <div class="text-box-text-panel__row">
              <span class="text-box-text-panel__label">结束颜色</span>
              <cs-color-picker
                csMode="palette"
                csSize="sm"
                [csValue]="gradientEnd"
                [csAllowClear]="false"
                [csShowText]="true"
                [csShowAlpha]="false"
                (csChangeComplete)="setGradientColor(1, $event.value)">
              </cs-color-picker>
            </div>
            <label class="text-box-text-panel__row">
              <span class="text-box-text-panel__label">渐变角度</span>
              <cs-input-number
                csSize="sm"
                [csMin]="0"
                [csMax]="360"
                [csStep]="15"
                [csValue]="currentStyle.gradientAngle"
                (csValueChange)="setGradientAngle($event)">
              </cs-input-number>
              <span class="text-box-text-panel__unit">°</span>
            </label>
          }

          <div class="text-box-text-panel__subsection">
            <div class="text-box-text-panel__row">
              <span class="text-box-text-panel__label">文字轮廓</span>
              <cs-color-picker
                csMode="palette"
                csSize="sm"
                [csValue]="currentStyle.outlineColor"
                [csAllowClear]="false"
                [csShowText]="true"
                [csShowAlpha]="false"
                (csChangeComplete)="setOutlineColor($event.value)">
              </cs-color-picker>
            </div>
            <label class="text-box-text-panel__row">
              <span class="text-box-text-panel__label">轮廓宽度</span>
              <cs-input-number
                csSize="sm"
                [csMin]="0"
                [csMax]="0.2"
                [csStep]="0.01"
                [csPrecision]="2"
                [csValue]="currentStyle.outlineWidthEm"
                (csValueChange)="setOutlineWidth($event)">
              </cs-input-number>
              <span class="text-box-text-panel__unit">em</span>
            </label>
          </div>
        </div>
      } @else {
        <div class="text-box-text-panel__form">
          <label class="text-box-text-panel__row text-box-text-panel__row--stacked">
            <span class="text-box-text-panel__label">文字转换</span>
            <cs-select
              csSize="sm"
              csVariant="outlined"
              aria-label="文字转换效果"
              [csValue]="currentStyle.effect"
              (csValueChange)="setEffect($event)">
              @for (effect of effectOptions; track effect.value) {
                <cs-option [csValue]="effect.value" [csLabel]="effect.label">
                </cs-option>
              }
            </cs-select>
          </label>

          <div class="text-box-text-panel__row">
            <span class="text-box-text-panel__label">阴影</span>
            <cs-switch
              csSize="sm"
              [csChecked]="currentStyle.shadowEnabled"
              (csCheckedChange)="setShadowEnabled($event)">
            </cs-switch>
            <span class="text-box-text-panel__hint">
              {{ currentStyle.shadowEnabled ? '已开启' : '已关闭' }}
            </span>
          </div>

          @if (currentStyle.shadowEnabled) {
            <div class="text-box-text-panel__row">
              <span class="text-box-text-panel__label">阴影颜色</span>
              <cs-color-picker
                csMode="palette"
                csSize="sm"
                [csValue]="currentStyle.shadowColor"
                [csAllowClear]="false"
                [csShowText]="true"
                [csShowAlpha]="false"
                (csChangeComplete)="setShadowColor($event.value)">
              </cs-color-picker>
            </div>
            <div class="text-box-text-panel__row text-box-text-panel__row--slider">
              <span class="text-box-text-panel__label">阴影透明度</span>
              <cs-slider
                [csMin]="0"
                [csMax]="100"
                [csStep]="1"
                csAriaLabel="文字阴影透明度"
                [csValue]="shadowOpacity"
                (csValueChange)="draftShadowOpacity($event)"
                (pointerup)="commitShadowOpacity()"
                (keyup)="commitShadowOpacity()"
                (blur)="commitShadowOpacity()">
              </cs-slider>
              <output>{{ shadowOpacity }}%</output>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
      width: min(var(--text-box-settings-panel-width, 288px), calc(100vw - 86px));
      max-width: 100%;
    }

    .text-box-text-panel {
      box-sizing: border-box;
      width: 100%;
      max-height: min(520px, calc(100vh - 24px));
      padding: 10px;
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 12px;
      background: var(--bc-float-toolbar-bg);
      color: var(--bc-float-toolbar-item-color);
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 10px 28px rgba(15, 23, 42, .16));
    }

    .text-box-text-panel__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .text-box-text-panel__header strong,
    .text-box-text-panel__header span {
      display: block;
    }

    .text-box-text-panel__header strong {
      font-size: 13px;
      line-height: 18px;
    }

    .text-box-text-panel__header span,
    .text-box-text-panel__hint {
      margin-top: 2px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      line-height: 16px;
    }

    .text-box-text-panel__tabs {
      display: block;
      margin-bottom: 10px;
    }

    .text-box-text-panel__form {
      display: grid;
      gap: 8px;
    }

    .text-box-text-panel__row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .text-box-text-panel__row--stacked {
      display: grid;
      grid-template-columns: 66px minmax(0, 1fr);
    }

    .text-box-text-panel__row--slider {
      display: grid;
      grid-template-columns: 66px minmax(0, 1fr) 44px;
    }

    .text-box-text-panel__row--slider output {
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      text-align: right;
    }

    .text-box-text-panel__label {
      flex: 0 0 66px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
    }

    .text-box-text-panel__row cs-select,
    .text-box-text-panel__row cs-color-picker,
    .text-box-text-panel__row cs-input-number {
      flex: 1;
      min-width: 0;
    }

    .text-box-text-panel__row button.active {
      border-color: var(--bc-active-color);
      background: var(--bc-float-toolbar-item-active-bg);
      color: var(--bc-active-color);
    }

    .text-box-text-panel__unit {
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
    }

    .text-box-text-panel__subsection {
      display: grid;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--bc-float-toolbar-divider-color);
    }
  `],
})
export class TextBoxTextPanelComponent implements OnChanges {
  @Input()
  style: TextBoxWordArtStyle | null = null

  @Input()
  wm: TextBoxWritingMode = 'h'

  @Output()
  readonly patch = new EventEmitter<Partial<TextBoxBlockProps>>()

  readonly sectionOptions: CsSegmentedOptions = [
    {value: 'preset', label: '预设'},
    {value: 'font', label: '字体'},
    {value: 'fill', label: '填充与轮廓'},
    {value: 'effects', label: '效果'},
  ]
  readonly writingModeOptions: CsSegmentedOptions = [
    {value: 'h', label: '横向'},
    {value: 'v', label: '竖向'},
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
  /**
   * `horizontalAlign` drives `text-align` and `verticalAlign` drives the flex
   * main axis. Both are logical, so a vertical frame flips what the user sees
   * without any model change — only the labels have to follow.
   */
  private readonly verticalInlineAlignOptions: CsSegmentedOptions = [
    {value: 'left', label: '顶端'},
    {value: 'center', label: '居中'},
    {value: 'right', label: '底端'},
  ]
  private readonly verticalBlockAlignOptions: CsSegmentedOptions = [
    {value: 'top', label: '右'},
    {value: 'middle', label: '中'},
    {value: 'bottom', label: '左'},
  ]
  readonly fillTypeOptions: CsSegmentedOptions = [
    {value: 'solid', label: '纯色'},
    {value: 'linear-gradient', label: '渐变'},
  ]
  readonly fontOptions = WORD_ART_FONT_OPTIONS
  readonly effectOptions = EFFECT_OPTIONS

  activeSection: TextPanelSection = 'preset'
  letterSpacing = 0
  lineHeight = 1.5
  shadowOpacity = 25

  private letterSpacingDirty = false
  private lineHeightDirty = false
  private shadowOpacityDirty = false

  get currentStyle(): TextBoxWordArtStyle {
    return this.style ?? NEUTRAL_TEXT_BOX_WORD_ART
  }

  get gradientStart(): string {
    return this.currentStyle.gradientColors[0] ?? '#60A5FA'
  }

  get gradientEnd(): string {
    const colors = this.currentStyle.gradientColors
    return colors[colors.length - 1] ?? '#7C3AED'
  }

  ngOnChanges(): void {
    if (!this.letterSpacingDirty) {
      this.letterSpacing = this.currentStyle.letterSpacingEm
    }
    if (!this.lineHeightDirty) {
      this.lineHeight = this.currentStyle.lineHeight
    }
    if (!this.shadowOpacityDirty) {
      this.shadowOpacity = Math.round(this.currentStyle.shadowOpacity * 100)
    }
  }

  setSection(value: string | number): void {
    if (
      value === 'preset' || value === 'font' ||
      value === 'fill' || value === 'effects'
    ) {
      this.activeSection = value
    }
  }

  applyPreset(value: WordArtPresetId): void {
    const serialized = serializeTextBoxWordArtPreset(value, this.currentStyle)
    if (serialized) this.patch.emit({wa: serialized})
  }

  clearStyle(): void {
    this.patch.emit({wa: null})
  }

  setFontFamily(value: unknown): void {
    if (!WORD_ART_FONT_OPTIONS.some(item => item.id === value)) return
    this.emitStyle({fontFamily: value as WordArtFontId})
  }

  setFontSize(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return
    this.emitStyle({fontSize: value})
  }

  toggleBold(): void {
    const weight: WordArtFontWeight =
      this.currentStyle.fontWeight >= 700 ? 400 : 700
    this.emitStyle({fontWeight: weight})
  }

  toggleItalic(): void {
    this.emitStyle({
      fontStyle: this.currentStyle.fontStyle === 'italic' ? 'normal' : 'italic',
    })
  }

  get inlineAlignLabel(): string {
    return this.wm === 'v' ? '垂直对齐' : '水平对齐'
  }

  get blockAlignLabel(): string {
    return this.wm === 'v' ? '水平对齐' : '垂直对齐'
  }

  get inlineAlignOptions(): CsSegmentedOptions {
    return this.wm === 'v'
      ? this.verticalInlineAlignOptions
      : this.horizontalAlignOptions
  }

  get blockAlignOptions(): CsSegmentedOptions {
    return this.wm === 'v'
      ? this.verticalBlockAlignOptions
      : this.verticalAlignOptions
  }

  setWritingMode(value: string | number): void {
    if (value !== 'h' && value !== 'v') return
    if (value === this.wm) return
    this.patch.emit({wm: value})
  }

  setHorizontalAlign(value: string | number): void {
    if (value !== 'left' && value !== 'center' && value !== 'right') return
    this.emitStyle({horizontalAlign: value as WordArtHorizontalAlign})
  }

  setVerticalAlign(value: string | number): void {
    if (value !== 'top' && value !== 'middle' && value !== 'bottom') return
    this.emitStyle({verticalAlign: value as WordArtVerticalAlign})
  }

  draftLetterSpacing(value: CsSliderValue): void {
    this.letterSpacing = normalizeSlider(value, -0.2, 1, 2)
    this.letterSpacingDirty = true
  }

  commitLetterSpacing(): void {
    if (!this.letterSpacingDirty) return
    this.letterSpacingDirty = false
    this.emitStyle({letterSpacingEm: this.letterSpacing})
  }

  draftLineHeight(value: CsSliderValue): void {
    this.lineHeight = normalizeSlider(value, 0.8, 3, 1)
    this.lineHeightDirty = true
  }

  commitLineHeight(): void {
    if (!this.lineHeightDirty) return
    this.lineHeightDirty = false
    this.emitStyle({lineHeight: this.lineHeight})
  }

  setFillType(value: string | number): void {
    if (value !== 'solid' && value !== 'linear-gradient') return
    this.emitStyle({fillType: value as WordArtFillType})
  }

  setTextColor(value: string | null): void {
    if (value) this.emitStyle({fillColor: value})
  }

  setGradientColor(index: 0 | 1, value: string | null): void {
    if (!value) return
    const colors = [...this.currentStyle.gradientColors]
    if (colors.length < 2) colors.splice(0, colors.length, '#60A5FA', '#7C3AED')
    const target = index === 0 ? 0 : colors.length - 1
    colors[target] = value
    this.emitStyle({gradientColors: colors})
  }

  setGradientAngle(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return
    this.emitStyle({gradientAngle: value})
  }

  setOutlineColor(value: string | null): void {
    if (value) this.emitStyle({outlineColor: value})
  }

  setOutlineWidth(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return
    this.emitStyle({outlineWidthEm: value})
  }

  setEffect(value: unknown): void {
    if (!EFFECT_OPTIONS.some(item => item.value === value)) return
    this.emitStyle({effect: value as WordArtEffect})
  }

  setShadowEnabled(value: boolean): void {
    this.emitStyle({shadowEnabled: value})
  }

  setShadowColor(value: string | null): void {
    if (value) this.emitStyle({shadowColor: value})
  }

  draftShadowOpacity(value: CsSliderValue): void {
    this.shadowOpacity = normalizeSlider(value, 0, 100, 0)
    this.shadowOpacityDirty = true
  }

  commitShadowOpacity(): void {
    if (!this.shadowOpacityDirty) return
    this.shadowOpacityDirty = false
    this.emitStyle({shadowOpacity: this.shadowOpacity / 100})
  }

  private emitStyle(patch: Partial<TextBoxWordArtStyle>): void {
    const serialized = serializeTextBoxWordArtStyle({
      ...this.currentStyle,
      ...patch,
    })
    if (serialized) this.patch.emit({wa: serialized})
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
