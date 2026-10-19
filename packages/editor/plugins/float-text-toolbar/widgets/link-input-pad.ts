import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, DestroyRef,
  ElementRef,
  EventEmitter, HostListener, Input,
  Output,
  ViewChild
} from "@angular/core";
import {CsButtonComponent} from "@cses/ui";
import {isUrl} from "../../../global";

@Component({
  selector: 'link-input-pad',
  template: `
    @if (showTextInput) {
      <label>显示文本
        <input #textElement type="text" [value]="textValue" (input)="textValue = $any($event.target).value"
          placeholder="输入链接文本" (keydown.enter)="submitValue($event)" (keydown.escape)="closePad($event)" />
      </label>
    }
    <input type="text" aria-label="链接地址" (input)="onInput($event)" [class.error]="!isValid" placeholder="输入链接地址" #inputElement
           (keydown.enter)="submitValue($event)" (keydown.escape)="closePad($event)"    />
    <div style="display: flex; justify-content: flex-end; gap: 8px; width: 100%;">
      <button cs-button csType="secondary" csSize="sm" (click)="closePad($event)">取消</button>
      <button cs-button csType="primary" csSize="sm" (click)="submitValue($event)">确定</button>
    </div>
  `,
  styles: [`
    :host {
      width: min(400px, calc(100vw - 24px));
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 16px;
      gap: 16px;
      border-radius: 4px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      box-shadow: var(--bc-shadow-md);
      font-size: 14px;
      color: var(--bc-color);

      label { display: grid; gap: 8px; width: 100%; }
      input {
        box-sizing: border-box;
        background: var(--bc-bg-primary);
        color: inherit;
        width: 100%;
        margin: 0;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--bc-border-color);
        outline: none;

        &:focus {
          border-color: var(--bc-active-color);
        }

        &.error {
          border-color: var(--bc-error-color) !important;
        }
      }
    }
  `],
  standalone: true,
  imports: [
    CsButtonComponent,
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

  // Optional insertion fields; range callers keep their URL-only event contract.
  @Input() showTextInput = false
  textValue = ''

  @ViewChild('inputElement', {read: ElementRef}) inputElement!: ElementRef<HTMLInputElement>;
  @ViewChild('textElement', {read: ElementRef}) textElement?: ElementRef<HTMLInputElement>;

  @HostListener('mousedown', ['$event'])
  onMouseDown($event: MouseEvent) {
    if($event.eventPhase !== 2) return
    $event.preventDefault()
    $event.stopPropagation()
  }

  isValid = true

  ngAfterViewInit() {
    (this.textElement ?? this.inputElement).nativeElement.focus()
  }

  onInput($event: Event) {
    this.isValid = isUrl(this.inputElement.nativeElement.value)
    this.cdr.markForCheck()
  }

  submitValue(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    const url = this.inputElement.nativeElement.value.trim()
    this.isValid = isUrl(url)
    this.cdr.markForCheck()
    if (!this.isValid || (this.showTextInput && !this.textValue.trim())) return
    this.onConfirm.emit(url)
  }

  closePad(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    this.onCancel.emit()
  }
}
