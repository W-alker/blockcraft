import {DocPlugin, getPositionWithOffset} from "../../framework";
import {fromEvent, Subject, Subscription, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {BookmarkBlockToolbar} from "./widgets/bookmark-toolbar";

export class BookmarkBlockExtensionPlugin extends DocPlugin {
  override name = "EmbedFrameExtensionPlugin";

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.IBlockComponents['attachment'] | null = null

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || selection.to || selection.firstBlock?.flavour !== 'bookmark') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      this.clearTimer()

      const bookmarkBlock = selection.firstBlock
      if (this._toolbarRef && this._activeBlock === bookmarkBlock) return;
      this.closeToolbar()

      setTimeout(() => {
        if (this._toolbarRef && this._activeBlock === bookmarkBlock) return;

        this._activeBlock = bookmarkBlock as any

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay({
          target: bookmarkBlock.hostElement,
          component: BookmarkBlockToolbar,
          positions: [
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ]
        }, this._closeToolbar$, this.closeToolbar)

        componentRef.setInput('block', bookmarkBlock)
        componentRef.setInput('doc', this.doc)
        this._toolbarRef = overlayRef
      }, 200)

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
    this._activeBlock = null
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}
