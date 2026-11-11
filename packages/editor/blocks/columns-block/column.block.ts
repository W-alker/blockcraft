import { ChangeDetectionStrategy, Component } from "@angular/core";
import { BaseBlockComponent } from "../../framework";
import { ColumnBlockModel } from "./index";
import { takeUntil, takeWhile } from 'rxjs';

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
      <button type="button" class="column-drag-handle" aria-label="拖动子栏" title="点击选中子栏，拖动调整位置"
              contenteditable="false" data-bc-selection-interaction-ignore
              (pointerdown)="startColumnDrag($event)" (mousedown)="$event.preventDefault(); $event.stopPropagation()"
              (keydown)="$event.stopPropagation()" (click)="selectColumn($event)">
        <i class="bc_icon bc_yidong" aria-hidden="true"></i>
      </button>
    }
    <div class="children-render-container column-content"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColumnBlockComponent extends BaseBlockComponent<ColumnBlockModel> {
  private suppressHandleClick = false

  protected selectColumn(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (this.isReadonly || (event.detail > 0 && this.suppressHandleClick)) return
    this.doc.selection.selectBlock(this)
  }

  protected startColumnDrag(event: PointerEvent) {
    if (event.button !== 0 || this.isReadonly || this.doc.dragController.state !== 'idle') return
    event.preventDefault()
    event.stopPropagation()
    this.suppressHandleClick = false
    this.doc.dragController.startDrag(event, {kind: 'origin-block', blockId: this.id})
    // 只观察本次手势；真正拖动后生成的 click 不覆盖控制器恢复的选区。
    this.doc.dragController.state$.pipe(
      takeWhile(state => state !== 'idle'),
      takeUntil(this.onDestroy$),
    ).subscribe(state => {
      if (state === 'dragging') this.suppressHandleClick = true
    })
  }
}
