import { ChangeDetectionStrategy, Component, Input, computed } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective } from "../../../components";
import { AsyncPipe, NgForOf } from "@angular/common";
import { HostUrlPipe } from "../../../blocks";
import {LinkBlockMenuState, resolveLinkBlockTarget, runLinkViewChange} from '../../link-view-utils';

@Component({
  selector: "div.iframe-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick($event)" direction="row">
      <a class="link" [href]="block.props.url"
         target="_blank">{{ block.props.url | hostUrl }}</a>
      @if (!(doc.readonlySwitch$ | async) && !block.isReadonly) {
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item [expandable]="true" [bcOverlayTrigger]="viewModeTpl"
                               [positions]="['bottom-left', 'bottom-right', 'top-right', 'top-left']" [offsetY]="8">
          卡片视图
        </bc-float-toolbar-item>
      }
    </bc-float-toolbar>

    <ng-template #viewModeTpl>
      <bc-float-toolbar direction="column" (onItemClick)="switchViewMode($event)">
        @if (blockView.loading()) {
          <bc-float-toolbar-item [disabled]="true">正在解析链接…</bc-float-toolbar-item>
        } @else if (blockView.failed()) {
          <bc-float-toolbar-item [disabled]="true">链接解析失败</bc-float-toolbar-item>
        }
        @for (mode of BOOKMARK_BLOCK_VIEW_MODE_MAP(); track mode[0]) {
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
    HostUrlPipe,
    AsyncPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookmarkBlockToolbar {
  @Input()
  block!: BlockCraft.IBlockComponents['bookmark']

  @Input()
  doc!: BlockCraft.Doc

  readonly blockView = new LinkBlockMenuState()
  private conversionAbort?: AbortController
  protected readonly BOOKMARK_BLOCK_VIEW_MODE_MAP = computed(() => {
    const modes = new Map([['inline', '链接视图'], ['card', '卡片视图']])
    const target = this.blockView.target()
    if (target) modes.set('embed', target.label)
    return modes
  })

  ngOnChanges() {
    this.conversionAbort?.abort()
    if (this.doc && this.block && !this.doc.isReadonly && !this.block.isReadonly) {
      this.blockView.load(this.block.props.url, this.doc)
    } else this.blockView.cancel()
  }

  ngOnDestroy() {
    this.conversionAbort?.abort()
    this.blockView.cancel()
  }

  async switchViewMode($event: BcFloatToolbarItemComponent): Promise<void> {
    if (!this.isCurrent(this.block)) return
    const source = this.block
    if ($event.value === 'embed') {
      const url = this.block.props.url
      const expectedFlavour = this.blockView.target()?.flavour
      this.conversionAbort?.abort()
      const controller = new AbortController()
      this.conversionAbort = controller
      try {
        const resolved = await resolveLinkBlockTarget(url, this.doc, {phase: 'convert', signal: controller.signal})
        if (!resolved || controller.signal.aborted || !this.isCurrent(source) || source.props.url !== url
          || (expectedFlavour && resolved.flavour !== expectedFlavour)) return
        const parent = this.block.parentBlock
        if (!parent || !this.doc.canInsertChild(parent.id, resolved.flavour)) {
          this.doc.messageService.warn('当前位置无法转换为该视图')
          return
        }
        const target = this.doc.schemas.createSnapshot(resolved.flavour, resolved.params)
        await runLinkViewChange(this.doc, this.block, target.id, () => this.doc.crud.replaceWithSnapshots(this.block.id, [target]))
      } catch {
        if (!controller.signal.aborted) this.doc.messageService.warn('链接转换失败，请重试')
      } finally {
        if (this.conversionAbort === controller) this.conversionAbort = undefined
      }
    } else if ($event.value === 'inline') {
      this.conversionAbort?.abort()
      if (!this.block.parentId || !this.doc.canInsertChild(this.block.parentId, 'paragraph')) {
        this.doc.messageService.warn('当前位置无法插入行内链接')
        return
      }
      const paragraph = this.doc.schemas.createSnapshot('paragraph', [
        [{ insert: this.block.props.url, attributes: { 'a:link': this.block.props.url } }], this.block.props]
      )
      await runLinkViewChange(this.doc, this.block, paragraph.id, () => this.doc.crud.replaceWithSnapshots(this.block.id, [paragraph]))
    }
  }

  private isCurrent(source: BlockCraft.BlockComponent): boolean {
    try {
      return !this.doc.isReadonly && this.block === source
        && !source.isReadonly && this.doc.getBlockById(source.id) === source
    } catch { return false }
  }

  onItemClick($event: BcFloatToolbarItemComponent) {
    switch ($event.name) {
    }
  }
}
