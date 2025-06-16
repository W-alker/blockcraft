import {
  DocPlugin,
  EventListen, getPositionWithOffset
} from "../../framework";
import {merge, Subject, Subscription, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {DividerStylePopupComponent} from "./widgets/divider-style-popup.component";

export class DividerExtensionPlugin extends DocPlugin {
  override name = "divider-extension";

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.IBlockComponents['divider'] | null = null

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()

      if (!selection || selection.to || selection.firstBlock?.flavour !== 'divider') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      const dividerBlock = selection.firstBlock as BlockCraft.IBlockComponents['divider']
      if (this._toolbarRef && this._activeBlock === dividerBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._toolbarRef && this._activeBlock === dividerBlock) return;

        this._activeBlock = dividerBlock as any

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<DividerStylePopupComponent>({
          target: dividerBlock.hostElement,
          component: DividerStylePopupComponent,
          positions: [
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ]
        }, this._closeToolbar$, this.closeToolbar)

        this._toolbarRef = overlayRef
        componentRef.setInput('dividerBlock', dividerBlock)

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
    this._activeBlock = null
  }

  destroy() {
    this._sub?.unsubscribe()
  }


}
