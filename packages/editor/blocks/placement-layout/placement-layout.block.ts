import {ChangeDetectionStrategy, Component} from '@angular/core'
import {BaseBlockComponent} from '../../framework/block-std'
import type {PlacementLayoutBlockModel} from './index'

/**
 * Root-level infrastructure surface for blocks that are visually detached
 * from the normal document flow.
 *
 * The host deliberately has no height and creates no stacking context. Its
 * children therefore share the root document's under / flow / over z-index
 * tiers while their coordinates keep the same root-content origin.
 */
@Component({
  selector: 'div.placement-layout-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.contenteditable]': "'false'",
    '[style.position]': "'absolute'",
    '[style.top.px]': '0',
    '[style.left.px]': '0',
    '[style.width.%]': '100',
    '[style.height.px]': '0',
    '[style.margin]': "'0'",
    '[style.pointer-events]': "'none'",
    '[attr.data-bc-placement-layer-bridge]': "''",
    '[attr.data-bc-placement-layout]': "''",
  },
  template: `
    <div
      class="children-render-container"
      style="isolation: auto; pointer-events: none">
    </div>
  `,
})
export class PlacementLayoutBlockComponent
  extends BaseBlockComponent<PlacementLayoutBlockModel> {}
