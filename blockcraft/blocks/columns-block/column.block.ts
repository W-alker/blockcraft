import { ChangeDetectionStrategy, Component } from "@angular/core";
import { BaseBlockComponent } from "../../framework";
import { ColumnBlockModel } from "./index";

/**
 * 单列容器组件
 *
 * 功能：
 * - 纵向布局容器，子块在此列中垂直堆叠
 * - 每列有独立的 children-render-container
 */
@Component({
  selector: 'div.column-block',
  template: `
    <div class="children-render-container column-content"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColumnBlockComponent extends BaseBlockComponent<ColumnBlockModel> {
}
