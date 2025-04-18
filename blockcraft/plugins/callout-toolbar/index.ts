import {DocPlugin} from "../../framework";
import {fromEvent, Subject, Subscription, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {getPositionWithOffset} from "../../components";
import {CalloutBlockToolbar} from "./widgets/callout.toolbar";

export class CalloutToolbarPlugin extends DocPlugin {
  override name = 'callout-toolbar';

  private _sub?: Subscription
  private _timer: number | null = null
  private _overlayRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || selection.to || selection.firstBlock.parentBlock?.flavour !== 'callout') {
        this._overlayRef && this.closeToolbar()
        return
      }
      if (this._overlayRef) return
      this.clearTimer()

      const calloutBlock = selection.firstBlock.parentBlock
      setTimeout(() => {
        if (this._overlayRef) return

        const overlay = this.doc.injector.get(Overlay)
        const portal = new ComponentPortal(CalloutBlockToolbar, null, this.doc.injector)
        this._overlayRef = overlay.create({
          positionStrategy: overlay.position().flexibleConnectedTo(calloutBlock.hostElement).withPositions([
            getPositionWithOffset("top-center", 0, 8),
            getPositionWithOffset("bottom-center", 0, -8),
          ])
        })
        const cpr = this._overlayRef.attach(portal)

        cpr.setInput('calloutBlock', calloutBlock)

        fromEvent<MouseEvent>(this.doc.root.hostElement.parentElement!, 'scroll').pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          this._overlayRef?.updatePosition()
        })

        calloutBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
          this.closeToolbar()
        })
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
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}
