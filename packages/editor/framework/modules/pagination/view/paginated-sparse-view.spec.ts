import {Subject} from 'rxjs'
import {BlockNodeType} from '../../../block-std/types/block.type'
import {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from '../../../doc/model-graph'
import {PaginationLayoutCoordinator} from '../layout/pagination-layout-coordinator'
import {PaginatedViewController} from './paginated-view.controller'

describe('PaginatedViewController sparse view', () => {
  it('keeps offscreen roots estimated and replays their gap when they mount', () => {
    const scrollContainer = document.createElement('div')
    const rootHost = document.createElement('div')
    const hosts = new Map([
      ['a', blockHost('a', 160)],
      ['b', blockHost('b', 160)],
    ])
    rootHost.setAttribute('data-blockcraft-root', 'true')
    rootHost.append(hosts.get('a')!)
    scrollContainer.append(rootHost)
    document.body.append(scrollContainer)

    let mountedIds = ['a']
    const headingById = new Map<string, number | undefined>([
      ['a', undefined],
      ['b', undefined],
    ])
    const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>()
    const contentChange$ = new Subject<IBlockModelContentChange>()
    const structureChange$ = new Subject<IBlockModelStructureChange>()
    const themeChange$ = new Subject<string>()
    const childrenChange$ = new Subject<void>()
    const releaseProjection = jasmine.createSpy('releaseProjection')
    let registeredProjection: any = null
    let registrationHooks: any = null
    const registerLayoutProjection = jasmine.createSpy('registerLayoutProjection')
      .and.callFake((projection: unknown, hooks: any) => {
        registeredProjection = projection
        registrationHooks = hooks
        hooks.beforeActivate?.()
        return () => {
          hooks.beforeDeactivate?.()
          releaseProjection()
        }
      })
    const getBlockById = jasmine.createSpy('getBlockById').and.callFake(
      (id: string, onError?: () => void) => {
        if (!mountedIds.includes(id)) {
          onError?.()
          throw new Error(`Block not found: ${id}`)
        }
        return {
          id,
          flavour: 'paragraph',
          nodeType: BlockNodeType.editable,
          hostElement: hosts.get(id),
          get heading() {
            return headingById.get(id)
          },
        }
      },
    )
    const config = {
      scrollContainer,
      theme: 'light',
      virtualization: {
        enabled: true,
        estimatedHeights: {paragraph: 160},
      },
    }
    const compositionSession = {isIdle: true}
    const eventStatus = {isComposing: false}
    const doc = {
      rootId: 'root',
      root: {
        childrenIds: ['a', 'b'],
        hostElement: rootHost,
      },
      model: {
        contentChange$,
        structureChange$,
        getChildrenIds: (id: string) => id === 'root' ? ['a', 'b'] : [],
        getPath: (id: string) => ['root', id],
        getFlavour: () => 'paragraph',
        getNodeType: () => BlockNodeType.editable,
        getProps: (id: string) => {
          const heading = headingById.get(id)
          return heading == null ? {} : {heading}
        },
      },
      config,
      get theme() {
        return config.theme
      },
      themeChange$,
      onChildrenUpdate$: childrenChange$,
      getBlockById,
      vm: {getMountedRootChildIds: () => [...mountedIds]},
      virtualization: {
        enabled: true,
        viewChange$,
        registerLayoutProjection,
      },
      inputManger: {compositionSession},
      event: {status: eventStatus},
      ngZone: {runOutsideAngular: (run: () => void) => run()},
      logger: {warn: jasmine.createSpy('warn')},
    } as unknown as BlockCraft.Doc
    const onSparseViewFailure = jasmine.createSpy('onSparseViewFailure')
    const controller = new PaginatedViewController(
      doc,
      {
        pageSize: {width: 400, height: 220},
        margins: {top: 10, right: 10, bottom: 10, left: 10},
        pageGap: 20,
      },
      scrollContainer,
      undefined,
      {sparseView: true, onSparseViewFailure},
    )

    try {
      controller.enable()
      expect(registerLayoutProjection).toHaveBeenCalledTimes(1)
      expect(registrationHooks?.isValidationDeferred?.()).toBeFalse()
      expect(gapBefore(hosts.get('b')!)).toBeNull()
      expect(controller.captureStableLayout()).not.toBeNull()
      const entries = controller.captureShadowLayout()!.entries
      expect(entries.find(entry => entry.blockId === 'a')?.source).toBe('measured')
      expect(entries.find(entry => entry.blockId === 'b')?.source).toBe('estimated')

      for (const heading of [1, 2, undefined]) {
        headingById.set('a', heading)
        contentChange$.next({
          blockIds: ['a'],
          kinds: ['props'],
          origin: 'heading-test',
          local: true,
          isUndoRedo: false,
        })

        expect(controller.captureStableLayout()).not.toBeNull()
        expect(controller.captureShadowLayout()?.entries[0].isHeading)
          .toBe(heading != null)
        expect(rootHost.classList.contains('bc-paginated')).toBeTrue()
        expect(onSparseViewFailure).not.toHaveBeenCalled()
      }

      controller.updateConfig({pageSize: {width: 500, height: 220}})
      expect(rootHost.style.getPropertyValue('--bc-page-width')).toBe('400px')
      expect(controller.captureStableLayout()).not.toBeNull()
      expect(rootHost.style.getPropertyValue('--bc-page-width')).toBe('500px')

      const projectionRevision = registeredProjection.revision
      eventStatus.isComposing = true
      compositionSession.isIdle = false
      controller.scheduleRecompute()
      expect(registrationHooks.isValidationDeferred()).toBeTrue()

      // Raw/model composition has ended, but the trailing sparse projection
      // recompute has not committed yet.
      eventStatus.isComposing = false
      compositionSession.isIdle = true
      expect(registrationHooks.isValidationDeferred()).toBeTrue()

      controller.captureStableLayout()
      expect(registrationHooks.isValidationDeferred()).toBeFalse()
      expect(registeredProjection.revision).toBeGreaterThan(projectionRevision)

      headingById.set('b', 1)
      contentChange$.next({
        blockIds: ['b'],
        kinds: ['props'],
        origin: 'offscreen-heading-test',
        local: false,
        isUndoRedo: false,
      })
      expect(controller.captureStableLayout()).not.toBeNull()
      expect(controller.captureShadowLayout()?.entries.find(
        entry => entry.blockId === 'b',
      )).toEqual(jasmine.objectContaining({
        isHeading: true,
        source: 'estimated',
      }))

      const scheduleRecompute = spyOn(controller, 'scheduleRecompute')
      contentChange$.next({
        blockIds: ['b'],
        kinds: ['text'],
        origin: 'remote-test',
        local: false,
        isUndoRedo: false,
      })
      expect(scheduleRecompute).toHaveBeenCalledTimes(1)

      getBlockById.calls.reset()
      rootHost.replaceChildren(hosts.get('b')!)
      mountedIds = ['b']
      viewChange$.next({mountedRootIds: mountedIds})

      expect(controller.captureStableLayout()).not.toBeNull()
      expect(controller.captureShadowLayout()?.entries.find(
        entry => entry.blockId === 'b',
      )).toEqual(jasmine.objectContaining({
        isHeading: true,
        source: 'measured',
      }))
      expect(getBlockById).not.toHaveBeenCalledWith('a', jasmine.anything())
      expect(gapBefore(hosts.get('a')!)).toBeNull()
      expect(gapBefore(hosts.get('b')!)?.style.height).toBe('80px')
      expect(rootHost.classList.contains('bc-paginated')).toBeTrue()
      expect(onSparseViewFailure).not.toHaveBeenCalled()

      controller.disable()
      expect(releaseProjection).toHaveBeenCalledTimes(1)
      expect(gapBefore(hosts.get('b')!)).toBeNull()
      expect(rootHost.classList.contains('bc-paginated')).toBeFalse()
    } finally {
      controller.destroy()
      contentChange$.complete()
      structureChange$.complete()
      themeChange$.complete()
      childrenChange$.complete()
      viewChange$.complete()
      scrollContainer.remove()
    }
  })

  it('skips a full recompute when returning to a warm mounted host', () => {
    const harness = createWarmWindowHarness()
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 0
    spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      const frameId = ++nextFrameId
      callbacks.set(frameId, callback)
      return frameId
    })
    spyOn(window, 'cancelAnimationFrame').and.callFake((frameId) => {
      callbacks.delete(frameId)
    })
    const flushFrame = () => {
      const pending = [...callbacks.values()]
      callbacks.clear()
      pending.forEach((callback) => callback(performance.now()))
    }
    const compute = spyOn(harness.coordinator, 'compute').and.callThrough()
    const heightSource = (
      harness.controller as unknown as {
        _heightSource: {
          measure(...args: unknown[]): unknown
          _handleResize(entries: readonly ResizeObserverEntry[]): void
        }
      }
    )._heightSource
    const measure = spyOn(heightSource, 'measure').and.callThrough()
    const applyLayout = spyOn(
      harness.controller as unknown as {
        _applyLayoutView(...args: unknown[]): ReadonlySet<string>
      },
      '_applyLayoutView',
    ).and.callThrough()

    try {
      harness.controller.enable()
      harness.controller.captureStableLayout()

      // B is a cold host, so its first mounted window must still be measured
      // and published through the complete sparse-pagination path.
      compute.calls.reset()
      measure.calls.reset()
      applyLayout.calls.reset()
      harness.mount('b')
      flushFrame()
      expect(compute).toHaveBeenCalledTimes(1)
      expect(measure).toHaveBeenCalledTimes(1)
      expect(applyLayout).toHaveBeenCalledTimes(1)

      // A and B now both have a completed measurement for the same host and
      // measure context. Returning to either window only replays its cached DOM
      // projection; it must not scan/paginate/publish the whole document again.
      compute.calls.reset()
      measure.calls.reset()
      applyLayout.calls.reset()
      let projectionChanges = 0
      harness.projection.change$.subscribe(() => projectionChanges++)

      harness.mount('a')
      flushFrame()
      harness.mount('b')
      flushFrame()

      expect(compute).not.toHaveBeenCalled()
      expect(measure).not.toHaveBeenCalled()
      expect(applyLayout).not.toHaveBeenCalled()
      expect(projectionChanges).toBe(0)

      // A remount backed by a new HTMLElement is not a warm-host cache hit: it
      // must be measured once, while equal geometry still avoids compute/publish.
      const replacement = blockHost('a', 160)
      harness.replaceHost('a', replacement)
      harness.mount('a')
      // Browsers deliver an initial RO entry for a newly observed host before
      // the next rAF. It must not promote the queued mounted measurement to a
      // full invalidation.
      heightSource._handleResize([
        {
          target: replacement,
          borderBoxSize: [{blockSize: 160}],
        } as unknown as ResizeObserverEntry,
      ])
      flushFrame()

      expect(compute).not.toHaveBeenCalled()
      expect(measure).toHaveBeenCalledTimes(1)
      expect(applyLayout).not.toHaveBeenCalled()
      expect(projectionChanges).toBe(0)

      // A real ResizeObserver change on that same host invalidates its completed
      // measurement and must publish the new pagination geometry.
      compute.calls.reset()
      measure.calls.reset()
      applyLayout.calls.reset()
      Object.defineProperty(replacement, 'offsetHeight', {
        configurable: true,
        value: 180,
      })
      Object.defineProperty(replacement, 'scrollHeight', {
        configurable: true,
        value: 180,
      })
      heightSource._handleResize([
        {
          target: replacement,
          borderBoxSize: [{blockSize: 180}],
        } as unknown as ResizeObserverEntry,
      ])
      flushFrame()

      expect(compute).toHaveBeenCalledTimes(1)
      expect(measure).toHaveBeenCalledTimes(1)
      expect(applyLayout).toHaveBeenCalledTimes(1)
      expect(projectionChanges).toBe(1)

      // The synchronous sparse export barrier invalidates every old DOM epoch,
      // but only the mounted root can be refreshed here. Offscreen entries must
      // therefore keep the layout non-exact and force readonly export reflow.
      expect(harness.controller.captureStableLayout()).not.toBeNull()
      expect(harness.controller.canReuseStableLayoutForExport).toBeFalse()
    } finally {
      harness.destroy()
    }
  })

  it('defers structure validation until the matching sparse projection publishes', () => {
    const harness = createWarmWindowHarness()

    try {
      harness.controller.enable()
      expect(harness.controller.captureStableLayout()).not.toBeNull()
      const projectionRevision = harness.projection.revision

      harness.structureChange$.next({
        revision: 1,
        reachableAddedIds: [],
        reachableRemovedIds: [],
        affectedParentIds: ['root'],
        affectedRootIds: [],
      })

      expect(harness.registrationHooks.isValidationDeferred()).toBeTrue()
      expect(harness.projection.revision).toBe(projectionRevision)

      expect(harness.controller.captureStableLayout()).not.toBeNull()
      expect(harness.registrationHooks.isValidationDeferred()).toBeFalse()
      expect(harness.projection.revision).toBeGreaterThan(projectionRevision)
    } finally {
      harness.destroy()
    }
  })

  it('finishes sparse failure teardown when projection release and one view cleanup throw', () => {
    const harness = createWarmWindowHarness()
    let restoreGapClear: (() => void) | null = null

    try {
      harness.controller.enable()
      expect(harness.controller.captureStableLayout()).not.toBeNull()
      const internals = harness.controller as unknown as {
        _enabled: boolean
        _subs: {readonly closed: boolean}
        _containerRO: ResizeObserver | null
        _releaseLayoutProjection: (() => void) | null
        _sparseProjectionUpdateDeferred: boolean
        _recomputeSparse(
          measurementRevision: number | null,
          mountedMeasurementOnly: boolean,
        ): unknown
        _gapApplier: {clear(): void}
        _inlineBreaks: {clear(): void}
        _tableBreaks: {clear(): void}
        _heightLockApplier: {clear(): void}
      }
      const previousSubscriptions = internals._subs
      const gapCleanupError = new Error('forced gap cleanup failure')
      const releaseError = new Error('forced projection release failure')
      harness.setProjectionReleaseError(releaseError)
      const gapClear = spyOn(internals._gapApplier, 'clear').and.callFake(() => {
        throw gapCleanupError
      })
      restoreGapClear = () => gapClear.and.callThrough()
      const inlineClear = spyOn(internals._inlineBreaks, 'clear').and.callThrough()
      const tableClear = spyOn(internals._tableBreaks, 'clear').and.callThrough()
      const heightLockClear = spyOn(internals._heightLockApplier, 'clear').and.callThrough()

      expect(() => {
        internals._recomputeSparse(null, false)
        internals._recomputeSparse(null, false)
        internals._recomputeSparse(null, false)
      }).not.toThrow()

      expect(harness.releaseProjection).toHaveBeenCalledTimes(1)
      expect(harness.onSparseViewFailure).toHaveBeenCalledTimes(1)
      expect(harness.onSparseViewFailure).toHaveBeenCalledWith(jasmine.any(Error))
      expect(previousSubscriptions.closed).toBeTrue()
      expect(internals._enabled).toBeFalse()
      expect(internals._containerRO).toBeNull()
      expect(internals._releaseLayoutProjection).toBeNull()
      expect(internals._sparseProjectionUpdateDeferred).toBeFalse()
      expect(inlineClear).toHaveBeenCalled()
      expect(tableClear).toHaveBeenCalled()
      expect(heightLockClear).toHaveBeenCalled()
      expect(harness.rootHost.classList.contains('bc-paginated')).toBeFalse()
      expect(harness.logger.warn).toHaveBeenCalledWith(
        'paginationViewCleanupError: ',
        jasmine.objectContaining({stage: 'gap-view', error: gapCleanupError}),
      )
      expect(harness.logger.warn).toHaveBeenCalledWith(
        'paginationViewCleanupError: ',
        jasmine.objectContaining({
          stage: 'sparse-reconcile-release',
          error: releaseError,
        }),
      )
    } finally {
      restoreGapClear?.()
      harness.destroy()
    }
  })
})

