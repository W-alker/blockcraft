import { DocPlugin, getPositionWithOffset } from "../../framework";
import { Subject, Subscription, takeUntil } from "rxjs";
import { OverlayRef } from "@angular/cdk/overlay";
import { CalloutBlockToolbar } from "./widgets/callout.toolbar";
import { throttle } from "../../global";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";

export class CalloutToolbarPlugin extends DocPlugin {
  override name = 'callout-toolbar';

  private _sub?: Subscription
  private _timer: number | null = null
  private _overlayRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeCalloutBlock: BlockCraft.BlockComponent | null = null

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()

      if (
        this.doc.isReadonly ||
        !selection ||
        !isSelectionAlive(selection as any, this.doc) ||
        !selection.isInSameBlock ||
        selection.start.type !== 'text' ||
        selection.end.type !== 'text' ||
        selection.firstBlock.parentBlock?.flavour !== 'callout'
      ) {
        this._overlayRef && this.closeToolbar()
        return
      }

      const calloutBlock = selection.firstBlock.parentBlock

      if (this._overlayRef && this._activeCalloutBlock === calloutBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._overlayRef && this._activeCalloutBlock === calloutBlock) return;
        const currentSelection = this.doc.selection.value
        if (
          !currentSelection ||
          !isSelectionAlive(currentSelection as any, this.doc) ||
          !currentSelection.isInSameBlock ||
          currentSelection.start.type !== 'text' ||
          currentSelection.end.type !== 'text' ||
          currentSelection.firstBlock.parentBlock?.id !== calloutBlock.id ||
          !this._isBlockAlive(calloutBlock)
        ) {
          return
        }

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
    if (!this._isBlockAlive(calloutBlock)) return;

    this._activeCalloutBlock = calloutBlock

    const resizeObs = new ResizeObserver(throttle(() => {
      this._overlayRef?.updatePosition()
    }, 100))
    resizeObs.observe(calloutBlock.hostElement)

    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay({
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

    calloutBlock.onDestroy$?.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      this.closeToolbar()
    })
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
    this.closeToolbar()
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent): boolean {
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }
}
