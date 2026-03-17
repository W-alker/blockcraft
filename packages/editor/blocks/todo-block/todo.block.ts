import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {TodoBlockModel} from "./index";

@Component({
  selector: 'div.todo-block',
  template: `
    <button class="todo-block-button" contenteditable="false" (mousedown)="toggleCompleted($event)">
      <i [class]="['bc_icon', props.checked ? 'bc_xuanzhong-fill' : 'bc_weixuanzhong']"></i>
    </button>
    <div class="edit-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TodoBlockComponent extends EditableBlockComponent<TodoBlockModel> {

  @HostBinding('style.justify-content')
  override get textAlign() {
    return this._native.props['textAlign']
  }

  @HostBinding('class.is-checked')
  get checked() {
    return this._native.props.checked
  }

  toggleCompleted(e: Event) {
    e.preventDefault()
    this.updateProps({
      checked: this.props.checked ? 0 : Date.now()
    })
    this.changeDetectorRef.detectChanges()
  }
}
