import {BehaviorSubject, Subject} from 'rxjs'
import {Component} from '@angular/core'
import {TestBed, fakeAsync, flushMicrotasks} from '@angular/core/testing'
import {ORIGIN_NO_RECORD} from '../doc/origins'
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BlockPlacementManager,
  measureBlockPlacement,
  measureObjectPlacement,
  resolveBlockPosition,
  resolvePlacementLayer,
} from './block-placement.manager'
import {
  resolvePlacementContainerBox,
  resolvePlacementPlaneBounds,
} from './block-placement/geometry'
import {BaseBlockComponent} from '../block-std/block/component/base-block'

/**
 * 对象宽度契约（base.scss）：`data-bc-object` 宿主流内收敛到内容列，浮动
 * （absolute）不设上限。标记与真实渲染一致：宿主标记来自 BaseBlockComponent
 * 的 HostBinding，表面标记来自各块模板的 `data-bc-object-surface`。
 */
@Component({
  selector: 'object-width-contract-harness',
  standalone: true,
  template: `
    <div
      data-blockcraft-root="true"
      style="position: relative; box-sizing: border-box; width: 500px;
        padding: 0 20px 0 40px"
    >
      <div style="position: relative; width: 100%">
        <div
          data-block-id="flow"
          data-bc-object=""
          data-flow=""
          style="width: fit-content"
        >
          <div data-bc-object-surface="" style="width: 800px; height: 40px"></div>
        </div>
        <div
          data-block-id="float"
          data-bc-object=""
          data-bc-placement="absolute"
          data-float=""
          style="position: absolute; left: -40px; top: 0; width: fit-content;
            margin: 0"
        >
          <div data-bc-object-surface="" style="width: 800px; height: 40px"></div>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../themes/base.scss',
})
class ObjectWidthContractHarness {}

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
  const rootChildren = ['image-1']
  const layoutChildren: string[] = []
  const parent = {
    id: 'root',
    childrenIds: rootChildren,
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
  const childrenById = new Map<string, string[]>([
    ['root', rootChildren],
    ['layout', layoutChildren],
    ['image-1', []],
  ])
  const flavourById = new Map<string, string>([
    ['root', 'root'],
    ['layout', 'placement-layout'],
    ['image-1', 'image'],
  ])
  const parentOf = (id: string): string | null => {
    for (const [parentId, children] of childrenById) {
      if (children.includes(id)) return parentId
    }
    return null
  }
  const doc = {
    config: {} as any,
    isReadonly: false,
    readonlySwitch$,
    onDestroy$,
    schemas: {
      get: jasmine.createSpy('getSchema').and.callFake((flavour: string) => ({
        metadata: flavour === 'image'
          ? {placement: {modes: ['relative', 'absolute']}}
          : {},
      })),
      createSnapshot: jasmine.createSpy('createSnapshot').and.returnValue({
        id: 'layout',
        flavour: 'placement-layout',
        nodeType: 'block',
        props: {},
        meta: {},
        children: [],
      }),
    },
    rootId: 'root',
    root: {id: 'root', hostElement: container, childrenIds: rootChildren},
    model: {
      getChildrenIds: (id: string) => [...(childrenById.get(id) ?? [])],
      getFlavour: (id: string) => flavourById.get(id),
      getProps: (id: string) => id === block.id ? props : {},
      getParentId: (id: string) => parentOf(id),
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
      getYBlock: jasmine.createSpy('getYBlock').and.callFake((id: string) => ({
        get: (key: string) => key === 'children'
          ? {
              get length() { return childrenById.get(id)?.length ?? 0 },
              toArray: () => [...(childrenById.get(id) ?? [])],
            }
          : key === 'props'
            ? {toJSON: () => id === block.id ? {...props} : {}}
            : undefined,
      })),
      insertBlockSnapshots: jasmine.createSpy('insertBlockSnapshots')
        .and.callFake((parentId: string, index: number, snapshots: any[]) => {
          const ids = snapshots.map(snapshot => snapshot.id)
          childrenById.get(parentId)!.splice(index, 0, ...ids)
          return ids
        }),
      moveBlocks: jasmine.createSpy('moveBlocks').and.callFake((
        sourceId: string,
        sourceIndex: number,
        count: number,
        targetId: string,
        targetIndex: number,
      ) => {
        const moved = childrenById.get(sourceId)!.splice(sourceIndex, count)
        childrenById.get(targetId)!.splice(targetIndex, 0, ...moved)
        if (moved.includes(block.id)) {
          block.parentId = targetId
          block.parentBlock = targetId === 'root'
            ? parent
            : {id: 'layout', childrenIds: layoutChildren}
        }
      }),
    },
    virtualization: {
      acquireBlockViewLease: jasmine.createSpy('acquireBlockViewLease').and.returnValue(releaseLease),
    },
    ngZone: {runOutsideAngular: (fn: () => void) => fn()},
    afterInit: (fn: (root: {hostElement: HTMLElement}) => void) =>
      fn({hostElement: container}),
  }
  const manager = new BlockPlacementManager(doc as any)

  const setAbsolute = (
    position = {x: 20, y: 30},
    layer: 'under' | 'over' = 'over',
  ) => {
    const rootIndex = rootChildren.indexOf(block.id)
    if (rootIndex >= 0) rootChildren.splice(rootIndex, 1)
    if (!rootChildren.includes('layout')) rootChildren.push('layout')
    if (!layoutChildren.includes(block.id)) layoutChildren.push(block.id)
    block.parentId = 'layout'
    block.parentBlock = {id: 'layout', childrenIds: layoutChildren}
    props['position'] = position
    if (layer === 'under') props['placementLayer'] = 'under'
    else delete props['placementLayer']
  }

  return {
    container,
    host,
    props,
    block,
    parent,
    doc,
    manager,
    releaseLease,
    setAbsolute,
    rootChildren,
    layoutChildren,
  }
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
      position: {x: 10, y: 20},
    }],
    ['absolute-2', {
      position: {x: 30, y: 40},
      placementLayer: 'under',
    }],
    ['malformed-relative', {
      // A flow-only Schema must not become an absolute layout child merely
      // because a stale snapshot contains placement props.
      position: {x: 99, y: 99},
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
    updateBlockProps: jasmine.createSpy('updateBlockProps').and.callFake((
      id: string,
      patch: Record<string, unknown>,
    ) => {
      const props = propsById.get(id) ?? {}
      for (const [key, value] of Object.entries(patch)) {
        if (value == null) delete props[key]
        else props[key] = value
      }
      propsById.set(id, props)
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
    ['under-a', {position: {x: 0, y: 0}, placementLayer: 'under'}],
    ['over-a', {position: {x: 0, y: 0}}],
    ['under-b', {position: {x: 0, y: 0}, placementLayer: 'under'}],
    ['over-b', {position: {x: 0, y: 0}}],
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
      resolvePlacementLayer(propsById.get(id)?.['placementLayer']) === layer,
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

  it('normalizes atomic position and layer values', () => {
    expect(resolveBlockPosition(null)).toEqual({x: 0, y: 0})
    expect(resolveBlockPosition({x: Number.NaN, y: 12}))
      .toEqual({x: 0, y: 12})
    expect(resolveBlockPosition({x: 120, y: 2}))
      .toEqual({x: 120, y: 2})
    expect(resolvePlacementLayer('under')).toBe('under')
    expect(resolvePlacementLayer('over')).toBe('over')
    expect(resolvePlacementLayer('top')).toBe('over')
  })

  it('measures absolute coordinates against the direct children container', () => {
    const {container, host, manager} = makeHarness()
    expect(measureBlockPlacement(host))
      .toEqual({mode: 'absolute', x: 125, y: 40, layer: 'over'})
    expect(measureObjectPlacement(host, container, 'under'))
      .toEqual({mode: 'absolute', x: 125, y: 40, layer: 'under'})
    manager.destroy()
    container.remove()
  })

  it('projects structural absolute position directly in layout pixels', () => {
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
        placement: {
          getState: () => ({
            mode: 'absolute',
            x: 25,
            y: 40,
            layer: 'over',
          }),
        },
      },
      _native: {
        id: 'shape-1',
        flavour: 'shape',
        props: {position: {x: 25, y: 40}},
      },
    })

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
      .toEqual({mode: 'absolute', x: 125, y: 40, layer: 'over'})

    root.remove()
  })

  it('excludes root padding from placement coordinates and width', () => {
    const root = document.createElement('div')
    const host = document.createElement('div')
    root.style.padding = '10px 20px 30px 40px'
    root.style.setProperty('--bc-placement-content-origin-y', '120px')
    root.appendChild(host)
    document.body.appendChild(root)
    setRect(root, {left: 100, top: 50, width: 500})
    setRect(host, {left: 225, top: 210, width: 100, height: 80})
    Object.defineProperty(root, 'offsetWidth', {configurable: true, value: 500})
    Object.defineProperty(root, 'clientWidth', {configurable: true, value: 500})
    Object.defineProperty(root, 'clientLeft', {configurable: true, value: 0})
    Object.defineProperty(root, 'clientTop', {configurable: true, value: 0})

    expect(measureObjectPlacement(host, root))
      .toEqual({mode: 'absolute', x: 85, y: 30, layer: 'over'})

    const box = resolvePlacementContainerBox(root)
    expect(box.originX).toBe(140)
    expect(box.originY).toBe(180)
    expect(box.width).toBe(440)

    root.remove()
  })

  it('frees a floating object of width caps while flow collapses to the column', async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectWidthContractHarness],
    }).compileComponents()
    const fixture = TestBed.createComponent(ObjectWidthContractHarness)
    document.body.appendChild(fixture.nativeElement)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const flowSurface = host.querySelector<HTMLElement>(
      '[data-flow] [data-bc-object-surface]',
    )!
    const floatHost = host.querySelector<HTMLElement>('[data-float]')!
    const floatSurface = host.querySelector<HTMLElement>(
      '[data-float] [data-bc-object-surface]',
    )!

    try {
      // 流内：宿主与表面都收敛到内容列（500 - 40 - 20 = 440）。
      expect(flowSurface.getBoundingClientRect().width).toBe(440)
      // 浮动：宽度完全归用户，可以比编辑器本身还宽。
      expect(floatHost.getBoundingClientRect().width).toBe(800)
      expect(floatSurface.getBoundingClientRect().width).toBe(800)
    } finally {
      fixture.nativeElement.remove()
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })

  it('exposes the padding box as the placeable plane', () => {
    const root = document.createElement('div')
    root.style.padding = '10px 20px 30px 40px'
    root.style.setProperty('--bc-placement-content-origin-y', '120px')
    document.body.appendChild(root)
    setRect(root, {left: 100, top: 50, width: 500})
    Object.defineProperty(root, 'clientWidth', {configurable: true, value: 500})
    Object.defineProperty(root, 'clientLeft', {configurable: true, value: 0})
    Object.defineProperty(root, 'clientTop', {configurable: true, value: 0})

    const box = resolvePlacementContainerBox(root)
    const bounds = resolvePlacementPlaneBounds(box)

    // Objects may sit on the editor padding, so the plane is one padding ring
    // wider than the content box on both axes.
    expect(bounds).toEqual({minX: -40, maxX: 460, minY: -130})
    expect(bounds.maxX - bounds.minX).toBe(root.clientWidth)

    root.remove()
  })

  const makeInsertionHarness = (options: {
    selectionRect: DOMRect
    padding?: string
  }) => {
    const rootHost = document.createElement('div')
    if (options.padding) rootHost.style.padding = options.padding
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
          options.selectionRect,
        ),
      },
      logger: {warn: jasmine.createSpy('warn')},
    }
    const manager = new BlockPlacementManager(doc as any)
    const insertedPosition = () =>
      (doc.schemas.createSnapshot.calls.mostRecent()
        .args[1] as any[])[0][0].props.position

    return {
      rootHost,
      shape,
      layout,
      doc,
      manager,
      insertBlockSnapshots,
      insertDepths,
      insertedPosition,
    }
  }

  it('inserts a new object directly into the root placement layout', () => {
    const {
      rootHost,
      shape,
      layout,
      doc,
      manager,
      insertBlockSnapshots,
      insertDepths,
    } = makeInsertionHarness({selectionRect: new DOMRect(350, 210, 0, 48)})

    const insertedId = manager.insertAbsoluteSnapshot(shape)

    expect(insertedId).toBe(shape.id)
    expect(doc.schemas.createSnapshot)
      .toHaveBeenCalledOnceWith('placement-layout', [[{
        ...shape,
        props: {
          ...shape.props,
          position: {x: 125, y: 80},
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
            position: {x: 125, y: 80},
          },
        }],
      }],
    ])
    expect(insertDepths.every(depth => depth > 0)).toBeTrue()

    manager.destroy()
    rootHost.remove()
  })

  it('keeps an insertion anchored inside the root padding', () => {
    // Content origin sits at (180, 70) in visual px: 100 + 40 * 2 / 50 + 10 * 2.
    // The anchor is up and left of it, i.e. on the editor padding itself.
    const {rootHost, shape, manager, insertedPosition} = makeInsertionHarness({
      padding: '10px 20px 30px 40px',
      selectionRect: new DOMRect(120, 54, 0, 48),
    })

    expect(manager.insertAbsoluteSnapshot(shape)).toBe(shape.id)
    expect(insertedPosition()).toEqual({x: -30, y: -8})

    manager.destroy()
    rootHost.remove()
  })

  it('stops an insertion at the editor edge instead of the content edge', () => {
    const {rootHost, shape, manager, insertedPosition} = makeInsertionHarness({
      padding: '10px 20px 30px 40px',
      selectionRect: new DOMRect(-400, -400, 0, 48),
    })

    expect(manager.insertAbsoluteSnapshot(shape)).toBe(shape.id)
    // -padding-left / -padding-top: the padding box is the outer boundary.
    expect(insertedPosition()).toEqual({x: -40, y: -10})

    manager.destroy()
    rootHost.remove()
  })

  it('publishes the shared Word-like object layout vocabulary', () => {
    expect(BLOCK_OBJECT_LAYOUT_OPTIONS).toEqual([
      {value: 'inline', label: '嵌入型', icon: 'bc_tuwenraopaiqianrushi'},
      {value: 'top-bottom', label: '上下型', icon: 'bc_tuwenraopaishangxiashi'},
      {value: 'under', label: '衬于文字下方', icon: 'bc_cengji-xia'},
      {value: 'over', label: '浮于文字上方', icon: 'bc_cengji-shang'},
    ])
  })

  it('maps object layouts to flow or absolute placement in one transaction', () => {
    const {container, props, block, manager, doc} = makeHarness()

    expect(manager.getObjectLayout(block as any)).toBe('top-bottom')
    expect(manager.setObjectLayout(block as any, 'under')).toBeTrue()
    expect(doc.crud.transact).toHaveBeenCalledTimes(1)
    expect(props['position']).toEqual({x: 125, y: 40})
    expect(props['placementLayer']).toBe('under')
    expect(manager.getObjectLayout(block as any)).toBe('under')

    expect(manager.setObjectLayout(block as any, 'top-bottom')).toBeTrue()
    expect(props['position']).toBeUndefined()
    expect(props['placementLayer']).toBeUndefined()

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

  it('switches modes through structure and preserves the current visual position', () => {
    const {container, props, block, manager} = makeHarness()

    expect(manager.setMode(block as any, 'absolute')).toBeTrue()
    expect(props['position']).toEqual({x: 125, y: 40})

    expect(manager.setMode(block as any, 'relative')).toBeTrue()
    expect(props['position']).toBeUndefined()
    expect(block.updateProps).toHaveBeenCalledTimes(2)

    manager.destroy()
    container.remove()
  })

  it('resolves the nearest flow sibling from the absolute block visual center', () => {
    const {container, block, manager, doc, setAbsolute, rootChildren} = makeHarness()
    setAbsolute()
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
    rootChildren.splice(0, rootChildren.length, tall.id, short.id, 'layout')
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
    const {container, block, manager, doc, setAbsolute, rootChildren} = makeHarness()
    setAbsolute()
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
      props: {position: {x: 0, y: 0}},
      hostElement: absoluteHost,
    }
    const bridge = {id: 'bridge', props: {}, hostElement: bridgeHost}
    rootChildren.splice(0, rootChildren.length, bridge.id, flow.id, 'layout')
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
    const {container, block, manager, doc, rootChildren} = makeHarness()
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

    rootChildren.splice(0, rootChildren.length, block.id, filler.id, anchor.id)
    expect(manager.reanchorToFlow(block as any, {
      parentId: 'root',
      anchorBlockId: anchor.id,
      side: 'before',
    })).toBeTrue()
    expect(doc.crud.moveBlocks).toHaveBeenCalledWith('root', 0, 1, 'root', 1)

    doc.crud.moveBlocks.calls.reset()
    rootChildren.splice(0, rootChildren.length, anchor.id, filler.id, block.id)
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
    const {container, block, manager, doc, rootChildren} = makeHarness()
    rootChildren.splice(0, rootChildren.length, block.id, 'flow')

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

  it('always reanchors from placement-layout to root beside absolute peers', () => {
    const {
      container,
      block,
      manager,
      doc,
      setAbsolute,
      rootChildren,
      layoutChildren,
    } = makeHarness()
    setAbsolute()
    rootChildren.unshift('flow')
    layoutChildren.push('other-absolute')

    expect(manager.reanchorToFlow(block as any, null)).toBeTrue()
    expect(doc.crud.moveBlocks).toHaveBeenCalledOnceWith(
      'layout',
      0,
      1,
      'root',
      1,
    )
    expect(rootChildren).toEqual(['flow', block.id, 'layout'])
    expect(layoutChildren).toEqual(['other-absolute'])

    manager.destroy()
    container.remove()
  })

  it('moves and clears placement in one transaction when returning to flow', () => {
    const {container, props, block, manager, doc, setAbsolute, rootChildren} = makeHarness()
    setAbsolute()
    const flowHost = document.createElement('div')
    container.append(flowHost)
    setRect(block.hostElement, {top: 200, bottom: 240, height: 40})
    setRect(flowHost, {top: 100, bottom: 180, height: 80})
    const flow = {id: 'flow', props: {}, hostElement: flowHost}
    rootChildren.splice(0, rootChildren.length, flow.id, 'layout')
    doc.getBlockById.and.callFake((id: string) => ({
      [block.id]: block,
      [flow.id]: flow,
    })[id] ?? null)

    expect(manager.setMode(block as any, 'relative')).toBeTrue()
    expect(doc.crud.transact).toHaveBeenCalledTimes(1)
    expect(doc.crud.moveBlocks).toHaveBeenCalledWith('layout', 0, 1, 'root', 1)
    expect(props['position']).toBeUndefined()

    manager.destroy()
    container.remove()
  })

  it('updates semantic layers without losing absolute coordinates', () => {
    const {container, props, block, manager, setAbsolute} = makeHarness()
    setAbsolute()

    expect(manager.setLayer(block as any, 'under')).toBeTrue()
    expect(props['position']).toEqual({x: 20, y: 30})
    expect(props['placementLayer']).toBe('under')
    expect(manager.setLayer(block as any, 'over')).toBeTrue()
    expect(props['position']).toEqual({x: 20, y: 30})
    expect(props['placementLayer']).toBeUndefined()

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
    expect(h.propsById.get('under-b')?.['position']).toEqual({x: 0, y: 0})
    expect(h.propsById.get('under-b')?.['placementLayer']).toBeUndefined()

    expect(h.manager.moveBackward(h.blocks['under-b'])).toBeTrue()
    expect(h.crud.transact).toHaveBeenCalledTimes(2)
    expect(h.idsForLayer('under')).toEqual(['under-a', 'under-b'])
    expect(h.idsForLayer('over')).toEqual(['over-a', 'over-b'])
    expect(h.propsById.get('under-b')?.['position']).toEqual({x: 0, y: 0})
    expect(h.propsById.get('under-b')?.['placementLayer']).toBe('under')

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

    h.childrenById.get('layout')!.values.splice(
      h.childrenById.get('layout')!.values.indexOf('under-a'),
      1,
    )
    h.blocks['under-a'].props = h.propsById.get('under-a')
    expect(h.manager.moveForward(h.blocks['under-a'])).toBeFalse()

    h.doc.getBlockById.and.throwError('stale')
    expect(h.manager.canMoveForward(h.blocks['under-b'])).toBeFalse()

    h.manager.destroy()
    h.host.remove()
  })

  it('clears the layer override when setting the default over layer', () => {
    const {container, props, block, manager, setAbsolute} = makeHarness()
    setAbsolute({x: 20, y: 30}, 'under')

    expect(manager.setLayer(block as any, 'over')).toBeTrue()
    expect(props['position']).toEqual({x: 20, y: 30})
    expect(props['placementLayer']).toBeUndefined()

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
        placement: {
          getState: () => ({
            mode: 'absolute',
            x: 0,
            y: 0,
            layer: 'under',
          }),
        },
      },
      _native: {
        id: 'shape-1',
        props: {position: {x: 0, y: 0}, placementLayer: 'under'},
      },
    })

    expect(block.placementZIndex).toBe(0)
    ;(block as any).doc.placement.getState = () => ({
      mode: 'absolute',
      x: 0,
      y: 0,
      layer: 'over',
    })
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
        props: {position: {x: 0, y: 0}},
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
    const {container, block, manager, doc, setAbsolute} = makeHarness()
    setAbsolute({x: 20, y: 30}, 'under')
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

  it('keeps absolute-object editor chrome interactive', () => {
    const {container, manager} = makeHarness()
    const chrome = document.createElement('bc-drag-handle')
    chrome.setAttribute('data-bc-placement-pick-ignore', '')
    container.appendChild(chrome)

    chrome.dispatchEvent(pointer('pointerdown'))

    expect(container.hasAttribute(
      'data-bc-flow-selection-passthrough',
    )).toBeFalse()

    manager.destroy()
    container.remove()
  })

  it('previews pointer movement and commits one placement update on pointerup', () => {
    const {
      container,
      host,
      props,
      block,
      manager,
      doc,
      releaseLease,
      setAbsolute,
    } = makeHarness()
    setAbsolute()

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
    expect(props['position']).toEqual({x: 70, y: 55})
    expect(host.style.transform).toBe('')
    expect(doc.virtualization.acquireBlockViewLease).toHaveBeenCalledOnceWith(['image-1'])
    expect(releaseLease).toHaveBeenCalledTimes(1)
    expect(doc.selection.setSuppressRecalculate).toHaveBeenCalledWith(false)
    expect(block.updateProps).toHaveBeenCalledTimes(1)

    manager.destroy()
    container.remove()
  })

  it('uses the measured placement scale for pointer drag geometry', () => {
    const {container, host, props, block, manager, doc, setAbsolute} = makeHarness()
    setAbsolute()
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

    expect(props['position']).toEqual({x: 45, y: 40})
    expect(host.style.transform).toBe('')

    manager.destroy()
    container.remove()
  })

  it('preserves selection while armed and releases protection after a click', () => {
    const {container, block, manager, doc, setAbsolute} = makeHarness()
    setAbsolute()

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

  it('reprojects the current absolute-object selection after an armed click', () => {
    const {container, block, manager, doc, setAbsolute} = makeHarness()
    setAbsolute()
    ;(doc.selection as any).value = {
      isInSameBlock: true,
      anchor: {type: 'selected', blockId: block.id},
      head: {type: 'selected', blockId: block.id},
    }
    doc.selection.selectBlock.calls.reset()

    expect(manager.startDrag(
      pointer('pointerdown', {clientX: 200, clientY: 100}),
      block as any,
    )).toBeTrue()
    window.dispatchEvent(pointer('pointerup', {clientX: 200, clientY: 100}))

    expect(doc.selection.setSuppressRecalculate.calls.allArgs()).toEqual([
      [true],
      [false],
    ])
    expect(doc.selection.selectBlock).toHaveBeenCalledOnceWith(block)

    manager.destroy()
    container.remove()
  })

  it('releases an absolute drag guard when pointer capture is lost', () => {
    const {container, host, block, manager, doc, setAbsolute} = makeHarness()
    setAbsolute()
    const edge = document.createElement('span')
    host.appendChild(edge)
    const setPointerCapture = spyOn(edge, 'setPointerCapture')
    spyOn(edge, 'hasPointerCapture').and.returnValue(false)
    const releasePointerCapture = spyOn(edge, 'releasePointerCapture')
    const down = pointer('pointerdown', {clientX: 200, clientY: 100})
    Object.defineProperty(down, 'target', {value: edge})

    expect(manager.startDrag(down, block as any)).toBeTrue()
    expect(setPointerCapture).toHaveBeenCalledOnceWith(7)

    edge.dispatchEvent(pointer('lostpointercapture'))

    expect(manager.state).toBe('idle')
    expect(doc.selection.setSuppressRecalculate.calls.allArgs()).toEqual([
      [true],
      [false],
    ])
    expect(releasePointerCapture).not.toHaveBeenCalled()

    manager.destroy()
    container.remove()
  })
})
