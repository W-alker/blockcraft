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

  private _activeContainerBlock: BlockCraft.BlockComponent | null = null

  private _isReadonly(block: BlockCraft.BlockComponent) {
    return this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly
  }

  init() {
    this._sub = new Subscription()
    this._sub.add(this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()

      const containerBlock = this.resolveAppearanceContainer(selection)

      if (
        this.doc.isReadonly ||
        !selection ||
        !isSelectionAlive(selection as any, this.doc) ||
        !containerBlock
      ) {
        this._overlayRef && this.closeToolbar()
        return
      }

      if (!this._isBlockAlive(containerBlock) || this._isReadonly(containerBlock)) {
        this._overlayRef && this.closeToolbar()
        return
      }

      if (this._overlayRef && this._activeContainerBlock === containerBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._overlayRef && this._activeContainerBlock === containerBlock) return;
        const currentSelection = this.doc.selection.value
        const currentContainerBlock = this.resolveAppearanceContainer(currentSelection)
        if (
          !currentSelection ||
          !isSelectionAlive(currentSelection as any, this.doc) ||
          currentContainerBlock?.id !== containerBlock.id ||
          !this._isBlockAlive(containerBlock) ||
          this._isReadonly(containerBlock)
        ) {
          return
        }

        this.openToolbar(containerBlock)
      }, 200)
    }))
    const stateChange$ = this.doc.readonlyManager?.stateChange$
    if (stateChange$) {
      this._sub.add(stateChange$.subscribe(() => {
        const activeBlock = this._activeContainerBlock
        if (activeBlock && (!this._isBlockAlive(activeBlock) || this._isReadonly(activeBlock))) {
          this.closeToolbar()
        }
      }))
    }
  }

  clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  openToolbar = (containerBlock: BlockCraft.BlockComponent) => {
    if (!this.isAppearanceContainer(containerBlock)) return;
    if (this._overlayRef && this._activeContainerBlock === containerBlock) return;
    if (!this._isBlockAlive(containerBlock) || this._isReadonly(containerBlock)) return;

    this._activeContainerBlock = containerBlock

    const resizeObs = new ResizeObserver(throttle(() => {
      this._overlayRef?.updatePosition()
    }, 100))
    resizeObs.observe(containerBlock.hostElement)

    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay({
      target: containerBlock,
      component: CalloutBlockToolbar,
      positions: [
        getPositionWithOffset("top-center", 0, 8),
        getPositionWithOffset("bottom-center", 0, 8),
      ]
    }, this._closeToolbar$, () => {
      this.closeToolbar()
      resizeObs.disconnect()
    })
    componentRef.setInput('containerBlock', containerBlock)
    this._overlayRef = overlayRef

    containerBlock.onDestroy$?.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
      this.closeToolbar()
    })
  }

  closeToolbar = () => {
    this._closeToolbar$.next()
    this.clearTimer()
    this._overlayRef?.dispose()
    this._overlayRef = undefined
    this._activeContainerBlock = null
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

  private resolveAppearanceContainer(
    selection: typeof this.doc.selection.value,
  ): BlockCraft.BlockComponent | null {
    if (!selection || !selection.isInSameBlock) return null

    try {
      if (selection.start.type === 'text' && selection.end.type === 'text') {
        const parent = selection.firstBlock.parentBlock
        return parent && this.isAppearanceContainer(parent)
          ? parent
          : null
      }

      if (selection.start.type === 'selected' && selection.end.type === 'selected') {
        const selectedBlock = selection.firstBlock
        return selectedBlock.flavour === 'render-unit' ? selectedBlock : null
      }
    } catch {
      return null
    }

    return null
  }

  private isAppearanceContainer(
    block: BlockCraft.BlockComponent,
  ): boolean {
    return block.flavour === 'callout' || block.flavour === 'render-unit'
  }
}
