import {BehaviorSubject, Subject} from 'rxjs'
import {fakeAsync, flushMicrotasks} from '@angular/core/testing'
import {ORIGIN_NO_RECORD} from '../doc/origins'
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BlockPlacementManager,
  measureBlockPlacement,
  measureObjectPlacement,
  resolveBlockPlacement,
  resolvePlacementXInPixels,
} from './block-placement.manager'
import {BaseBlockComponent} from '../block-std/block/component/base-block'

function setRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  })
}

function makeHarness() {
  const container = document.createElement('div')
  const host = document.createElement('div')
  container.appendChild(host)
  document.body.appendChild(container)
  setRect(container, {left: 100, top: 50, width: 500})
  setRect(host, {
    left: 225,
    top: 90,
    right: 325,
    bottom: 170,
    width: 100,
    height: 80,
  })
  Object.defineProperty(container, 'clientWidth', {configurable: true, value: 500})
  Object.defineProperty(container, 'clientLeft', {configurable: true, value: 0})
  Object.defineProperty(container, 'clientTop', {configurable: true, value: 0})

  const props: Record<string, any> = {}
  const onPropsChange = new Subject<Map<string, any>>()
  const onReattach$ = new Subject<void>()
  const onDetach$ = new Subject<void>()
  const parent = {
    id: 'root',
    childrenIds: ['image-1'],
  }
  const block = {
    id: 'image-1',
    flavour: 'image',
    parentId: 'root',
    parentBlock: parent,
    props,
    hostElement: host,
    updateProps: jasmine.createSpy('updateProps').and.callFake((patch: Record<string, any>) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value == null) delete props[key]
        else props[key] = value
      }
      onPropsChange.next(new Map(Object.keys(patch).map(key => [key, {}])))
    }),
    onPropsChange,
    onReattach$,
    onDetach$,
    changeDetectorRef: {markForCheck: jasmine.createSpy('markForCheck')},
  }
  const readonlySwitch$ = new BehaviorSubject(false)
  const onDestroy$ = new Subject<void>()
  const releaseLease = jasmine.createSpy('releaseLease')
  const doc = {
    config: {} as any,
    isReadonly: false,
    readonlySwitch$,
    onDestroy$,
    schemas: {
      get: jasmine.createSpy('getSchema').and.returnValue({
        metadata: {placement: {modes: ['relative', 'absolute']}},
      }),
    },
    getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) =>
      id === block.id ? block : null),
    readonlyManager: {
      isReadonly: jasmine.createSpy('isReadonly').and.returnValue(false),
      containsReadonly: jasmine.createSpy('containsReadonly').and.returnValue(false),
    },
    selection: {
      setSuppressRecalculate: jasmine.createSpy('setSuppressRecalculate'),
      blur: jasmine.createSpy('blur'),
      selectBlock: jasmine.createSpy('selectBlock'),
    },
    dragController: {state: 'idle'},
    crud: {
      transact: jasmine.createSpy('transact').and.callFake((fn: () => void) => fn()),
      moveBlocks: jasmine.createSpy('moveBlocks'),
    },
    virtualization: {
      acquireBlockViewLease: jasmine.createSpy('acquireBlockViewLease').and.returnValue(releaseLease),
    },
    ngZone: {runOutsideAngular: (fn: () => void) => fn()},
    afterInit: (fn: (root: {hostElement: HTMLElement}) => void) =>
      fn({hostElement: container}),
  }
  const manager = new BlockPlacementManager(doc as any)

  return {container, host, props, block, parent, doc, manager, releaseLease}
}

function pointer(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 7,
    pointerType: 'mouse',
    button: 0,
    bubbles: true,
    cancelable: true,
    ...init,
  })
}

