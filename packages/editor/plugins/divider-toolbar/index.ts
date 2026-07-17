import {
  closetBlockId,
  DocPlugin,
  EventListen, getPositionWithOffset,
  resolveBlockGapSide,
} from "../../framework";
import { merge, Subject, Subscription, takeUntil } from "rxjs";
import { OverlayRef } from "@angular/cdk/overlay";
import { DividerStylePopupComponent } from "./widgets/divider-style-popup.component";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";

export class DividerExtensionPlugin extends DocPlugin {
  override name = "divider-extension";

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.IBlockComponents['divider'] | null = null

  @EventListen('mouseDown', {flavour: 'divider'})
  private _handleDividerMouseDown(context: BlockCraft.EventStateContext) {
    const event = context.getDefaultEvent<MouseEvent>()
    if (event.defaultPrevented || event.button !== 0) return

    const target = event.target
    if (!(target instanceof Node)) return
    if (resolveBlockGapSide(target)) return

    const blockId = closetBlockId(target)
    if (!blockId) return

    let block: BlockCraft.BlockComponent | null = null
    try {
      block = this.doc.getBlockById(blockId)
    } catch {
      return
    }
    if (!block || block.flavour !== 'divider') return

    event.preventDefault()
    this.doc.selection.selectBlock(block)
  }

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()

      // Focusing an overlay input can temporarily clear the editor selection.
      // Retain the toolbar only for that null-selection transition. A concrete
      // new editor selection always wins, even if focus has not left the overlay yet.
      if (!selection) {
        const overlayOwnsFocus = !!this._toolbarRef?.overlayElement?.contains(document.activeElement)
        if (overlayOwnsFocus) return
        this._toolbarRef && this.closeToolbar()
        return
      }

      if (
        !isSelectionAlive(selection as any, this.doc) ||
        !selection.isInSameBlock ||
        selection.firstBlock?.flavour !== 'divider' ||
        selection.anchor.type !== 'selected' ||
        selection.head.type !== 'selected'
      ) {
        this._toolbarRef && this.closeToolbar()
        return
      }

      const dividerBlock = selection.firstBlock as BlockCraft.IBlockComponents['divider']
      if (this._toolbarRef && this._activeBlock === dividerBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._toolbarRef && this._activeBlock === dividerBlock) return;
        const currentSelection = this.doc.selection.value
        if (
          !currentSelection ||
          !isSelectionAlive(currentSelection as any, this.doc) ||
          !currentSelection.isInSameBlock ||
          currentSelection.firstBlock?.id !== dividerBlock.id ||
          currentSelection.anchor.type !== 'selected' ||
          currentSelection.head.type !== 'selected' ||
          !this._isBlockAlive(dividerBlock)
        ) {
          return
        }

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

        dividerBlock.onDestroy$?.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
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
    this._activeBlock?.hostElement.classList.remove('divider-toolbar-active')
    this._activeBlock = null
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
    this.clearTimer()
    this._closeToolbar$.next()
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
