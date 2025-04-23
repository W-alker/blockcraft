import {ChangeDetectionStrategy, Component, EventEmitter, Output} from "@angular/core";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent} from "../../../components";

@Component({
  selector: "div.attachment-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick.emit($event)">
      <bc-float-toolbar-item icon="bc_bianji_1" name="rename" title="重命名"></bc-float-toolbar-item>
      <bc-float-toolbar-item icon="bc_xiazai" name="download" title="下载文件"></bc-float-toolbar-item>
      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item icon="bc_shanchu" name="delete" title="删除"></bc-float-toolbar-item>
    </bc-float-toolbar>
  `,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentBlockToolbar {

  @Output()
  onItemClick = new EventEmitter<BcFloatToolbarItemComponent>()


  constructor() {
  }

  ngOnInit() {
  }


}
