import {ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild} from '@angular/core'
import {FormsModule} from '@angular/forms'
import {CsButtonComponent, CsColorPickerComponent, CsInputNumberComponent, CsOptionComponent, CsSegmentedComponent, CsSelectComponent, CsSwitchComponent, CsTooltipDirective} from '@cses/ui'
import {
  BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective,
  BUILTIN_BG_COLOR_LIST, BUILTIN_COLOR_LIST, ColorGroup, ColorPickerComponent,
} from '../../../components'
import {normalizeRegionBorders, type RegionBorders} from '../../../blocks/render-unit-block/borders'
import {normalizeBlockSurfaceProps, normalizeObjectTextStyle, resolveBlockSurface, resolveTypographyFontFamily, storeObjectTextStyle, TYPOGRAPHY_FONT_FAMILIES, type ObjectTextStyle} from '../../../framework'
import {OBJECT_FORMAT_POPUP_STYLES, ObjectFormatPopupState} from '../../object-format-toolbar/object-format-popup'

type RegionPanel = 'appearance' | 'text'
type AppearanceTab = 'fill' | 'outline'
type TextTab = 'padding' | 'text'
type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double'
const SIDES = ['top', 'right', 'bottom', 'left'] as const

@Component({
  selector: 'callout-block-toolbar',
  standalone: true,
  imports: [FormsModule, CsButtonComponent, CsColorPickerComponent, CsInputNumberComponent, CsOptionComponent, CsSegmentedComponent, CsSelectComponent, CsSwitchComponent, CsTooltipDirective, ColorPickerComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective, BcFloatToolbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (containerBlock.flavour === 'render-unit') {
      <div class="object-format object-format--anchored" [class.object-format--left]="panelSide === 'right'"
           contenteditable="false" data-bc-region-format-toolbar>
        <nav #rail class="object-format__rail" aria-label="内容区域快捷工具">
          <button cs-button csType="text" csSize="sm" type="button"
                  [class.active]="activePanel === 'appearance'"
                  [attr.aria-expanded]="activePanel === 'appearance'" aria-label="外观选项"
                  csTooltip="外观选项" [csTooltipPlacement]="panelSide === 'left' ? 'right' : 'left'" (click)="togglePanel('appearance')">
            <i class="bc_icon bc_tuxing" aria-hidden="true"></i>
          </button>
          <button cs-button csType="text" csSize="sm" type="button"
                  [class.active]="activePanel === 'text'"
                  [attr.aria-expanded]="activePanel === 'text'" aria-label="文本选项"
                  csTooltip="文本选项" [csTooltipPlacement]="panelSide === 'left' ? 'right' : 'left'" (click)="togglePanel('text')">
            <i class="bc_icon bc_wenben" aria-hidden="true"></i>
          </button>
        </nav>
        @if (activePanel) {
          <aside class="object-format__panel" [attr.aria-label]="activePanel === 'appearance' ? '内容区域外观设置' : '内容区域文本设置'">
            <div class="object-format__scroll">
              <cs-segmented class="object-format__tabs" csSize="small" [csBlock]="true"
                            [csOptions]="tabOptions" [ngModel]="activeTab"
                            (ngModelChange)="selectTab($event)" [csAriaLabel]="activePanel === 'appearance' ? '外观格式分类' : '文本格式分类'" />
              <section class="object-format__tab-section" [hidden]="activeTab !== 'fill'">
                <div class="region-format__color"><span>填充颜色</span>
                  <cs-color-picker csMode="palette" csSize="sm" [csValue]="activeColors['backColor']"
                                   [csAllowClear]="true" [csShowText]="true" [csShowAlpha]="false"
                                   (csChangeComplete)="onColorPicked({type: 'backColor', color: $event.value})" />
                </div>
              </section>
              <section class="object-format__tab-section" [hidden]="activeTab !== 'outline'">
              <div class="region-format__fields">
                <label>宽度
                  <cs-input-number csSize="sm" [csMin]="0" [csMax]="24" [csStep]="0.5"
                                   [csValue]="borderWidth" (csValueChange)="changeBorderWidth($event)" />
                </label>
                <label>线型
                  <cs-select csSize="sm" csVariant="outlined" [csValue]="borderStyle"
                             (csValueChange)="changeBorderStyle($event)">
                    <cs-option csValue="solid" csLabel="实线" />
                    <cs-option csValue="dashed" csLabel="虚线" />
                    <cs-option csValue="dotted" csLabel="点线" />
                    <cs-option csValue="double" csLabel="双线" />
                  </cs-select>
                </label>
              </div>
              <div class="region-format__color"><span>轮廓颜色</span>
              <cs-color-picker csMode="palette" csSize="sm"
                               [csValue]="activeColors['borderColor']"
                               [csAllowClear]="true" [csShowText]="true" [csShowAlpha]="false"
                               (csChangeComplete)="onColorPicked({type: 'borderColor', color: $event.value})" />
              </div>
              </section>
              <section class="object-format__tab-section" [hidden]="activeTab !== 'padding'">
                <div class="region-format__fields">
                  @for (side of paddingSides; track side.key) {
                    <label>{{side.label}}
                      <cs-input-number csSize="sm" [csMin]="0" [csMax]="1000" [csValue]="padding[side.key]"
                                       (csValueChange)="changePadding(side.key, $event)" />
                    </label>
                  }
                </div>
                <button cs-button csType="text" csSize="sm" type="button" class="region-format__reset" (click)="resetPadding()">
                  <i class="bc_icon bc_huifu1" aria-hidden="true"></i><span>恢复默认边距</span>
                </button>
              </section>
              <section class="object-format__tab-section" [hidden]="activeTab !== 'text'">
                <div class="region-format__fields">
                  <label class="region-format__wide">字体
                    <cs-select csSize="sm" csVariant="outlined" [csValue]="fontFamilyValue" csPlaceholder="文档默认"
                               [csShowSearch]="true" (csValueChange)="changeFontFamily($event)">
                      @for (font of fontOptions; track font.id) {
                        <cs-option [csValue]="font.css" [csLabel]="font.label" />
                      }
                    </cs-select>
                  </label>
                  <label>字号
                    <cs-input-number csSize="sm" [csMin]="4" [csMax]="512" [csValue]="textStyle.fontSize"
                                     (csValueChange)="changeTextNumber('fontSize', $event)" />
                  </label>
                  <label>字重
                    <cs-select csSize="sm" csVariant="outlined" [csValue]="textStyle.fontWeight"
                               (csValueChange)="changeFontWeight($event)">
                      @for (weight of fontWeights; track weight.value) {
                        <cs-option [csValue]="weight.value" [csLabel]="weight.label" />
                      }
                    </cs-select>
                  </label>
                  <label>字距
                    <cs-input-number csSize="sm" [csMin]="-1" [csMax]="5" [csStep]="0.01" [csValue]="textStyle.letterSpacingEm"
                                     (csValueChange)="changeTextNumber('letterSpacingEm', $event)" />
                  </label>
                  <label>行高
                    <cs-input-number csSize="sm" [csMin]="0.5" [csMax]="5" [csStep]="0.05" [csValue]="textStyle.lineHeight"
                                     (csValueChange)="changeTextNumber('lineHeight', $event)" />
                  </label>
                  <label class="region-format__switch">斜体
                    <cs-switch csSize="sm" [csChecked]="textStyle.fontStyle === 'italic'"
                               (csCheckedChange)="changeItalic($event)" />
                  </label>
                </div>
                <div class="region-format__color"><span>文字颜色</span>
                  <cs-color-picker csMode="palette" csSize="sm" [csValue]="activeColors['textFill']"
                                   [csAllowClear]="true" [csShowText]="true" [csShowAlpha]="false"
                                   (csChangeComplete)="onColorPicked({type: 'textFill', color: $event.value})" />
                </div>
                <button cs-button csType="text" csSize="sm" type="button" class="region-format__reset" (click)="resetTypography()">
                  <i class="bc_icon bc_huifu1" aria-hidden="true"></i><span>恢复默认字体</span>
                </button>
              </section>
            </div>
          </aside>
        }
      </div>
    } @else {
      <bc-float-toolbar>
        <bc-float-toolbar-item icon="bc_sepan" [bcOverlayTrigger]="colorPicker" />
      </bc-float-toolbar>
      <ng-template #colorPicker>
        <bc-color-picker (colorPicked)="onColorPicked($event)" [gapAround]="8"
                         [activeColors]="activeColors" [colorGroups]="colorGroups" />
      </ng-template>
    }
  `,
  styles: [OBJECT_FORMAT_POPUP_STYLES, `
    .object-format{--object-format-settings-panel-width:228px}
    .object-format__tab-section{padding:2px 0}
    .region-format__color{display:flex;flex-direction:column;gap:6px}
    .region-format__color cs-color-picker{align-self:flex-start}
    .region-format__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
    .region-format__fields label{display:flex;flex-direction:column;gap:6px;min-width:0}
    .region-format__fields cs-input-number,.region-format__fields cs-select{min-width:0}
    .region-format__wide{grid-column:1/-1}
    .region-format__switch{flex-direction:row!important;align-items:center;justify-content:space-between}
    .region-format__reset{display:inline-flex;align-items:center;gap:5px}
    .region-format__reset .bc_icon{font-size:14px}
  `],
})
export class CalloutBlockToolbar {
  @Input() containerBlock!: BlockCraft.IBlockComponents['callout'] | BlockCraft.IBlockComponents['render-unit']
  @ViewChild('rail') private rail?: ElementRef<HTMLElement>

  private readonly popup = new ObjectFormatPopupState<RegionPanel>()
  get activePanel(): RegionPanel | null { return this.popup.activePanel }
  panelSide: 'left' | 'right' = 'left'
  appearanceTab: AppearanceTab = 'fill'
  textTab: TextTab = 'padding'
  get activeTab(): AppearanceTab | TextTab {
    return this.activePanel === 'text' ? this.textTab : this.appearanceTab
  }
  readonly appearanceTabOptions = [{value: 'fill', label: '填充'}, {value: 'outline', label: '轮廓'}]
  readonly textTabOptions = [{value: 'padding', label: '边距'}, {value: 'text', label: '字体'}]
  get tabOptions() {
    return this.activePanel === 'text' ? this.textTabOptions : this.appearanceTabOptions
  }
  readonly paddingSides = [{key: 'top', label: '上'}, {key: 'right', label: '右'}, {key: 'bottom', label: '下'}, {key: 'left', label: '左'}] as const
  readonly fontOptions = TYPOGRAPHY_FONT_FAMILIES
  readonly fontWeights = [
    {value: 400, label: '常规 400'}, {value: 500, label: '中等 500'},
    {value: 600, label: '半粗 600'}, {value: 700, label: '粗体 700'},
    {value: 800, label: '特粗 800'}, {value: 900, label: '黑体 900'},
  ]
  colorGroups: ColorGroup[] = []
  readonly backgroundGroups: ColorGroup[] = [{title: '背景颜色', type: 'backColor', list: BUILTIN_BG_COLOR_LIST, templateUse: 'fill'}]
  readonly borderGroups: ColorGroup[] = [{title: '边框颜色', type: 'borderColor', list: BUILTIN_BG_COLOR_LIST, templateUse: 'fill'}]
  activeColors: Record<string, string | null> = {}
  borderWidth = 1
  borderStyle: BorderStyle = 'solid'
  padding = {top: 0, right: 0, bottom: 0, left: 0}
  textStyle = normalizeObjectTextStyle({})
  get fontFamilyValue(): string | null {
    return this.containerBlock.props.textFamily
      ? resolveTypographyFontFamily(this.textStyle.fontFamily)
      : null
  }

  ngOnInit() {
    this.colorGroups = this.containerBlock.flavour === 'callout'
      ? [{title: '字体颜色', type: 'color', list: BUILTIN_COLOR_LIST, templateUse: 'font'},
         ...this.backgroundGroups, ...this.borderGroups]
      : [...this.backgroundGroups, ...this.borderGroups, {title: '文字颜色', type: 'textFill', list: BUILTIN_COLOR_LIST, templateUse: 'font'}]

    if (this.containerBlock.flavour === 'render-unit') {
      this.padding = resolveBlockSurface(this.containerBlock.props).padding
      this.textStyle = normalizeObjectTextStyle(this.containerBlock.props)
    }

    const textColor = this.containerBlock.props['color']
    const existingBorder = Object.values(normalizeRegionBorders(this.containerBlock.props.borders) ?? {})
      .find(value => value !== 'none')
    const parsed = existingBorder?.match(/^(\d+(?:\.\d+)?)px (solid|dashed|dotted|double) (.+)$/)
    if (parsed) {
      this.borderWidth = Number(parsed[1])
      this.borderStyle = parsed[2] as BorderStyle
    }
    this.activeColors = {
      ...(this.containerBlock.flavour === 'callout' && typeof textColor === 'string' ? {color: textColor} : {}),
      backColor: this.containerBlock.props.backColor ?? null,
      borderColor: parsed?.[3] ?? this.containerBlock.props.borderColor ?? null,
      ...(this.containerBlock.flavour === 'render-unit' ? {
        textFill: typeof this.containerBlock.props.textFill === 'string' ? this.containerBlock.props.textFill : null,
      } : {}),
    }
  }

  togglePanel(panel: RegionPanel) {
    if (this.activePanel === null) {
      const railRect = this.rail?.nativeElement.getBoundingClientRect()
      const boundary = this.containerBlock.doc?.scrollContainer?.getBoundingClientRect()
        ?? document.documentElement.getBoundingClientRect()
      if (railRect) {
        const leftSpace = railRect.left - boundary.left - 8
        const rightSpace = boundary.right - railRect.right - 8
        this.panelSide = rightSpace >= 228 || rightSpace > leftSpace ? 'right' : 'left'
      }
    }
    this.popup.toggle(panel)
  }

  selectTab(value: string | number) {
    if (this.activePanel === 'appearance') {
      if (value !== 'fill' && value !== 'outline') return
      this.appearanceTab = value
    } else if (this.activePanel === 'text') {
      if (value !== 'padding' && value !== 'text') return
      this.textTab = value
    } else return
    this.popup.changed()
  }

  onColorPicked(event: {type: string; color: string | null}) {
    if (!this.colorGroups.some(group => group.type === event.type)) return
    if (this.containerBlock.flavour === 'render-unit' && event.type === 'borderColor') {
      const color = event.color === 'transparent' ? null : event.color
      this.writeBorder(this.borderWidth, this.borderStyle, color)
      this.activeColors = {...this.activeColors, borderColor: color}
    } else if (this.containerBlock.flavour === 'render-unit' && event.type === 'textFill') {
      this.containerBlock.updateProps({textFill: event.color})
      this.activeColors = {...this.activeColors, textFill: event.color}
    } else {
      this.containerBlock.updateProps({[event.type]: event.color})
      this.activeColors = {...this.activeColors, [event.type]: event.color}
    }
  }

  changePadding(side: keyof typeof this.padding, value: number | null) {
    if (this.containerBlock.flavour !== 'render-unit' || value === null || !Number.isFinite(value) || value < 0 || value > 1000) return
    this.padding = {...this.padding, [side]: value}
    const {top, right, bottom, left} = this.padding
    const normalized = normalizeBlockSurfaceProps({p: [top, right, bottom, left]})
    this.containerBlock.updateProps({p: normalized.p})
  }

  resetPadding() {
    if (this.containerBlock.flavour !== 'render-unit') return
    this.padding = {top: 0, right: 0, bottom: 0, left: 0}
    this.containerBlock.updateProps({p: null})
  }

  changeFontFamily(value: unknown) {
    if (typeof value !== 'string' || !this.fontOptions.some(font => font.css === value)) return
    this.writeTextStyle('textFamily', {...this.textStyle, fontFamily: value})
  }

  changeTextNumber(key: 'fontSize' | 'letterSpacingEm' | 'lineHeight', value: number | null) {
    if (value === null || !Number.isFinite(value)) return
    const field = key === 'fontSize' ? 'textFont' : 'textSpacing'
    this.writeTextStyle(field, {...this.textStyle, [key]: value})
  }

  changeFontWeight(value: unknown) {
    if (typeof value !== 'number' || !this.fontWeights.some(weight => weight.value === value)) return
    this.writeTextStyle('textFont', {...this.textStyle, fontWeight: value as ObjectTextStyle['fontWeight']})
  }

  changeItalic(value: boolean) {
    this.writeTextStyle('textFont', {...this.textStyle, fontStyle: value ? 'italic' : 'normal'})
  }

  resetTypography() {
    if (this.containerBlock.flavour !== 'render-unit') return
    this.textStyle = normalizeObjectTextStyle({})
    this.activeColors = {...this.activeColors, textFill: null}
    this.containerBlock.updateProps({textFamily: null, textFont: null, textSpacing: null, textFill: null})
  }

  private writeTextStyle(field: 'textFamily' | 'textFont' | 'textSpacing', style: ObjectTextStyle) {
    if (this.containerBlock.flavour !== 'render-unit') return
    this.textStyle = style
    this.containerBlock.updateProps({[field]: storeObjectTextStyle(style)[field]})
  }

  changeBorderWidth(width: number | null) {
    if (width === null || !Number.isFinite(width) || width < 0 || width > 24) return
    this.borderWidth = width
    const color = this.activeColors['borderColor'] ?? '#000000'
    this.writeBorder(width, this.borderStyle, color)
    this.activeColors = {...this.activeColors, borderColor: color}
  }

  changeBorderStyle(value: unknown) {
    const style = String(value)
    if (!['solid', 'dashed', 'dotted', 'double'].includes(style)) return
    this.borderStyle = style as BorderStyle
    const color = this.activeColors['borderColor'] ?? '#000000'
    this.writeBorder(this.borderWidth, this.borderStyle, color)
    this.activeColors = {...this.activeColors, borderColor: color}
  }

  private writeBorder(width: number, style: BorderStyle, color: string | null) {
    const region = this.containerBlock as BlockCraft.IBlockComponents['render-unit']
    const existing = normalizeRegionBorders(region.props.borders)
    if (!existing && width === 1 && style === 'solid') {
      region.updateProps({borderColor: color})
      return
    }
    const borders: RegionBorders | null = width > 0 && color
      ? Object.fromEntries(SIDES.filter(side => !existing || (existing[side] && existing[side] !== 'none'))
          .map(side => [side, `${width}px ${style} ${color}`]))
      : null
    region.updateProps({borders, borderColor: null})
  }
}
