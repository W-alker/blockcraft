import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild} from "@angular/core";

@Component({
  selector: "rename-input-pad",
  template: `
    <div class="input-wrapper" [class.is-error]="isError">
      <input placeholder="输入文件名" [value]="value" (keydown.enter)="$event.preventDefault(); onSubmit()"
             (keydown.escape)="cancel.emit()"
             #inputEle/>
      <span>{{ '.' + suffix }}</span>
    </div>

    <i class="bc_icon bc_xuanzhong icon-confirm" (mousedown)="$event.preventDefault(); onSubmit()"></i>
  `,
  styles: [`
    :host {
      width: 300px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 4px;
      border: 1px solid #E6E6E6;
      background: #FFF;
      box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.10);
      font-size: 14px;
      color: #333;
      padding: 12px;

      .input-wrapper {
        flex: 1;
        display: flex;
        align-items: flex-end;
        gap: 8px;
        border-radius: 4px;
        border: 1px solid #E6E6E6;
        padding: 4px 8px;
        margin: 0;

        &:focus-within {
          border-color: #4857E2;
        }

        &.is-error {
          border-color: #ff4d4f !important;
        }

        > input {
          width: 100%;
          outline: none;
          margin: 0;
          border: none;
        }

        > span {
          color: #999;
          font-size: 14px;
        }
      }

      .icon-confirm {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        font-size: 20px;
        color: #666;
        cursor: pointer;
        border-radius: 4px;

        &:hover {
          background-color: rgba(153, 153, 153, 0.2);
        }
      }
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RenameInputPad {

  private _value = ''
  @Input()
  set value(value: string) {
    const point = value.lastIndexOf('.')
    if (point) {
      this._value = value.substring(0, point)
      this.suffix = value.substring(point)
    } else {
      this.suffix = ''
      this._value = value
    }
    this.isError = false;
    this.suffix = value ? (value.split('.').pop() || '') : '';
  }

  get value() {
    return this._value;
  }

  @Output()
  valueChange: EventEmitter<string> = new EventEmitter<string>();

  @Output()
  cancel: EventEmitter<void> = new EventEmitter<void>();

  @ViewChild('inputEle', {read: ElementRef}) inputEle!: ElementRef<HTMLInputElement>;

  isError: boolean = false;
  suffix: string = '';

  constructor() {
  }

  focus() {
    this.inputEle.nativeElement.focus()
  }

  onSubmit() {
    const value = this.inputEle.nativeElement.value;
    if (!value) {
      this.isError = true;
      return;
    }

    this.valueChange.emit(value + '.' + this.suffix);
  }
}
