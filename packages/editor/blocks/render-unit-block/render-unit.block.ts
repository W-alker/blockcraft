import {ChangeDetectionStrategy, Component} from '@angular/core'
import {
  BaseBlockComponent,
  blockSurfaceImageFitToObjectFit,
  resolveBlockSurface,
  deriveObjectSizeFromPixels,
} from '../../framework'
import {RenderUnitBlockModel, resolveRenderUnitDimensions} from './index'
import {ShapeResizerComponent, type ShapeResizeCommit} from '../shape-block/shape-resizer.component'
import {takeUntil} from 'rxjs'

/**
 * Generic container used by host applications to declare a configurable
 * content region without inventing a presentation-specific Block flavour.
 */
@Component({
  selector: 'div.render-unit-block',
  template: `
    @if (surface.backgroundImage; as image) {
      <img
        class="render-unit-background-image"
        [src]="image.src"
        [style.object-fit]="objectFit(image.fit)"
        [style.object-position]="image.positionX + '% ' + image.positionY + '%'"
        [style.opacity]="image.opacity"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        [draggable]="false">
    }
    <div
      class="children-render-container render-unit-content"
      (mousedown)="selectEmptyRegion($event)">
    </div>
    @if (!isReadonly) {
      <button
        type="button"
        class="render-unit-block__object-handle"
        data-bc-print-exclude="true"
        data-bc-selection-interaction-ignore
        data-bc-placement-pick-ignore
        contenteditable="false"
        aria-label="选中内容区域并调整大小"
        title="选中内容区域并调整大小"
        (pointerdown)="focusResizeHandles($event)"
        (click)="focusResizeHandles($event)">
        <i class="bc_icon bc_yidong" aria-hidden="true"></i>
      </button>
      <shape-resizer
        data-bc-print-exclude="true"
        data-bc-selection-interaction-ignore
        [target]="hostElement"
        [maxWidthContainer]="doc.objectSizing.rootContentElement ?? hostElement"
        [maxWidthResolver]="resizeMaxWidth"
        (resizeCommit)="onResized($event)" />
    }
  `,
  standalone: true,
  imports: [ShapeResizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-bc-render-unit': 'true',
    '[class.render-unit-sized]': '!!objectDimensions',
    '[style.width.px]': 'objectDimensions?.width',
    '[style.height.px]': 'objectDimensions?.height',
    '[style.--bc-render-unit-background-color]': 'props.backColor',
    '[style.--bc-render-unit-border-color]': 'props.borderColor',
    '[style.--bc-render-unit-padding-top]': 'surface.padding.top + "px"',
    '[style.--bc-render-unit-padding-right]': 'surface.padding.right + "px"',
    '[style.--bc-render-unit-padding-bottom]': 'surface.padding.bottom + "px"',
    '[style.--bc-render-unit-padding-left]': 'surface.padding.left + "px"',
  },
})
export class RenderUnitBlockComponent extends BaseBlockComponent<RenderUnitBlockModel> {
  get objectDimensions() {
    return resolveRenderUnitDimensions(this.props, this.doc.objectSizing.getReferenceWidth(this.id))
  }

  readonly resizeMaxWidth = () => this.doc.objectSizing.getReferenceWidth(this.id)

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.doc.objectSizing.widthChange$.pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      this.changeDetectorRef.markForCheck()
    })
  }

  /** 与流式图片共用布局像素换算；一个 props 事务同时更新宽高，支持协同和撤销。 */
  setSize(width: number, height: number): void {
    if (this.isReadonly || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
    const basis = this.doc.objectSizing.getReferenceWidth(this.id)
    const size = deriveObjectSizeFromPixels(Math.min(width, basis), height, basis)
    if (!size) return
    this.updateProps({...size, width: null, height: null})
  }

  onResized(event: ShapeResizeCommit): void {
    this.setSize(event.width, event.height)
  }

  protected get surface() {
    return resolveBlockSurface(this.props)
  }

  protected objectFit(
    fit: NonNullable<ReturnType<typeof resolveBlockSurface>['backgroundImage']>['fit'],
  ) {
    return blockSurfaceImageFitToObjectFit(fit)
  }

  protected focusResizeHandles(event: MouseEvent): void {
    if (this.isReadonly || event.button !== 0 ||
        ('isPrimary' in event && event.isPrimary === false)) return
    event.preventDefault()
    event.stopPropagation()
    this.doc.selection.selectBlock(this)
  }

  protected selectEmptyRegion(event: MouseEvent): void {
    if (event.target !== event.currentTarget || this.childrenLength > 0) return
    event.preventDefault()
    event.stopPropagation()
    this.doc.selection.selectBlock(this)
  }
}
