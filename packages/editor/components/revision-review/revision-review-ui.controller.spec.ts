import type {ComponentRef} from '@angular/core'
import type {OverlayRef} from '@angular/cdk/overlay'
import {BehaviorSubject, Subject, take} from 'rxjs'
import type {
  RevisionReviewItem,
  RevisionReviewState,
} from '../../plugins/revision-review'
import {RevisionReviewPopoverComponent} from './revision-review-popover.component'
import {RevisionReviewUiController} from './revision-review-ui.controller'

describe('RevisionReviewUiController', () => {
  function createHarness() {
    const scrollContainer = document.createElement('div')
    const blockHost = document.createElement('div')
    const marker = document.createElement('c-element')
    blockHost.dataset['blockId'] = 'block-1'
    marker.setAttribute('data-bc-revision-ids', 'revision-1')
    blockHost.append(marker)
    scrollContainer.append(blockHost)
    document.body.append(scrollContainer)

    const item: RevisionReviewItem = {
      id: 'group-1',
      revisionIds: ['revision-1'],
      kinds: ['text-insert'],
      actors: [{actorId: 'actor-1', displayName: '评审人'}],
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
      status: 'pending',
      blockIds: ['block-1'],
      dependsOn: [],
      activeDecisionIds: [],
      overlapConflictIds: [],
    }
    const state: RevisionReviewState = {
      mode: 'track',
      viewMode: 'markup',
      epoch: 1,
      items: [item],
      activeItemId: item.id,
      activeItem: item,
      activeIndex: 0,
      pendingItemCount: 1,
      pendingRevisionCount: 1,
      conflicts: [],
    }
    const state$ = new BehaviorSubject(state)
    const intent = new Subject<any>()
    const componentRef = {
      instance: {intent},
      setInput: jasmine.createSpy('setInput'),
    } as unknown as ComponentRef<RevisionReviewPopoverComponent>
    const keydown$ = new Subject<KeyboardEvent>()
    const outside$ = new Subject<MouseEvent>()
    const overlayRef = {
      keydownEvents: () => keydown$,
      outsidePointerEvents: () => outside$,
      updatePosition: jasmine.createSpy('updatePosition'),
    } as unknown as OverlayRef
    const disposeOverlay = jasmine.createSpy('disposeOverlay')
    const releaseLease = jasmine.createSpy('releaseLease')
    const acquireBlockViewLease = jasmine.createSpy('acquireBlockViewLease')
      .and.returnValue(releaseLease)
    const createConnectedOverlay = jasmine.createSpy('createConnectedOverlay')
      .and.callFake((_options: unknown, close$: Subject<void>) => {
        close$.pipe(take(1)).subscribe(() => disposeOverlay())
        return {componentRef, overlayRef}
      })
    const navigateToBlock = jasmine.createSpy('navigateToBlock').and.resolveTo(true)
    let destroyCallback: () => void = () => undefined
    const doc = {
      scrollContainer,
      model: {
        exists: jasmine.createSpy('exists').and.returnValue(true),
      },
      virtualization: {acquireBlockViewLease},
      navigateToBlock,
      vm: {get: () => ({instance: {hostElement: blockHost}})},
      overlayService: {createConnectedOverlay},
      logger: {warn: jasmine.createSpy('warn')},
      messageService: {error: jasmine.createSpy('error')},
      onDestroy: (callback: () => void) => { destroyCallback = callback },
    }
    const review = {
      state$,
      activate: jasmine.createSpy('activate').and.returnValue(item),
      keep: jasmine.createSpy('keep'),
      revert: jasmine.createSpy('revert'),
      keepAll: jasmine.createSpy('keepAll'),
      revertAll: jasmine.createSpy('revertAll'),
      resolveOverlap: jasmine.createSpy('resolveOverlap'),
      previous: jasmine.createSpy('previous').and.returnValue(null),
      next: jasmine.createSpy('next').and.returnValue(null),
    }
    const controller = new RevisionReviewUiController(doc as any, review as any)
    const cleanup = () => {
      controller.destroy()
      state$.complete()
      intent.complete()
      keydown$.complete()
      outside$.complete()
      scrollContainer.remove()
    }
    return {
      acquireBlockViewLease,
      blockHost,
      cleanup,
      controller,
      createConnectedOverlay,
      disposeOverlay,
      destroy: () => destroyCallback(),
      marker,
      navigateToBlock,
      releaseLease,
      review,
      state$,
    }
  }

  it('reveals an offscreen item with one block lease and anchors to its exact marker', async () => {
    const h = createHarness()

    expect(await h.controller.reveal('group-1')).toBeTrue()
    expect(h.review.activate).toHaveBeenCalledOnceWith('group-1')
    expect(h.acquireBlockViewLease).toHaveBeenCalledOnceWith(['block-1'])
    expect(h.navigateToBlock).toHaveBeenCalledOnceWith('block-1')
    expect(h.createConnectedOverlay).toHaveBeenCalled()
    expect(h.createConnectedOverlay.calls.mostRecent().args[0].target).toBe(h.marker)

    h.controller.close()
    expect(h.releaseLease).toHaveBeenCalledTimes(1)
    h.cleanup()
  })

  it('uses one delegated marker listener and releases UI state on document destroy', () => {
    const h = createHarness()
    expect(h.controller.attach()).toBeTrue()

    h.marker.click()
    expect(h.review.activate).toHaveBeenCalledOnceWith('group-1')
    expect(h.acquireBlockViewLease).toHaveBeenCalledOnceWith(['block-1'])

    h.destroy()
    expect(h.releaseLease).toHaveBeenCalledTimes(1)
    h.marker.click()
    expect(h.review.activate).toHaveBeenCalledTimes(1)
    h.cleanup()
  })

  it('does not open an inline popover for a resolved review item', () => {
    const h = createHarness()
    expect(h.controller.attach()).toBeTrue()
    const current = h.state$.value
    const accepted = {...current.items[0], status: 'accepted' as const}
    h.state$.next({
      ...current,
      items: [accepted],
      activeItem: accepted,
      pendingItemCount: 0,
      pendingRevisionCount: 0,
    })

    h.marker.click()

    expect(h.review.activate).not.toHaveBeenCalled()
    expect(h.createConnectedOverlay).not.toHaveBeenCalled()
    h.cleanup()
  })

  it('disposes the previous popover before opening the next review item', async () => {
    const h = createHarness()

    expect(await h.controller.reveal('group-1')).toBeTrue()
    expect(await h.controller.reveal('group-1')).toBeTrue()

    expect(h.createConnectedOverlay).toHaveBeenCalledTimes(2)
    expect(h.disposeOverlay).toHaveBeenCalledTimes(1)
    expect(h.releaseLease).toHaveBeenCalledTimes(1)

    h.controller.close()
    expect(h.disposeOverlay).toHaveBeenCalledTimes(2)
    expect(h.releaseLease).toHaveBeenCalledTimes(2)
    h.cleanup()
  })
})
