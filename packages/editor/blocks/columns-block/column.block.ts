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
    @if (!isReadonly) {
      <button type="button" class="column-drag-handle" aria-label="拖动子栏" title="拖动调整子栏位置"
              contenteditable="false" data-bc-selection-interaction-ignore
              (pointerdown)="startColumnDrag($event)" (mousedown)="$event.preventDefault(); $event.stopPropagation()"
              (click)="$event.stopPropagation()">
        <i class="bc_icon bc_yidong" aria-hidden="true"></i>
      </button>
    }
    <div class="children-render-container column-content"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColumnBlockComponent extends BaseBlockComponent<ColumnBlockModel> {
  protected startColumnDrag(event: PointerEvent) {
    if (event.button !== 0 || this.isReadonly) return
    event.preventDefault()
    event.stopPropagation()
    this.doc.dragController.startDrag(event, {kind: 'origin-block', blockId: this.id})
  }
}
