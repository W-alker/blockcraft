import {DocPlugin, getPositionWithOffset} from "../../framework";
import {Subject, Subscription} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {CalloutBlockToolbar} from "./widgets/callout.toolbar";
import {throttle} from "../../global";

export class CalloutToolbarPlugin extends DocPlugin {
  override name = 'callout-toolbar';

  private _sub?: Subscription
  private _timer: number | null = null
  private _overlayRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeCalloutBlock: BlockCraft.BlockComponent | null = null

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (this.doc.isReadonly || !selection || selection.to || selection.firstBlock.parentBlock?.flavour !== 'callout') {
        this._overlayRef && this.closeToolbar()
        return
      }

      this.clearTimer()
      const calloutBlock = selection.firstBlock.parentBlock

      if (this._overlayRef && this._activeCalloutBlock === calloutBlock) return;
      this.closeToolbar()

      setTimeout(() => {
        this.openToolbar(calloutBlock)
      }, 200)
    })
  }

  clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  openToolbar = (calloutBlock: BlockCraft.BlockComponent) => {
    if (this._overlayRef && this._activeCalloutBlock === calloutBlock) return;

    this._activeCalloutBlock = calloutBlock

    const resizeObs = new ResizeObserver(throttle(() => {
      this._overlayRef?.updatePosition()
    }, 100))
    resizeObs.observe(calloutBlock.hostElement)

    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay({
      target: calloutBlock,
      component: CalloutBlockToolbar,
      positions: [
        getPositionWithOffset("top-center", 0, 8),
        getPositionWithOffset("bottom-center", 0, 8),
      ]
    }, this._closeToolbar$, () => {
      this.closeToolbar()
      resizeObs.disconnect()
    })
    componentRef.setInput('calloutBlock', calloutBlock)
    this._overlayRef = overlayRef


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
