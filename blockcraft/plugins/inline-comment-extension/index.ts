import {
  closetBlockId,
  DocPlugin,
  EventListen,
  EventNames, getPositionWithOffset, IBlockRange,
  INLINE_TEXT_NODE_TAG, ORIGIN_SKIP_SYNC
} from "../../framework";
import {merge, Subject, takeUntil} from "rxjs";
import {getFirstSameAttrsTextRange, nextTick, sliceDelta} from "../../global";
import {UIEventStateContext, IBlockSnapshot} from "../../framework";
import {ComponentRef, Type} from "@angular/core";
import {CommentPluginDialog} from "./widgets/comment-dialog";

interface IInlineCommentPluginConfig {
  dialog: Type<CommentPluginDialog>
}

export class InlineCommentExtension extends DocPlugin {
  override name = 'inline-link-extension'

  private _timer: number | null = null

  private _cpr: ComponentRef<CommentPluginDialog> | null = null
  private _closeToolbar$ = new Subject<void>()

  private _linkInfo: { text: string, link: string } | null = null
  private _anchorTextRange: { blockId: string, start: number, end: number } | null = null

  constructor(config: IInlineCommentPluginConfig) {
    super();
  }

  init() {
  }

  @EventListen(EventNames.mouseDown)
  onMouseDown(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Node | null
    if (!target) return

    const link = this.tryGetLink(target)
    if (!link) return
    if (this._linkInfo?.link === link) return true

    const bid = closetBlockId(target)
    if (!bid) return
    const block = this.doc.getBlockById(bid)
    if (!this.doc.isEditable(block)) return;

    const sameLinkRange = getFirstSameAttrsTextRange(block.textDeltas(), {'a:link': link})
    this._anchorTextRange = {
      blockId: block.id,
      start: sameLinkRange[0],
      end: sameLinkRange[1]
    }
    this._linkInfo = {
      text: block.textContent().slice(sameLinkRange[0], sameLinkRange[1]),
      link
    }

    this._timer = setTimeout(() => {
      this.openToolbar(target as HTMLElement)
    }, 200)
    return true
  }

  tryGetLink(target: Node) {
    if (!(target instanceof HTMLElement)) return null
    const link = target.localName === INLINE_TEXT_NODE_TAG ? target.parentElement?.getAttribute('link') : target.getAttribute('link')
    if (!link) return null
    return link
  }

  isInRange(range: IBlockRange) {
    if (!this._anchorTextRange) return false
    if (range.blockId !== this._anchorTextRange.blockId || range.type !== 'text') return false
    return range.index > this._anchorTextRange.start && (range.index + range.length) < this._anchorTextRange.end
  }

  openDialog(target: HTMLElement) {
    if (this._cpr) return

    this._cpr = this.doc.overlayService.createConnectedOverlay<InlineLinkToolbar>({
      target,
      component: InlineLinkToolbar,
    }, this._closeToolbar$, this.closeToolbar).componentRef

    this._cpr.setInput('link', this._linkInfo?.link ?? '')

    this._cpr.instance.itemClicked.pipe(takeUntil(this._closeToolbar$)).subscribe(item => {
      if (!this._anchorTextRange || !this._linkInfo) return this.closeToolbar()

      switch (item.name) {
        case 'open-link':
          window.open(this._linkInfo.link, '_blank')
          break
        case 'edit-link':
          this.onEditLink(target, {...this._linkInfo}, {...this._anchorTextRange})
          this.closeToolbar()
          break
        case 'unbind-link':
          const block = this.doc.getBlockById(this._anchorTextRange.blockId, () => this.closeToolbar())
          if (!this.doc.isEditable(block)) return this.closeToolbar()
          block.formatText(this._anchorTextRange.start, this._anchorTextRange.end - this._anchorTextRange.start, {'a:link': null})
          this.closeToolbar()
          break
        case 'copy-link':
          this.doc.clipboard.copyText(this._linkInfo.link).then(() => {
            this.doc.messageService.success('链接已复制')
          })
          return
        case 'switch-view':
          if (item.value === 'card') {
            this.switchView()
          }
          this.closeToolbar()
          return
      }
    })

    this.doc.selection.selectionChange$.pipe(takeUntil(this._closeToolbar$)).subscribe(sel => {
      if (!sel || sel.to || !sel.collapsed || sel.from.type !== 'text' ||
        (this._anchorTextRange && !this.isInRange(sel.from))) {
        this.closeToolbar()
        return
      }
    })

  }

  clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  closeToolbar = () => {
    this.clearTimer()
    this._closeToolbar$.next()
    this._anchorTextRange = this._linkInfo = this._cpr = null
  }

  destroy() {
  }
}
