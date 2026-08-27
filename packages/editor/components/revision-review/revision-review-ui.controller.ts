import type {ComponentRef} from '@angular/core'
import type {OverlayRef} from '@angular/cdk/overlay'
import {Subject, Subscription, take, takeUntil} from 'rxjs'
import type {BlockCraftDoc} from '../../framework/doc'
import {getPositionWithOffset} from '../../framework/services'
import type {
  RevisionReviewItem,
  RevisionReviewPlugin,
  RevisionReviewState,
} from '../../plugins/revision-review'
import {RevisionReviewPopoverComponent} from './revision-review-popover.component'
import type {
  RevisionReviewIntent,
  RevisionReviewPopoverIntent,
} from './revision-review.types'
import {
  findItemMarker,
  findMarkerItem,
  REVISION_MARK_SELECTOR,
} from './revision-review-dom'

export interface RevisionReviewUiControllerOptions {
  /** Host-owned permission snapshot. No role inference happens in the editor. */
  canReview?: () => boolean
}

/**
 * Optional default UI adapter over the headless RevisionReviewPlugin.
 *
 * It uses one delegated click listener, holds only the active block's virtual
 * view lease and reveals offscreen items through BlockCraftDoc.navigateToBlock.
 * It never acquires a full-document view lease.
 */
export class RevisionReviewUiController {
  private container: HTMLElement | null = null
  private componentRef: ComponentRef<RevisionReviewPopoverComponent> | null = null
  private overlayRef: OverlayRef | null = null
  private overlayClose$: Subject<void> | null = null
  private releaseViewLease: (() => void) | null = null
  private stateSubscription = Subscription.EMPTY
  private destroyed = false

  constructor(
    private readonly doc: BlockCraftDoc,
    private readonly review: RevisionReviewPlugin,
    private readonly options: RevisionReviewUiControllerOptions = {},
  ) {
    this.doc.onDestroy(() => this.destroy())
  }

  attach(): boolean {
    if (this.destroyed) return false
    const container = this.doc.scrollContainer
    if (!container) return false
    if (this.container === container) return true
    this.detachContainer()
    this.container = container
    container.addEventListener('click', this.onContainerClick)
    return true
  }

  async reveal(itemId: string): Promise<boolean> {
    if (this.destroyed) return false
    const item = this.review.activate(itemId)
    if (!item) return false
    return this.revealItem(item)
  }

  private async revealItem(item: RevisionReviewItem): Promise<boolean> {
    const blockId = item.blockIds.find(id => this.doc.model.exists(id))
    if (!blockId) return false

    let release: () => void = () => undefined
    try {
      release = this.doc.virtualization.acquireBlockViewLease([blockId])
      const revealed = await this.doc.navigateToBlock(blockId)
      if (!revealed || this.destroyed) {
        release()
        return false
      }
      const blockHost = this.doc.vm.get(blockId)?.instance.hostElement
      if (!blockHost) {
        release()
        return false
      }
      const marker = findItemMarker(blockHost, item) ?? blockHost
      if (marker !== blockHost && marker.getClientRects().length) {
        marker.scrollIntoView({behavior: 'auto', block: 'center', inline: 'nearest'})
      }
      this.open(item, marker, blockId, release)
      return true
    } catch (error) {
      release()
      this.doc.logger.warn('revisionReviewRevealError: ', error)
      return false
    }
  }

  handleIntent(intent: RevisionReviewIntent): void {
    if (intent.type === 'close') return
    if (intent.type === 'activate') {
      void this.reveal(intent.itemId)
      return
    }
    if (!this.canExecuteDecision()) return
    try {
      switch (intent.type) {
        case 'keep':
          this.review.keep(intent.itemId)
          break
        case 'revert':
          this.review.revert(intent.itemId)
          break
        case 'keep-all':
          this.review.keepAll()
          break
        case 'revert-all':
          this.review.revertAll()
          break
        case 'resolve-overlap':
          this.review.resolveOverlap(intent.conflictId, intent.keepRevisionIds)
          break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '修订裁决失败'
      this.doc.messageService.error(message)
    }
  }

  close(): void {
    this.overlayClose$?.next()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.close()
    this.detachContainer()
    this.stateSubscription.unsubscribe()
  }

  private readonly onContainerClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const marker = target.closest<HTMLElement>(REVISION_MARK_SELECTOR)
    if (!marker || !this.container?.contains(marker)) return
    const item = findMarkerItem(marker, this.review.state$.value)
    if (!item) return
    this.review.activate(item.id)
    const blockId = marker.closest<HTMLElement>('[data-block-id]')
      ?.getAttribute('data-block-id')
    if (!blockId) return
    this.open(item, marker, blockId)
  }