function makeRootLayoutNormalizationHarness() {
  class ChildrenList {
    constructor(readonly values: string[] = []) {}
    get length(): number { return this.values.length }
    toArray(): string[] { return [...this.values] }
  }

  const host = document.createElement('div')
  document.body.appendChild(host)
  const childrenById = new Map<string, ChildrenList>([
    ['root', new ChildrenList([
      'flow',
      'legacy-absolute',
      'layout-a',
      'layout-b',
    ])],
    ['flow', new ChildrenList()],
    ['legacy-absolute', new ChildrenList()],
    ['layout-a', new ChildrenList(['malformed-relative'])],
    ['layout-b', new ChildrenList(['absolute-2'])],
    ['malformed-relative', new ChildrenList()],
    ['absolute-2', new ChildrenList()],
  ])
  const flavourById = new Map<string, string>([
    ['root', 'root'],
    ['flow', 'paragraph'],
    ['legacy-absolute', 'image'],
    ['layout-a', 'placement-layout'],
    ['layout-b', 'placement-layout'],
    ['malformed-relative', 'flow-shape'],
    ['absolute-2', 'shape'],
  ])
  const propsById = new Map<string, Record<string, any>>([
    ['legacy-absolute', {
      placement: {mode: 'absolute', x: 10, y: 20},
    }],
    ['absolute-2', {
      placement: {mode: 'absolute', x: 30, y: 40, layer: 'under'},
    }],
    ['malformed-relative', {
      // A flow-only Schema must not become an absolute layout child merely
      // because a stale snapshot contains placement props.
      placement: {mode: 'absolute', x: 99, y: 99},
    }],
  ])
  const parentOf = (id: string): string | null => {
    for (const [parentId, children] of childrenById) {
      if (children.values.includes(id)) return parentId
    }
    return null
  }
  const model = {
    getChildrenIds: (id: string) => childrenById.get(id)?.toArray() ?? [],
    getFlavour: (id: string) => flavourById.get(id),
    getProps: (id: string) => propsById.get(id) ?? {},
    getParentId: (id: string) => parentOf(id),
    exists: (id: string) => flavourById.has(id),
  }
  const yBlock = (id: string) => flavourById.has(id)
    ? {
        get: (key: string) => {
          if (key === 'children') return childrenById.get(id)
          if (key === 'props') {
            return {toJSON: () => ({...(propsById.get(id) ?? {})})}
          }
          if (key === 'flavour') return flavourById.get(id)
          return undefined
        },
      }
    : undefined
  const crud = {
    transact: jasmine.createSpy('transact').and.callFake((fn: () => void) => fn()),
    getYBlock: jasmine.createSpy('getYBlock').and.callFake(yBlock),
    moveBlocks: jasmine.createSpy('moveBlocks').and.callFake((
      sourceId: string,
      sourceIndex: number,
      count: number,
      targetId: string,
      targetIndex: number,
    ) => {
      const source = childrenById.get(sourceId)!.values
      const target = childrenById.get(targetId)!.values
      const moved = source.splice(sourceIndex, count)
      target.splice(targetIndex, 0, ...moved)
    }),
    deleteBlockById: jasmine.createSpy('deleteBlockById').and.callFake((id: string) => {
      const parentId = parentOf(id)
      if (parentId) {
        const siblings = childrenById.get(parentId)!.values
        siblings.splice(siblings.indexOf(id), 1)
      }
      childrenById.delete(id)
      flavourById.delete(id)
      propsById.delete(id)
    }),
    insertBlockSnapshots: jasmine.createSpy('insertBlockSnapshots'),
  }
  const doc = {
    isReadonly: false,
    isInitialized: true,
    rootId: 'root',
    root: {id: 'root', hostElement: host},
    model,
    crud,
    schemas: {
      get: (flavour: string) => ({
        metadata: {
          placement: {
            modes: flavour === 'image' || flavour === 'shape'
              ? ['relative', 'absolute']
              : ['relative'],
          },
        },
      }),
    },
    readonlySwitch$: new BehaviorSubject(false),
    onDestroy$: new Subject<void>(),
    onChildrenUpdate$: new Subject<any>(),
    onPropsUpdate$: new Subject<any>(),
    ngZone: {runOutsideAngular: (fn: () => void) => fn()},
    afterInit: (fn: (root: {hostElement: HTMLElement}) => void) =>
      fn({hostElement: host}),
    logger: {warn: jasmine.createSpy('warn')},
  }
  const manager = new BlockPlacementManager(doc as any)
  return {childrenById, crud, doc, host, manager}
}

function makeStackHarness() {
  class ChildrenList {
    constructor(readonly values: string[] = []) {}
    get length(): number { return this.values.length }
    toArray(): string[] { return [...this.values] }
  }

  const host = document.createElement('div')
  document.body.appendChild(host)
  const childrenById = new Map<string, ChildrenList>([
    ['root', new ChildrenList(['layout'])],
    ['layout', new ChildrenList([
      'under-a',
      'over-a',
      'under-b',
      'over-b',
    ])],
    ['under-a', new ChildrenList()],
    ['over-a', new ChildrenList()],
    ['under-b', new ChildrenList()],
    ['over-b', new ChildrenList()],
  ])
  const flavourById = new Map<string, string>([
    ['root', 'root'],
    ['layout', 'placement-layout'],
    ['under-a', 'shape'],
    ['over-a', 'shape'],
    ['under-b', 'image'],
    ['over-b', 'image'],
  ])
  const propsById = new Map<string, Record<string, any>>([
    ['under-a', {
      placement: {mode: 'absolute', x: 0, y: 0, layer: 'under'},
    }],
    ['over-a', {
      placement: {mode: 'absolute', x: 0, y: 0},
    }],
    ['under-b', {
      placement: {mode: 'absolute', x: 0, y: 0, layer: 'under'},
    }],
    ['over-b', {
      placement: {mode: 'absolute', x: 0, y: 0},
    }],
  ])
  const parentOf = (id: string): string | null => {
    for (const [parentId, children] of childrenById) {
      if (children.values.includes(id)) return parentId
    }
    return null
  }
  const onPropsChange = new Subject<Map<string, any>>()
  const blocks = Object.fromEntries(
    ['under-a', 'over-a', 'under-b', 'over-b'].map(id => [
      id,
      {
        id,
        flavour: flavourById.get(id),
        parentId: 'layout',
        props: propsById.get(id),
        hostElement: document.createElement('div'),
        updateProps: jasmine.createSpy(`updateProps:${id}`)
          .and.callFake((patch: Record<string, any>) => {
            const props = propsById.get(id)!
            for (const [key, value] of Object.entries(patch)) {
              if (value == null) delete props[key]
              else props[key] = value
            }
            onPropsChange.next(
              new Map(Object.keys(patch).map(key => [key, {}])),
            )
          }),
        onPropsChange,
        onReattach$: new Subject<void>(),
        onDetach$: new Subject<void>(),
        changeDetectorRef: {
          markForCheck: jasmine.createSpy(`markForCheck:${id}`),
        },
      },
    ]),
  ) as Record<string, any>
  const model = {
    getChildrenIds: (id: string) => childrenById.get(id)?.toArray() ?? [],
    getFlavour: (id: string) => flavourById.get(id),
    getProps: (id: string) => propsById.get(id) ?? {},
    getParentId: (id: string) => parentOf(id),
    exists: (id: string) => flavourById.has(id),
  }
  const yBlock = (id: string) => flavourById.has(id)
    ? {
        get: (key: string) => {
          if (key === 'children') return childrenById.get(id)
          if (key === 'props') {
            return {toJSON: () => ({...(propsById.get(id) ?? {})})}
          }
          if (key === 'flavour') return flavourById.get(id)
          return undefined
        },
      }
    : undefined
  const crud = {
    transact: jasmine.createSpy('transact').and.callFake((fn: () => void) => fn()),
    getYBlock: jasmine.createSpy('getYBlock').and.callFake(yBlock),
    moveBlocks: jasmine.createSpy('moveBlocks').and.callFake((
      sourceId: string,
      sourceIndex: number,
      count: number,
      targetId: string,
      targetIndex: number,
    ) => {
      const source = childrenById.get(sourceId)!.values
      const target = childrenById.get(targetId)!.values
      const moved = source.splice(sourceIndex, count)
      target.splice(targetIndex, 0, ...moved)
    }),
  }
  const readonlyManager = {
    isReadonly: jasmine.createSpy('isReadonly').and.returnValue(false),
    containsReadonly: jasmine.createSpy('containsReadonly').and.returnValue(false),
  }
  const doc = {
    isReadonly: false,
    isInitialized: false,
    rootId: 'root',
    root: {id: 'root', hostElement: host},
    model,
    crud,
    schemas: {
      get: (flavour: string) => ({
        metadata: {
          placement: {
            modes: flavour === 'image' || flavour === 'shape'
              ? ['relative', 'absolute']
              : ['relative'],
          },
        },
      }),
    },
    getBlockById: jasmine.createSpy('getBlockById').and.callFake(
      (id: string) => {
        const block = blocks[id]
        if (!block) throw new Error(`missing block: ${id}`)
        return block
      },
    ),
    readonlyManager,
    readonlySwitch$: new BehaviorSubject(false),
    onDestroy$: new Subject<void>(),
    ngZone: {runOutsideAngular: (fn: () => void) => fn()},
    afterInit: (fn: (root: {hostElement: HTMLElement}) => void) =>
      fn({hostElement: host}),
    logger: {warn: jasmine.createSpy('warn')},
  }
  const manager = new BlockPlacementManager(doc as any)
  const idsForLayer = (layer: 'under' | 'over') =>
    childrenById.get('layout')!.toArray().filter(id =>
      resolveBlockPlacement(propsById.get(id)?.['placement']).layer === layer,
    )

  return {
    blocks,
    childrenById,
    crud,
    doc,
    host,
    manager,
    propsById,
    readonlyManager,
    idsForLayer,
  }
}

