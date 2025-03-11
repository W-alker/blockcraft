import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {TodoBlockModel} from "./index";

@Component({
  selector: 'div.todo-block',
  template: `
    <span class="todo-block-button" contenteditable="false">
      <i [class]="['bc_icon', props.completed ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"></i>
    </span>
    <div class="edit-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TodoBlockComponent extends EditableBlockComponent<TodoBlockModel> {

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.bindEvent('click', ct => {
      const target = ct.getDefaultEvent().target
      if (!target || !(target instanceof HTMLElement) || !target.classList.contains('todo-block-button')) return false
      this.props.completed = this.props.completed ? 0 : Date.now()
      this.changeDetectorRef.detectChanges()
      return true
    })
  }
}
