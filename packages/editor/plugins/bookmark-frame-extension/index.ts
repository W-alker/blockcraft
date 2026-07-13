import {DocPlugin, getPositionWithOffset} from "../../framework";
import {Subject, Subscription, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {BookmarkBlockToolbar} from "./widgets/bookmark-toolbar";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";

export class BookmarkBlockExtensionPlugin extends DocPlugin {
  override name = "EmbedFrameExtensionPlugin";

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.IBlockComponents['bookmark'] | null = null

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || !isSelectionAlive(selection as any, this.doc) || !selection.isInSameBlock || selection.firstBlock?.flavour !== 'bookmark' || selection.anchor.type !== 'selected' || selection.head.type !== 'selected') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      this.clearTimer()

      const bookmarkBlock = selection.firstBlock
      if (this._toolbarRef && this._activeBlock === bookmarkBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._toolbarRef && this._activeBlock === bookmarkBlock) return;
        const currentSelection = this.doc.selection.value
        if (
          !currentSelection ||
          !isSelectionAlive(currentSelection as any, this.doc) ||
          !currentSelection.isInSameBlock ||
          currentSelection.firstBlock.id !== bookmarkBlock.id ||
          currentSelection.anchor.type !== 'selected' ||
          currentSelection.head.type !== 'selected' ||
          !this._isBlockAlive(bookmarkBlock)
        ) {
          return
        }

        this._activeBlock = bookmarkBlock as BlockCraft.IBlockComponents['bookmark']

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay({
          target: bookmarkBlock,
          component: BookmarkBlockToolbar,
          positions: [
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ]
        }, this._closeToolbar$, this.closeToolbar)

        componentRef.setInput('block', bookmarkBlock)
        componentRef.setInput('doc', this.doc)
        this._toolbarRef = overlayRef

        bookmarkBlock.onDestroy$?.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
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
