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
          heading: false,
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
        getProps: () => ({}),
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
    const controller = new PaginatedViewController(
      doc,
      {
        pageSize: {width: 400, height: 220},
        margins: {top: 10, right: 10, bottom: 10, left: 10},
        pageGap: 20,
      },
      scrollContainer,
      undefined,
      {sparseView: true},
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

      expect(getBlockById).not.toHaveBeenCalledWith('a', jasmine.anything())
      expect(gapBefore(hosts.get('a')!)).toBeNull()
      expect(gapBefore(hosts.get('b')!)?.style.height).toBe('80px')

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
  const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>()
  const contentChange$ = new Subject<IBlockModelContentChange>()
  const structureChange$ = new Subject<IBlockModelStructureChange>()
  const themeChange$ = new Subject<string>()
  const childrenChange$ = new Subject<void>()
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
        hooks.beforeActivate?.()
        return () => hooks.beforeDeactivate?.()
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
    {sparseView: true},
  )

  return {
    controller,
    coordinator,
    get projection() {
      if (!projection) throw new Error('Sparse projection is not registered')
      return projection
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
