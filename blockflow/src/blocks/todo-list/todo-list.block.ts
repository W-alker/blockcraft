import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {NgIf} from "@angular/common";
import {NzDatePickerModule} from "ng-zorro-antd/date-picker";
import {EditableBlock} from "../../core";
import {ITodoListBlockModel} from "./type";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

@Component({
  selector: 'div.todo-list',
  template: `
      <span [class]="['todo-list__icon', 'bf_icon', props.checked ? 'bf_xuanzhong-fill' : 'bf_weixuanzhong']"
            [class.checked]="props.checked" (click)="toggleCheck()"></span>
      <div class="editable-container"></div>
  `,
  styles: [`
    :host {
      position: relative;
      padding-left: 1.2em;

      &.selected {
        background-color: var(--bf-selected);
      }
    }

    .todo-list__icon {
      position: absolute;
      left: 0;
      cursor: pointer;
      color: var(--bf-anchor);
      font-size: 1.1em;
      line-height: var(--bf-lh);
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
  override placeholder = '待办事项'

  protected _date: Date | null = null

  @HostBinding('class.checked')
  private _checked = false

  override ngOnInit() {
    super.ngOnInit()
    this.setCheck()
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      if(v.type === 'props') {
        this._checked !== this.props.checked && this.setCheck()
      }
    })
  }

  setCheck() {
    this._checked = this.props.checked
    this.cdr.markForCheck()
  }

  toggleCheck() {
    if(this.controller.readonly$.value) return
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