  private open(
    item: RevisionReviewItem,
    marker: HTMLElement,
    blockId: string,
    existingRelease?: () => void,
  ): void {
    this.close()
    if (this.destroyed) {
      existingRelease?.()
      return
    }

    const close$ = new Subject<void>()
    this.overlayClose$ = close$
    this.releaseViewLease = existingRelease
      ?? this.doc.virtualization.acquireBlockViewLease([blockId])
    close$.pipe(take(1)).subscribe(() => this.cleanupOverlay(close$))

    try {
      const {componentRef, overlayRef} =
        this.doc.overlayService.createConnectedOverlay<RevisionReviewPopoverComponent>({
          target: marker,
          component: RevisionReviewPopoverComponent,
          positions: [
            getPositionWithOffset('top-center', 0, 8),
            getPositionWithOffset('bottom-center', 0, 8),
            getPositionWithOffset('right-center', 8, 0),
          ],
          clampTo: this.doc.scrollContainer ?? undefined,
          flexibleDimensions: false,
        }, close$)
      this.componentRef = componentRef
      this.overlayRef = overlayRef
      this.updatePopover(this.review.state$.value, item.id)

      const intentSubscription = componentRef.instance.intent.subscribe(intent =>
        this.handlePopoverIntent(intent))
      close$.pipe(take(1)).subscribe(() => intentSubscription.unsubscribe())
      overlayRef.keydownEvents().pipe(takeUntil(close$)).subscribe(event => {
        if (event.key === 'Escape') close$.next()
      })
      overlayRef.outsidePointerEvents().pipe(takeUntil(close$))
        .subscribe(() => close$.next())

      this.stateSubscription.unsubscribe()
      this.stateSubscription = this.review.state$.subscribe(state => {
        this.updatePopover(state, item.id)
      })
      close$.pipe(take(1)).subscribe(() => this.stateSubscription.unsubscribe())
    } catch (error) {
      close$.next()
      throw error
    }
  }

  private handlePopoverIntent(intent: RevisionReviewPopoverIntent): void {
    if (intent.type === 'close') {
      this.close()
      return
    }
    if (intent.type === 'previous' || intent.type === 'next') {
      const item = intent.type === 'previous'
        ? this.review.previous()
        : this.review.next()
      // next()/previous() already activate the item; do not publish the same
      // active state twice before the virtual target has mounted.
      if (item) void this.revealItem(item)
      return
    }
    this.handleIntent(intent)
  }

  private updatePopover(state: RevisionReviewState, itemId: string): void {
    const componentRef = this.componentRef
    if (!componentRef) return
    const index = state.items.findIndex(item => item.id === itemId)
    if (index < 0) {
      this.close()
      return
    }
    componentRef.setInput('item', state.items[index])
    componentRef.setInput('activeIndex', index)
    componentRef.setInput('total', state.items.length)
    componentRef.setInput('viewMode', state.viewMode)
    componentRef.setInput('canReview', this.options.canReview?.() ?? true)
    this.overlayRef?.updatePosition()
  }

  private canExecuteDecision(): boolean {
    return this.review.state$.value.viewMode !== 'final' &&
      (this.options.canReview?.() ?? true)
  }

  private cleanupOverlay(owner: Subject<void>): void {
    if (this.overlayClose$ !== owner) return
    this.overlayClose$ = null
    this.componentRef = null
    this.overlayRef = null
    this.stateSubscription.unsubscribe()
    this.stateSubscription = Subscription.EMPTY
    const release = this.releaseViewLease
    this.releaseViewLease = null
    try {
      release?.()
    } catch (error) {
      this.doc.logger.warn('revisionReviewViewLeaseReleaseError: ', error)
    }
    // OverlayService subscribes after this controller cleanup subscription.
    // Completing synchronously here would stop the current Subject fan-out
    // before the service can dispose its pane, leaving stacked popovers behind.
    queueMicrotask(() => owner.complete())
  }

  private detachContainer(): void {
    this.container?.removeEventListener('click', this.onContainerClick)
    this.container = null
  }
}
