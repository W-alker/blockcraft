import {DocPlugin, getPositionWithOffset} from "../../framework";
import {Subject, Subscription, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {EmbedFrameBlockToolbar} from "./widgets/iframe-toolbar";

export class EmbedFrameExtensionPlugin extends DocPlugin {
  override name = "EmbedFrameExtensionPlugin";

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef
  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.IBlockComponents['attachment'] | null = null

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || selection.to || !selection.firstBlock?.flavour.endsWith('embed')) {
        this._toolbarRef && this.closeToolbar()
        return
      }

      this.clearTimer()

      const frameBlock = selection.firstBlock
      if (this._toolbarRef && this._activeBlock === frameBlock) return;
      this.closeToolbar()

      setTimeout(() => {
        if (this._toolbarRef && this._activeBlock === frameBlock) return;

        this._activeBlock = frameBlock as any

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay({
          target: frameBlock.hostElement,
          positions: [
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ],
          component: EmbedFrameBlockToolbar,
        }, this._closeToolbar$, this.closeToolbar)

        componentRef.setInput('frameBlock', frameBlock)
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
