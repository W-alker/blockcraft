import {ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild, signal} from '@angular/core'
import {Subscription} from 'rxjs'
import {FormsModule} from '@angular/forms'
import {CsButtonComponent, CsColorPickerComponent, CsInputNumberComponent, CsOptionComponent, CsSegmentedComponent, CsSelectComponent, CsSliderComponent, CsTooltipDirective, type CsSliderValue} from '@cses/ui'
import {BUILTIN_BG_COLOR_LIST, BUILTIN_COLOR_LIST, ColorGroup} from '../../../components'
import {normalizeRegionBorderProps, regionBorderPatch, resolveRegionBorders, REGION_BORDER_SIDE_PROPS} from '../../../blocks/render-unit-block/borders'
import {resolveRenderUnitDimensions} from '../../../blocks/render-unit-block'
import {compactObjectTextFontFamily, normalizeBlockSurfaceProps, normalizeObjectTextStyle, resolveBlockSurface, storeObjectTextStyle, TYPOGRAPHY_FONT_FAMILIES, type ObjectTextStyle} from '../../../framework'
import {OBJECT_FORMAT_POPUP_STYLES, ObjectFormatPopupState} from '../../object-format-toolbar/object-format-popup'

type RegionPanel = 'appearance' | 'text'
type AppearanceTab = 'fill' | 'outline'
type TextTab = 'padding' | 'text'
type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double'
const SIDES = ['top', 'right', 'bottom', 'left'] as const
const PANEL_MAX_HEIGHT = 520

