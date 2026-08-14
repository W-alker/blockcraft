import {FormsModule} from '@angular/forms'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  CsSegmentedComponent,
  CsSliderComponent,
  type CsSegmentedOptions,
  type CsSliderValue,
} from '@cses/ui'
import {
  DOC_FILE_SERVICE_TOKEN,
  type BlockSurfaceImageFit,
  type DocFileService,
} from '../../framework'
import {
  type NormalizedTextBoxBlockProps,
  type TextBoxBlockProps,
} from '../../blocks/text-box-block'
import {ShapePickerComponent} from '../../components'
import type {ShapeKind, ShapeStrokeStyle} from '../../blocks/shape-block'

type ShapePanelSection = 'shape' | 'fill' | 'outline'

@Component({
  selector: 'bc-text-box-shape-panel',
  standalone: true,
  imports: [
    FormsModule,
    ShapePickerComponent,
    CsButtonComponent,
    CsColorPickerComponent,
    CsInputNumberComponent,
    CsSegmentedComponent,
    CsSliderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="text-box-shape-panel" aria-label="设置文本框形状">
      <header class="text-box-shape-panel__header">
        <div>
          <strong>形状格式</strong>
          <span>更改外形、填充与轮廓</span>
        </div>
      </header>

      <cs-segmented
        class="text-box-shape-panel__tabs"
        csSize="small"
        [csBlock]="true"
        [csOptions]="sectionOptions"
        [ngModel]="activeSection"
        (ngModelChange)="setSection($event)"
        csAriaLabel="形状格式分类">
      </cs-segmented>

      @if (activeSection === 'shape') {
        <div class="text-box-shape-panel__catalog">
          <bc-shape-picker
            [embedded]="true"
            ariaLabel="更改文本框形状"
            [current]="props.sh"
            [supportsTextOnly]="true"
            (pick)="setShape($event)">
          </bc-shape-picker>
        </div>
      } @else if (activeSection === 'fill') {
        <div class="text-box-shape-panel__form">
          <div class="text-box-shape-panel__row">
            <span class="text-box-shape-panel__label">形状填充</span>
            <cs-color-picker
              csMode="palette"
              csSize="sm"
              [csValue]="props.backColor"
              [csAllowClear]="true"
              [csShowText]="true"
              [csShowAlpha]="false"
              (csChangeComplete)="setFillColor($event.value)">
            </cs-color-picker>
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              (click)="removeFill()">
              无填充
            </button>
          </div>

          <div class="text-box-shape-panel__row text-box-shape-panel__row--slider">
            <span class="text-box-shape-panel__label">填充透明度</span>
            <cs-slider
              [csMin]="0"
              [csMax]="100"
              [csStep]="1"
              csAriaLabel="形状填充透明度"
              [csValue]="fillTransparency"
              (csValueChange)="draftFillTransparency($event)"
              (pointerup)="commitFillTransparency()"
              (keyup)="commitFillTransparency()"
              (blur)="commitFillTransparency()">
            </cs-slider>
            <output>{{ fillTransparency }}%</output>
          </div>

          <div class="text-box-shape-panel__subsection">
            <div class="text-box-shape-panel__subheading">图片填充</div>
            <input
              #backgroundFile
              class="text-box-shape-panel__file-input"
              type="file"
              accept="image/*"
              (change)="uploadBackground($event)">
            <div class="text-box-shape-panel__image-actions">
              <button
                cs-button
                csType="secondary"
                csSize="sm"
                type="button"
                [disabled]="uploading"
                (click)="backgroundFile.click()">
                <i class="bc_icon bc_tupian-color" aria-hidden="true"></i>
                {{ props.bgi ? '替换图片' : '选择图片' }}
              </button>
              @if (props.bgi) {
                <button
                  cs-button
                  csType="text"
                  csSize="sm"
                  type="button"
                  (click)="removeBackground()">
                  移除
                </button>
              }
            </div>
            @if (backgroundStatus) {
              <p class="text-box-shape-panel__status" aria-live="polite">
                {{ backgroundStatus }}
              </p>
            }
          </div>

          @if (props.bgi) {
            <div class="text-box-shape-panel__row text-box-shape-panel__row--stacked">
              <span class="text-box-shape-panel__label">图片适应</span>
              <cs-segmented
                csSize="small"
                [csBlock]="true"
                [csOptions]="imageFitOptions"
                [ngModel]="props.bgs"
                (ngModelChange)="setImageFit($event)"
                csAriaLabel="背景图片适应方式">
              </cs-segmented>
            </div>
            <div class="text-box-shape-panel__row text-box-shape-panel__row--slider">
              <span class="text-box-shape-panel__label">图片透明度</span>
              <cs-slider
                [csMin]="0"
                [csMax]="100"
                [csStep]="1"
                csAriaLabel="背景图片透明度"
                [csValue]="imageTransparency"
                (csValueChange)="draftImageTransparency($event)"
                (pointerup)="commitImageTransparency()"
                (keyup)="commitImageTransparency()"
                (blur)="commitImageTransparency()">
              </cs-slider>
              <output>{{ imageTransparency }}%</output>
            </div>
          }
        </div>
      } @else {
        <div class="text-box-shape-panel__form">
          <div class="text-box-shape-panel__row">
            <span class="text-box-shape-panel__label">形状轮廓</span>
            <cs-color-picker
              csMode="palette"
              csSize="sm"
              [csValue]="props.borderColor"
              [csAllowClear]="true"
              [csShowText]="true"
              [csShowAlpha]="false"
              (csChangeComplete)="setOutlineColor($event.value)">
            </cs-color-picker>
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              (click)="removeOutline()">
              无轮廓
            </button>
          </div>

          <label class="text-box-shape-panel__row">
            <span class="text-box-shape-panel__label">宽度</span>
            <cs-input-number
              csSize="sm"
              [csMin]="0"
              [csMax]="20"
              [csStep]="0.5"
              [csPrecision]="1"
              [csValue]="props.bw"
              (csValueChange)="setOutlineWidth($event)">
            </cs-input-number>
            <span class="text-box-shape-panel__unit">px</span>
          </label>

          <div class="text-box-shape-panel__row text-box-shape-panel__row--stacked">
            <span class="text-box-shape-panel__label">线型</span>
            <cs-segmented
              csSize="small"
              [csBlock]="true"
              [csOptions]="strokeStyleOptions"
              [ngModel]="props.bs"
              (ngModelChange)="setStrokeStyle($event)"
              csAriaLabel="形状轮廓线型">
            </cs-segmented>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
      width: min(380px, calc(100vw - 86px));
      max-width: 100%;
    }

    .text-box-shape-panel {
      box-sizing: border-box;
      width: 100%;
      max-height: min(520px, calc(100vh - 24px));
      padding: 12px;
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 12px;
      background: var(--bc-float-toolbar-bg);
      color: var(--bc-float-toolbar-item-color);
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 10px 28px rgba(15, 23, 42, .16));
    }

    .text-box-shape-panel__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .text-box-shape-panel__header strong,
    .text-box-shape-panel__header span {
      display: block;
    }

    .text-box-shape-panel__header strong {
      font-size: 13px;
      line-height: 18px;
    }

    .text-box-shape-panel__header span,
    .text-box-shape-panel__status {
      margin: 2px 0 0;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      line-height: 16px;
    }

    .text-box-shape-panel__tabs {
      display: block;
      margin-bottom: 12px;
    }

    .text-box-shape-panel__catalog {
      min-height: 200px;
    }

    .text-box-shape-panel__form {
      display: grid;
      gap: 12px;
    }

    .text-box-shape-panel__row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .text-box-shape-panel__row--stacked {
      display: grid;
      grid-template-columns: 78px minmax(0, 1fr);
    }

    .text-box-shape-panel__row--slider {
      display: grid;
      grid-template-columns: 78px minmax(0, 1fr) 38px;
    }

    .text-box-shape-panel__row--slider output {
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      text-align: right;
    }

    .text-box-shape-panel__label {
      flex: 0 0 78px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 12px;
    }

    .text-box-shape-panel__row cs-color-picker,
    .text-box-shape-panel__row cs-input-number {
      flex: 1;
      min-width: 0;
    }

    .text-box-shape-panel__unit {
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
    }

    .text-box-shape-panel__subsection {
      padding-top: 12px;
      border-top: 1px solid var(--bc-float-toolbar-divider-color);
    }

    .text-box-shape-panel__subheading {
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 600;
    }

    .text-box-shape-panel__image-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .text-box-shape-panel__image-actions .bc_icon {
      margin-right: 4px;
    }

    .text-box-shape-panel__file-input {
      display: none;
    }
  `],
})
export class TextBoxShapePanelComponent implements OnChanges {
  @Input({required: true})
  props!: NormalizedTextBoxBlockProps

  @Input({required: true})
  textBoxBlock!: BlockCraft.BlockComponent

  @Output()
  readonly patch = new EventEmitter<Partial<TextBoxBlockProps>>()

  readonly sectionOptions: CsSegmentedOptions = [
    {value: 'shape', label: '形状'},
    {value: 'fill', label: '填充'},
    {value: 'outline', label: '轮廓'},
  ]
  readonly imageFitOptions: CsSegmentedOptions = [
    {value: 'cover', label: '填充'},
    {value: 'contain', label: '适应'},
    {value: 'stretch', label: '拉伸'},
  ]
  readonly strokeStyleOptions: CsSegmentedOptions = [
    {value: 'solid', label: '实线'},
    {value: 'dashed', label: '虚线'},
  ]

  activeSection: ShapePanelSection = 'shape'
  fillTransparency = 0
  imageTransparency = 0
  uploading = false
  backgroundStatus = ''

  private fillTransparencyDirty = false
  private imageTransparencyDirty = false

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    if (!this.fillTransparencyDirty) {
      this.fillTransparency = Math.round((1 - this.props.fo) * 100)
    }
    if (!this.imageTransparencyDirty) {
      this.imageTransparency = Math.round((1 - (this.props.bgo ?? 1)) * 100)
    }
  }

  setSection(value: string | number): void {
    if (value === 'shape' || value === 'fill' || value === 'outline') {
      this.activeSection = value
    }
  }

  setShape(value: ShapeKind): void {
    this.patch.emit({sh: value})
  }

  setFillColor(value: string | null): void {
    if (!value) {
      this.removeFill()
      return
    }
    this.patch.emit({
      backColor: value,
      ...(this.props.fo === 0 ? {fo: 1} : {}),
    })
  }

  removeFill(): void {
    this.fillTransparency = 100
    this.fillTransparencyDirty = false
    this.patch.emit({fo: 0})
  }

  draftFillTransparency(value: CsSliderValue): void {
    this.fillTransparency = normalizePercent(value)
    this.fillTransparencyDirty = true
  }

  commitFillTransparency(): void {
    if (!this.fillTransparencyDirty) return
    this.fillTransparencyDirty = false
    this.patch.emit({fo: 1 - this.fillTransparency / 100})
  }

  setOutlineColor(value: string | null): void {
    if (!value) {
      this.removeOutline()
      return
    }
    this.patch.emit({
      borderColor: value,
      ...(this.props.bw === 0 ? {bw: 1} : {}),
    })
  }

  setOutlineWidth(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return
    this.patch.emit({bw: value})
  }

  setStrokeStyle(value: string | number): void {
    if (value !== 'solid' && value !== 'dashed') return
    this.patch.emit({bs: value as ShapeStrokeStyle})
  }

  removeOutline(): void {
    this.patch.emit({bw: 0})
  }

  setImageFit(value: string | number): void {
    if (value !== 'cover' && value !== 'contain' && value !== 'stretch') return
    this.patch.emit({bgs: value as BlockSurfaceImageFit})
  }

  draftImageTransparency(value: CsSliderValue): void {
    this.imageTransparency = normalizePercent(value)
    this.imageTransparencyDirty = true
  }

  commitImageTransparency(): void {
    if (!this.imageTransparencyDirty) return
    this.imageTransparencyDirty = false
    this.patch.emit({bgo: 1 - this.imageTransparency / 100})
  }

  removeBackground(): void {
    this.backgroundStatus = ''
    this.patch.emit({bgi: null})
  }

  async uploadBackground(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      this.backgroundStatus = '请选择图片文件'
      return
    }

    let fileService: DocFileService
    try {
      fileService = this.textBoxBlock.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    } catch {
      this.backgroundStatus = '当前宿主未提供图片上传服务'
      return
    }
    if (fileService.isOverMaxSize(file.size)) {
      this.backgroundStatus = '图片超过宿主允许的大小'
      return
    }

    this.uploading = true
    this.backgroundStatus = '正在上传…'
    this.cdr.markForCheck()
    try {
      const url = await fileService.uploadImg(file, progress => {
        this.backgroundStatus = `正在上传 ${Math.round(progress)}%`
        this.cdr.markForCheck()
      })
      this.patch.emit({bgi: url})
      this.backgroundStatus = '图片已应用'
    } catch {
      this.backgroundStatus = '图片上传失败'
    } finally {
      this.uploading = false
      this.cdr.markForCheck()
    }
  }
}

function normalizePercent(value: CsSliderValue): number {
  const source = Array.isArray(value) ? value[0] : value
  return Math.round(Math.min(100, Math.max(0, Number(source) || 0)))
}
