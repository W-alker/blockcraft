import {ChangeDetectionStrategy, Component} from '@angular/core'
import {
  BaseBlockComponent,
  blockSurfaceImageFitToObjectFit,
  resolveBlockSurface,
} from '../../framework'
import {RenderUnitBlockModel} from './index'

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
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-bc-render-unit': 'true',
    '[style.--bc-render-unit-background-color]': 'props.backColor',
    '[style.--bc-render-unit-border-color]': 'props.borderColor',
    '[style.--bc-render-unit-padding-top]': 'surface.padding.top + "px"',
    '[style.--bc-render-unit-padding-right]': 'surface.padding.right + "px"',
    '[style.--bc-render-unit-padding-bottom]': 'surface.padding.bottom + "px"',
    '[style.--bc-render-unit-padding-left]': 'surface.padding.left + "px"',
  },
})
export class RenderUnitBlockComponent extends BaseBlockComponent<RenderUnitBlockModel> {
  protected get surface() {
    return resolveBlockSurface(this.props)
  }

  protected objectFit(
    fit: NonNullable<ReturnType<typeof resolveBlockSurface>['backgroundImage']>['fit'],
  ) {
    return blockSurfaceImageFitToObjectFit(fit)
  }

  protected selectEmptyRegion(event: MouseEvent): void {
    if (event.target !== event.currentTarget || this.childrenLength > 0) return
    event.preventDefault()
    event.stopPropagation()
    this.doc.selection.selectBlock(this)
  }
}
