import {closetBlockId, DocPlugin, EventListen, getPositionWithOffset, UIEventStateContext} from "../../framework";
import {Subject, Subscription, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {EmbedFrameBlockToolbar} from "./widgets/iframe-toolbar";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";

export class EmbedFrameExtensionPlugin extends DocPlugin {
  override name = "EmbedFrameExtensionPlugin";

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef
  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.BlockComponent | null = null

  @EventListen('mouseDown', {flavour: 'root'})
  private onReadonlyFrameClick(ctx: UIEventStateContext) {
    const event = ctx.getDefaultEvent() as MouseEvent
    if (event.button !== 0 || !(event.target instanceof Element)) return
    const card = event.target.closest('embed-frame-card')
    const id = card && closetBlockId(card)
    if (!id) return
    let block: BlockCraft.BlockComponent
    try { block = this.doc.getBlockById(id) }
    catch { return }
    if (!block.flavour.endsWith('embed') || !block.isReadonly) return
    ctx.preventDefault()
    this.doc.selection.selectBlock(block)
    return true
  }

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || !isSelectionAlive(selection as any, this.doc) || !selection.isInSameBlock || !selection.firstBlock?.flavour.endsWith('embed') || selection.anchor.type !== 'selected' || selection.head.type !== 'selected') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      this.clearTimer()

      const frameBlock = selection.firstBlock
      if (this._toolbarRef && this._activeBlock === frameBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._toolbarRef && this._activeBlock === frameBlock) return;
        const currentSelection = this.doc.selection.value
        if (
          !currentSelection ||
          !isSelectionAlive(currentSelection as any, this.doc) ||
          !currentSelection.isInSameBlock ||
          currentSelection.firstBlock.id !== frameBlock.id ||
          currentSelection.anchor.type !== 'selected' ||
          currentSelection.head.type !== 'selected' ||
          !this._isBlockAlive(frameBlock)
        ) {
          return
        }

        this._activeBlock = frameBlock

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay({
          target: frameBlock,
          allowReadonly: frameBlock.isReadonly,
          positions: [
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ],
          component: EmbedFrameBlockToolbar,
        }, this._closeToolbar$, this.closeToolbar)

        componentRef.setInput('frameBlock', frameBlock)
        componentRef.setInput('doc', this.doc)

        this._toolbarRef = overlayRef

        frameBlock.onDestroy$?.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
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
