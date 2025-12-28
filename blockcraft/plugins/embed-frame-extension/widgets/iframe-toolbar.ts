import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective } from "../../../components";
import { NgForOf } from "@angular/common";
import { HostUrlPipe } from "../../../blocks";

const EMBED_BLOCK_VIEW_MODE_MAP: Record<string, string> = {
  inline: '链接视图',
  card: "卡片视图",
  embed: "嵌入视图"
}

@Component({
  selector: "div.iframe-toolbar",
  template: `
    <bc-float-toolbar [theme]="doc.theme" (onItemClick)="onItemClick($event)">
<!--      <a class="link" [href]="frameBlock.props.url"-->
<!--         target="_blank">{{ frameBlock.props.url | hostUrl }}</a>-->
<!--      <span class="bc-float-toolbar__divider"></span>-->
      <bc-float-toolbar-item [expandable]="true" [bcOverlayTrigger]="viewModeTpl"
                             [positions]="['bottom-left', 'bottom-right', 'top-right', 'top-left']" [offsetY]="8">
        {{ EMBED_BLOCK_VIEW_MODE_MAP['embed'] }}
      </bc-float-toolbar-item>
      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item icon="bc_huanyige" name="reload" title="重新加载"></bc-float-toolbar-item>
    </bc-float-toolbar>

    <ng-template #viewModeTpl>
      <bc-float-toolbar [theme]="doc.theme" direction="column" (onItemClick)="switchViewMode($event)">
        @for (mode of viewModeList; track mode[0]) {
          <bc-float-toolbar-item [value]="mode[0]" [name]="mode[0]" [active]="mode[0] === 'embed'">
            {{ mode[1] }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>
  `,
  styles: [`
    .link {
      color: var(--bc-active-color);
      line-height: 32px;
    }
  `],
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    NgForOf,
    BcOverlayTriggerDirective,
    HostUrlPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmbedFrameBlockToolbar {
  @Input()
  frameBlock!: BlockCraft.IBlockComponents['figma-embed']

  @Input()
  doc!: BlockCraft.Doc

  viewModeList = Object.entries(EMBED_BLOCK_VIEW_MODE_MAP)

  protected readonly EMBED_BLOCK_VIEW_MODE_MAP = EMBED_BLOCK_VIEW_MODE_MAP

  switchViewMode($event: BcFloatToolbarItemComponent) {
    switch ($event.value) {
      case 'card':
        const bookmark = this.doc.schemas.createSnapshot('bookmark', [this.frameBlock.props.url])
        this.doc.crud.replaceWithSnapshots(this.frameBlock.id, [bookmark]).then(() => {
        })
        break
      case 'inline':
        const paragraph = this.doc.schemas.createSnapshot('paragraph', [
          [{ insert: this.frameBlock.props.url, attributes: { 'a:link': this.frameBlock.props.url } }]]
        )
        this.doc.crud.replaceWithSnapshots(this.frameBlock.id, [paragraph]).then(() => {
          this.doc.selection.selectOrSetCursorAtBlock(paragraph.id, false)
        })
        break
    }
  }

  onItemClick($event: BcFloatToolbarItemComponent) {
    switch ($event.name) {
      case 'reload':
        this.frameBlock.reloadIframe()
    }
  }
}
