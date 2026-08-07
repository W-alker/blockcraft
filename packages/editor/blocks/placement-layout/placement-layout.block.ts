import {ChangeDetectionStrategy, Component} from '@angular/core'
import {BaseBlockComponent} from '../../framework/block-std'
import type {PlacementLayoutBlockModel} from './index'

/**
 * Root-level infrastructure surface for blocks that are visually detached
 * from the normal document flow.
 *
 * The host deliberately has no height and creates no stacking context. Its
 * children therefore share the root document's under / flow / over z-index
 * tiers. The plane inherits root padding and exposes its own content box as
 * the containing block, so placement x/y never include the root padding.
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
    '[style.right.px]': '0',
    '[style.width]': "'auto'",
    '[style.height.px]': '0',
    '[style.box-sizing]': "'border-box'",
    '[style.padding]': "'inherit'",
    '[style.margin]': "'0'",
    '[style.pointer-events]': "'none'",
    '[attr.data-bc-placement-layer-bridge]': "''",
    '[attr.data-bc-placement-layout]': "''",
  },
  template: `
    <div
      class="children-render-container"
      style="position: relative; box-sizing: border-box; width: 100%; height: 0;
        isolation: auto; pointer-events: none">
    </div>
  `,
})
export class PlacementLayoutBlockComponent
  extends BaseBlockComponent<PlacementLayoutBlockModel> {}