describe('BlockPlacementManager', () => {
  it('normalizes legacy and duplicate root layouts without user undo', fakeAsync(() => {
    const {childrenById, crud, host, manager} =
      makeRootLayoutNormalizationHarness()

    flushMicrotasks()

    expect(childrenById.get('root')?.toArray()).toEqual([
      'flow',
      'malformed-relative',
      'layout-a',
    ])
    expect(childrenById.get('layout-a')?.toArray()).toEqual([
      'absolute-2',
      'legacy-absolute',
    ])
    expect(childrenById.has('layout-b')).toBeFalse()
    expect(crud.transact).toHaveBeenCalledWith(
      jasmine.any(Function),
      ORIGIN_NO_RECORD,
    )
    expect(crud.deleteBlockById).toHaveBeenCalledOnceWith('layout-b')

    manager.destroy()
    host.remove()
  }))

  it('never allows a gap cursor on the root placement layout', fakeAsync(() => {
    const {host, manager} = makeRootLayoutNormalizationHarness()

    flushMicrotasks()

    expect(manager.allowsGapCursor('layout-a')).toBeFalse()
    expect(manager.allowsGapCursor({
      id: 'detached-layout-view',
      flavour: 'placement-layout',
    } as any)).toBeFalse()

    manager.destroy()
    host.remove()
  }))

  it('normalizes malformed persisted values', () => {
    expect(resolveBlockPlacement(null)).toEqual({
      mode: 'relative',
      x: 0,
      y: 0,
      layer: 'over',
    })
    expect(resolveBlockPlacement({mode: 'relative', x: 10, y: 20}))
      .toEqual({mode: 'relative', x: 0, y: 0, layer: 'over'})
    expect(resolveBlockPlacement({mode: 'absolute', x: Number.NaN, y: 12}))
      .toEqual({mode: 'absolute', x: 0, y: 12, layer: 'over'})
    expect(resolveBlockPlacement({mode: 'absolute', x: 1, y: 2, layer: 'under'}))
      .toEqual({mode: 'absolute', x: 1, y: 2, layer: 'under'})
    expect(resolveBlockPlacement({mode: 'absolute', x: 1, y: 2, layer: 'normal'}))
      .toEqual({mode: 'absolute', x: 1, y: 2, layer: 'over'})
    expect(resolveBlockPlacement({mode: 'absolute', x: 1, y: 2, layer: 'top'}))
      .toEqual({mode: 'absolute', x: 1, y: 2, layer: 'over'})
    expect(resolveBlockPlacement({mode: 'absolute', x: 120, y: 2, unit: 'px'}))
      .toEqual({mode: 'absolute', x: 120, y: 2, unit: 'px', layer: 'over'})
    expect(resolvePlacementXInPixels(
      {mode: 'absolute', x: 25, y: 2},
      500,
    )).toBe(125)
    expect(resolvePlacementXInPixels(
      {mode: 'absolute', x: 25, y: 2, unit: 'px'},
      500,
    )).toBe(25)
  })

  it('measures absolute coordinates against the direct children container', () => {
    const {container, host, manager} = makeHarness()
    expect(measureBlockPlacement(host))
      .toEqual({mode: 'absolute', x: 125, y: 40, unit: 'px', layer: 'over'})
    expect(measureObjectPlacement(host, container, 'under'))
      .toEqual({mode: 'absolute', x: 125, y: 40, unit: 'px', layer: 'under'})
    manager.destroy()
    container.remove()
  })

  it('projects legacy percent x to a fixed inline px value before print cloning', () => {
    const container = document.createElement('div')
    const host = document.createElement('div')
    container.appendChild(host)
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 500,
    })
    const block = Object.create(BaseBlockComponent.prototype) as BaseBlockComponent
    Object.assign(block as any, {
      hostElement: host,
      doc: {
        schemas: {
          get: () => ({metadata: {placement: {modes: ['absolute']}}}),
        },
      },
      _native: {
        flavour: 'shape',
        props: {placement: {mode: 'absolute', x: 25, y: 40}},
      },
    })

    expect(block.placementLeft).toBe(125)
    ;(block as any)._native.props.placement = {
      mode: 'absolute',
      x: 25,
      y: 40,
      unit: 'px',
    }
    expect(block.placementLeft).toBe(25)
  })

  it('measures paginated absolute coordinates from the deterministic content origin', () => {
    const root = document.createElement('div')
    const host = document.createElement('div')
    root.style.setProperty('--bc-placement-content-origin-y', '120px')
    root.appendChild(host)
    document.body.appendChild(root)
    setRect(root, {left: 100, top: 50, width: 500})
    setRect(host, {left: 225, top: 210, width: 100, height: 80})
    Object.defineProperty(root, 'clientWidth', {configurable: true, value: 500})
    Object.defineProperty(root, 'clientLeft', {configurable: true, value: 0})
    Object.defineProperty(root, 'clientTop', {configurable: true, value: 0})

    expect(measureObjectPlacement(host, root))
      .toEqual({mode: 'absolute', x: 125, y: 40, unit: 'px', layer: 'over'})

    root.remove()
  })

  it('inserts a new object directly into the root placement layout', () => {
    const rootHost = document.createElement('div')
    document.body.appendChild(rootHost)
    // The host is visually scaled to 2x while its layout width stays 500px.
    // Selection DOMRects are visual pixels and must be normalised before the
    // placement is persisted.
    setRect(rootHost, {left: 100, top: 50, width: 1000, height: 1600})
    Object.defineProperty(rootHost, 'clientWidth', {
      configurable: true,
      value: 500,
    })
    Object.defineProperty(rootHost, 'clientLeft', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(rootHost, 'clientTop', {
      configurable: true,
      value: 0,
    })
    const shape = {
      id: 'shape-new',
      flavour: 'shape',
      nodeType: 'block',
      props: {shapeType: 'diamond', width: 180},
      meta: {},
      children: [],
    } as any
    const layout = {
      id: 'layout-new',
      flavour: 'placement-layout',
      nodeType: 'block',
      props: {},
      meta: {},
      children: [],
    } as any
    const insertDepths: number[] = []
    let transactionDepth = 0
    const insertBlockSnapshots = jasmine.createSpy('insertBlockSnapshots')
      .and.callFake((parentId: string, _index: number, snapshots: any[]) => {
        insertDepths.push(transactionDepth)
        return parentId === 'root'
          ? [layout.id]
          : snapshots.map(snapshot => snapshot.id)
      })
    const doc = {
      isReadonly: false,
      isInitialized: false,
      rootId: 'root',
      root: {id: 'root', hostElement: rootHost},
      model: {
        getChildrenIds: () => [],
        getFlavour: (id: string) => id === 'root' ? 'root' : undefined,
        getProps: () => ({}),
        getParentId: () => null,
      },
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((fn: () => void) => {
          transactionDepth++
          try {
            fn()
          } finally {
            transactionDepth--
          }
        }),
        insertBlockSnapshots,
        getYBlock: jasmine.createSpy('getYBlock').and.callFake((id: string) =>
          id === layout.id
            ? {get: (key: string) => key === 'children' ? {length: 0} : undefined}
            : undefined),
      },
      schemas: {
        get: jasmine.createSpy('getSchema').and.callFake((flavour: string) => ({
          metadata: flavour === 'shape'
            ? {placement: {modes: ['relative', 'absolute']}}
            : {},
        })),
        createSnapshot: jasmine.createSpy('createSnapshot')
          .and.callFake((_flavour: string, params: any[]) => ({
            ...layout,
            children: params[0] ?? [],
          })),
      },
      readonlyManager: {
        isReadonly: jasmine.createSpy('isReadonly').and.returnValue(false),
        containsReadonly: jasmine.createSpy('containsReadonly').and.returnValue(false),
      },
      readonlySwitch$: new BehaviorSubject(false),
      onDestroy$: new Subject<void>(),
      onChildrenUpdate$: new Subject<any>(),
      onPropsUpdate$: new Subject<any>(),
      ngZone: {runOutsideAngular: (fn: () => void) => fn()},
      afterInit: (fn: (root: {hostElement: HTMLElement}) => void) =>
        fn({hostElement: rootHost}),
      selection: {
        getSelectionRect: jasmine.createSpy('getSelectionRect').and.returnValue(
          new DOMRect(350, 210, 0, 48),
        ),
      },
      logger: {warn: jasmine.createSpy('warn')},
    }
    const manager = new BlockPlacementManager(doc as any)

    const insertedId = manager.insertAbsoluteSnapshot(shape)

    expect(insertedId).toBe(shape.id)
    expect(doc.schemas.createSnapshot)
      .toHaveBeenCalledOnceWith('placement-layout', [[{
        ...shape,
        props: {
          ...shape.props,
          placement: {mode: 'absolute', x: 125, y: 80, unit: 'px'},
        },
      }]])
    expect(insertBlockSnapshots).toHaveBeenCalledTimes(1)
    expect(insertBlockSnapshots.calls.argsFor(0)).toEqual([
      'root',
      0,
      [{
        ...layout,
        children: [{
          ...shape,
          props: {
            ...shape.props,
            placement: {mode: 'absolute', x: 125, y: 80, unit: 'px'},
          },
        }],
      }],
    ])
    expect(insertDepths.every(depth => depth > 0)).toBeTrue()

    manager.destroy()
    rootHost.remove()
  })

  it('publishes the shared Word-like object layout vocabulary', () => {
    expect(BLOCK_OBJECT_LAYOUT_OPTIONS).toEqual([
      {value: 'inline', label: '嵌入型', icon: 'bc_fuwenben-qianruzuo'},
      {value: 'top-bottom', label: '上下型', icon: 'bc_fuwenben-shangxia'},
      {value: 'under', label: '衬于文字下方', icon: 'bc_cengji-xia'},
      {value: 'over', label: '浮于文字上方', icon: 'bc_cengji-shang'},
    ])
  })

  it('maps object layouts to flow or absolute placement in one transaction', () => {
    const {container, props, block, manager, doc} = makeHarness()

    expect(manager.getObjectLayout(block as any)).toBe('top-bottom')
    expect(manager.setObjectLayout(block as any, 'under')).toBeTrue()
    expect(doc.crud.transact).toHaveBeenCalledTimes(1)
    expect(props['placement']).toEqual({
      mode: 'absolute',
      x: 125,
      y: 40,
      unit: 'px',
      layer: 'under',
    })
    expect(manager.getObjectLayout(block as any)).toBe('under')

    expect(manager.setObjectLayout(block as any, 'top-bottom')).toBeTrue()
    expect(props['placement']).toBeUndefined()

    manager.destroy()
    container.remove()
  })

  it('delegates the inline representation to a flavour adapter', () => {
    const {container, block, manager} = makeHarness()
    const toInline = jasmine.createSpy('toInline').and.returnValue(true)
    const release = manager.registerObjectLayoutAdapter('image', {toInline})

    expect(manager.supportsObjectLayout(block as any, 'inline')).toBeTrue()
    expect(manager.setObjectLayout(block as any, 'inline')).toBeTrue()
    expect(toInline).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      block,
    }))

    release()
    expect(manager.supportsObjectLayout(block as any, 'inline')).toBeFalse()
    manager.destroy()
    container.remove()
  })

  it('switches modes through block props and preserves the current visual position', () => {
    const {container, props, block, manager} = makeHarness()

    expect(manager.setMode(block as any, 'absolute')).toBeTrue()
    expect(props['placement']).toEqual({mode: 'absolute', x: 125, y: 40, unit: 'px'})

    expect(manager.setMode(block as any, 'relative')).toBeTrue()
    expect(props['placement']).toBeUndefined()
    expect(block.updateProps).toHaveBeenCalledTimes(2)

    manager.destroy()
    container.remove()
  })

  it('resolves the nearest flow sibling from the absolute block visual center', () => {
    const {container, props, block, parent, manager, doc} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30}
    setRect(block.hostElement, {top: 360, bottom: 440, height: 80})

    const tallHost = document.createElement('div')
    const shortHost = document.createElement('div')
    container.append(tallHost, shortHost)
    setRect(tallHost, {top: 100, bottom: 350, height: 250})
    setRect(shortHost, {top: 500, bottom: 520, height: 20})
    const tall = {
      id: 'tall-code',
      props: {},
      hostElement: tallHost,
    }
    const short = {
      id: 'short-text',
      props: {},
      hostElement: shortHost,
    }
    parent.childrenIds = [tall.id, block.id, short.id]
    doc.getBlockById.and.callFake((id: string) => ({
      [block.id]: block,
      [tall.id]: tall,
      [short.id]: short,
    })[id] ?? null)

    expect(manager.resolveFlowAnchor(block as any)).toEqual({
      parentId: 'root',
      anchorBlockId: 'tall-code',
      side: 'after',
    })

    manager.destroy()
    container.remove()
  })

  it('uses the target midpoint to choose before and ignores non-flow siblings', () => {
    const {container, props, block, parent, manager, doc} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30}
    setRect(block.hostElement, {top: 90, bottom: 130, height: 40})

    const flowHost = document.createElement('div')
    const absoluteHost = document.createElement('div')
    const bridgeHost = document.createElement('div')
    bridgeHost.setAttribute('data-bc-placement-layer-bridge', '')
    container.append(flowHost, absoluteHost, bridgeHost)
    setRect(flowHost, {top: 100, bottom: 300, height: 200})
    setRect(absoluteHost, {top: 100, bottom: 120, height: 20})
    setRect(bridgeHost, {top: 100, bottom: 120, height: 20})
    const flow = {id: 'flow', props: {}, hostElement: flowHost}
    const absolute = {
      id: 'absolute',
      props: {placement: {mode: 'absolute', x: 0, y: 0}},
      hostElement: absoluteHost,
    }
    const bridge = {id: 'bridge', props: {}, hostElement: bridgeHost}
    parent.childrenIds = [absolute.id, bridge.id, block.id, flow.id]
    doc.getBlockById.and.callFake((id: string) => ({
      [block.id]: block,
      [flow.id]: flow,
      [absolute.id]: absolute,
      [bridge.id]: bridge,
    })[id] ?? null)

    expect(manager.resolveFlowAnchor(block as any)).toEqual({
      parentId: 'root',
      anchorBlockId: 'flow',
      side: 'before',
    })

    manager.destroy()
    container.remove()
  })

  it('converts stable before/after anchors into same-parent move indexes', () => {
    const {container, block, parent, manager, doc} = makeHarness()
    const anchor = {
      id: 'anchor',
      props: {},
      hostElement: document.createElement('div'),
    }
    const filler = {
      id: 'filler',
      props: {},
      hostElement: document.createElement('div'),
    }
    container.append(anchor.hostElement, filler.hostElement)
    doc.getBlockById.and.callFake((id: string) => ({
      [block.id]: block,
      [anchor.id]: anchor,
      [filler.id]: filler,
    })[id] ?? null)

    parent.childrenIds = [block.id, filler.id, anchor.id]
    expect(manager.reanchorToFlow(block as any, {
      parentId: 'root',
      anchorBlockId: anchor.id,
      side: 'before',
    })).toBeTrue()
    expect(doc.crud.moveBlocks).toHaveBeenCalledWith('root', 0, 1, 'root', 1)

    doc.crud.moveBlocks.calls.reset()
    parent.childrenIds = [anchor.id, filler.id, block.id]
    expect(manager.reanchorToFlow(block as any, {
      parentId: 'root',
      anchorBlockId: anchor.id,
      side: 'after',
    })).toBeTrue()
    expect(doc.crud.moveBlocks).toHaveBeenCalledWith('root', 2, 1, 'root', 1)

    manager.destroy()
    container.remove()
  })

  it('uses the post-delete root-end index when no flow anchor or layout exists', () => {
    const {container, block, parent, manager, doc} = makeHarness()
    parent.childrenIds = [block.id, 'flow']

    expect(manager.reanchorToFlow(block as any, null)).toBeTrue()
    expect(doc.crud.moveBlocks).toHaveBeenCalledOnceWith(
      'root',
      0,
      1,
      'root',
      1,
    )

    manager.destroy()
    container.remove()
  })

  it('moves and clears placement in one transaction when returning to flow', () => {
    const {container, props, block, parent, manager, doc} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30}
    const flowHost = document.createElement('div')
    container.append(flowHost)
    setRect(block.hostElement, {top: 200, bottom: 240, height: 40})
    setRect(flowHost, {top: 100, bottom: 180, height: 80})
    const flow = {id: 'flow', props: {}, hostElement: flowHost}
    parent.childrenIds = [block.id, flow.id]
    doc.getBlockById.and.callFake((id: string) => ({
      [block.id]: block,
      [flow.id]: flow,
    })[id] ?? null)

    expect(manager.setMode(block as any, 'relative')).toBeTrue()
    expect(doc.crud.transact).toHaveBeenCalledTimes(1)
    expect(doc.crud.moveBlocks).toHaveBeenCalledWith('root', 0, 1, 'root', 1)
    expect(props['placement']).toBeUndefined()

    manager.destroy()
    container.remove()
  })

  it('updates semantic layers without losing absolute coordinates', () => {
    const {container, props, block, manager} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30}

    expect(manager.setLayer(block as any, 'under')).toBeTrue()
    expect(props['placement']).toEqual({
      mode: 'absolute',
      x: 20,
      y: 30,
      layer: 'under',
    })
    expect(manager.setLayer(block as any, 'over')).toBeTrue()
    expect(props['placement']).toEqual({mode: 'absolute', x: 20, y: 30})

    manager.destroy()
    container.remove()
  })

  it('moves one step within an interleaved absolute layer', () => {
    const h = makeStackHarness()

    expect(h.manager.moveForward(h.blocks['under-a'])).toBeTrue()
    expect(h.idsForLayer('under')).toEqual(['under-b', 'under-a'])
    expect(h.manager.moveBackward(h.blocks['under-a'])).toBeTrue()
    expect(h.idsForLayer('under')).toEqual(['under-a', 'under-b'])

    h.manager.destroy()
    h.host.remove()
  })

  it('crosses the flow-content boundary one step at a time', () => {
    const h = makeStackHarness()

    expect(h.manager.moveForward(h.blocks['under-b'])).toBeTrue()
    expect(h.crud.transact).toHaveBeenCalledTimes(1)
    expect(h.idsForLayer('under')).toEqual(['under-a'])
    expect(h.idsForLayer('over')).toEqual([
      'under-b',
      'over-a',
      'over-b',
    ])
    expect(h.propsById.get('under-b')?.['placement']).toEqual({
      mode: 'absolute',
      x: 0,
      y: 0,
    })

    expect(h.manager.moveBackward(h.blocks['under-b'])).toBeTrue()
    expect(h.crud.transact).toHaveBeenCalledTimes(2)
    expect(h.idsForLayer('under')).toEqual(['under-a', 'under-b'])
    expect(h.idsForLayer('over')).toEqual(['over-a', 'over-b'])
    expect(h.propsById.get('under-b')?.['placement']).toEqual({
      mode: 'absolute',
      x: 0,
      y: 0,
      layer: 'under',
    })

    h.manager.destroy()
    h.host.remove()
  })

  it('lets a single absolute object cross the flow-content boundary', () => {
    const h = makeStackHarness()
    const children = h.childrenById.get('layout')!.values
    children.splice(0, children.length, 'under-a')

    expect(h.manager.canMoveBackward(h.blocks['under-a'])).toBeFalse()
    expect(h.manager.canMoveForward(h.blocks['under-a'])).toBeTrue()
    expect(h.manager.moveForward(h.blocks['under-a'])).toBeTrue()
    expect(h.idsForLayer('under')).toEqual([])
    expect(h.idsForLayer('over')).toEqual(['under-a'])
    expect(h.manager.canMoveForward(h.blocks['under-a'])).toBeFalse()
    expect(h.manager.canMoveBackward(h.blocks['under-a'])).toBeTrue()

    expect(h.manager.moveBackward(h.blocks['under-a'])).toBeTrue()
    expect(h.idsForLayer('under')).toEqual(['under-a'])
    expect(h.idsForLayer('over')).toEqual([])

    h.manager.destroy()
    h.host.remove()
  })

  it('reports total stack boundaries and rejects stale or readonly blocks', () => {
    const h = makeStackHarness()

    expect(h.manager.canMoveBackward(h.blocks['under-a'])).toBeFalse()
    expect(h.manager.canMoveForward(h.blocks['under-a'])).toBeTrue()
    expect(h.manager.canMoveBackward(h.blocks['over-a'])).toBeTrue()
    expect(h.manager.canMoveForward(h.blocks['over-b'])).toBeFalse()

    h.readonlyManager.isReadonly.and.returnValue(true)
    expect(h.manager.moveForward(h.blocks['under-a'])).toBeFalse()
    h.readonlyManager.isReadonly.and.returnValue(false)

    h.propsById.set('under-a', {placement: null})
    h.blocks['under-a'].props = h.propsById.get('under-a')
    expect(h.manager.moveForward(h.blocks['under-a'])).toBeFalse()

    h.doc.getBlockById.and.throwError('stale')
    expect(h.manager.canMoveForward(h.blocks['under-b'])).toBeFalse()

    h.manager.destroy()
    h.host.remove()
  })

  it('normalizes legacy normal/top storage when setting the over layer', () => {
    const {container, props, block, manager} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30, layer: 'top'}

    expect(manager.setLayer(block as any, 'over')).toBeTrue()
    expect(props['placement']).toEqual({mode: 'absolute', x: 20, y: 30})

    manager.destroy()
    container.remove()
  })

  it('projects absolute layers around the flow-content tier', () => {
    const block = Object.create(BaseBlockComponent.prototype) as BaseBlockComponent
    Object.assign(block as any, {
      doc: {
        schemas: {
          get: () => ({metadata: {placement: {modes: ['relative', 'absolute']}}}),
        },
      },
      _native: {
        props: {placement: {mode: 'absolute', x: 0, y: 0, layer: 'under'}},
      },
    })

    expect(block.placementZIndex).toBe(0)
    ;(block as any)._native.props.placement = {mode: 'absolute', x: 0, y: 0}
    expect(block.placementZIndex).toBe(2)
  })

  it('removes block gap DOM while a block is absolutely positioned', () => {
    const host = document.createElement('div')
    host.append(
      document.createElement('span'),
      document.createElement('div'),
      document.createElement('span'),
    )
    host.firstElementChild!.setAttribute('data-block-zero-space', 'true')
    host.lastElementChild!.setAttribute('data-block-zero-space', 'true')
    const allowsGapCursor = jasmine.createSpy('allowsGapCursor')
      .and.returnValue(false)
    const block = Object.create(BaseBlockComponent.prototype) as BaseBlockComponent
    Object.assign(block as any, {
      hostElement: host,
      doc: {
        placement: {
          allowsGapCursor,
        },
      },
      _native: {
        id: 'shape-1',
        flavour: 'shape',
        nodeType: 'block',
        props: {placement: {mode: 'absolute', x: 0, y: 0}},
      },
    })

    ;(block as any)._syncBlockGapSpaces()

    expect(host.querySelectorAll(
      ':scope > [data-block-zero-space="true"]',
    ).length).toBe(0)

    allowsGapCursor.and.returnValue(true)
    ;(block as any)._syncBlockGapSpaces()

    const restored = host.querySelectorAll<HTMLElement>(
      ':scope > [data-block-zero-space="true"]',
    )
    expect(restored.length).toBe(2)
    expect(restored[0].getAttribute('data-block-gap-side')).toBe('before')
    expect(restored[1].getAttribute('data-block-gap-side')).toBe('after')
  })

  it('does not mount gap DOM on placement-layout', () => {
    const host = document.createElement('div')
    const allowsGapCursor = jasmine.createSpy('allowsGapCursor')
      .and.returnValue(false)
    const block = Object.create(BaseBlockComponent.prototype) as BaseBlockComponent
    Object.assign(block as any, {
      hostElement: host,
      doc: {
        schemas: {
          get: () => ({metadata: {isLeaf: false}}),
        },
        placement: {
          allowsGapCursor,
        },
      },
      _native: {
        id: 'placement-layout-1',
        flavour: 'placement-layout',
        nodeType: 'block',
        props: {},
      },
    })

    ;(block as any)._syncBlockGapSpaces()

    expect(host.querySelector(
      ':scope > [data-block-zero-space="true"]',
    )).toBeNull()
    expect(allowsGapCursor).toHaveBeenCalledOnceWith(block as any)
  })

  it('lets a host adapter orchestrate same-core-mode transitions', () => {
    const {container, block, manager, doc} = makeHarness()
    const transitionMode = jasmine.createSpy('transitionMode').and.returnValue(true)
    doc.config.placement = {transitionMode}

    expect(manager.setMode(block as any, 'relative')).toBeTrue()
    expect(transitionMode).toHaveBeenCalled()
    expect(block.updateProps).not.toHaveBeenCalled()

    manager.destroy()
    container.remove()
  })

  it('picks an underlay block from its edge on the root capture path', () => {
    const {container, props, block, manager, doc} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30, layer: 'under'}
    const release = manager.registerBlockView(block as any)
    const text = document.createElement('span')
    container.appendChild(text)

    text.dispatchEvent(pointer('pointerdown', {clientX: 226, clientY: 92}))

    expect(doc.selection.selectBlock).toHaveBeenCalledOnceWith(block)

    release()
    manager.destroy()
    container.remove()
  })

  it('makes absolute objects pointer-transparent during a flow mouse gesture', () => {
    const {container, host, manager} = makeHarness()
    host.setAttribute('data-block-id', 'image-1')
    host.setAttribute('data-bc-placement', 'absolute')
    const flowText = document.createElement('span')
    container.appendChild(flowText)

    flowText.dispatchEvent(pointer('pointerdown'))

    expect(container.hasAttribute(
      'data-bc-flow-selection-passthrough',
    )).toBeTrue()

    window.dispatchEvent(pointer('pointerup'))

    expect(container.hasAttribute(
      'data-bc-flow-selection-passthrough',
    )).toBeFalse()

    manager.destroy()
    container.remove()
  })

  it('keeps an absolute-object-originated mouse gesture interactive', () => {
    const {container, host, manager} = makeHarness()
    host.setAttribute('data-block-id', 'image-1')
    host.setAttribute('data-bc-placement', 'absolute')

    host.dispatchEvent(pointer('pointerdown'))

    expect(container.hasAttribute(
      'data-bc-flow-selection-passthrough',
    )).toBeFalse()

    manager.destroy()
    container.remove()
  })

  it('previews pointer movement and commits one placement update on pointerup', () => {
    const {container, host, props, block, manager, doc, releaseLease} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30}

    expect(manager.startDrag(pointer('pointerdown', {clientX: 200, clientY: 100}), block as any)).toBeTrue()
    expect(manager.state).toBe('armed')
    expect(doc.selection.setSuppressRecalculate).toHaveBeenCalledOnceWith(true)
    expect(doc.selection.blur).not.toHaveBeenCalled()
    window.dispatchEvent(pointer('pointermove', {clientX: 202, clientY: 101}))
    expect(manager.state).toBe('armed')
    window.dispatchEvent(pointer('pointermove', {clientX: 250, clientY: 125}))
    expect(manager.state).toBe('dragging')
    expect(doc.selection.blur).toHaveBeenCalledTimes(1)
    expect(host.style.transform).toContain('translate3d(50px, 25px, 0px)')

    window.dispatchEvent(pointer('pointerup', {clientX: 250, clientY: 125}))

    expect(manager.state).toBe('idle')
    expect(props['placement']).toEqual({mode: 'absolute', x: 150, y: 55, unit: 'px'})
    expect(host.style.transform).toBe('')
    expect(doc.virtualization.acquireBlockViewLease).toHaveBeenCalledOnceWith(['image-1'])
    expect(releaseLease).toHaveBeenCalledTimes(1)
    expect(doc.selection.setSuppressRecalculate).toHaveBeenCalledWith(false)
    expect(block.updateProps).toHaveBeenCalledTimes(1)

    manager.destroy()
    container.remove()
  })

  it('uses the measured placement scale for pointer drag geometry', () => {
    const {container, host, props, block, manager, doc} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30}
    setRect(container, {left: 100, top: 50, width: 1000})
    // Deliberately conflict with the real DOM scale. Placement interactions
    // must follow the containing plane, not a configured toolbar value.
    ;(doc as any).viewScale = {value: 0.5}

    expect(manager.startDrag(
      pointer('pointerdown', {clientX: 200, clientY: 100}),
      block as any,
    )).toBeTrue()

    window.dispatchEvent(pointer('pointermove', {clientX: 250, clientY: 120}))
    expect(manager.state).toBe('dragging')
    expect(host.style.transform).toContain('translate3d(25px, 10px, 0px)')

    window.dispatchEvent(pointer('pointerup', {clientX: 250, clientY: 120}))

    expect(props['placement']).toEqual({mode: 'absolute', x: 125, y: 40, unit: 'px'})
    expect(host.style.transform).toBe('')

    manager.destroy()
    container.remove()
  })

  it('preserves selection while armed and releases protection after a click', () => {
    const {container, props, block, manager, doc} = makeHarness()
    props['placement'] = {mode: 'absolute', x: 20, y: 30}

    expect(manager.startDrag(
      pointer('pointerdown', {clientX: 200, clientY: 100}),
      block as any,
    )).toBeTrue()

    const selectStart = new Event('selectstart', {bubbles: true, cancelable: true})
    document.dispatchEvent(selectStart)
    expect(selectStart.defaultPrevented).toBeTrue()

    window.dispatchEvent(pointer('pointerup', {clientX: 200, clientY: 100}))

    expect(manager.state).toBe('idle')
    expect(doc.selection.blur).not.toHaveBeenCalled()
    expect(doc.selection.setSuppressRecalculate.calls.allArgs()).toEqual([
      [true],
      [false],
    ])

    manager.destroy()
    container.remove()
  })
})
