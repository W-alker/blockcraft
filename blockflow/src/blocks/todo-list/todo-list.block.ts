import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {EditableBlock} from "@core";
import {ITodoListBlockModel} from "@blocks/todo-list/type";
import {FormsModule} from "@angular/forms";
import {NgIf} from "@angular/common";
import {NzDatePickerModule} from "ng-zorro-antd/date-picker";

@Component({
  selector: 'div.todo-list',
  template: `
      <span [class]="['todo-list__icon', 'bf_icon', props.checked ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"
            [class.checked]="props.checked" (click)="toggleCheck()"></span>
      <div class="editable-container"></div>
      <nz-date-picker *ngIf="_date" style="padding: 0"
                      #endDatePicker
                      nzShowTime nzBorderless
                      nzFormat="yyyy-MM-dd HH:mm:ss"
                      [(ngModel)]="_date"
                      (ngModelChange)="onDatePickerChange($event)"
                      nzPlaceHolder="选择截止日期"
      ></nz-date-picker>
      <span class="bf_icon bf_shijian todo-list__date-pick-icon" (click)="openDatePicker()" title="添加截止日期"
            *ngIf="!_date"></span>
  `,
  styles: [`
    :host {
      position: relative;
      padding-left: 1.2em;
      display: flex;
      align-items: flex-start;
    }

    .todo-list__icon {
      position: absolute;
      left: 0;
      cursor: pointer;
      color: #333;
      font-size: 1.1em;
    }

    :host.checked .todo-list__icon {
      color: var(--bf-anchor);
    }

    :host .editable-container {
      flex: 1;
    }

    :host.checked .editable-container {
      text-decoration: line-through;
      opacity: .6;
    }

    .todo-list__date-pick-icon {
      cursor: pointer;
    }

    .todo-list__date-pick-icon:hover {
      color: #4857E2;
    }
  `],
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    NzDatePickerModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TodoListBlock extends EditableBlock<ITodoListBlockModel> {
  override placeholder = '输入待办事项，使用@快速提及成员并设置截止日期'

  protected _date: Date | null = null

  @HostBinding('class.checked')
  private _checked = false

  override ngOnInit() {
    super.ngOnInit()
    this._checked = this.props.checked
  }

  toggleCheck() {
    this._checked = !this._checked
    this.setProp('checked', this._checked)
  }

  openDatePicker() {
    this._date = this.props.endTime ? new Date(this.props.endTime) : new Date()
  }

  onDatePickerChange(e: Date) {
    e ? this.setProp('endTime', e.getTime()) : this.deleteProp('endTime')
  }

}
