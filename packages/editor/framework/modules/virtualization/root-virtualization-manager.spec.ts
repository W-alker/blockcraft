import {BehaviorSubject, Subject} from 'rxjs'
import {BlockNodeType} from '../../block-std/types'
import {HeightMap} from './height-map'
import {ContinuousLayoutProjection} from './layout-projection'
import type {VerticalLayoutProjection} from './layout-projection'
import {
  registerRootLayoutProjection,
  RootVirtualizationManager,
} from './root-virtualization-manager'
import type {VirtualizationConfig} from './types'

describe('RootVirtualizationManager', () => {
  function createHarness(
    retainedViewLimit = 12,
    rootBlockCount = 20,
    config: VirtualizationConfig = {},
    ownerDocument: Document = document,
  ) {
    const ids = Array.from({length: rootBlockCount}, (_, index) => `b${index}`)
    let layoutIds = [...ids]
    const mounted = new Set<string>()
    const refs = new Map<string, any>()
    const rootContainer = ownerDocument.createElement('div')
    const scrollContainer = ownerDocument.createElement('div')
    scrollContainer.append(rootContainer)
    Object.defineProperty(scrollContainer, 'clientHeight', {value: 96})
    Object.defineProperty(scrollContainer, 'scrollTop', {value: 0, writable: true})
    spyOn(rootContainer, 'getBoundingClientRect').and.callFake(() =>
      createRect(-scrollContainer.scrollTop, layoutIds.length * 48),
    )
    spyOn(scrollContainer, 'getBoundingClientRect').and.returnValue({
      top: 0,
      bottom: 96,
      left: 0,
      right: 100,
      width: 100,
      height: 96,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const structureChange$ = new Subject<void>()
    const selection$ = new BehaviorSubject<any>(null)
    const compositionSession = {isIdle: true}
    let structureRevision = 0
    let deferredSparseRootOrder = false
    let adapter: any = null

    const ensureRef = (id: string) => {
      let ref = refs.get(id)
      if (ref) return ref
      const hostElement = ownerDocument.createElement('div')
      hostElement.dataset['blockId'] = id
      spyOn(hostElement, 'getBoundingClientRect').and.callFake(() =>
        createRect(layoutIds.indexOf(id) * 48 - scrollContainer.scrollTop, 48),
      )
      ref = {instance: {id, hostElement}}
      refs.set(id, ref)
      return ref
    }
    const syncDom = () => {
      Array.from(rootContainer.children).forEach((node) => node.remove())
      ids.filter((id) => mounted.has(id)).forEach((id) => rootContainer.append(ensureRef(id).instance.hostElement))
    }
    const mountRootChild = (id: string) => {
      mounted.add(id)
      syncDom()
      return ensureRef(id)
    }
    const vm = {
      mountRootChild: jasmine.createSpy('mountRootChild').and.callFake(mountRootChild),
      retainRootChild: jasmine.createSpy('retainRootChild').and.callFake((id: string) => {
        mounted.delete(id)
        syncDom()
        return refs.get(id)
      }),
      destroyRetainedRootChild: jasmine.createSpy('destroyRetainedRootChild').and.callFake((id: string) => {
        if (mounted.has(id)) return false
        return refs.delete(id)
      }),
      getRetainedRootChildIds: () => [...refs.keys()].filter(id => !mounted.has(id)),
      isMounted: jasmine.createSpy('isMounted').and.callFake((id: string) => mounted.has(id)),
      getMountedRootChildIds: () => ids.filter(id => mounted.has(id)),
      get: (id: string) => refs.get(id),
      get hasDeferredSparseRootOrder() {
        return deferredSparseRootOrder
      },
      _flushDeferredSparseRootOrder: jasmine.createSpy('_flushDeferredSparseRootOrder').and.callFake(() => {
        const hadDeferredOrder = deferredSparseRootOrder
        deferredSparseRootOrder = false
        return hadDeferredOrder
      }),
      _reconcileSparseRootChildren: jasmine.createSpy('_reconcileSparseRootChildren'),
    }
    const doc = {
      rootId: 'root',
      root: {childrenRenderRef: {containerElement: rootContainer}},
      model: {
        get structureRevision() {
          return structureRevision
        },
        getChildrenIds: () => [...ids],
        getFlavour: () => 'paragraph',
        getPath: (id: string) => ['root', id],
        exists: (id: string) => ids.includes(id) || id === 'nested',
        structureChange$,
      },
      vm,
      selection: {
        changeObserve: () => selection$.asObservable(),
        registerProjectionMountAdapter: (value: unknown) => {
          adapter = value
          return () => {
            adapter = null
          }
        },
      },
      ngZone: {runOutsideAngular: (fn: () => void) => fn()},
      event: {status: {isComposing: false}},
      inputManger: {compositionSession},
      logger: {warn: jasmine.createSpy('warn')},
      messageService: {warn: jasmine.createSpy('messageWarn')},
    }
    const manager = new RootVirtualizationManager(doc as any, {
      enabled: true,
      overscanViewports: 1,
      retainedViewLimit,
      ...config,
      estimatedHeights: {
        paragraph: 48,
        ...config.estimatedHeights,
      },
    })
    const replaceRootIds = (nextIds: readonly string[]) => {
      ids.splice(0, ids.length, ...nextIds)
      structureRevision++
      structureChange$.next()
      layoutIds = [...ids]
      syncDom()
    }
    return {
      adapter: () => adapter,
      compositionSession,
      doc,
      ids,
      advanceStructureRevision: () => structureRevision++,
      ensureRef,
      manager,
      mountRootChild,
      mounted,
      refs,
      replaceRootIds,
      setDeferredSparseRootOrder: (value: boolean) => {
        deferredSparseRootOrder = value
      },
      scrollContainer,
      selection$,
      structureChange$,
      vm,
    }
  }

  it('refreshes offscreen object estimates when root content width changes', () => {
    const h = createHarness(12, 3)
    const width$ = new BehaviorSubject(800)
    let resolvedHeight = 200
    ;(h.doc.model as any).getChildrenIds = (blockId: string) =>
      blockId === 'root' ? [...h.ids] : []
    ;(h.doc.model as any).getFlavour = () => 'image'
    ;(h.doc.model as any).getProps = () => ({wr: 50, ar: 2})
    ;(h.doc as any).schemas = {
      get: () => ({
        metadata: {
          objectSizing: {defaultWr: 100, defaultAr: 4 / 3},
        },
      }),
    }
    ;(h.doc as any).objectSizing = {
      widthChange$: width$,
      resolve: () => ({
        width: resolvedHeight * 2,
        height: resolvedHeight,
        wr: 50,
        ar: 2,
        source: 'ratio',
        exact: true,
      }),
    }

    h.manager.init(h.scrollContainer)
    expect((h.manager as any).heights.get(0)).toBe(200)

    resolvedHeight = 250
    width$.next(1000)
    expect((h.manager as any).heights.get(0)).toBe(250)

    h.manager.dispose()
  })

  it('refreshes table estimates for row structure without rescanning on cell text', () => {
    const h = createHarness(12, 1, {
      estimatedHeights: {table: 240},
    })
    const contentChange$ = new Subject<any>()
    const tableId = h.ids[0]
    const rowIds = Array.from({length: 5}, (_, index) => `row-${index}`)
    const rowHeights = new Map(rowIds.map(id => [id, 60]))
    let tableChildrenReads = 0
    ;(h.doc.model as any).contentChange$ = contentChange$
    ;(h.doc.model as any).getChildrenIds = (blockId: string) => {
      if (blockId === 'root') return [...h.ids]
      if (blockId === tableId) {
        tableChildrenReads++
        return [...rowIds]
      }
      return []
    }
    ;(h.doc.model as any).getFlavour = (blockId: string) => {
      if (blockId === tableId) return 'table'
      if (rowHeights.has(blockId)) return 'table-row'
      return 'paragraph'
    }
    ;(h.doc.model as any).getNodeType = (blockId: string) =>
      blockId === tableId || rowHeights.has(blockId)
        ? BlockNodeType.block
        : BlockNodeType.editable
    ;(h.doc.model as any).getProps = (blockId: string) =>
      rowHeights.has(blockId) ? {height: rowHeights.get(blockId)} : {}
    ;(h.doc.model as any).getParentId = (blockId: string) =>
      rowHeights.has(blockId) ? tableId : null
    ;(h.doc.model as any).getPath = (blockId: string) => {
      if (h.ids.includes(blockId)) return ['root', blockId]
      if (rowHeights.has(blockId)) return ['root', tableId, blockId]
      return ['root', tableId, 'row-0', 'cell-0', blockId]
    }

    h.manager.init(h.scrollContainer)
    expect((h.manager as any).heights.get(0)).toBe(300)
    tableChildrenReads = 0

    contentChange$.next({
      blockIds: ['paragraph'],
      kinds: ['text'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })
    expect(tableChildrenReads).toBe(0)
    expect((h.manager as any).heights.get(0)).toBe(300)

    rowHeights.set('row-0', 100)
    contentChange$.next({
      blockIds: ['row-0'],
      kinds: ['props'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })
    expect(tableChildrenReads).toBe(1)
    expect((h.manager as any).heights.get(0)).toBe(300)

    rowIds.push('row-5')
    rowHeights.set('row-5', 60)
    h.advanceStructureRevision()
    ;(h.structureChange$ as Subject<any>).next({
      revision: 1,
      reachableAddedIds: ['row-5'],
      reachableRemovedIds: [],
      affectedParentIds: [tableId],
      affectedRootIds: [tableId],
    })
    expect((h.manager as any).heights.get(0)).toBe(360)

    rowIds.push('row-6')
    rowHeights.set('row-6', 60)
    h.ids.push('new-root')
    h.advanceStructureRevision()
    ;(h.structureChange$ as Subject<any>).next({
      revision: 2,
      reachableAddedIds: ['row-6', 'new-root'],
      reachableRemovedIds: [],
      affectedParentIds: [tableId, 'root'],
      affectedRootIds: [tableId, 'new-root'],
    })
    expect((h.manager as any).heights.get(0)).toBe(420)

    h.manager.dispose()
    contentChange$.complete()
  })

  it('mounts a cold zero-height placement layout from absolute child geometry', async () => {
    const h = createHarness(12, 20)
    const contentChange$ = new Subject<any>()
    const rootIds = [
      ...Array.from({length: 20}, (_, index) => `p${index}`),
      'layout',
    ]
    h.replaceRootIds(rootIds)
    let imageY = 40
    ;(h.doc.model as any).contentChange$ = contentChange$
    ;(h.doc.model as any).getChildrenIds = (blockId: string) => {
      if (blockId === 'root') return [...h.ids]
      if (blockId === 'layout') return ['image']
      return []
    }
    ;(h.doc.model as any).getFlavour = (blockId: string) => {
      if (blockId === 'layout') return 'placement-layout'
      if (blockId === 'image') return 'image'
      return 'paragraph'
    }
    ;(h.doc.model as any).getProps = (blockId: string) =>
      blockId === 'image'
        ? {
            placement: {mode: 'absolute', x: 10, y: imageY},
            wr: 50,
            ar: 2,
          }
        : {}
    ;(h.doc.model as any).getPath = (blockId: string) =>
      blockId === 'image'
        ? ['root', 'layout', 'image']
        : ['root', blockId]
    ;(h.doc as any).objectSizing = {
      rootContentWidth: 800,
      resolve: (flavour: string) =>
        flavour === 'image'
          ? {
              width: 400,
              height: 200,
              wr: 50,
              ar: 2,
              source: 'ratio',
              exact: true,
            }
          : null,
    }

    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    expect(h.mounted.has('layout')).toBeTrue()

    imageY = 800
    contentChange$.next({
      blockIds: ['image'],
      kinds: ['props'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })
    await nextAnimationFrame()
    expect(h.mounted.has('layout')).toBeFalse()

    imageY = 20
    contentChange$.next({
      blockIds: ['image'],
      kinds: ['props'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })
    await nextAnimationFrame()
    expect(h.mounted.has('layout')).toBeTrue()

    h.manager.dispose()
    contentChange$.complete()
  })

  it('mounts an initially offscreen placement layout when scrolling into its y range', async () => {
    const h = createHarness(12, 20)
    h.replaceRootIds([
      ...Array.from({length: 20}, (_, index) => `p${index}`),
      'layout',
    ])
    ;(h.doc.model as any).getChildrenIds = (blockId: string) => {
      if (blockId === 'root') return [...h.ids]
      if (blockId === 'layout') return ['shape']
      return []
    }
    ;(h.doc.model as any).getFlavour = (blockId: string) => {
      if (blockId === 'layout') return 'placement-layout'
      if (blockId === 'shape') return 'shape'
      return 'paragraph'
    }
    ;(h.doc.model as any).getProps = (blockId: string) =>
      blockId === 'shape'
        ? {
            placement: {mode: 'absolute', x: 10, y: 600},
            width: 180,
            height: 100,
          }
        : {}
    ;(h.doc.model as any).getPath = (blockId: string) =>
      blockId === 'shape'
        ? ['root', 'layout', 'shape']
        : ['root', blockId]

    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    expect(h.mounted.has('layout')).toBeFalse()

    h.scrollContainer.scrollTop = 450
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect(h.mounted.has('layout')).toBeTrue()
    h.manager.dispose()
  })

  it('coalesces initial work and mounts only the estimated viewport window', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      expect([...h.mounted]).toEqual(h.ids.slice(0, 7))
      expect(h.vm.mountRootChild).toHaveBeenCalledTimes(7)
      h.manager.dispose()
      done()
    })
  })

  it('derives the mounted viewport from the active layout projection', (done) => {
    const h = createHarness()
    const projectedHeights = new HeightMap()
    projectedHeights.bulkInit(Array.from({length: h.ids.length}, () => 200))
    const projection = new ContinuousLayoutProjection(projectedHeights)
    ;(h.manager as any).layoutProjection = projection

    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      expect([...h.mounted]).toEqual(h.ids.slice(0, 2))
      h.manager.dispose()
      projection.dispose()
      done()
    })
  })

  it('atomically registers one custom projection and restores continuous layout on release', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 200))
    const projection = customProjection(h.ids, heights)
    const beforeDeactivate = jasmine.createSpy('beforeDeactivate')
    const release = registerRootLayoutProjection(h.manager, projection, {beforeDeactivate})

    await nextAnimationFrame()
    expect([...h.mounted]).toEqual(h.ids.slice(0, 2))

    release()
    release()
    await nextAnimationFrame()

    expect(beforeDeactivate).toHaveBeenCalledTimes(1)
    expect([...h.mounted]).toEqual(h.ids.slice(0, 7))
    h.manager.dispose()
    projection.dispose()
  })

  it('synchronizes the lazy model index when pagination registers before virtualization init', async () => {
    const h = createHarness()
    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 200))
    const projection = customProjection(h.ids, heights)

    const release = registerRootLayoutProjection(h.manager, projection)
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    expect([...h.mounted]).toEqual(h.ids.slice(0, 2))
    release()
    h.manager.dispose()
    projection.dispose()
  })

  it('captures the old coordinate anchor before activation side effects', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 100))
    const projection = customProjection(h.ids, heights)
    const order: string[] = []
    spyOn<any>(h.manager, 'captureCurrentStructureAnchor').and.callFake(() => {
      order.push('capture')
      return null
    })

    const release = registerRootLayoutProjection(h.manager, projection, {
      beforeActivate: () => order.push('activate'),
    })

    expect(order).toEqual(['capture', 'activate'])
    release()
    h.manager.dispose()
    projection.dispose()
  })

  it('cleans custom projection view state when the manager disposes first', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 100))
    const projection = customProjection(h.ids, heights)
    const beforeDeactivate = jasmine.createSpy('beforeDeactivate')
    const release = registerRootLayoutProjection(h.manager, projection, {beforeDeactivate})

    h.manager.dispose()
    release()

    expect(beforeDeactivate).toHaveBeenCalledTimes(1)
    projection.dispose()
  })

  it('rejects mismatched and concurrent custom projections', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const invalidHeights = new HeightMap()
    invalidHeights.bulkInit(h.ids.map(() => 48))
    const invalid = customProjection([...h.ids].reverse(), invalidHeights)
    expect(() => registerRootLayoutProjection(h.manager, invalid))
      .toThrowError(/block order/)

    const firstHeights = new HeightMap()
    firstHeights.bulkInit(h.ids.map(() => 48))
    const first = customProjection(h.ids, firstHeights)
    const release = registerRootLayoutProjection(h.manager, first)
    const second = customProjection(h.ids, firstHeights)
    expect(() => registerRootLayoutProjection(h.manager, second))
      .toThrowError(/already registered/)

    release()
    h.manager.dispose()
    first.dispose()
    second.dispose()
    invalid.dispose()
  })

  it('reconciles projection changes and falls back before an invalid order can mount', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 200))
    let projectedIds = [...h.ids]
    const projection = customProjection(() => projectedIds, heights)
    const beforeDeactivate = jasmine.createSpy('beforeDeactivate')
    const onInvalid = jasmine.createSpy('onInvalid')
    registerRootLayoutProjection(h.manager, projection, {beforeDeactivate, onInvalid})
    await nextAnimationFrame()
    expect([...h.mounted]).toEqual(h.ids.slice(0, 2))

    projectedIds = [...h.ids].reverse()
    projection.notifyChange()
    await nextAnimationFrames(3)

    expect(beforeDeactivate).toHaveBeenCalledTimes(1)
    expect(onInvalid).toHaveBeenCalledTimes(1)
    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'layoutProjectionInvalid: ',
      jasmine.any(Error),
    )
    await nextAnimationFrame()
    expect([...h.mounted]).toEqual(h.ids.slice(0, 7))
    h.manager.dispose()
    projection.dispose()
  })

  it('waits one bounded frame for a structure-driven custom projection update', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 120))
    let projectedIds = [...h.ids]
    const projection = customProjection(() => projectedIds, heights)
    const onInvalid = jasmine.createSpy('onInvalid')
    const release = registerRootLayoutProjection(h.manager, projection, {onInvalid})
    await nextAnimationFrame()

    h.replaceRootIds([...h.ids, 'inserted'])
    requestAnimationFrame(() => {
      projectedIds = [...h.ids]
      heights.bulkInit(projectedIds.map(() => 120))
      projection.notifyChange()
    })
    await nextAnimationFrames(3)

    expect(onInvalid).not.toHaveBeenCalled()
    expect(h.doc.logger.warn).not.toHaveBeenCalledWith(
      'layoutProjectionInvalid: ',
      jasmine.anything(),
    )
    expect(h.mounted.size).toBeLessThan(10)

    release()
    h.manager.dispose()
    projection.dispose()
  })

  it('defers structure-driven custom projection validation for the full IME session', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 120))
    let projectedIds = [...h.ids]
    let projectionUpdateDeferred = true
    const projection = customProjection(() => projectedIds, heights)
    const onInvalid = jasmine.createSpy('onInvalid')
    const release = registerRootLayoutProjection(h.manager, projection, {
      isValidationDeferred: () => projectionUpdateDeferred,
      onInvalid,
    })
    await nextAnimationFrame()

    h.doc.event.status.isComposing = true
    h.compositionSession.isIdle = false
    h.replaceRootIds([...h.ids, 'ime-paragraph'])
    await nextAnimationFrames(4)

    expect(onInvalid).not.toHaveBeenCalled()
    expect((h.manager as any).customProjectionFailureCount).toBe(0)

    // Replacing a composition host can release the raw browser flag before the
    // model-owned CompositionSession finishes. Projection validation must stay
    // frozen across that remaining commit window as well.
    h.doc.event.status.isComposing = false
    h.manager.settleCompositionView()
    await nextAnimationFrames(4)

    expect(onInvalid).not.toHaveBeenCalled()
    expect((h.manager as any).customProjectionFailureCount).toBe(0)

    // The browser/model composition flags can both clear before pagination's
    // trailing recompute commits its new projection. The owner hook keeps that
    // post-composition handoff from consuming the corruption fallback budget.
    h.compositionSession.isIdle = true
    h.manager.settleCompositionView()
    await nextAnimationFrames(4)

    expect(onInvalid).not.toHaveBeenCalled()
    expect((h.manager as any).customProjectionFailureCount).toBe(0)

    projectedIds = [...h.ids]
    heights.bulkInit(projectedIds.map(() => 120))
    projection.notifyChange()
    projectionUpdateDeferred = false
    h.manager.settleCompositionView()
    await nextAnimationFrames(2)

    expect(onInvalid).not.toHaveBeenCalled()
    expect((h.manager as any).customProjectionValidationPending).toBeFalse()
    expect((h.manager as any).customProjectionFailureCount).toBe(0)

    release()
    h.manager.dispose()
    projection.dispose()
  })

  it('mounts a newly inserted selection target without reading stale projection geometry', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 120))
    let projectedIds = [...h.ids]
    const projection = customProjection(() => projectedIds, heights)
    const rangeHeight = spyOn(projection, 'rangeHeight').and.callThrough()
    const onInvalid = jasmine.createSpy('onInvalid')
    const release = registerRootLayoutProjection(h.manager, projection, {onInvalid})
    await nextAnimationFrame()
    rangeHeight.calls.reset()

    h.replaceRootIds([...h.ids, 'inserted'])

    expect(() => h.manager.ensureViewMounted(['inserted'])).not.toThrow()
    expect(h.mounted.has('inserted')).toBeTrue()
    expect(rangeHeight).not.toHaveBeenCalled()

    projectedIds = [...h.ids]
    heights.bulkInit(projectedIds.map(() => 120))
    projection.notifyChange()
    await nextAnimationFrames(2)

    expect(onInvalid).not.toHaveBeenCalled()
    expect(h.doc.logger.warn).not.toHaveBeenCalledWith(
      'layoutProjectionInvalid: ',
      jasmine.anything(),
    )

    release()
    h.manager.dispose()
    projection.dispose()
  })

  it('does not contaminate continuous heights while a custom projection is active', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const continuous = (h.manager as any)
      .continuousLayoutProjection as ContinuousLayoutProjection
    const revision = continuous.revision

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 120))
    const projection = customProjection(h.ids, heights)
    const release = registerRootLayoutProjection(h.manager, projection)
    ;(h.manager as any).applyMeasurements([['b0', 999]])

    expect(continuous.revision).toBe(revision)
    release()
    h.manager.dispose()
    projection.dispose()
  })

  it('captures a custom projection anchor on willChange before new geometry commits', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 120))
    const projection = customProjection(h.ids, heights)
    const willChange$ = new Subject<{revision: number}>()
    Object.defineProperty(projection, 'willChange$', {
      value: willChange$.asObservable(),
    })
    const release = registerRootLayoutProjection(h.manager, projection)
    await nextAnimationFrame()
    const capture = spyOn<any>(h.manager, 'captureCurrentStructureAnchor')
      .and.callThrough()

    willChange$.next({revision: projection.revision + 1})

    expect(capture).toHaveBeenCalledTimes(1)
    release()
    h.manager.dispose()
    projection.dispose()
    willChange$.complete()
  })

  it('lets a newer viewport scroll replace a pending projection anchor', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 120))
    const projection = customProjection(h.ids, heights)
    const willChange$ = new Subject<{revision: number}>()
    Object.defineProperty(projection, 'willChange$', {
      value: willChange$.asObservable(),
    })
    const release = registerRootLayoutProjection(h.manager, projection)
    await nextAnimationFrame()

    willChange$.next({revision: projection.revision + 1})
    expect((h.manager as any).pendingStructureAnchor.blockId).toBe('b0')

    h.scrollContainer.scrollTop = 1_200
    h.scrollContainer.dispatchEvent(new Event('scroll'))

    expect((h.manager as any).pendingStructureAnchor.blockId).toBe('b10')
    release()
    h.manager.dispose()
    projection.dispose()
    willChange$.complete()
  })

  it('keeps a 1000-root custom projection mounted window bounded while scrolling', async () => {
    const h = createHarness(4, 1000, {overscanViewports: 1})
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 160))
    const projection = customProjection(h.ids, heights)
    const release = registerRootLayoutProjection(h.manager, projection)
    await nextAnimationFrame()
    expect(h.mounted.size).toBeLessThan(10)

    h.scrollContainer.scrollTop = 80_000
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect(h.mounted.size).toBeLessThan(10)
    expect([...h.mounted].some(id => Number(id.slice(1)) >= 495)).toBeTrue()

    release()
    h.manager.dispose()
    projection.dispose()
  })

  it('does not merge oversized projected gaps between the viewport and a lease', async () => {
    const h = createHarness(12, 8, {segmentMergeGap: 2})
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heights = new HeightMap()
    heights.bulkInit(h.ids.map(() => 1_000))
    const projection = customProjection(h.ids, heights)
    const releaseProjection = registerRootLayoutProjection(h.manager, projection)
    await nextAnimationFrame()

    expect([...h.mounted]).toEqual(['b0'])
    const releaseLease = h.manager.acquireBlockViewLease(['b3'])

    expect(h.mounted.has('b0')).toBeTrue()
    expect(h.mounted.has('b1')).toBeFalse()
    expect(h.mounted.has('b2')).toBeFalse()
    expect(h.mounted.has('b3')).toBeTrue()

    releaseLease()
    releaseProjection()
    h.manager.dispose()
    projection.dispose()
  })

  it('publishes one continuous-layout revision for a measurement batch', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const projection = (h.manager as any)
      .continuousLayoutProjection as ContinuousLayoutProjection
    const previousRevision = projection.revision

    ;(h.manager as any).applyMeasurements([
      ['b0', 60],
      ['b1', 72],
    ])

    expect(projection.revision).toBe(previousRevision + 1)
    h.manager.dispose()
  })

  it('completes the continuous layout projection once on disposal', () => {
    const h = createHarness()
    const complete = jasmine.createSpy('complete')
    ;(h.manager as any).continuousLayoutProjection.change$.subscribe({complete})

    h.manager.dispose()
    h.manager.dispose()

    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('settles sparse root ownership once per structure batch, never on scroll-only frames', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.vm._reconcileSparseRootChildren.calls.reset()

    h.structureChange$.next()
    h.structureChange$.next()
    await nextAnimationFrame()

    expect(h.vm._reconcileSparseRootChildren).toHaveBeenCalledOnceWith(h.ids)

    h.vm._reconcileSparseRootChildren.calls.reset()
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()
    expect(h.vm._reconcileSparseRootChildren).not.toHaveBeenCalled()
    h.manager.dispose()
  })

  it('publishes only real mounted-window changes', (done) => {
    const h = createHarness()
    const windows: string[][] = []
    h.manager.viewChange$.subscribe(event => windows.push([...event.mountedRootIds]))
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      expect(windows).toEqual([h.ids.slice(0, 7)])

      h.manager.ensureViewMounted(['b12'])
      h.manager.ensureViewMounted(['b12'])

      expect(windows).toEqual([
        h.ids.slice(0, 7),
        [...h.ids.slice(0, 7), 'b12'],
      ])
      h.manager.dispose()
      done()
    })
  })

  it('skips observer and spacer work when an ensured view is already mounted', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const heightSync = spyOn((h.manager as any).heightObserver, 'sync').and.callThrough()
    const spacerSync = spyOn((h.manager as any).spacerLayer, 'sync').and.callThrough()
    h.manager.ensureViewMounted(['b0'])
    h.manager.ensureViewMounted(['b0'])

    expect(heightSync).not.toHaveBeenCalled()
    expect(spacerSync).not.toHaveBeenCalled()
    h.manager.dispose()
  })

  it('publishes mounts completed before a projection request is aborted', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const windows: string[][] = []
    h.manager.viewChange$.subscribe(event => windows.push([...event.mountedRootIds]))
    const controller = new AbortController()
    h.vm.mountRootChild.and.callFake((id: string) => {
      const component = h.mountRootChild(id)
      controller.abort()
      return component
    })

    h.adapter().ensureMounted(['b12', 'b15'], controller.signal)

    expect(h.mounted.has('b12')).toBeTrue()
    expect(h.mounted.has('b15')).toBeFalse()
    expect(windows).toEqual([[...h.ids.slice(0, 7), 'b12']])
    h.manager.dispose()
  })

  it('binds frame and resize lifecycle to the scroll container window', () => {
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    const ownerDocument = iframe.contentDocument!
    const ownerWindow = iframe.contentWindow!
    const addListener = spyOn(ownerWindow, 'addEventListener').and.callThrough()
    const removeListener = spyOn(ownerWindow, 'removeEventListener').and.callThrough()
    const h = createHarness(12, 20, {}, ownerDocument)

    h.manager.init(h.scrollContainer)
    const viewportObserver = (h.manager as any).viewportResizeObserver as ResizeObserver
    const disconnect = spyOn(viewportObserver, 'disconnect').and.callThrough()
    expect(addListener).toHaveBeenCalledWith('resize', jasmine.any(Function), {passive: true})
    h.manager.dispose()
    expect(removeListener).toHaveBeenCalledWith('resize', jasmine.any(Function))
    expect(disconnect).toHaveBeenCalled()
    iframe.remove()
  })

  it('repairs local height and index drift before reconciling the next frame', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    ;(h.manager as any).heights.bulkInit([48])
    ;(h.manager as any).indexById.clear()
    h.advanceStructureRevision()
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrames(2)

    expect((h.manager as any).heights.length).toBe(h.ids.length)
    expect((h.manager as any).indexById.size).toBe(h.ids.length)
    expect((h.manager as any).synchronizedStructureRevision).toBe(1)
    expect((h.manager as any).fullMountFallback).toBeFalse()
    expect(h.doc.messageService.warn).not.toHaveBeenCalled()
    h.manager.dispose()
  })

  it('retries a transient reconciliation failure without disabling windowing', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    let shouldFail = true
    h.vm.mountRootChild.and.callFake((id: string) => {
      if (shouldFail) {
        shouldFail = false
        throw new Error('transient mount failure')
      }
      return h.mountRootChild(id)
    })
    h.scrollContainer.scrollTop = 480
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrames(3)

    expect(h.mounted.has('b10')).toBeTrue()
    expect((h.manager as any).fullMountFallback).toBeFalse()
    expect(h.doc.messageService.warn).not.toHaveBeenCalled()
    h.manager.dispose()
  })

  it('retains canonical sparse-root repair across a failed structure synchronization', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const releaseFullView = h.manager.acquireFullDocumentViewLease()
    h.vm._reconcileSparseRootChildren.calls.reset()
    let failInsertedMount = true
    h.vm.mountRootChild.and.callFake((id: string) => {
      if (id === 'inserted' && failInsertedMount) {
        failInsertedMount = false
        throw new Error('inserted mount failed')
      }
      return h.mountRootChild(id)
    })

    h.replaceRootIds(['inserted', ...h.ids])
    await nextAnimationFrames(3)

    expect(h.vm._reconcileSparseRootChildren).toHaveBeenCalledWith(h.ids)
    expect(h.mounted.has('inserted')).toBeTrue()
    expect((h.manager as any).fullMountFallback).toBeFalse()
    releaseFullView()
    h.manager.dispose()
  })

  it('routes a deferred composition reorder failure through sparse-root recovery', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.vm._reconcileSparseRootChildren.calls.reset()
    h.vm._flushDeferredSparseRootOrder.and.throwError('composition DOM move failed')

    expect(() => h.manager.settleCompositionView()).not.toThrow()
    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'virtualizationReconcileError: ',
      jasmine.any(Error),
    )
    await nextAnimationFrame()

    expect(h.vm._reconcileSparseRootChildren).toHaveBeenCalledWith(h.ids)
    expect((h.manager as any).reconcileFailureCount).toBe(0)
    expect((h.manager as any).fullMountFallback).toBeFalse()
    h.manager.dispose()
  })

  it('keeps deferred sparse-root order untouched while native composition is active', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.vm._flushDeferredSparseRootOrder.calls.reset()
    h.setDeferredSparseRootOrder(true)
    h.doc.event.status.isComposing = true

    h.scrollContainer.scrollTop = 480
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect(h.vm._flushDeferredSparseRootOrder).not.toHaveBeenCalled()
    expect(h.mounted.has('b10')).toBeFalse()
    h.manager.dispose()
  })

  it('settles deferred sparse-root order when native composition ended without compositionend', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.vm._flushDeferredSparseRootOrder.calls.reset()
    h.setDeferredSparseRootOrder(true)
    h.doc.event.status.isComposing = false

    h.scrollContainer.scrollTop = 480
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect(h.vm._flushDeferredSparseRootOrder).toHaveBeenCalledTimes(1)
    expect(h.mounted.has('b10')).toBeTrue()
    expect((h.manager as any).reconcileFailureCount).toBe(0)
    h.manager.dispose()
  })

  it('falls back to full mounting once after three consecutive failures', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    let remainingFailures = 3
    h.vm.mountRootChild.and.callFake((id: string) => {
      if (remainingFailures > 0) {
        remainingFailures--
        throw new Error('persistent window failure')
      }
      return h.mountRootChild(id)
    })
    h.scrollContainer.scrollTop = 480
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrames(5)

    expect((h.manager as any).fullMountFallback).toBeTrue()
    expect(h.ids.every(id => h.mounted.has(id))).toBeTrue()
    expect(h.doc.messageService.warn).toHaveBeenCalledOnceWith(
      '虚拟渲染异常，已切换为完整渲染',
    )

    h.scrollContainer.scrollTop = 0
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()
    expect(h.ids.every(id => h.mounted.has(id))).toBeTrue()
    expect(h.doc.messageService.warn).toHaveBeenCalledTimes(1)

    h.replaceRootIds([...h.ids, 'inserted-after-fallback'])
    await nextAnimationFrame()
    expect(h.ids.every(id => h.mounted.has(id))).toBeTrue()
    expect(h.doc.messageService.warn).toHaveBeenCalledTimes(1)
    h.manager.dispose()
  })

  it('clears stale spacers before a failing full-mount fallback retry', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const rootContainer = h.doc.root.childrenRenderRef.containerElement as HTMLElement
    expect(rootContainer.querySelectorAll('.bc-virtual-spacer').length).toBeGreaterThan(0)

    h.vm.mountRootChild.and.callFake(() => {
      throw new Error('persistent mount failure')
    })
    h.scrollContainer.scrollTop = 480
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrames(5)

    expect((h.manager as any).fullMountFallback).toBeTrue()
    expect(h.vm._reconcileSparseRootChildren).toHaveBeenCalledWith(h.ids)
    expect(rootContainer.querySelector('.bc-virtual-spacer')).toBeNull()
    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'virtualizationFullMountError: ',
      jasmine.any(Error),
    )
    h.manager.dispose()
  })

  it('publishes the sparse render order without scanning every model block', (done) => {
    const h = createHarness(12, 2000)
    const windows: string[][] = []
    h.manager.viewChange$.subscribe(event => windows.push([...event.mountedRootIds]))
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      expect(windows).toEqual([h.ids.slice(0, 7)])
      expect(h.vm.isMounted).not.toHaveBeenCalled()
      h.manager.dispose()
      done()
    })
  })

  it('mounts the root child of a nested projection target without mounting the middle range', (done) => {
    const h = createHarness()
    h.doc.model.getPath = (id: string) => (id === 'nested' ? ['root', 'b12', 'nested'] : ['root', id])
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(async () => {
      await h.adapter().ensureMounted(['nested'], new AbortController().signal)
      expect(h.mounted.has('b12')).toBeTrue()
      expect(h.mounted.has('b11')).toBeFalse()
      h.manager.dispose()
      done()
    })
  })

  it('ignores stale selection and projection IDs during a structure race', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.selection$.next({
      toJSON: () => ({
        anchor: {blockId: 'b12', type: 'text', offset: 1},
        head: {blockId: 'b12', type: 'text', offset: 1},
      }),
    })
    h.adapter().ensureMounted(['b12'], new AbortController().signal)
    h.doc.model.getPath = (id: string) => {
      if (id === 'b12') throw new Error('block removed')
      return ['root', id]
    }

    expect(() => h.replaceRootIds(h.ids.filter(id => id !== 'b12'))).not.toThrow()
    await nextAnimationFrames(2)

    expect((h.manager as any).fullMountFallback).toBeFalse()
    expect((h.manager as any).reconcileFailureCount).toBe(0)
    expect(h.doc.logger.warn).not.toHaveBeenCalledWith(
      'virtualizationReconcileError: ',
      jasmine.anything(),
    )
    expect(h.doc.messageService.warn).not.toHaveBeenCalled()
    h.manager.dispose()
  })

  it('mounts an interaction target immediately without retaining it as a pin', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.manager.ensureViewMounted(['b12'])

      expect(h.mounted.has('b12')).toBeTrue()
      expect(h.mounted.has('b11')).toBeFalse()

      h.scrollContainer.dispatchEvent(new Event('scroll'))
      requestAnimationFrame(() => {
        expect(h.mounted.has('b12')).toBeFalse()
        h.manager.dispose()
        done()
      })
    })
  })

  it('waits for initialization when block navigation starts before init', async () => {
    const h = createHarness(0)
    let settled = false
    const pending = h.manager.scrollToBlock('b12').then(result => {
      settled = true
      return result
    })

    await Promise.resolve()
    expect(settled).toBeFalse()

    h.manager.init(h.scrollContainer)

    expect(await pending).toBeTrue()
    expect(h.mounted.has('b12')).toBeTrue()
    expect(centerY(h.vm.get('b12').instance.hostElement.getBoundingClientRect()))
      .toBe(centerY(h.scrollContainer.getBoundingClientRect()))
    h.manager.dispose()
  })

  it('lets the newest pre-init block navigation supersede the previous one', async () => {
    const h = createHarness()
    const first = h.manager.scrollToBlock('b12')
    const second = h.manager.scrollToBlock('b15')

    h.manager.init(h.scrollContainer)

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toBeFalse()
    expect(secondResult).toBeTrue()
    expect(centerY(h.vm.get('b15').instance.hostElement.getBoundingClientRect()))
      .toBe(centerY(h.scrollContainer.getBoundingClientRect()))
    h.manager.dispose()
  })

  it('settles a pre-init block navigation when disposed', async () => {
    const h = createHarness()
    const pending = h.manager.scrollToBlock('b12')

    h.manager.dispose()

    expect(await pending).toBeFalse()
  })

  it('centers an offscreen block that has no retained component view', async () => {
    const h = createHarness(0)
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    expect(h.refs.has('b12')).toBeFalse()

    const result = await h.manager.scrollToBlock('b12')

    expect(result).toBeTrue()
    expect(h.mounted.has('b12')).toBeTrue()
    expect(centerY(h.vm.get('b12').instance.hostElement.getBoundingClientRect()))
      .toBe(centerY(h.scrollContainer.getBoundingClientRect()))
    h.manager.dispose()
  })

  it('keeps projected gaps out of the estimated block-navigation jump', async () => {
    const h = createHarness(0)
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    const changes = new Subject<{revision: number}>()
    const extentAt = jasmine.createSpy('extentAt').and.returnValue(1600)
    const projection: VerticalLayoutProjection = {
      revision: 1,
      length: h.ids.length,
      totalHeight: 10000,
      change$: changes.asObservable(),
      offsetAt: index => index * 100 + 1000,
      contentOffsetAt: index => index * 100,
      extentAt,
      rangeHeight: (start, end) => (end - start + 1) * 100,
      indexAtOffset: offset => Math.max(
        0,
        Math.min(h.ids.length - 1, Math.floor(offset / 100)),
      ),
    }
    ;(h.manager as any).layoutProjection = projection
    let estimatedScrollTop: number | null = null
    h.vm.mountRootChild.and.callFake((id: string) => {
      if (id === 'b12') estimatedScrollTop = h.scrollContainer.scrollTop
      return h.mountRootChild(id)
    })

    expect(await h.manager.scrollToBlock('b12')).toBeTrue()

    expect(projection.offsetAt(12)).toBe(2200)
    expect(projection.contentOffsetAt(12)).toBe(1200)
    expect(estimatedScrollTop as number | null).toBe(1152)
    expect(extentAt).not.toHaveBeenCalled()
    changes.complete()
    h.manager.dispose()
  })

  it('centers the nested target host rather than only its root render unit', async () => {
    const h = createHarness()
    const rootRef = h.ensureRef('b12')
    const nestedHost = document.createElement('p')
    spyOn(nestedHost, 'getBoundingClientRect').and.callFake(() =>
      createRect(12 * 48 + 8 - h.scrollContainer.scrollTop, 16),
    )
    rootRef.instance.hostElement.append(nestedHost)
    h.refs.set('nested', {instance: {id: 'nested', hostElement: nestedHost}})
    h.doc.model.getPath = (id: string) => id === 'nested'
      ? ['root', 'b12', 'nested']
      : ['root', id]
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const result = await h.manager.scrollToBlock('nested')

    expect(result).toBeTrue()
    expect(h.mounted.has('b12')).toBeTrue()
    expect(centerY(nestedHost.getBoundingClientRect()))
      .toBe(centerY(h.scrollContainer.getBoundingClientRect()))
    h.manager.dispose()
  })

  it('corrects an inaccurate estimated offset with mounted target geometry', async () => {
    const h = createHarness()
    const target = h.ensureRef('b12').instance.hostElement
    ;(target.getBoundingClientRect as jasmine.Spy).and.callFake(() =>
      createRect(12 * 60 - h.scrollContainer.scrollTop, 60),
    )
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const result = await h.manager.scrollToBlock('b12')

    expect(result).toBeTrue()
    expect(h.scrollContainer.scrollTop).toBe(702)
    expect(centerY(target.getBoundingClientRect()))
      .toBe(centerY(h.scrollContainer.getBoundingClientRect()))
    h.manager.dispose()
  })

  it('re-centers after mounted target geometry settles on a later frame', async () => {
    const h = createHarness()
    const target = h.ensureRef('b12').instance.hostElement
    let lateLayoutShift = 0
    ;(target.getBoundingClientRect as jasmine.Spy).and.callFake(() =>
      createRect(12 * 48 + lateLayoutShift - h.scrollContainer.scrollTop, 48),
    )
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const result = h.manager.scrollToBlock('b12')
    lateLayoutShift = 120

    expect(await result).toBeTrue()
    expect(centerY(target.getBoundingClientRect()))
      .toBe(centerY(h.scrollContainer.getBoundingClientRect()))
    h.manager.dispose()
  })

  it('lets the newest block navigation supersede and settle the previous one', async () => {
    const h = createHarness()
    const firstTarget = h.ensureRef('b12').instance.hostElement
    ;(firstTarget.getBoundingClientRect as jasmine.Spy).and.callFake(() =>
      createRect(12 * 60 - h.scrollContainer.scrollTop, 60),
    )
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const first = h.manager.scrollToBlock('b12')
    const second = h.manager.scrollToBlock('b15')
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult).toBeFalse()
    expect(secondResult).toBeTrue()
    expect(centerY(h.vm.get('b15').instance.hostElement.getBoundingClientRect()))
      .toBe(centerY(h.scrollContainer.getBoundingClientRect()))
    h.manager.dispose()
  })

  it('fails closed for a missing target and settles pending navigation on dispose', async () => {
    const h = createHarness()
    const target = h.ensureRef('b12').instance.hostElement
    ;(target.getBoundingClientRect as jasmine.Spy).and.callFake(() =>
      createRect(12 * 60 - h.scrollContainer.scrollTop, 60),
    )
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    expect(await h.manager.scrollToBlock('missing')).toBeFalse()

    const pending = h.manager.scrollToBlock('b12')
    h.manager.dispose()

    expect(await pending).toBeFalse()
  })

  it('fails closed when a pending navigation target disappears during a structure change', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const pending = h.manager.scrollToBlock('b12')
    h.doc.model.getPath = (id: string) => {
      if (id === 'b12') throw new Error('target removed')
      return ['root', id]
    }

    expect(() => h.replaceRootIds(h.ids.filter(id => id !== 'b12'))).not.toThrow()
    expect(await pending).toBeFalse()
    h.manager.dispose()
  })

  it('fails closed and releases navigation ownership when target mounting throws', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.vm.mountRootChild.and.throwError('mount failed')

    const result = await h.manager.scrollToBlock('b12')

    expect(result).toBeFalse()
    h.vm.mountRootChild.and.callFake(h.mountRootChild)
    h.scrollContainer.scrollTop = 0
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()
    expect(h.mounted.has('b12')).toBeFalse()
    h.manager.dispose()
  })

  it('settles navigation when rebuilding the virtual model throws', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    ;(h.manager as any).blockIds = []
    spyOn<any>(h.manager as any, 'rebuildModel').and.throwError('rebuild failed')

    expect(await h.manager.scrollToBlock('b12')).toBeFalse()
    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'blockNavigationError: ',
      jasmine.any(Error),
    )
    h.manager.dispose()
  })

  it('settles and releases navigation ownership when a later geometry correction throws', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    let correctionReads = 0
    spyOn<any>(h.manager as any, 'readBlockCenterCorrection').and.callFake(() => {
      if (correctionReads++ === 0) return 0
      throw new Error('geometry failed')
    })

    expect(await h.manager.scrollToBlock('b12')).toBeFalse()
    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'blockNavigationError: ',
      jasmine.any(Error),
    )

    h.scrollContainer.scrollTop = 0
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()
    expect(h.mounted.has('b12')).toBeFalse()
    h.manager.dispose()
  })

  it('keeps a leased nested target mounted until idempotent release', (done) => {
    const h = createHarness()
    h.doc.model.getPath = (id: string) => (id === 'nested' ? ['root', 'b12', 'nested'] : ['root', id])
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      const release = h.manager.acquireBlockViewLease(['nested'])

      expect(h.mounted.has('b12')).toBeTrue()
      expect(h.mounted.has('b11')).toBeFalse()

      h.scrollContainer.dispatchEvent(new Event('scroll'))
      requestAnimationFrame(() => {
        expect(h.mounted.has('b12')).toBeTrue()

        release()
        release()
        requestAnimationFrame(() => {
          expect(h.mounted.has('b12')).toBeFalse()
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('keeps a shared block mounted until every independent lease releases', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      const releaseFirst = h.manager.acquireBlockViewLease(['b12'])
      const releaseSecond = h.manager.acquireBlockViewLease(['b12'])

      releaseFirst()
      requestAnimationFrame(() => {
        expect(h.mounted.has('b12')).toBeTrue()

        releaseSecond()
        requestAnimationFrame(() => {
          expect(h.mounted.has('b12')).toBeFalse()
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('rolls back a block view lease when mounting fails partway', () => {
    const h = createHarness()
    h.vm.mountRootChild.and.callFake((id: string) => {
      if (id === 'b7') throw new Error('mount failed')
      return h.mountRootChild(id)
    })

    expect(() => h.manager.acquireBlockViewLease(['b5', 'b7']))
      .toThrowError('mount failed')
    expect((h.manager as any).blockViewLeases.size).toBe(0)
    expect((h.manager as any).pins.sources.size).toBe(0)
    expect(h.mounted.size).toBe(0)

    h.vm.mountRootChild.and.callFake(h.mountRootChild)
    const release = h.manager.acquireBlockViewLease(['b12'])
    expect(h.mounted.has('b12')).toBeTrue()
    release()
    expect(h.mounted.size).toBe(0)
    h.manager.dispose()
  })

  it('activates schema keep-alive after the current mount transaction', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])

    const release = h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'video',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })

    expect((h.manager as any).blockViewLeases.size).toBe(0)
    await Promise.resolve()
    expect((h.manager as any).blockViewLeases.size).toBe(1)

    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()
    expect(h.mounted.has('b12')).toBeTrue()

    release()
    await nextAnimationFrame()
    expect(h.mounted.has('b12')).toBeFalse()
    h.manager.dispose()
  })

  it('lets the host force a schema keep-alive block back to virtual', async () => {
    const resolveViewRetention = jasmine.createSpy('resolveViewRetention')
      .and.returnValue('virtual')
    const h = createHarness(12, 20, {resolveViewRetention})
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])

    h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'video',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })
    await Promise.resolve()
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect(resolveViewRetention).toHaveBeenCalledOnceWith({
      blockId: 'b12',
      flavour: 'video',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })
    expect(h.mounted.has('b12')).toBeFalse()
    h.manager.dispose()
  })

  it('uses schema retention when the host resolver returns undefined', async () => {
    const h = createHarness(12, 20, {
      resolveViewRetention: () => undefined,
    })
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])

    const release = h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'video',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })
    await Promise.resolve()
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect(h.mounted.has('b12')).toBeTrue()
    release()
    h.manager.dispose()
  })

  it('lets the host opt a future custom block into keep-alive', async () => {
    const h = createHarness(12, 20, {
      resolveViewRetention: context =>
        context.flavour === 'custom-player' ? 'keep-alive' : undefined,
    })
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])

    const release = h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'custom-player',
      nodeType: BlockNodeType.void,
      schemaRetention: 'virtual',
    })
    await Promise.resolve()
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect(h.mounted.has('b12')).toBeTrue()
    release()
    h.manager.dispose()
  })

  it('cancels pending keep-alive activation when the view is destroyed first', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])

    const release = h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'embed',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })
    release()
    await Promise.resolve()
    h.scrollContainer.dispatchEvent(new Event('scroll'))
    await nextAnimationFrame()

    expect((h.manager as any).blockViewLeases.size).toBe(0)
    expect(h.mounted.has('b12')).toBeFalse()
    h.manager.dispose()
  })

  it('contains a keep-alive lease activation failure inside its microtask', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])
    spyOn(h.manager, 'acquireBlockViewLease').and.throwError('lease failed')

    const release = h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'video',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })
    await Promise.resolve()

    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'blockViewRetentionLeaseError: ',
      jasmine.any(Error),
    )
    release()
    h.manager.dispose()
  })

  it('contains a keep-alive lease release failure inside view destruction', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])
    spyOn(h.manager, 'acquireBlockViewLease').and.returnValue(() => {
      throw new Error('release failed')
    })

    const release = h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'video',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })
    await Promise.resolve()

    expect(() => release()).not.toThrow()
    expect(h.doc.logger.warn).toHaveBeenCalledWith(
      'blockViewRetentionLeaseReleaseError: ',
      jasmine.any(Error),
    )
    h.manager.dispose()
  })

  it('falls back to schema retention when the host resolver fails', async () => {
    const h = createHarness(12, 20, {
      resolveViewRetention: () => {
        throw new Error('resolver failed')
      },
    })
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.manager.ensureViewMounted(['b12'])

    const release = h.manager.bindBlockViewRetention({
      blockId: 'b12',
      flavour: 'video',
      nodeType: BlockNodeType.void,
      schemaRetention: 'keep-alive',
    })
    await Promise.resolve()

    expect(h.doc.logger.warn).toHaveBeenCalled()
    expect(h.mounted.has('b12')).toBeTrue()
    release()
    h.manager.dispose()
  })

  it('aggregates long-lived block leases into one pin-registry source', () => {
    const h = createHarness()

    const releaseFirst = h.manager.acquireBlockViewLease(['b12'])
    const releaseSecond = h.manager.acquireBlockViewLease(['b15'])

    expect((h.manager as any).pins.sources.size).toBe(1)
    expect([...(h.manager as any).pins.snapshot()]).toEqual([12, 15])

    releaseFirst()
    expect((h.manager as any).pins.sources.size).toBe(1)
    expect([...(h.manager as any).pins.snapshot()]).toEqual([15])

    releaseSecond()
    expect((h.manager as any).pins.sources.size).toBe(0)
    h.manager.dispose()
  })

  it('makes an outstanding block lease release inert after manager disposal', () => {
    const h = createHarness()
    const release = h.manager.acquireBlockViewLease(['b12'])

    expect(h.mounted.has('b12')).toBeTrue()
    h.manager.dispose()
    h.vm.retainRootChild.calls.reset()

    release()
    release()

    expect(h.vm.retainRootChild).not.toHaveBeenCalled()
  })

  it('re-resolves active block leases after root ownership changes', (done) => {
    const h = createHarness()
    let ownerId = 'b12'
    h.doc.model.getPath = (id: string) => (id === 'nested' ? ['root', ownerId, 'nested'] : ['root', id])
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      const release = h.manager.acquireBlockViewLease(['nested'])
      expect(h.mounted.has('b12')).toBeTrue()

      ownerId = 'b15'
      h.replaceRootIds(['inserted', ...h.ids])
      expect(h.mounted.has('b15')).toBeTrue()

      requestAnimationFrame(() => {
        expect(h.mounted.has('b12')).toBeFalse()
        expect(h.mounted.has('b15')).toBeTrue()

        release()
        requestAnimationFrame(() => {
          expect(h.mounted.has('b15')).toBeFalse()
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('re-resolves a nested lease when only its root owner changes', async () => {
    const h = createHarness()
    let ownerId = 'b12'
    h.doc.model.getPath = (id: string) => (id === 'nested' ? ['root', ownerId, 'nested'] : ['root', id])
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const release = h.manager.acquireBlockViewLease(['nested'])
    expect(h.mounted.has('b12')).toBeTrue()

    ownerId = 'b15'
    h.structureChange$.next()
    expect(h.mounted.has('b15')).toBeTrue()
    await nextAnimationFrame()

    expect(h.mounted.has('b12')).toBeFalse()
    expect(h.mounted.has('b15')).toBeTrue()
    release()
    h.manager.dispose()
  })

  it('re-resolves nested selection and projection pins when only their root owner changes', async () => {
    const h = createHarness()
    let ownerId = 'b12'
    h.doc.model.getPath = (id: string) => (id === 'nested' ? ['root', ownerId, 'nested'] : ['root', id])
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.selection$.next({
      toJSON: () => ({
        anchor: {blockId: 'nested', type: 'text', offset: 1},
        head: {blockId: 'nested', type: 'text', offset: 1},
      }),
    })
    h.adapter().ensureMounted(['nested'], new AbortController().signal)
    await nextAnimationFrame()
    expect(h.mounted.has('b12')).toBeTrue()

    ownerId = 'b15'
    h.structureChange$.next()
    await nextAnimationFrame()

    expect(h.mounted.has('b12')).toBeFalse()
    expect(h.mounted.has('b15')).toBeTrue()
    h.manager.dispose()
  })

  it('ignores a deleted leased ID before its component destroy hook releases', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()

    const release = h.manager.acquireBlockViewLease(['b12'])
    h.doc.model.getPath = (id: string) => {
      if (id === 'b12') throw new Error('block deleted')
      return ['root', id]
    }

    expect(() => h.structureChange$.next()).not.toThrow()
    await nextAnimationFrame()
    expect(h.mounted.has('b12')).toBeFalse()

    release()
    h.manager.dispose()
  })

  it('pins only the endpoint root render units of an active selection while scrolling', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.selection$.next({
        toJSON: () => ({
          anchor: {blockId: 'b12', type: 'text', offset: 2},
          head: {blockId: 'b3', type: 'text', offset: 1},
        }),
      })

      requestAnimationFrame(() => {
        expect(h.mounted.has('b3')).toBeTrue()
        expect(h.mounted.has('b12')).toBeTrue()
        expect(h.ids.slice(7, 12).every((id) => !h.mounted.has(id))).toBeTrue()
        h.scrollContainer.dispatchEvent(new Event('scroll'))

        requestAnimationFrame(() => {
          expect(h.mounted.has('b3')).toBeTrue()
          expect(h.mounted.has('b12')).toBeTrue()
          expect(h.ids.slice(7, 12).every((id) => !h.mounted.has(id))).toBeTrue()
          h.selection$.next({
            toJSON: () => ({
              anchor: {blockId: 'b3', type: 'text', offset: 1},
              head: {blockId: 'b3', type: 'text', offset: 1},
            }),
          })

          requestAnimationFrame(() => {
            expect(h.mounted.has('b3')).toBeTrue()
            expect(h.mounted.has('b12')).toBeFalse()
            h.manager.dispose()
            done()
          })
        })
      })
    })
  })

  it('pins the endpoint units of a half-open root boundary selection', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.selection$.next({
        toJSON: () => ({
          anchor: {blockId: 'root', type: 'boundary', index: 13},
          head: {blockId: 'root', type: 'boundary', index: 3},
          commonParent: 'root',
        }),
      })

      requestAnimationFrame(() => {
        expect(h.mounted.has('b3')).toBeTrue()
        expect(h.mounted.has('b12')).toBeTrue()
        expect(h.ids.slice(7, 12).every((id) => !h.mounted.has(id))).toBeTrue()
        expect(h.mounted.has('b13')).toBeFalse()
        h.scrollContainer.scrollTop = 720
        h.scrollContainer.dispatchEvent(new Event('scroll'))

        requestAnimationFrame(() => {
          expect(h.mounted.has('b3')).toBeTrue()
          expect(h.mounted.has('b12')).toBeTrue()
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('pins the root units adjacent to a boundary and a block endpoint', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.selection$.next({
        toJSON: () => ({
          anchor: {blockId: 'root', type: 'boundary', index: 3},
          head: {blockId: 'b12', type: 'text', offset: 1},
          commonParent: 'root',
        }),
      })

      requestAnimationFrame(() => {
        expect(h.mounted.has('b3')).toBeTrue()
        expect(h.mounted.has('b12')).toBeTrue()
        expect(h.ids.slice(7, 12).every((id) => !h.mounted.has(id))).toBeTrue()
        expect(h.mounted.has('b13')).toBeFalse()
        h.manager.dispose()
        done()
      })
    })
  })

  it('pins the nearest root unit for a collapsed root boundary', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.selection$.next({
        toJSON: () => ({
          anchor: {blockId: 'root', type: 'boundary', index: 12},
          head: {blockId: 'root', type: 'boundary', index: 12},
          commonParent: 'root',
        }),
      })

      requestAnimationFrame(() => {
        expect(h.mounted.has('b12')).toBeTrue()
        h.selection$.next({
          toJSON: () => ({
            anchor: {blockId: 'root', type: 'boundary', index: h.ids.length},
            head: {blockId: 'root', type: 'boundary', index: h.ids.length},
            commonParent: 'root',
          }),
        })

        requestAnimationFrame(() => {
          expect(h.mounted.has('b19')).toBeTrue()
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('keeps only the first and last root units pinned for a full-document selection', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.selection$.next({
        toJSON: () => ({
          anchor: {blockId: 'root', type: 'boundary', index: 0},
          head: {blockId: 'root', type: 'boundary', index: h.ids.length},
          commonParent: 'root',
        }),
      })

      requestAnimationFrame(() => {
        expect(h.mounted.has('b0')).toBeTrue()
        expect(h.mounted.has('b19')).toBeTrue()
        expect(h.ids.slice(7, 19).every((id) => !h.mounted.has(id))).toBeTrue()

        h.scrollContainer.scrollTop = 480
        h.scrollContainer.dispatchEvent(new Event('scroll'))
        requestAnimationFrame(() => {
          expect(h.mounted.has('b0')).toBeTrue()
          expect(h.mounted.has('b19')).toBeTrue()
          expect(h.mounted.has('b10')).toBeTrue()
          expect(h.mounted.has('b5')).toBeFalse()
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('pins only the containing root unit for a nested boundary selection', (done) => {
    const h = createHarness()
    h.doc.model.getPath = (id: string) => id === 'nested-container'
      ? ['root', 'b12', 'nested-container']
      : ['root', id]
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.selection$.next({
        toJSON: () => ({
          anchor: {blockId: 'nested-container', type: 'boundary', index: 0},
          head: {blockId: 'nested-container', type: 'boundary', index: 3},
          commonParent: 'nested-container',
        }),
      })

      requestAnimationFrame(() => {
        expect(h.mounted.has('b12')).toBeTrue()
        expect(h.mounted.has('b11')).toBeFalse()
        expect(h.mounted.has('b13')).toBeFalse()
        h.manager.dispose()
        done()
      })
    })
  })

  it('keeps the visible root child at the same viewport offset after blocks are inserted above it', (done) => {
    const h = createHarness()
    h.scrollContainer.scrollTop = 480
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      expect(h.mounted.has('b10')).toBeTrue()
      h.replaceRootIds(['inserted', ...h.ids])

      requestAnimationFrame(() => {
        expect(h.scrollContainer.scrollTop).toBe(528)
        expect(h.vm.get('b10').instance.hostElement.getBoundingClientRect().top).toBe(0)
        h.manager.dispose()
        done()
      })
    })
  })

  it('keeps the visible root child stable when blocks above it are removed', (done) => {
    const h = createHarness()
    h.scrollContainer.scrollTop = 480
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.replaceRootIds(h.ids.slice(2))

      requestAnimationFrame(() => {
        expect(h.scrollContainer.scrollTop).toBe(384)
        expect(h.vm.get('b10').instance.hostElement.getBoundingClientRect().top).toBe(0)
        h.manager.dispose()
        done()
      })
    })
  })

  it('preserves the original anchor across multiple root transactions in one frame', (done) => {
    const h = createHarness()
    h.scrollContainer.scrollTop = 480
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.replaceRootIds(['inserted-1', ...h.ids])
      h.replaceRootIds(['inserted-2', ...h.ids])

      requestAnimationFrame(() => {
        expect(h.scrollContainer.scrollTop).toBe(576)
        expect(h.vm.get('b10').instance.hostElement.getBoundingClientRect().top).toBe(0)
        h.manager.dispose()
        done()
      })
    })
  })

  it('remaps an active selection pin by block ID after the root order changes', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.selection$.next({
        toJSON: () => ({
          anchor: {blockId: 'b12', type: 'text', offset: 0},
          head: {blockId: 'b16', type: 'text', offset: 0},
        }),
      })

      requestAnimationFrame(() => {
        expect(h.mounted.has('b12')).toBeTrue()
        expect(h.mounted.has('b14')).toBeFalse()
        expect(h.mounted.has('b16')).toBeTrue()
        h.replaceRootIds(['inserted', ...h.ids])

        requestAnimationFrame(() => {
          expect(h.mounted.has('b12')).toBeTrue()
          expect(h.mounted.has('b14')).toBeFalse()
          expect(h.mounted.has('b16')).toBeTrue()
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('holds every root view for an exact full-document consumer and releases it', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      const release = h.manager.acquireFullDocumentViewLease()
      expect(h.ids.every((id) => h.mounted.has(id))).toBeTrue()

      h.scrollContainer.dispatchEvent(new Event('scroll'))
      requestAnimationFrame(() => {
        expect(h.ids.every((id) => h.mounted.has(id))).toBeTrue()
        release()

        requestAnimationFrame(() => {
          expect([...h.mounted]).toEqual(h.ids.slice(0, 7))
          h.manager.dispose()
          done()
        })
      })
    })
  })

  it('mounts root blocks inserted while a full-document lease is active', (done) => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      const release = h.manager.acquireFullDocumentViewLease()
      h.replaceRootIds([...h.ids, 'inserted'])

      expect(h.mounted.has('inserted')).toBeTrue()
      release()
      h.manager.dispose()
      done()
    })
  })

  it('rolls back a full-document lease when mounting fails partway', async () => {
    const h = createHarness()
    h.manager.init(h.scrollContainer)
    await nextAnimationFrame()
    h.vm.mountRootChild.and.callFake((id: string) => {
      if (id === 'b7') throw new Error('mount failed')
      return h.mountRootChild(id)
    })

    expect(() => h.manager.acquireFullDocumentViewLease()).toThrowError('mount failed')
    expect((h.manager as any).fullDocumentViewLeaseCount).toBe(0)

    h.vm.mountRootChild.and.callFake(h.mountRootChild)
    await nextAnimationFrame()
    expect([...h.mounted]).toEqual(h.ids.slice(0, 7))

    const release = h.manager.acquireFullDocumentViewLease()
    expect(h.ids.every(id => h.mounted.has(id))).toBeTrue()
    release()
    h.manager.dispose()
  })

  it('can acquire exact full-document views before scroll initialization', () => {
    const h = createHarness()

    const release = h.manager.acquireFullDocumentViewLease()

    expect(h.ids.every((id) => h.mounted.has(id))).toBeTrue()
    release()
    expect(h.mounted.size).toBe(0)
    h.manager.dispose()
  })

  it('makes an outstanding full-document lease release inert after manager disposal', () => {
    const h = createHarness()
    const release = h.manager.acquireFullDocumentViewLease()

    expect(h.ids.every((id) => h.mounted.has(id))).toBeTrue()
    h.manager.dispose()
    h.vm.retainRootChild.calls.reset()

    release()
    release()

    expect(h.vm.retainRootChild).not.toHaveBeenCalled()
  })

  it('bounds retained component subtrees while scrolling', (done) => {
    const h = createHarness(2)
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.scrollContainer.scrollTop = 480
      h.scrollContainer.dispatchEvent(new Event('scroll'))

      requestAnimationFrame(() => {
        expect(h.vm.destroyRetainedRootChild).toHaveBeenCalledTimes(5)
        expect(h.refs.has('b0')).toBeFalse()
        expect(h.refs.has('b1')).toBeFalse()
        expect(h.refs.has('b2')).toBeFalse()
        expect(h.refs.has('b3')).toBeFalse()
        expect(h.refs.has('b4')).toBeFalse()
        expect(h.refs.has('b5')).toBeTrue()
        expect(h.refs.has('b6')).toBeTrue()
        h.manager.dispose()
        done()
      })
    })
  })

  it('evicts offscreen views created by a local command outside the manager', (done) => {
    const h = createHarness(2)
    h.manager.init(h.scrollContainer)

    requestAnimationFrame(() => {
      h.ensureRef('b12')
      h.ensureRef('b13')
      h.ensureRef('b14')
      h.scrollContainer.dispatchEvent(new Event('scroll'))

      requestAnimationFrame(() => {
        expect(h.refs.has('b12')).toBeFalse()
        expect(h.refs.has('b13')).toBeTrue()
        expect(h.refs.has('b14')).toBeTrue()
        h.manager.dispose()
        done()
      })
    })
  })
})

function customProjection(
  blockIds: readonly string[] | (() => readonly string[]),
  heights: HeightMap,
): ContinuousLayoutProjection & {readonly blockIds: readonly string[]} {
  const projection = new ContinuousLayoutProjection(heights) as
    ContinuousLayoutProjection & {readonly blockIds: readonly string[]}
  Object.defineProperty(projection, 'blockIds', {
    configurable: true,
    get: () => typeof blockIds === 'function' ? blockIds() : blockIds,
  })
  return projection
}

function createRect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function centerY(rect: DOMRect): number {
  return rect.top + rect.height / 2
}

function nextAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function nextAnimationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index++) await nextAnimationFrame()
}
