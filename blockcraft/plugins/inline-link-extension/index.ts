import {
  closetBlockId,
  DocPlugin,
  EventListen, FakeRange, getPositionWithOffset, IBlockRange,
  INLINE_TEXT_NODE_TAG, ORIGIN_SKIP_SYNC
} from "../../framework";
import {Subject, takeUntil} from "rxjs";
import {InlineLinkToolbar} from "./widgets/inline-link-toolbar";
import {getFirstSameAttrsTextRange, nextTick, sliceDelta} from "../../global";
import {UIEventStateContext, IBlockSnapshot} from "../../framework";
import {ComponentRef} from "@angular/core";
import {LinkEditFloatDialog} from "./widgets/link-edit-dialog";

export class InlineLinkExtension extends DocPlugin {
  override name = 'inline-link-extension'

  private _timer: number | null = null

  private _cpr: ComponentRef<InlineLinkToolbar> | null = null
  private _closeToolbar$ = new Subject<void>()

  private _linkInfo: { text: string, link: string } | null = null
  private _anchorTextRange: { blockId: string, start: number, end: number } | null = null

  constructor(
    private openLink = (link: string) => {
      window.open(link, '_blank')
    }
  ) {
    super();
  }

  init() {
    this.doc.subscribeReadonlyChange(() => {
      this._cpr?.setInput('isReadOnly', this.doc.isReadonly)
    })
  }

  @EventListen('doubleClick')
  onDoubleClick(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Node | null
    if (!target) return
    const link = this.tryGetLink(target)
    if (!link) return
    this.openLink(link)
  }

  @EventListen('mouseDown')
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

  openToolbar(target: HTMLElement) {
    if (this._cpr) return

    this._cpr = this.doc.overlayService.createConnectedOverlay<InlineLinkToolbar>({
      target,
      component: InlineLinkToolbar,
      backdrop: true
    }, this._closeToolbar$, this.closeToolbar).componentRef

    this._cpr.setInput('link', this._linkInfo?.link ?? '')
    this._cpr.setInput('isReadOnly', this.doc.isReadonly)

    this._cpr.instance.itemClicked.pipe(takeUntil(this._closeToolbar$)).subscribe(item => {
      if (!this._anchorTextRange || !this._linkInfo) return this.closeToolbar()

      switch (item.name) {
        case 'open-link':
          this.openLink(this._linkInfo.link)
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
        this._closeToolbar$.next()
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

  onEditLink(target: HTMLElement, linkInfo: typeof this._linkInfo, range: typeof this._anchorTextRange) {
    if (!linkInfo || !range) return

    const close$ = new Subject<void>()

    let fakeRange: FakeRange

    const {componentRef} = this.doc.overlayService.createConnectedOverlay<LinkEditFloatDialog>({
      target: target,
      component: LinkEditFloatDialog,
      positions: [
        getPositionWithOffset('top-left', 0, 4),
        getPositionWithOffset('bottom-left', 0, 4),
      ],
      backdrop: true
    }, close$, () => {
      close$.next()
      fakeRange?.destroy()
      nextTick().then(() => {
        this.doc.selection.setSelection({
          index: range.end,
          length: 0,
          blockId: range.blockId,
          type: 'text'
        })
      })
    })

    // componentRef.setInput('text', this._linkInfo?.text)
    componentRef.setInput('href', linkInfo?.link)

    // 伪造选中
    requestAnimationFrame(() => {
      componentRef.instance.focus()
      fakeRange = this.doc.selection.createFakeRange({
        from: {
          index: range.start,
          length: range.end - range.start,
          blockId: range.blockId,
          type: 'text'
        },
        to: null,
        collapsed: false,
        commonParent: range.blockId
      })
    })

    componentRef.instance.close.pipe(takeUntil(close$)).subscribe(() => close$.next())
    componentRef.instance.update.pipe(takeUntil(close$)).subscribe(v => {
      close$.next()
      if (!range || !linkInfo) return
      const block = this.doc.getBlockById(range.blockId)
      if (!this.doc.isEditable(block)) return
      if (v.href !== linkInfo.link) {
        block.formatText(range.start, range.end - range.start, {'a:link': v.href})
      }
    })
  }

  switchView() {
    if (!this._linkInfo || !this._anchorTextRange) return
    const block = this.doc.getBlockById(this._anchorTextRange.blockId)
    if (!this.doc.isEditable(block)) return this.closeToolbar()

    const bookmark = this.doc.schemas.createSnapshot('bookmark', [this._linkInfo.link])
    const insertBlocks: IBlockSnapshot[] = [bookmark]

    if (this._anchorTextRange.end < block.textLength) {
      const splitRightDeltas = sliceDelta(block.textDeltas(), this._anchorTextRange.end)
      insertBlocks.push(this.doc.schemas.createSnapshot(block.flavour, [splitRightDeltas, block.props]))
    }

    // this.doc.crud.transact(() => {
    block.deleteText(this._anchorTextRange!.start, block.textLength - this._anchorTextRange!.start)
    this.doc.crud.insertBlocksAfter(block, insertBlocks).then(() => {
      this.doc.selection.selectBlock(bookmark.id)
    })
    // }, ORIGIN_SKIP_SYNC)
  }

  destroy() {
  }
}
