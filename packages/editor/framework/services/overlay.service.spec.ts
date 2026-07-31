import {DocOverlayService} from './overlay.service'
import {Subject} from 'rxjs'

class TestOverlayComponent {}

describe('DocOverlayService', () => {
  function createOverlayHarness() {
    const positionChanges = new Subject<void>()
    const backdropClick$ = new Subject<void>()
    const detachments$ = new Subject<void>()
    const readonlySwitch$ = new Subject<boolean>()
    const docDestroy$ = new Subject<void>()
    const blockDestroy$ = new Subject<void>()
    const close$ = new Subject<void>()
    const scrollContainer = document.createElement('div')
    const targetElement = document.createElement('div')
    const overlayElement = document.createElement('div')
    const overlayHost = document.createElement('div')
    document.body.append(scrollContainer, targetElement, overlayHost)
    overlayHost.appendChild(overlayElement)

    const order: string[] = []
    const releaseBlockViewLease = jasmine.createSpy('releaseBlockViewLease')
    const flexiblePosition = {
      positionChanges,
      withFlexibleDimensions: jasmine.createSpy('withFlexibleDimensions').and.callFake(() => flexiblePosition),
      withGrowAfterOpen: jasmine.createSpy('withGrowAfterOpen').and.callFake(() => flexiblePosition),
      withPush: jasmine.createSpy('withPush').and.callFake(() => flexiblePosition),
      withViewportMargin: jasmine.createSpy('withViewportMargin').and.callFake(() => flexiblePosition),
      withPositions: jasmine.createSpy('withPositions').and.callFake(() => flexiblePosition),
    }
    const globalPosition = {
      centerHorizontally: jasmine.createSpy('centerHorizontally').and.callFake(() => globalPosition),
      centerVertically: jasmine.createSpy('centerVertically').and.callFake(() => globalPosition),
      top: jasmine.createSpy('top').and.callFake(() => globalPosition),
      left: jasmine.createSpy('left').and.callFake(() => globalPosition),
      right: jasmine.createSpy('right').and.callFake(() => globalPosition),
      bottom: jasmine.createSpy('bottom').and.callFake(() => globalPosition),
      start: jasmine.createSpy('start').and.callFake(() => globalPosition),
      end: jasmine.createSpy('end').and.callFake(() => globalPosition),
    }
    let attached = true
    const overlayRef = {
      attach: jasmine.createSpy('attach').and.returnValue({instance: {}}),
      hasAttached: jasmine.createSpy('hasAttached').and.callFake(() => attached),
      backdropClick: () => backdropClick$.asObservable(),
      detachments: () => detachments$.asObservable(),
      updatePosition: jasmine.createSpy('updatePosition'),
      updateSize: jasmine.createSpy('updateSize'),
      overlayElement,
      hostElement: overlayHost,
      dispose: jasmine.createSpy('dispose').and.callFake(() => {
        if (!attached) return
        attached = false
        detachments$.next()
        detachments$.complete()
      }),
    }
    const overlay = {
      position: () => ({
        flexibleConnectedTo: jasmine.createSpy('flexibleConnectedTo').and.callFake(() => {
          order.push('position')
          return flexiblePosition
        }),
        global: jasmine.createSpy('global').and.returnValue(globalPosition),
      }),
      create: jasmine.createSpy('create').and.returnValue(overlayRef),
    }
    const virtualization = {
      acquireBlockViewLease: jasmine.createSpy('acquireBlockViewLease').and.callFake(() => {
        order.push('acquire')
        return releaseBlockViewLease
      }),
    }
    const rootHost = document.createElement('div')
    document.body.appendChild(rootHost)
    const doc = {
      injector: {get: () => overlay},
      virtualization,
      logger: {warn: jasmine.createSpy('warn')},
      scrollContainer,
      readonlySwitch$,
      onDestroy$: docDestroy$,
      isInitialized: false,
      root: {hostElement: rootHost},
    }
    const block = {
      id: 'block-1',
      hostElement: targetElement,
      onDestroy$: blockDestroy$,
    }
    const service = new DocOverlayService(doc as any)
    const cleanup = () => {
      close$.next()
      close$.complete()
      positionChanges.complete()
      backdropClick$.complete()
      readonlySwitch$.complete()
      docDestroy$.complete()
      blockDestroy$.complete()
      scrollContainer.remove()
      targetElement.remove()
      overlayHost.remove()
      rootHost.remove()
    }

    return {
      block,
      close$,
      cleanup,
      doc,
      docDestroy$,
      order,
      overlay,
      overlayRef,
      flexiblePosition,
      releaseBlockViewLease,
      service,
      targetElement,
      virtualization,
    }
  }

  it('leases a BlockComponent target before CDK positioning and releases once on close', () => {
    const h = createOverlayHarness()

    h.service.createConnectedOverlay({
      target: h.block as any,
      component: TestOverlayComponent,
    }, h.close$)

    expect(h.order).toEqual(['acquire', 'position'])
    expect(h.virtualization.acquireBlockViewLease).toHaveBeenCalledOnceWith(['block-1'])

    h.close$.next()
    h.close$.next()

    expect(h.releaseBlockViewLease).toHaveBeenCalledTimes(1)
    expect(h.overlayRef.dispose).toHaveBeenCalledTimes(1)
    h.cleanup()
  })

  it('uses exact dimensions by default and preserves explicit flexible sizing', () => {
    const defaultHarness = createOverlayHarness()

    defaultHarness.service.createConnectedOverlay({
      target: defaultHarness.targetElement,
      component: TestOverlayComponent,
    }, defaultHarness.close$)

    expect(
      defaultHarness.flexiblePosition.withFlexibleDimensions,
    ).toHaveBeenCalledOnceWith(false)
    defaultHarness.cleanup()

    const flexibleHarness = createOverlayHarness()

    flexibleHarness.service.createConnectedOverlay({
      target: flexibleHarness.targetElement,
      component: TestOverlayComponent,
      flexibleDimensions: true,
    }, flexibleHarness.close$)

    expect(
      flexibleHarness.flexiblePosition.withFlexibleDimensions,
    ).toHaveBeenCalledOnceWith(true)
    flexibleHarness.cleanup()
  })

  it('releases a BlockComponent target lease when OverlayRef is disposed directly', () => {
    const h = createOverlayHarness()
    const {overlayRef} = h.service.createConnectedOverlay({
      target: h.block as any,
      component: TestOverlayComponent,
    }, h.close$)

    overlayRef.dispose()
    h.close$.next()

    expect(h.releaseBlockViewLease).toHaveBeenCalledTimes(1)
    h.cleanup()
  })

  it('contains a target lease release failure during overlay teardown', () => {
    const h = createOverlayHarness()
    h.releaseBlockViewLease.and.throwError('release failed')
    h.service.createConnectedOverlay({
      target: h.block as any,
      component: TestOverlayComponent,
    }, h.close$)

    expect(() => h.close$.next()).not.toThrow()
    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'overlayTargetViewLeaseReleaseError: ',
      jasmine.any(Error),
    )
    expect(h.releaseBlockViewLease).toHaveBeenCalledTimes(1)
    h.cleanup()
  })

  it('releases a BlockComponent target lease when document destruction closes the overlay', () => {
    const h = createOverlayHarness()
    h.service.createConnectedOverlay({
      target: h.block as any,
      component: TestOverlayComponent,
    }, h.close$)

    h.docDestroy$.next()

    expect(h.releaseBlockViewLease).toHaveBeenCalledTimes(1)
    expect(h.overlayRef.dispose).toHaveBeenCalledTimes(1)
    h.cleanup()
  })

  it('releases the BlockComponent target lease when overlay creation throws', () => {
    const h = createOverlayHarness()
    h.overlay.create.and.throwError('overlay create failed')

    expect(() => h.service.createConnectedOverlay({
      target: h.block as any,
      component: TestOverlayComponent,
    }, h.close$)).toThrowError('overlay create failed')

    expect(h.releaseBlockViewLease).toHaveBeenCalledTimes(1)
    h.cleanup()
  })

  it('does not lease HTMLElement or global overlay targets', () => {
    const h = createOverlayHarness()
    h.service.createConnectedOverlay({
      target: h.targetElement,
      component: TestOverlayComponent,
    }, h.close$)

    expect(h.virtualization.acquireBlockViewLease).not.toHaveBeenCalled()
    h.close$.next()

    const globalClose$ = new Subject<void>()
    h.service.createGlobalOverlay({component: TestOverlayComponent} as any, globalClose$)
    expect(h.virtualization.acquireBlockViewLease).not.toHaveBeenCalled()
    globalClose$.next()
    globalClose$.complete()
    h.cleanup()
  })

  it('ignores a delayed clamp after the overlay has been disposed', () => {
    const scrollContainer = document.createElement('div')
    document.body.append(scrollContainer)
    spyOn(scrollContainer, 'getBoundingClientRect').and.returnValue({
      left: 0,
      right: 200,
      top: 0,
      bottom: 100,
      width: 200,
      height: 100,
    } as DOMRect)
    const service = new DocOverlayService({
      injector: {get: () => ({})},
      scrollContainer,
    } as any)
    const overlayRef = {
      hasAttached: () => false,
      hostElement: null,
      overlayElement: null,
      updateSize: jasmine.createSpy('updateSize'),
    }

    expect(() => (service as any)._clampConnectedOverlay(overlayRef)).not.toThrow()
    expect(overlayRef.updateSize).not.toHaveBeenCalled()

    scrollContainer.remove()
  })
})
