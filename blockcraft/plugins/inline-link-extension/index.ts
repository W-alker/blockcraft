import {
  closetBlockId,
  DocPlugin,
  EventListen,
  EventNames, IBlockRange,
  IBlockTextRange,
  INLINE_TEXT_NODE_TAG
} from "../../framework";
import {fromEvent, Subject, Subscription, take, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {getPositionWithOffset, POSITION_MAP} from "../../components";
import {InlineLinkToolbar} from "./widgets/inline-link-toolbar";
import {getFirstSameAttrsTextRange} from "../../global";
import {UIEventStateContext} from "../../framework/event/base";

export class InlineLinkExtension extends DocPlugin {
  override name = 'inline-link-extension'

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _anchorLink: string | null = null
  private _anchorTextRange: { blockId: string, start: number, end: number } | null = null

  init() {
  }

  @EventListen(EventNames.doubleClick)
  onDoubleClick(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Node | null
    if (!target) return
    const link = this.tryGetLink(target)
    if (!link) return
    window.open(link, '_blank')
  }

  @EventListen(EventNames.mouseDown)
  onMouseDown(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Node | null
    if (!target) return

    const link = this.tryGetLink(target)
    if (!link) return
    if (this._anchorLink === link) return true

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
    this._anchorLink = link

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
    if (this._toolbarRef) return
    const overlay = this.doc.injector.get(Overlay)
    const portal = new ComponentPortal(InlineLinkToolbar)

    this._toolbarRef = overlay.create({
      positionStrategy: overlay.position().flexibleConnectedTo(target).withPositions([
        getPositionWithOffset('top-center', 0, 0),
        getPositionWithOffset('bottom-center', 0, 0),
      ]),
      scrollStrategy: overlay.scrollStrategies.close(),
    })

    const cpr = this._toolbarRef.attach(portal)

    cpr.instance.itemClicked.pipe(takeUntil(this._closeToolbar$)).subscribe(item => {
      if (!this._anchorTextRange || !this._anchorLink) return this.closeToolbar()

      switch (item.name) {
        case 'open-link':
          window.open(this._anchorLink, '_blank')
          break
        case 'edit-link':
          break
        case 'unbind-link':
          const block = this.doc.getBlockById(this._anchorTextRange.blockId, () => this.closeToolbar())
          if (!this.doc.isEditable(block)) return this.closeToolbar()
          block.formatText(this._anchorTextRange.start, this._anchorTextRange.end - this._anchorTextRange.start, {'a:link': null})
          this.closeToolbar()
          break
      }
    })

    fromEvent(this.doc.root.hostElement.parentElement!, 'scroll').pipe(takeUntil(this._closeToolbar$))
      .subscribe(() => {
        if (this._toolbarRef) {
          this._toolbarRef.updatePosition()
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
    this._closeToolbar$.next()
    this.clearTimer()
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
    this._anchorTextRange = null
    this._anchorLink = null
  }

  destroy() {
  }
}
