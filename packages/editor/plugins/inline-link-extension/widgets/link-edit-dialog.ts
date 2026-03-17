import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild} from "@angular/core";
import {NzButtonModule} from "ng-zorro-antd/button";
import {FormsModule} from "@angular/forms";
import {isUrl} from "../../../global";

@Component({
  selector: 'div.float-edit-dialog',
  template: `
    <div class="input-group" style="margin-bottom: 8px">
      <span>文本</span>
      <input type="text" placeholder="请输入标题" [(ngModel)]="updatedText"
             [class.error]="titleError" #titleInput (keyup.enter)="onUpdate()"
             (keydown.tab)="titleInput.focus()" (keydown.escape)="close.emit()">
    </div>
    <div class="input-group">
      <span>地址</span>
      <input type="text" placeholder="请输入地址" [(ngModel)]="updatedHref" [class.error]="urlError"
              #urlInput (keyup.enter)="onUpdate()" (keydown.escape)="close.emit()">
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
    </div>

<!--    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">-->
      <!--      <button nz-button (click)="onClose()">取消</button>-->
<!--    </div>-->
  `,
  styles: [`
    :host {
      padding: 12px;
      width: 400px;
      border-radius: 4px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      box-shadow: var(--bc-shadow-md);
      font-size: 14px;
      color: var(--bc-color);

      .input-group {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;

        > input {
          flex: 1;
          padding: 8px;
          border-radius: 4px;
          border: 1px solid var(--bc-border-color);
          outline: none;
          background: unset;

          &:focus {
            border-color: var(--bc-active-color);
          }

          &.error {
            border-color: var(--bc-error-color);
          }
        }
      }
    }
  `],
  standalone: true,
  imports: [
    NzButtonModule,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LinkEditFloatDialog {
  private _text: string = ''
  @Input({required: true})
  set text(v: string) {
    this.updatedText = v
    this._text = v
  }
  get text() {
    return this._text
  }

  private _href: string = ''
  @Input({required: true})
  set href(v: string) {
    this.updatedHref = v
    this._href = v
  }
  get href() {
    return this._href
  }

  @Output() close = new EventEmitter<void>()
  @Output() update = new EventEmitter<{text:string, href:string}>()

  constructor() {
  }

  @ViewChild('titleInput', {read: ElementRef}) titleInput!: ElementRef<HTMLInputElement>
  @ViewChild('urlInput', {read: ElementRef}) urlInput!: ElementRef<HTMLInputElement>

  protected titleError = false
  protected urlError = false
  protected updatedText: string = ''
  protected updatedHref: string = ''

  focus() {
    this.titleInput.nativeElement.focus()
  }

  verifyText() {
    this.titleError = !this.updatedText
  }

  verifyUrl() {
    this.urlError = !isUrl(this.updatedHref)
  }

  onClose() {
    this.close.emit()
  }

  onUpdate() {
    this.verifyUrl()
    this.verifyText()
    if (this.titleError) return this.titleInput.nativeElement.focus()
    if (this.urlError) return this.urlInput.nativeElement.focus()
    // if(this.updatedText === this.text && this.updatedHref === this.href) return this.close.emit()
    this.update.emit({
      text: this.updatedText,
      href: this.updatedHref
    })
  }

}
