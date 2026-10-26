import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from '@angular/core'
import {BaseBlockComponent} from '../../framework'
import {storeBlockPosition} from '../../framework/modules/object/block-placement/state'
import {
  ShapeResizerComponent,
  type ShapeResizeBox,
  type ShapeResizeCalculator,
  type ShapeResizeCommit,
  type ShapeRotateCommit,
} from '../shape-block/shape-resizer.component'
import {calculateImageResize} from '../image-block/image-resize'
import {renderStickerDataUrl} from './presets'
import type {StickerBlockModel} from './index'
import {resolveStickerDimensions, normalizeStickerRotation} from './sticker-size'

@Component({
  selector: 'div.sticker-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShapeResizerComponent],
  template: `
    <div class="sticker-block__surface"
         #surface
         data-bc-object-drag-surface
         data-bc-print-visual-surface
         [style.width.px]="renderedWidth"
         [style.aspect-ratio]="renderedAspectRatio"
         [style.transform]="rotationTransform"
         [attr.data-bc-resize-preview-anchor]="isAbsolute ? null : 'layout'">
      @if (imageUrl; as url) {
        <img [src]="url" alt="" contenteditable="false" draggable="false" />
      } @else {
        <span class="sticker-block__missing" contenteditable="false">贴纸预设不可用</span>
      }
      @if (!isReadonly) {
        <shape-resizer
          data-bc-selection-interaction-ignore
          [target]="surface"
          [maxWidthContainer]="resizeMaxWidthContainer"
          [maxWidthResolver]="resizeMaxWidth"
          [rotation]="rotation"
          [rotatable]="isAbsolute"
          rotationLabel="旋转贴纸"
          [resizeCalculator]="resizeCalculator"
          (resizeCommit)="onResized($event)"
          (rotateCommit)="onRotated($event)" />
      }
    </div>
  `,
  styles: [`
    :host { display:block; width:fit-content; max-width:100%; user-select:none; }
    .sticker-block__surface { position:relative; max-width:100%; }
    .sticker-block__surface img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:fill; }
    .sticker-block__missing { display:flex; align-items:center; justify-content:center; height:100%; border:1px dashed #aaa; color:#777; font-size:12px; }
    :host-context([data-bc-object-group]) .sticker-block__surface { max-width:none; }
    @media print { shape-resizer { display:none !important; } }
  `],
})
export class StickerBlockComponent extends BaseBlockComponent<StickerBlockModel> {
  @ViewChild('surface') surface!: ElementRef<HTMLElement>
  private resizeStart: ShapeResizeBox | null = null

  override ngOnInit(): void {
    super.ngOnInit()
    const size = resolveStickerDimensions(this.props)
    const rotation = normalizeStickerRotation(this.props.rotation)
    if (!this.isReadonly && ((this.props.rotation != null && this.props.rotation !== rotation) ||
      this.props.width !== size.width || this.props.height !== size.height)) {
      this.setInitProps({...size, ...(this.props.rotation != null ? {rotation} : {})})
    }
  }

  private get dimensions(): {width: number; height: number} {
    return resolveStickerDimensions(this.props)
  }

  protected readonly resizeCalculator: ShapeResizeCalculator = (handle, start, dx, dy, maxWidth) =>
    calculateImageResize(handle, this.resizeStart ?? start, dx, dy, maxWidth, this.rotation)

  protected readonly resizeMaxWidth = () => {
    const style = getComputedStyle(this.surface.nativeElement)
    const width = Number.parseFloat(style.width)
    const height = Number.parseFloat(style.height)
    this.resizeStart = width > 0 && height > 0
      ? {width, height, offsetX: 0, offsetY: 0}
      : null
    return this.doc.placement.isInObjectGroup(this.id)
      ? this.doc.objectSizing.rootContentWidth
      : this.resizeMaxWidthContainer.clientWidth
  }

  get imageUrl(): string | null {
    return renderStickerDataUrl(this.props.presetId, this.props.presetVersion, this.props.colors)
  }

  get renderedWidth(): number {
    return this.dimensions.width
  }

  get renderedAspectRatio(): string {
    const {width, height} = this.dimensions
    return `${width / height}`
  }

  get isAbsolute(): boolean {
    return this.doc.placement.isInAbsoluteLayout(this.id)
  }

  get resizeMaxWidthContainer(): HTMLElement {
    if (this.doc.placement.isInObjectGroup(this.id)) {
      const group = this.hostElement.closest<HTMLElement>('[data-bc-object-group]')
      return this.doc.objectSizing.rootContentElement ?? group?.parentElement ?? this.hostElement
    }
    return this.isAbsolute
      ? this.doc.objectSizing.rootContentElement ?? this.hostElement
      : this.hostElement.parentElement ?? this.hostElement
  }

  protected get rotation(): number {
    return normalizeStickerRotation(this.props.rotation)
  }

  protected get rotationTransform(): string {
    return this.rotation ? `rotate(${this.rotation}deg)` : ''
  }

  protected onRotated(event: ShapeRotateCommit): void {
    if (this.isReadonly) return
    const rotation = normalizeStickerRotation(event.rotation)
    if (rotation === this.rotation) return
    this.doc.placement.updateObjectGeometry(this, {rotation})
    this.surface.nativeElement.style.transform = this.rotationTransform
  }

  protected onResized(event: ShapeResizeCommit): void {
    this.surface.nativeElement.style.height = ''
    if (this.isReadonly) return
    const start = this.resizeStart
    if (start && Math.abs(event.width - start.width) < .01 && Math.abs(event.height - start.height) < .01) {
      this.surface.nativeElement.style.width = `${this.renderedWidth}px`
      return
    }
    if (!Number.isFinite(event.width) || !Number.isFinite(event.height) || event.width <= 0 || event.height <= 0) return
    const placement = this.doc.placement.getState(this)
    const size = resolveStickerDimensions({width: event.width, height: event.height})
    this.doc.crud.transact(() => this.doc.placement.updateObjectGeometry(this, {
      ...size,
      ...(placement.mode === 'absolute' && (event.offsetX || event.offsetY)
        ? {position: storeBlockPosition({
            x: placement.x + event.offsetX,
            y: placement.y + (event.offsetY ?? 0),
          })}
        : {}),
    }))
    this.changeDetectorRef.markForCheck()
  }
}
