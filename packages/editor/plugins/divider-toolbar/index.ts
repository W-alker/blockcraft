import {
  DocPlugin,
  EventListen, getPositionWithOffset
} from "../../framework";
import { merge, Subject, Subscription, takeUntil } from "rxjs";
import { OverlayRef } from "@angular/cdk/overlay";
import { DividerStylePopupComponent } from "./widgets/divider-style-popup.component";

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

      // Keep the toolbar open while the user interacts with it (e.g. typing in the
      // 文字装订 input): focusing the overlay input blurs the divider block and fires a
      // selectionChange that would otherwise immediately close the toolbar.
      // NOTE: a disposed OverlayRef has `overlayElement === null`, so use optional
      // chaining — throwing here would permanently kill this subscription.
      if (this._toolbarRef?.overlayElement?.contains(document.activeElement)) {
        return
      }

      if (!selection || !selection.isInSameBlock || selection.firstBlock?.flavour !== 'divider' || selection.anchor.type !== 'selected') {
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
        // Keep the divider visually "selected" while its label is edited in the toolbar:
        // focusing the toolbar input clears the editor selection (which removes `.selected`).
        dividerBlock.hostElement.classList.add('divider-toolbar-active')

        const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<DividerStylePopupComponent>({
          target: dividerBlock,
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
    this._activeBlock?.hostElement.classList.remove('divider-toolbar-active')
    this._activeBlock = null
    this._toolbarRef = undefined
    this.clearTimer()
    this._closeToolbar$.next()
  }

  destroy() {
    this._sub?.unsubscribe()
  }


}