function blockHost(id: string, height: number): HTMLElement {
  const host = document.createElement('div')
  host.dataset['blockId'] = id
  host.style.marginBottom = '0'
  Object.defineProperty(host, 'offsetHeight', {configurable: true, value: height})
  Object.defineProperty(host, 'scrollHeight', {configurable: true, value: height})
  return host
}

function gapBefore(host: HTMLElement): HTMLElement | null {
  const previous = host.previousElementSibling as HTMLElement | null
  return previous?.dataset['bcPageGapSpacer'] ? previous : null
}

function createWarmWindowHarness() {
  const scrollContainer = document.createElement('div')
  const rootHost = document.createElement('div')
  const hosts = new Map([
    ['a', blockHost('a', 160)],
    ['b', blockHost('b', 160)],
  ])
  rootHost.setAttribute('data-blockcraft-root', 'true')
  rootHost.append(hosts.get('a')!)
  scrollContainer.append(rootHost)
  document.body.append(scrollContainer)

  let mountedIds = ['a']
  let projection: any = null
  let registrationHooks: any = null
  let projectionReleaseError: Error | null = null
  const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>()
  const contentChange$ = new Subject<IBlockModelContentChange>()
  const structureChange$ = new Subject<IBlockModelStructureChange>()
  const themeChange$ = new Subject<string>()
  const childrenChange$ = new Subject<void>()
  const releaseProjection = jasmine.createSpy('releaseProjection')
  const onSparseViewFailure = jasmine.createSpy('onSparseViewFailure')
  const config = {
    scrollContainer,
    theme: 'light',
    virtualization: {
      enabled: true,
      estimatedHeights: {paragraph: 160},
    },
  }
  const doc = {
    rootId: 'root',
    root: {
      childrenIds: ['a', 'b'],
      hostElement: rootHost,
    },
    model: {
      contentChange$,
      structureChange$,
      getChildrenIds: (id: string) => (id === 'root' ? ['a', 'b'] : []),
      getPath: (id: string) => ['root', id],
      getFlavour: () => 'paragraph',
      getNodeType: () => BlockNodeType.editable,
      getProps: () => ({}),
    },
    config,
    get theme() {
      return config.theme
    },
    themeChange$,
    onChildrenUpdate$: childrenChange$,
    getBlockById: (id: string, onError?: () => void) => {
      if (!mountedIds.includes(id)) {
        onError?.()
        throw new Error(`Block not found: ${id}`)
      }
      return {
        id,
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        hostElement: hosts.get(id),
        heading: false,
      }
    },
    vm: {getMountedRootChildIds: () => [...mountedIds]},
    virtualization: {
      enabled: true,
      viewChange$,
      registerLayoutProjection: (nextProjection: unknown, hooks: any) => {
        projection = nextProjection
        registrationHooks = hooks
        hooks.beforeActivate?.()
        let active = true
        return () => {
          if (!active) return
          active = false
          hooks.beforeDeactivate?.()
          releaseProjection()
          if (projectionReleaseError) throw projectionReleaseError
        }
      },
    },
    inputManger: {compositionSession: {isIdle: true}},
    event: {status: {isComposing: false}},
    ngZone: {runOutsideAngular: (run: () => void) => run()},
    logger: {warn: jasmine.createSpy('warn')},
  } as unknown as BlockCraft.Doc
  const coordinator = new PaginationLayoutCoordinator(doc)
  const controller = new PaginatedViewController(
    doc,
    {
      pageSize: {width: 400, height: 220},
      margins: {top: 10, right: 10, bottom: 10, left: 10},
      pageGap: 20,
    },
    scrollContainer,
    coordinator,
    {sparseView: true, onSparseViewFailure},
  )

  return {
    controller,
    coordinator,
    structureChange$,
    rootHost,
    logger: doc.logger,
    releaseProjection,
    onSparseViewFailure,
    get projection() {
      if (!projection) throw new Error('Sparse projection is not registered')
      return projection
    },
    get registrationHooks() {
      if (!registrationHooks) {
        throw new Error('Sparse projection hooks are not registered')
      }
      return registrationHooks
    },
    setProjectionReleaseError(error: Error | null) {
      projectionReleaseError = error
    },
    mount(id: 'a' | 'b') {
      mountedIds = [id]
      rootHost.replaceChildren(hosts.get(id)!)
      viewChange$.next({mountedRootIds: [...mountedIds]})
    },
    replaceHost(id: 'a' | 'b', host: HTMLElement) {
      hosts.set(id, host)
    },
    destroy() {
      controller.destroy()
      contentChange$.complete()
      structureChange$.complete()
      themeChange$.complete()
      childrenChange$.complete()
      viewChange$.complete()
      scrollContainer.remove()
    },
  }
}
