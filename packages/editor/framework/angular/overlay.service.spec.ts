import {DocOverlayService, getPositionWithOffset, type OverlayPosition} from './overlay.service'
import type {ConnectedPosition} from '@angular/cdk/overlay'
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
    let positions: ConnectedPosition[] = []
    const releaseBlockViewLease = jasmine.createSpy('releaseBlockViewLease')
    const flexiblePosition = {
      get positions() { return positions },
      positionChanges,
      withFlexibleDimensions: jasmine.createSpy('withFlexibleDimensions').and.callFake(() => flexiblePosition),
      withGrowAfterOpen: jasmine.createSpy('withGrowAfterOpen').and.callFake(() => flexiblePosition),
      withPush: jasmine.createSpy('withPush').and.callFake(() => flexiblePosition),
      withViewportMargin: jasmine.createSpy('withViewportMargin').and.callFake(() => flexiblePosition),
      withPositions: jasmine.createSpy('withPositions').and.callFake(value => {
        positions = value
        return flexiblePosition
      }),
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
      getDirection: jasmine.createSpy('getDirection').and.returnValue('ltr'),
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
      overlayElement,
      overlayHost,
      overlayRef,
      flexiblePosition,
      releaseBlockViewLease,
      service,
      scrollContainer,
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

  for (const scenario of [
    {name: '上方不足时切到下方', positions: ['top-center', 'bottom-center'],
      origin: [250, 110, 40, 30], before: [170, 62, 200, 40], after: [170, 148, 200, 40]},
    {name: '下方不足时切到上方', positions: ['bottom-center', 'top-center'],
      origin: [250, 360, 40, 30], before: [170, 398, 200, 40], after: [170, 312, 200, 40]},
    {name: '右侧不足时切到左侧', positions: ['right-center', 'left-center'],
      origin: [450, 220, 40, 30], before: [498, 215, 140, 40], after: [302, 215, 140, 40]},
    {name: 'RTL 仍按逻辑起止边选择候选', positions: ['top-left', 'bottom-right'], rtl: true,
      origin: [250, 110, 40, 30], before: [90, 62, 200, 40], after: [250, 148, 200, 40]},
  ]) {
    it(`按编辑器边界${scenario.name}，并保留调用方的原始候选顺序`, () => {
      const h = createOverlayHarness()
      const preferred = scenario.positions.map(name => getPositionWithOffset(name as OverlayPosition,
        name.includes('center') && (name.startsWith('left') || name.startsWith('right')) ? 8 : 0,
        name.startsWith('top') || name.startsWith('bottom') ? 8 : 0))
      h.flexiblePosition.withPositions(preferred)
      h.flexiblePosition.withPositions.calls.reset()
      h.overlayRef.getDirection.and.returnValue(scenario.rtl ? 'rtl' : 'ltr')
      const toRect = ([x, y, width, height]: number[]) => new DOMRect(x, y, width, height)
      spyOn(h.scrollContainer, 'getBoundingClientRect').and.returnValue(new DOMRect(100, 100, 400, 300))
      spyOn(h.targetElement, 'getBoundingClientRect').and.returnValue(toRect(scenario.origin))
      let rect = toRect(scenario.before)
      spyOn(h.overlayElement, 'getBoundingClientRect').and.callFake(() => rect)
      h.overlayRef.updatePosition.and.callFake(() => { rect = toRect(scenario.after) })

      ;(h.service as any)._clampConnectedOverlay(h.overlayRef, undefined,
        {origin: h.targetElement, strategy: h.flexiblePosition})

      expect(h.flexiblePosition.withPositions.calls.first().args[0]).toEqual([preferred[1]])
      expect(h.flexiblePosition.positions).toEqual(preferred)
      expect(h.overlayRef.updatePosition).toHaveBeenCalledTimes(1)
      expect(h.overlayHost.style.transform).toBe('')
      h.cleanup()
    })
  }

  it('所有候选均放不下时保留平移兜底，不反复重定位', () => {
    const h = createOverlayHarness()
    const preferred = ['top-center', 'bottom-center'].map(name => getPositionWithOffset(name as OverlayPosition, 0, 8))
    h.flexiblePosition.withPositions(preferred)
    spyOn(h.scrollContainer, 'getBoundingClientRect').and.returnValue(new DOMRect(100, 100, 400, 100))
    spyOn(h.targetElement, 'getBoundingClientRect').and.returnValue(new DOMRect(250, 110, 40, 80))
    spyOn(h.overlayElement, 'getBoundingClientRect').and.returnValue(new DOMRect(170, 62, 200, 40))

    ;(h.service as any)._clampConnectedOverlay(h.overlayRef, undefined,
      {origin: h.targetElement, strategy: h.flexiblePosition})

    expect(h.overlayRef.updatePosition).not.toHaveBeenCalled()
    expect(h.flexiblePosition.positions).toEqual(preferred)
    expect(h.overlayHost.style.transform).toBe('translate(0px, 46px)')
    h.cleanup()
  })

  it('treats an explicit clamp owner as authoritative over the document scroller', () => {
    const h = createOverlayHarness()
    const fullscreenHost = document.createElement('div')
    document.body.appendChild(fullscreenHost)
    spyOn(h.scrollContainer, 'getBoundingClientRect').and.returnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
    } as DOMRect)
    spyOn(fullscreenHost, 'getBoundingClientRect').and.returnValue({
      left: 0,
      right: 500,
      top: 0,
      bottom: 300,
      width: 500,
      height: 300,
    } as DOMRect)
    spyOn(h.overlayElement, 'getBoundingClientRect').and.returnValue({
      left: 400,
      right: 480,
      top: 100,
      bottom: 160,
      width: 80,
      height: 60,
    } as DOMRect)

    const service = h.service as any
    service._clampConnectedOverlay(h.overlayRef, fullscreenHost)

    expect(h.overlayRef.updateSize).toHaveBeenCalledOnceWith({
      maxWidth: '484px',
      maxHeight: '284px',
    })
    expect(h.overlayHost.style.transform).toBe('')

    fullscreenHost.remove()
    h.cleanup()
  })
})
