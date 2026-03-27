import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent } from "../../../components";
import { AsyncPipe } from "@angular/common";

export interface IAttachmentToolbarItem {
  name: string
  icon: string
  label: string
  /** 仅在编辑模式下显示，默认 false */
  editOnly?: boolean
}

@Component({
  selector: "div.attachment-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick.emit($event)">
      @if(!(doc.readonlySwitch$ | async)) {
        <bc-float-toolbar-item icon="bc_bianji_1" name="rename" title="重命名"></bc-float-toolbar-item>
      }
      <bc-float-toolbar-item icon="bc_xiazai" name="download" title="下载文件"></bc-float-toolbar-item>

      @for (item of extraItems; track item.name) {
        @if (!item.editOnly || !(doc.readonlySwitch$ | async)) {
          <bc-float-toolbar-item [icon]="item.icon" [name]="item.name" [title]="item.label"></bc-float-toolbar-item>
        }
      }

      @if(!(doc.readonlySwitch$ | async)) {
        <span class="bc-float-toolbar__divider"></span>
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

  @Input()
  extraItems: IAttachmentToolbarItem[] = []

  @Output()
  onItemClick = new EventEmitter<BcFloatToolbarItemComponent>()
}
