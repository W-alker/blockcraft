import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, DestroyRef,
  ElementRef,
  EventEmitter, HostListener,
  Output,
  ViewChild
} from "@angular/core";
import {NzButtonComponent} from "ng-zorro-antd/button";
import {isUrl} from "../../global";

@Component({
  selector: 'link-input-pad',
  template: `
    <input type="text" (input)="onInput($event)" [class.error]="!isValid" #inputElement/>
    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
      <button nz-button nzType="default" (mousedown)="$event.preventDefault(); onCancel.emit()">取消</button>
      <button nz-button nzType="primary" (mousedown)="$event.preventDefault(); submitValue()">确定</button>
    </div>

  `,
  styles: [`
    :host {
      width: 400px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 16px;
      gap: 16px;
      border-radius: 4px;
      border: 1px solid #E6E6E6;
      background: #FFF;
      box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.10);
      font-size: 14px;
      color: #333;

      > input {
        width: 100%;
        margin: 0;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid #E6E6E6;
        outline: none;

        &:focus {
          border-color: #4857E2;
        }

        &.error {
          border-color: #ff4d4f !important;
        }
      }
    }
  `],
  standalone: true,
  imports: [
    NzButtonComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LinkInputPad {
  constructor(
    private cdr: ChangeDetectorRef,
    public readonly destroyRef: DestroyRef
  ) {
  }

  @Output() onCancel = new EventEmitter<void>()
  @Output() onConfirm = new EventEmitter<string>()

  @ViewChild('inputElement', {read: ElementRef}) inputElement!: ElementRef<HTMLInputElement>;

  @HostListener('mousedown', ['$event'])
  onMouseDown($event: MouseEvent) {
    if($event.eventPhase !== 2) return
    $event.preventDefault()
    $event.stopPropagation()
  }

  isValid = true

  ngAfterViewInit() {
    this.inputElement.nativeElement.focus()
  }

  onInput($event: Event) {
    this.isValid = isUrl(this.inputElement.nativeElement.value)
    this.cdr.markForCheck()
  }

  submitValue() {
    if (!this.isValid) return
    this.onConfirm.emit(this.inputElement.nativeElement.value)
  }
}
