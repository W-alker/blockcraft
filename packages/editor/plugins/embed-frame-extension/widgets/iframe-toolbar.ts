import {ChangeDetectionStrategy, Component, Input, Type} from '@angular/core'
import {filter, Subject, take, takeUntil} from 'rxjs'
import {CsModalService, CsTooltipDirective} from '@cses/ui'
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective} from '../../../components'
import {EmbedFrameCreator} from '../../../blocks/embed-blocks/components/embed-source-editor'
import {runLinkViewChange} from '../../link-view-utils'
import {normalizeEmbedUrl} from '../../../blocks/embed-blocks/embed-block/source'
import {captureRelativeSelectionBookmark, type RelativeSelectionBookmark} from '../../../framework/modules/selection/relative-bookmark'

type FrameBlock = BlockCraft.IBlockComponents['embed' | 'figma-embed' | 'juejin-embed']

function isWritable(doc: BlockCraft.Doc, block: FrameBlock) {
  try { return !block.isReadonly && doc.getBlockById(block.id) === block }
  catch { return false }
}

// A source dialog outlives the selection toolbar that opened it. Its lifetime
// belongs to the document and block, since focusing an input clears selection.
function openFrameDialog<T>(doc: BlockCraft.Doc, block: FrameBlock, content: Type<T>, title: string, data: unknown) {
  const release = doc.virtualization.acquireBlockViewLease([block.id])
  const close$ = new Subject<void>()
  let ref: import('@cses/ui').CsModalRef<T>
  try {
    ref = doc.injector.get(CsModalService).open<unknown, unknown, T>({
      content, title, data, injector: doc.injector,
      width: 'min(360px, calc(100vw - 48px))', centered: true, footer: null,
      onCancel: () => close$.next(),
    })
  } catch (error) { release(); throw error }
  // 关闭动画期间立即停止接受写入，视图 lease 在弹窗实际移除后释放。
  const close = () => { close$.next(); ref.close() }
  ref.afterClose.pipe(take(1)).subscribe(() => { close$.next(); close$.complete(); release() })
  block.onDestroy$.pipe(takeUntil(close$)).subscribe(close)
  doc.onDestroy$.pipe(takeUntil(close$)).subscribe(close)
  doc.readonlySwitch$.pipe(filter(Boolean), takeUntil(close$)).subscribe(close)
  return {ref, close, close$}
}

function openSourceEditor(doc: BlockCraft.Doc, block: FrameBlock, bookmark: RelativeSelectionBookmark | null) {
  const schema = doc.schemas.get(block.flavour)
  if (!schema) return
  const {ref, close, close$} = openFrameDialog(doc, block, EmbedFrameCreator, schema.metadata.label, {schema, initialUrl: block.props.url})
  ref.afterClose.pipe(take(1)).subscribe(() => {
    if (bookmark && isWritable(doc, block) && doc.root.hostElement.isConnected) doc.selection.restoreBookmark(bookmark)
  })
  ref.componentInstance!.onSubmit.pipe(takeUntil(close$)).subscribe(value => {
    if (isWritable(doc, block)) {
      doc.crud.updateBlockProps(block.id, {url: value})
    }
    close()
  })
  ref.componentInstance!.onCancel.pipe(takeUntil(close$)).subscribe(close)
}

@Component({
  selector: 'div.iframe-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective, CsTooltipDirective],
  template: `
    <bc-float-toolbar (onItemClick)="onItemClick($event)">
      @if (!frameBlock.isReadonly) {
        <bc-float-toolbar-item [expandable]="true" [bcOverlayTrigger]="viewModeTpl"
          [positions]="['bottom-left', 'bottom-right', 'top-right', 'top-left']" [offsetY]="8">嵌入视图</bc-float-toolbar-item>
        @if (supportsSourceEditor()) {
          <bc-float-toolbar-item icon="bc_bianji" name="edit" csTooltip="修改嵌入来源" aria-label="修改嵌入来源" tabindex="-1"></bc-float-toolbar-item>
        }
        <span class="bc-float-toolbar__divider"></span>
      }
      <bc-float-toolbar-item icon="bc_huanyige" name="reload" csTooltip="重新加载" aria-label="重新加载"></bc-float-toolbar-item>
      <bc-float-toolbar-item icon="bc_tiaozhuan" name="open" csTooltip="外部打开" aria-label="外部打开"></bc-float-toolbar-item>
    </bc-float-toolbar>
    <ng-template #viewModeTpl>
      <bc-float-toolbar direction="column" (onItemClick)="switchViewMode($event)">
        <bc-float-toolbar-item name="inline" value="inline">链接视图</bc-float-toolbar-item>
        <bc-float-toolbar-item name="card" value="card">卡片视图</bc-float-toolbar-item>
        <bc-float-toolbar-item [active]="true">嵌入视图</bc-float-toolbar-item>
      </bc-float-toolbar>
    </ng-template>
  `,
})
export class EmbedFrameBlockToolbar {
  @Input() frameBlock!: FrameBlock
  @Input() doc!: BlockCraft.Doc

  private writable() {
    return isWritable(this.doc, this.frameBlock)
  }
  protected supportsSourceEditor() {
    return this.frameBlock.flavour === 'embed' || this.frameBlock.flavour === 'figma-embed' || this.frameBlock.flavour === 'juejin-embed'
  }
  switchViewMode(item: BcFloatToolbarItemComponent) {
    if (!this.writable()) return
    const url = this.frameBlock.props.url
    const flavour = item.value === 'card' ? 'bookmark' : item.value === 'inline' ? 'paragraph' : null
    if (!flavour || !this.doc.schemas.has(flavour)) return
    if (!this.frameBlock.parentId || !this.doc.canInsertChild(this.frameBlock.parentId, flavour)) {
      this.doc.messageService.warn('当前位置无法转换为该视图')
      return
    }
    if (item.value === 'card') {
      const bookmark = this.doc.schemas.createSnapshot('bookmark', [url])
      void runLinkViewChange(this.doc, this.frameBlock, bookmark.id, () => this.doc.crud.replaceWithSnapshots(this.frameBlock.id, [bookmark]))
    } else if (item.value === 'inline') {
      const paragraph = this.doc.schemas.createSnapshot('paragraph', [[{insert: url, attributes: {'a:link': url}}]])
      void runLinkViewChange(this.doc, this.frameBlock, paragraph.id, () => this.doc.crud.replaceWithSnapshots(this.frameBlock.id, [paragraph]))
    }
  }

  private editSource(item: BcFloatToolbarItemComponent) {
    if (!this.writable() || !this.supportsSourceEditor()) return
    const bookmark = captureRelativeSelectionBookmark(this.doc.selection.value, this.doc)
    // The toolbar suppresses mousedown focus. Give the modal a local return
    // target so closing it cannot focus the editor root and scroll to its top.
    item.hostEle.focus({preventScroll: true})
    openSourceEditor(this.doc, this.frameBlock, bookmark)
  }

  onItemClick(item: BcFloatToolbarItemComponent) {
    if (item.name === 'open') {
      try { if (this.doc.getBlockById(this.frameBlock.id) !== this.frameBlock) return }
      catch { return }
      const url = normalizeEmbedUrl(this.frameBlock.props.url)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    }
    if (item.name === 'reload') this.frameBlock.reloadIframe()
    if (item.name === 'edit') this.editSource(item)
  }
}
