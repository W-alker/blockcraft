import {DocPlugin, getPositionWithOffset} from "../../framework";
import {fromEvent, Subject, Subscription, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {CalloutBlockToolbar} from "./widgets/callout.toolbar";

export class CalloutToolbarPlugin extends DocPlugin {
  override name = 'callout-toolbar';

  private _sub?: Subscription
  private _timer: number | null = null
  private _overlayRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeCalloutBlock: BlockCraft.BlockComponent | null = null

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || selection.to || selection.firstBlock.parentBlock?.flavour !== 'callout') {
        this._overlayRef && this.closeToolbar()
        return
      }

      this.clearTimer()
      const calloutBlock = selection.firstBlock.parentBlock

      if (this._overlayRef && this._activeCalloutBlock === calloutBlock) return;
      this.closeToolbar()

      setTimeout(() => {
        if (this._overlayRef && this._activeCalloutBlock === calloutBlock) return;

        this._activeCalloutBlock = calloutBlock

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay({
          target: calloutBlock.hostElement,
          component: CalloutBlockToolbar,
          positions: [
            getPositionWithOffset("top-center", 0, 8),
            getPositionWithOffset("bottom-center", 0, 8),
          ]
        }, this._closeToolbar$, this.closeToolbar)
        componentRef.setInput('calloutBlock', calloutBlock)
        this._overlayRef = overlayRef
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
    this._overlayRef?.dispose()
    this._overlayRef = undefined
    this._activeCalloutBlock = null
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}
