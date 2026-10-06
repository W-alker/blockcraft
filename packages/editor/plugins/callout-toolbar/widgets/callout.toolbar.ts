import {ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild} from '@angular/core'
import {FormsModule} from '@angular/forms'
import {CsButtonComponent, CsColorPickerComponent, CsInputNumberComponent, CsOptionComponent, CsSegmentedComponent, CsSelectComponent, CsTooltipDirective} from '@cses/ui'
import {
  BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective,
  BUILTIN_BG_COLOR_LIST, BUILTIN_COLOR_LIST, ColorGroup, ColorPickerComponent,
} from '../../../components'
import {normalizeRegionBorders, type RegionBorders} from '../../../blocks/render-unit-block/borders'
import {OBJECT_FORMAT_POPUP_STYLES, ObjectFormatPopupState} from '../../object-format-toolbar/object-format-popup'

type RegionTab = 'fill' | 'outline'
type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double'
const SIDES = ['top', 'right', 'bottom', 'left'] as const

@Component({
  selector: 'callout-block-toolbar',
  standalone: true,
  imports: [FormsModule, CsButtonComponent, CsColorPickerComponent, CsInputNumberComponent, CsOptionComponent, CsSegmentedComponent, CsSelectComponent, CsTooltipDirective, ColorPickerComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective, BcFloatToolbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (containerBlock.flavour === 'render-unit') {
      <div class="object-format object-format--anchored" [class.object-format--left]="panelSide === 'right'"
           contenteditable="false" data-bc-region-format-toolbar>
        <nav #rail class="object-format__rail" aria-label="内容区域快捷工具">
          <button cs-button csType="text" csSize="sm" type="button"
                  [class.active]="activePanel === 'appearance'"
                  [attr.aria-expanded]="activePanel === 'appearance'" aria-label="内容区域设置"
                  csTooltip="内容区域设置" [csTooltipPlacement]="panelSide === 'left' ? 'right' : 'left'" (click)="togglePanel()">
            <i class="bc_icon bc_tuxing" aria-hidden="true"></i>
          </button>
        </nav>
        @if (activePanel) {
          <aside class="object-format__panel" aria-label="内容区域设置">
            <div class="object-format__scroll">
              <cs-segmented class="object-format__tabs" csSize="small" [csBlock]="true"
                            [csOptions]="tabOptions" [ngModel]="activeTab"
                            (ngModelChange)="selectTab($event)" csAriaLabel="内容区域格式分类" />
              <section class="object-format__tab-section" [hidden]="activeTab !== 'fill'">
                <label class="region-format__color">填充颜色
                  <cs-color-picker csMode="palette" csSize="sm" [csValue]="activeColors['backColor']"
                                   [csAllowClear]="true" [csShowText]="true" [csShowAlpha]="false"
                                   (csChangeComplete)="onColorPicked({type: 'backColor', color: $event.value})" />
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
              <label class="region-format__color">轮廓颜色
              <cs-color-picker csMode="palette" csSize="sm"
                               [csValue]="activeColors['borderColor']"
                               [csAllowClear]="true" [csShowText]="true" [csShowAlpha]="false"
                               (csChangeComplete)="onColorPicked({type: 'borderColor', color: $event.value})" />
              </label>
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
    .region-format__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
    .region-format__fields label{display:flex;flex-direction:column;gap:6px;min-width:0}
    .region-format__fields cs-input-number,.region-format__fields cs-select{min-width:0}
  `],
})
export class CalloutBlockToolbar {
  @Input() containerBlock!: BlockCraft.IBlockComponents['callout'] | BlockCraft.IBlockComponents['render-unit']
  @ViewChild('rail') private rail?: ElementRef<HTMLElement>

  private readonly popup = new ObjectFormatPopupState<'appearance'>()
  get activePanel(): 'appearance' | null { return this.popup.activePanel }
  panelSide: 'left' | 'right' = 'left'
  activeTab: RegionTab = 'fill'
  readonly tabOptions = [{value: 'fill', label: '填充'}, {value: 'outline', label: '轮廓'}]
  colorGroups: ColorGroup[] = []
  readonly backgroundGroups: ColorGroup[] = [{title: '背景颜色', type: 'backColor', list: BUILTIN_BG_COLOR_LIST, templateUse: 'fill'}]
  readonly borderGroups: ColorGroup[] = [{title: '边框颜色', type: 'borderColor', list: BUILTIN_BG_COLOR_LIST, templateUse: 'fill'}]
  activeColors: Record<string, string | null> = {}
  borderWidth = 1
  borderStyle: BorderStyle = 'solid'

  ngOnInit() {
    this.colorGroups = this.containerBlock.flavour === 'callout'
      ? [{title: '字体颜色', type: 'color', list: BUILTIN_COLOR_LIST, templateUse: 'font'},
         ...this.backgroundGroups, ...this.borderGroups]
      : [...this.backgroundGroups, ...this.borderGroups]

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
    }
  }

  togglePanel() {
    if (this.activePanel !== 'appearance') {
      const railRect = this.rail?.nativeElement.getBoundingClientRect()
      const boundary = this.containerBlock.doc?.scrollContainer?.getBoundingClientRect()
        ?? document.documentElement.getBoundingClientRect()
      if (railRect) {
        const leftSpace = railRect.left - boundary.left - 8
        const rightSpace = boundary.right - railRect.right - 8
        this.panelSide = rightSpace >= 228 || rightSpace > leftSpace ? 'right' : 'left'
      }
    }
    this.popup.toggle('appearance')
  }

  selectTab(value: string | number) {
    if (value !== 'fill' && value !== 'outline') return
    this.activeTab = value
    this.popup.changed()
  }

  onColorPicked(event: {type: string; color: string | null}) {
    if (!this.colorGroups.some(group => group.type === event.type)) return
    if (this.containerBlock.flavour === 'render-unit' && event.type === 'borderColor') {
      const color = event.color === 'transparent' ? null : event.color
      this.writeBorder(this.borderWidth, this.borderStyle, color)
      this.activeColors = {...this.activeColors, borderColor: color}
    } else {
      this.containerBlock.updateProps({[event.type]: event.color})
      this.activeColors = {...this.activeColors, [event.type]: event.color}
    }
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