@Component({
  selector: 'render-unit-toolbar',
  standalone: true,
  imports: [FormsModule, CsButtonComponent, CsColorPickerComponent, CsInputNumberComponent, CsOptionComponent, CsSegmentedComponent, CsSelectComponent, CsSliderComponent, CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
          <button cs-button csType="text" csSize="sm" type="button"
                  [attr.aria-label]="hasFixedHeight() ? '恢复内容自适应' : '切换为固定尺寸'"
                  [csTooltip]="hasFixedHeight() ? '固定尺寸，点击恢复内容自适应' : '内容自适应，点击切换为固定尺寸'"
                  [csTooltipPlacement]="panelSide === 'left' ? 'right' : 'left'"
                  (mousedown)="$event.preventDefault()" (click)="containerBlock.toggleSizeMode()">
            <i class="bc_icon" [class.bc_size-fixed]="hasFixedHeight()" [class.bc_size-auto]="!hasFixedHeight()" aria-hidden="true"></i>
          </button>
        </nav>
        @if (activePanel) {
          <aside #panel class="object-format__panel" [attr.aria-label]="activePanel === 'appearance' ? '内容区域外观设置' : '内容区域文本设置'">
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
                <label class="object-format__slider-row region-format__opacity">不透明度
                  <cs-slider [csMin]="0" [csMax]="100" [csStep]="1"
                             csAriaLabel="填写区填充不透明度" [csValue]="backOpacityPercent"
                             (pointerup)="commitBackOpacity()" (keyup)="commitBackOpacity()"
                             (focusout)="commitBackOpacity()" (csValueChange)="changeBackOpacity($event)" />
                  <output>{{backOpacityPercent}}%</output>
                </label>
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
              <details class="region-format__per-side">
                <summary>四边独立设置</summary>
                <div class="region-format__per-side-body">
                  <cs-segmented csSize="small" [csBlock]="true" [csOptions]="borderSideOptions"
                                [ngModel]="borderSide" (ngModelChange)="selectBorderSide($event)"
                                csAriaLabel="选择边框边" />
                  <div class="region-format__fields">
                    <label>粗细
                      <cs-input-number csSize="sm" [csMin]="0" [csMax]="24" [csStep]="0.5"
                                       [csValue]="edgeWidth" (csValueChange)="changeEdge('width', $event)" />
                    </label>
                    <label>线型
                      <cs-select csSize="sm" csVariant="outlined" [csValue]="edgeStyle"
                                 (csValueChange)="changeEdge('style', $event)">
                        <cs-option csValue="solid" csLabel="实线" />
                        <cs-option csValue="dashed" csLabel="虚线" />
                        <cs-option csValue="dotted" csLabel="点线" />
                        <cs-option csValue="double" csLabel="双线" />
                      </cs-select>
                    </label>
                  </div>
                  <div class="region-format__color"><span>颜色</span>
                    <cs-color-picker csMode="palette" csSize="sm" [csValue]="edgeColor"
                                     [csAllowClear]="true" [csShowText]="true" [csShowAlpha]="false"
                                     (csChangeComplete)="changeEdge('color', $event.value)" />
                  </div>
                  <span class="region-format__hint">仅调整选中的边；粗细为 0 时隐藏该边。</span>
                  @if (hasIndependentBorders) {
                    <button cs-button csType="text" csSize="sm" type="button" class="region-format__reset" (click)="resetBorders()">
                      <i class="bc_icon bc_huifu1" aria-hidden="true"></i><span>恢复统一边框</span>
                    </button>
                  }
                </div>
              </details>
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
                        <cs-option [csValue]="font.id" [csLabel]="font.label" />
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
  `,
  styles: [OBJECT_FORMAT_POPUP_STYLES, `
    .object-format{--object-format-settings-panel-width:228px}
    .object-format__rail .bc_icon{display:block;width:1em;line-height:1;text-align:center;letter-spacing:0;text-indent:0}
    .object-format__rail .bc_icon::before{display:block}
    .object-format__rail .bc_size-fixed{transform:translateY(calc(23 / 1024 * 1em))}
    .object-format__tab-section{padding:2px 0}
    .region-format__color{display:flex;flex-direction:column;gap:6px}
    .region-format__color cs-color-picker{align-self:flex-start}
    .region-format__opacity{display:grid;grid-template-columns:48px minmax(0,1fr) 36px;align-items:center;gap:6px;margin-top:10px}
    .region-format__opacity cs-slider{min-width:0}
    .region-format__opacity output{font-variant-numeric:tabular-nums;text-align:right;color:var(--bc-color-secondary,#697386)}
    .region-format__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
    .region-format__fields label{display:flex;flex-direction:column;gap:6px;min-width:0}
    .region-format__fields cs-input-number,.region-format__fields cs-select{min-width:0}
    .region-format__wide{grid-column:1/-1}
    .region-format__reset{display:inline-flex;align-items:center;gap:5px}
    .region-format__reset .bc_icon{font-size:14px}
    .region-format__per-side{margin-top:10px;border-top:1px solid var(--bc-float-toolbar-divider-color,#e2e8f0);padding-top:8px}
    .region-format__per-side summary{cursor:pointer;font-size:12px}
    .region-format__per-side-body{display:grid;gap:10px;padding-top:10px}
    .region-format__per-side-body .region-format__fields{margin-bottom:0}
    .region-format__hint{font-size:11px;color:var(--bc-color-secondary,#697386)}
  `],
})
export class RenderUnitToolbar {
  @Input() containerBlock!: BlockCraft.IBlockComponents['render-unit']
  readonly hasFixedHeight = signal(false)
  private sizeSubscription?: Subscription
  @ViewChild('rail') private rail?: ElementRef<HTMLElement>
  @ViewChild('panel') set panel(ref: ElementRef<HTMLElement> | undefined) {
    this.disconnectPanelPositioning()
    const panel = ref?.nativeElement
    if (!panel) return
    this.panelElement = panel
    const view = panel.ownerDocument.defaultView
    if (!view) return
    this.panelView = view
    this.panelObserver = new ResizeObserver(this.schedulePanelPosition)
    this.panelObserver.observe(panel)
    panel.ownerDocument.addEventListener('scroll', this.onViewportScroll, true)
    view.addEventListener('resize', this.schedulePanelPosition)
    view.visualViewport?.addEventListener('resize', this.schedulePanelPosition)
    view.visualViewport?.addEventListener('scroll', this.schedulePanelPosition)
    this.schedulePanelPosition()
  }

  private panelElement?: HTMLElement
  private panelView?: Window
  private panelObserver?: ResizeObserver
  private panelFrame?: number

  private readonly onViewportScroll = (event: Event) => {
    if (event.target instanceof Node && this.panelElement?.contains(event.target)) return
    this.schedulePanelPosition()
  }

  private readonly schedulePanelPosition = () => {
    if (!this.panelView || this.panelFrame !== undefined) return
    this.panelFrame = this.panelView.requestAnimationFrame(() => {
      this.panelFrame = undefined
      this.positionPanel()
    })
  }

  private positionPanel() {
    const panel = this.panelElement
    const rail = this.rail?.nativeElement
    const view = this.panelView
    if (!panel?.isConnected || !rail?.isConnected || !view) return

    const viewport = view.visualViewport
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportBottom = viewportTop + (viewport?.height ?? panel.ownerDocument.documentElement.clientHeight)
    const minTop = viewportTop + 12
    const maxBottom = viewportBottom - 12
    // The panel is absolutely positioned, so CDK only measures the rail.
    // Keep the rail anchored while fitting the panel inside the visible viewport.
    panel.style.maxHeight = `${Math.max(0, Math.min(PANEL_MAX_HEIGHT, maxBottom - minTop))}px`
    const railTop = rail.getBoundingClientRect().top
    const panelHeight = panel.getBoundingClientRect().height
    const offset = Math.max(minTop - railTop, Math.min(0, maxBottom - railTop - panelHeight))
    panel.style.top = `${offset}px`
  }

  private disconnectPanelPositioning() {
    this.panelObserver?.disconnect()
    this.panelObserver = undefined
    const panel = this.panelElement
    const view = this.panelView
    if (panel) panel.ownerDocument.removeEventListener('scroll', this.onViewportScroll, true)
    if (view) {
      view.removeEventListener('resize', this.schedulePanelPosition)
      view.visualViewport?.removeEventListener('resize', this.schedulePanelPosition)
      view.visualViewport?.removeEventListener('scroll', this.schedulePanelPosition)
      if (this.panelFrame !== undefined) view.cancelAnimationFrame(this.panelFrame)
    }
    this.panelFrame = undefined
    this.panelElement = undefined
    this.panelView = undefined
  }

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
  get fontOptions() {
    const current = this.containerBlock?.props.textFamily
    return current && !TYPOGRAPHY_FONT_FAMILIES.some(font => font.id === compactObjectTextFontFamily(current))
      ? [...TYPOGRAPHY_FONT_FAMILIES, {id: current, label: '自定义字体', css: current}]
      : TYPOGRAPHY_FONT_FAMILIES
  }
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
  borderSide: typeof SIDES[number] = 'top'
  readonly borderSideOptions = [
    {value: 'top', label: '上'}, {value: 'right', label: '右'},
    {value: 'bottom', label: '下'}, {value: 'left', label: '左'},
  ]
  private get selectedEdge() {
    const border = resolveRegionBorders(this.containerBlock.props)?.[this.borderSide]
    const match = border?.match(/^(\d+(?:\.\d+)?)px (solid|dashed|dotted|double) (.+)$/)
    return {
      width: match ? Number(match[1]) : 0,
      style: (match?.[2] ?? 'solid') as BorderStyle,
      color: match?.[3] ?? '#808080',
    }
  }
  get edgeWidth() { return this.selectedEdge.width }
  get edgeStyle() { return this.selectedEdge.style }
  get edgeColor() { return this.selectedEdge.color }
  get hasIndependentBorders() {
    const props = normalizeRegionBorderProps(this.containerBlock.props)
    return SIDES.some(side => props[REGION_BORDER_SIDE_PROPS[side]] != null)
  }
  padding = {top: 0, right: 0, bottom: 0, left: 0}
  textStyle = normalizeObjectTextStyle({})
  backOpacityPercent = 82
  private opacityPending = false
  get fontFamilyValue(): string | null {
    const family = this.containerBlock.props.textFamily
    return family ? compactObjectTextFontFamily(family) : null
  }

  ngOnInit() {
    const syncHeight = () => this.hasFixedHeight.set(!!resolveRenderUnitDimensions(this.containerBlock.props, 100))
    syncHeight()
    this.sizeSubscription = this.containerBlock.onPropsChange?.subscribe(changes => {
      if (['wr', 'ar', 'width', 'height'].some(key => changes.has(key))) syncHeight()
    })
    this.colorGroups = [...this.backgroundGroups, ...this.borderGroups,
      {title: '文字颜色', type: 'textFill', list: BUILTIN_COLOR_LIST, templateUse: 'font'}]

    this.padding = resolveBlockSurface(this.containerBlock.props).padding
    this.textStyle = normalizeObjectTextStyle(this.containerBlock.props)
    this.backOpacityPercent = Math.round((this.containerBlock.props.backOpacity ?? 0.82) * 100)

    const existingBorder = Object.values(resolveRegionBorders(this.containerBlock.props) ?? {})
      .find(value => value !== 'none')
    const parsed = existingBorder?.match(/^(\d+(?:\.\d+)?)px (solid|dashed|dotted|double) (.+)$/)
    if (parsed) {
      this.borderWidth = Number(parsed[1])
      this.borderStyle = parsed[2] as BorderStyle
    }
    this.activeColors = {
      backColor: this.containerBlock.props.backColor ?? null,
      borderColor: parsed?.[3] ?? this.containerBlock.props.borderColor ?? null,
      textFill: typeof this.containerBlock.props.textFill === 'string' ? this.containerBlock.props.textFill : null,
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
    if (event.type === 'borderColor') {
      const color = event.color === 'transparent' ? null : event.color
      this.writeBorder(this.borderWidth, this.borderStyle, color)
      this.activeColors = {...this.activeColors, borderColor: color}
    } else if (event.type === 'textFill') {
      this.containerBlock.updateProps({textFill: event.color})
      this.activeColors = {...this.activeColors, textFill: event.color}
    } else {
      this.containerBlock.updateProps({[event.type]: event.color})
      this.activeColors = {...this.activeColors, [event.type]: event.color}
    }
  }

  changeBackOpacity(value: CsSliderValue) {
    const percent = Array.isArray(value) ? value[0] : value
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return
    this.backOpacityPercent = percent
    this.opacityPending = true
    this.containerBlock.hostElement?.style.setProperty('--bc-render-unit-background-opacity', `${percent}%`)
  }

  commitBackOpacity() {
    if (!this.opacityPending) return
    this.opacityPending = false
    const next = this.backOpacityPercent === 82 ? null : this.backOpacityPercent / 100
    if ((this.containerBlock.props.backOpacity ?? null) !== next) {
      this.containerBlock.updateProps({backOpacity: next})
    }
  }

  ngOnDestroy() {
    this.sizeSubscription?.unsubscribe()
    this.disconnectPanelPositioning()
    if (!this.opacityPending) return
    const opacity = this.containerBlock.props.backOpacity
    if (opacity == null) this.containerBlock.hostElement?.style.removeProperty('--bc-render-unit-background-opacity')
    else this.containerBlock.hostElement?.style.setProperty('--bc-render-unit-background-opacity', `${opacity * 100}%`)
  }

  changePadding(side: keyof typeof this.padding, value: number | null) {
    if (value === null || !Number.isFinite(value) || value < 0 || value > 1000) return
    this.padding = {...this.padding, [side]: value}
    const {top, right, bottom, left} = this.padding
    const normalized = normalizeBlockSurfaceProps({p: [top, right, bottom, left]})
    this.containerBlock.updateProps({p: normalized.p})
  }

  resetPadding() {
    this.padding = {top: 0, right: 0, bottom: 0, left: 0}
    this.containerBlock.updateProps({p: null})
  }

  changeFontFamily(value: unknown) {
    if (typeof value !== 'string' || !TYPOGRAPHY_FONT_FAMILIES.some(font => font.id === value)) return
    this.textStyle = {...this.textStyle, fontFamily: value}
    this.containerBlock.updateProps({textFamily: value})
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

  resetTypography() {
    this.textStyle = normalizeObjectTextStyle({})
    this.activeColors = {...this.activeColors, textFill: null}
    this.containerBlock.updateProps({textFamily: null, textFont: null, textSpacing: null, textFill: null})
  }

  private writeTextStyle(field: 'textFont' | 'textSpacing', style: ObjectTextStyle) {
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

  selectBorderSide(value: unknown) {
    if (SIDES.includes(value as typeof SIDES[number])) this.borderSide = value as typeof SIDES[number]
  }

  changeEdge(key: 'width' | 'style' | 'color', value: unknown) {
    if (key === 'width' && value === null) return
    const edge = this.selectedEdge
    const width = key === 'width' ? Number(value) : edge.width
    const style = key === 'style' ? value : edge.style
    const color = key === 'color' ? (value || 'currentColor') : edge.color
    if (!Number.isFinite(width) || width < 0 || width > 24 ||
        !['solid', 'dashed', 'dotted', 'double'].includes(String(style)) ||
        typeof color !== 'string') return
    const current = normalizeRegionBorderProps(this.containerBlock.props)
    this.containerBlock.updateProps(regionBorderPatch({
      ...this.containerBlock.props, ...current,
      [REGION_BORDER_SIDE_PROPS[this.borderSide]]: width === 0 ? 'none' : `${width}px ${style} ${color}`,
    }))
  }

  resetBorders() {
    this.containerBlock.updateProps(regionBorderPatch({}))
  }

  private writeBorder(width: number, style: BorderStyle, color: string | null) {
    const border = width > 0 && color ? `${width}px ${style} ${color}` : null
    this.containerBlock.updateProps({...regionBorderPatch({border}), borderColor: null})
  }
}
