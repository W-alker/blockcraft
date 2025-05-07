import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {TodoBlockModel} from "./index";

@Component({
  selector: 'div.todo-block',
  template: `
    <button class="todo-block-button" contenteditable="false" (mousedown)="toggleCompleted($event)">
      <i [class]="['bc_icon', props.checked ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"></i>
    </button>
    <div class="edit-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TodoBlockComponent extends EditableBlockComponent<TodoBlockModel> {

  toggleCompleted(e: Event) {
    e.preventDefault()
    this.props.checked = this.props.checked ? 0 : Date.now()
    this.changeDetectorRef.detectChanges()
  }
}
