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
    // 分页只改变 root 的视图内容起点，不改 placement 数据；连续流回退为 0。
    '[style.top]': "'var(--bc-placement-content-origin-y, 0px)'",
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
