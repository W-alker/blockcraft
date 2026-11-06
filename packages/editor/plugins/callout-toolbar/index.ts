import { DocPlugin, getPositionWithOffset } from "../../framework";
import { fromEvent, Subject, Subscription, takeUntil } from "rxjs";
import { OverlayRef } from "@angular/cdk/overlay";
import { CalloutBlockToolbar } from "./widgets/callout.toolbar";
import { RenderUnitToolbar } from "./widgets/render-unit.toolbar";
import { throttle } from "../../global";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {isObjectToolbarOwnedTarget} from '../object-layout/object-toolbar-interaction'

export class CalloutToolbarPlugin extends DocPlugin {
  override name = 'callout-toolbar';

  private _sub?: Subscription
  private _timer: number | null = null
  private _overlayRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeContainerBlock: BlockCraft.BlockComponent | null = null
  private _toolbarInteraction = false
  private _releaseRegionPresentation?: () => void

  private _isReadonly(block: BlockCraft.BlockComponent) {
    return this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly
  }

  init() {
    this._sub = new Subscription()
    this._sub.add(fromEvent<PointerEvent>(document, 'pointerdown', {capture: true}).subscribe(event => {
      const target = event.target instanceof Element ? event.target : null
      this._toolbarInteraction = this._activeContainerBlock?.flavour === 'render-unit' &&
        isObjectToolbarOwnedTarget(this._overlayRef?.overlayElement, target)
      if (this._toolbarInteraction) {
        this.retainRegionPresentation()
      }
      if (!this._toolbarInteraction && this._overlayRef && !this.doc.selection.value) {
        this.closeToolbar()
      }
    }))
    this._sub.add(fromEvent<FocusEvent>(document, 'focusin', {capture: true}).subscribe(event => {
      if (this._activeContainerBlock?.flavour !== 'render-unit') return
      const target = event.target instanceof Element ? event.target : null
      this._toolbarInteraction = isObjectToolbarOwnedTarget(this._overlayRef?.overlayElement, target)
      if (this._toolbarInteraction) {
        this.retainRegionPresentation()
        this.doc.selection.blur()
      } else if (this._overlayRef && !this.doc.selection.value) {
        this.closeToolbar()
      }
    }))
    this._sub.add(this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()

      if (!selection && this._toolbarInteraction && !this.doc.isReadonly && this._activeContainerBlock &&
          this._isBlockAlive(this._activeContainerBlock) &&
          !this._isReadonly(this._activeContainerBlock)) return

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

    const component = containerBlock.flavour === 'render-unit'
      ? RenderUnitToolbar : CalloutBlockToolbar
    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<CalloutBlockToolbar | RenderUnitToolbar>({
      target: containerBlock,
      component,
      positions: containerBlock.flavour === 'render-unit'
        ? [getPositionWithOffset('right-top', 8, 0), getPositionWithOffset('left-top', 8, 0)]
        : [getPositionWithOffset('top-center', 0, 8), getPositionWithOffset('bottom-center', 0, 8)]
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
    this._releaseRegionPresentation?.()
    this._releaseRegionPresentation = undefined
    this._overlayRef?.dispose()
    this._overlayRef = undefined
    this._activeContainerBlock = null
    this._toolbarInteraction = false
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

  private retainRegionPresentation(): void {
    if (this._releaseRegionPresentation || !this.doc.selection.value) return
    this._releaseRegionPresentation = this.doc.selection.retainPresentation()
  }

  private resolveAppearanceContainer(
    selection: typeof this.doc.selection.value,
  ): BlockCraft.BlockComponent | null {
    if (!selection || !selection.isInSameBlock) return null

    try {
      if (selection.start.type === 'text' && selection.end.type === 'text') {
        const parent = selection.firstBlock.parentBlock
        return parent?.flavour === 'callout'
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
