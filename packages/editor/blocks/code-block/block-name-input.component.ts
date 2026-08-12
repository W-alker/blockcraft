import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, EventEmitter, Input, Output, ViewChild } from "@angular/core";

@Component({
  selector: "code-block-name-input",
  template: `
    <div class="input-wrapper">
      <input
        #inputEle
        placeholder="输入代码块名称"
        [value]="value"
        (keydown.enter)="$event.preventDefault(); onSubmit()"
        (keydown.escape)="cancel.emit()"
      />
    </div>

    <i class="bc_icon bc_xuanzhong icon-confirm" (mousedown)="$event.preventDefault(); onSubmit()"></i>
  `,
  styles: [`
    :host {
      width: 220px;
      display: flex;
      align-items: center;
      gap: var(--bc-padding-md);
      border-radius: 4px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      box-shadow: var(--bc-shadow-md);
      font-size: 14px;
      color: var(--bc-color);
      padding: var(--bc-padding-md);

      .input-wrapper {
        flex: 1;
        display: flex;
        align-items: center;
        border-radius: 4px;
        border: 1px solid var(--bc-border-color);
        padding: 4px 8px;

        &:focus-within {
          border-color: var(--bc-active-color);
        }

        > input {
          width: 100%;
          outline: none;
          margin: 0;
          border: none;
          background: none;
          color: var(--bc-color);
        }
      }

      .icon-confirm {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        font-size: 20px;
        color: var(--bc-color-light);
        cursor: pointer;
        border-radius: 4px;

        &:hover {
          background-color: var(--bc-bg-hover);
        }
      }
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeBlockNameInputComponent {
  @Input() value = "";

  @Output() valueChange = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild("inputEle", { read: ElementRef }) inputEle!: ElementRef<HTMLInputElement>;

  constructor(public readonly destroyRef: DestroyRef) {}

  focus() {
    const input = this.inputEle.nativeElement;
    input.focus();
    input.select();
  }

  onSubmit() {
    this.valueChange.emit(this.inputEle.nativeElement.value.trim());
  }
}
