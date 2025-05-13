import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input} from "@angular/core";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective} from "../../../components";
import {NgForOf} from "@angular/common";
import {HostUrlPipe} from "../../../blocks";
import {isFigmaUrl, isJueJinUrl} from "../../../global";

@Component({
  selector: "div.iframe-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick($event)" direction="row">
      <a class="link" [href]="block.props.url"
         target="_blank">{{ block.props.url | hostUrl }}</a>
      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item [expandable]="true" [bcOverlayTrigger]="viewModeTpl"
                             [positions]="['bottom-left', 'bottom-right', 'top-right', 'top-left']" [offsetY]="8">
        卡片视图
      </bc-float-toolbar-item>
    </bc-float-toolbar>

    <ng-template #viewModeTpl>
      <bc-float-toolbar direction="column" (onItemClick)="switchViewMode($event)">
        @for (mode of BOOKMARK_BLOCK_VIEW_MODE_MAP; track mode[0]) {
          <bc-float-toolbar-item [value]="mode[0]" [name]="mode[0]" [active]="mode[0] === 'card'">
            {{ mode[1] }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>
  `,
  styles: [`
    .link {
      display: block;
      color: var(--bc-active-color);
      line-height: 32px;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
export class BookmarkBlockToolbar {
  @Input()
  block!: BlockCraft.IBlockComponents['bookmark']

  @Input()
  doc!: BlockCraft.Doc

  embedType: BlockCraft.BlockFlavour | null = null
  protected readonly BOOKMARK_BLOCK_VIEW_MODE_MAP: Map<string, string> = new Map([['inline', '链接视图'], ['card', '卡片视图']])

  constructor(
    private cdr: ChangeDetectorRef
  ) {
  }

  ngOnInit() {
    if(isFigmaUrl(this.block.props.url) && this.doc.schemas.has('figma-embed')) {
      this.embedType = 'figma-embed'
    }
    if(isJueJinUrl(this.block.props.url) && this.doc.schemas.has('juejin-embed')) {
      this.embedType = 'juejin-embed'
    }
    if (this.embedType) {
      this.BOOKMARK_BLOCK_VIEW_MODE_MAP.set('embed', '嵌入视图')
      this.cdr.markForCheck()
    }
  }

  switchViewMode($event: BcFloatToolbarItemComponent) {
    switch ($event.value) {
      case 'embed':
        if(!this.embedType) return
        const embed = this.doc.schemas.createSnapshot(this.embedType, [this.block.props.url])
        this.doc.crud.replaceWithSnapshots(this.block.id, [embed]).then(() => {})
        break
      case 'inline':
        const paragraph = this.doc.schemas.createSnapshot('paragraph', [
          [{insert: this.block.props.url, attributes: {'a:link': this.block.props.url}}]]
        )
        this.doc.crud.replaceWithSnapshots(this.block.id, [paragraph]).then(() => {
          this.doc.selection.selectOrSetCursorAtBlock(paragraph.id, false)
        })
        break
    }
  }

  onItemClick($event: BcFloatToolbarItemComponent) {
    switch ($event.name) {
    }
  }
}
