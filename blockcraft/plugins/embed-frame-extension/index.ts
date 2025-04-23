import {DocPlugin} from "../../framework";
import {fromEvent, Subject, Subscription, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {getPositionWithOffset} from "../../components";
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

        const overlay = this.doc.injector.get(Overlay)
        const portal = new ComponentPortal(EmbedFrameBlockToolbar, null, this.doc.injector)
        this._toolbarRef = overlay.create({
          positionStrategy: overlay.position().flexibleConnectedTo(frameBlock.hostElement).withPositions([
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ])
        })
        const cpr = this._toolbarRef.attach(portal)

        cpr.setInput('frameBlock', frameBlock)
        cpr.setInput('doc', this.doc)

        fromEvent<MouseEvent>(this.doc.root.hostElement.parentElement!, 'scroll').pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          this._toolbarRef?.updatePosition()
        })

        frameBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
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
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
    this._activeBlock = null
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}
