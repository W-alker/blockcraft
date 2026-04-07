import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent } from "../../../components";
import { AsyncPipe } from "@angular/common";

export interface IAttachmentToolbarItem {
  name: string
  icon: string
  label: string
  /** 仅在编辑模式下显示，默认 false */
  editOnly?: boolean
  /** 附件尚未就绪（未上传或正在上传）时是否仍显示，默认 false */
  showWhenUnavailable?: boolean
}

@Component({
  selector: "div.attachment-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick.emit($event)">
      @if (canUse && !(doc.readonlySwitch$ | async)) {
        <bc-float-toolbar-item icon="bc_bianji_1" name="rename" title="重命名"></bc-float-toolbar-item>
      }
      @if (canUse && showPreview) {
        <bc-float-toolbar-item [icon]="previewIcon" name="preview" [title]="previewLabel"></bc-float-toolbar-item>
      }
      @if (canUse) {
        <bc-float-toolbar-item icon="bc_xiazai" name="download" title="下载文件"></bc-float-toolbar-item>
      }

      @for (item of extraItems; track item.name) {
        @if ((canUse || item.showWhenUnavailable) && (!item.editOnly || !(doc.readonlySwitch$ | async))) {
          <bc-float-toolbar-item [icon]="item.icon" [name]="item.name" [title]="item.label"></bc-float-toolbar-item>
        }
      }

      @if (!(doc.readonlySwitch$ | async)) {
        @if (canUse) {
          <span class="bc-float-toolbar__divider"></span>
        }
        <bc-float-toolbar-item icon="bc_shanchu" name="delete" title="删除"></bc-float-toolbar-item>
      }
    </bc-float-toolbar>
  `,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    AsyncPipe
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentBlockToolbar {
  @Input({ required: true })
  doc!: BlockCraft.Doc

  /** 附件是否就绪（已上传完成且可访问），控制 rename/preview/download 的可见性 */
  @Input()
  canUse = true

  /** 是否显示预览按钮 */
  @Input()
  showPreview = false

  @Input()
  previewIcon = 'bc_eye-open'

  @Input()
  previewLabel = '预览'

  @Input()
  extraItems: IAttachmentToolbarItem[] = []

  @Output()
  onItemClick = new EventEmitter<BcFloatToolbarItemComponent>()
}
