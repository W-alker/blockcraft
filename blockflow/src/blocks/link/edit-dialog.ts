import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild} from "@angular/core";
import {NzButtonModule} from "ng-zorro-antd/button";
import {FormsModule} from "@angular/forms";
import {ILinkBlockModel} from "./type";
import {isUrl} from "../../core";
import {NzRadioModule} from "ng-zorro-antd/radio";

@Component({
  selector: 'div.float-edit-dialog',
  template: `
    <p>标题</p>
    <input type="text" placeholder="请输入标题" [value]="attrs?.text" (input)="onTextUpdate($event)"
           [class.error]="titleError" #titleInput>
    <p>地址</p>
    <input type="text" placeholder="请输入地址" [value]="attrs?.href" (input)="onHrefUpdate($event)"
           [class.error]="urlError" #urlInput>
    <p>展现</p>
    <nz-radio-group [ngModel]="attrs?.appearance" (ngModelChange)="onAppearanceUpdate($event)">
      <label nz-radio nzValue="text">链接</label>
      <label nz-radio nzValue="card">卡片</label>
    </nz-radio-group>
    <div style="width: 100%; display: flex; justify-content: flex-end; gap: 16px">
      <button nz-button (click)="onClose()">取消</button>
      <button nz-button nzType="primary" (click)="onUpdate()">确定</button>
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

      > p {
        margin: 0;
        padding: 0;
      }

      > input {
        width: 100%;
        margin: 0;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid #E6E6E6;

        &:focus {
          border-color: #4857E2;
        }

        &.error {
          border-color: #ff4d4f;
        }
      }
    }
  `],
  standalone: true,
  imports: [
    NzButtonModule,
    NzRadioModule,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LinkBlockFloatDialog {
  @Input({required: true}) attrs?: ILinkBlockModel['props']

  @Output() close = new EventEmitter<void>()
  @Output() update = new EventEmitter<ILinkBlockModel['props']>()

  @ViewChild('titleInput', {read: ElementRef}) titleInput!: ElementRef<HTMLInputElement>
  @ViewChild('urlInput', {read: ElementRef}) urlInput!: ElementRef<HTMLInputElement>

  protected titleError = false
  protected urlError = false
  protected updatedText: string = ''
  protected updatedHref: string = ''

  protected appearanceUpdated = false

  onTextUpdate(e: Event) {
    this.updatedText = (e.target as HTMLInputElement).value
    this.titleError = !this.updatedText
  }

  onHrefUpdate(e: Event) {
    this.updatedHref = (e.target as HTMLInputElement).value
    this.urlError = !isUrl(this.updatedHref)
  }

  onClose() {
    this.close.emit()
  }

  onAppearanceUpdate(value: ILinkBlockModel['props']['appearance']) {
    this.appearanceUpdated = value !== this.attrs?.appearance
  }

  onUpdate() {
    if (this.titleError) return this.titleInput.nativeElement.focus()
    if (this.urlError) return this.urlInput.nativeElement.focus()
    this.update.emit({
      text: this.updatedText || this.attrs?.text!,
      href: this.updatedHref || this.attrs?.href!,
      appearance: this.appearanceUpdated ? this.attrs?.appearance === 'card' ? 'text' : 'card' : this.attrs?.appearance!
    })
  }

}
