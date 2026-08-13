import {ChangeDetectionStrategy, Component} from '@angular/core'
import {BaseBlockComponent} from '../../framework'
import {RenderUnitBlockModel} from './index'

/**
 * Generic container used by host applications to declare a configurable
 * content region without inventing a presentation-specific Block flavour.
 */
@Component({
  selector: 'div.render-unit-block',
  template: `
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
  },
})
export class RenderUnitBlockComponent extends BaseBlockComponent<RenderUnitBlockModel> {
  protected selectEmptyRegion(event: MouseEvent): void {
    if (event.target !== event.currentTarget || this.childrenLength > 0) return
    event.preventDefault()
    event.stopPropagation()
    this.doc.selection.selectBlock(this)
  }
}
