import {resolveObjectDimensions} from '../block-object-sizing.manager'
import {
  BLOCK_OBJECT_GROUP_PADDING,
  BlockPlacementManager,
} from '../block-placement.manager'
import {BehaviorSubject} from 'rxjs'

describe('BlockPlacement group commands', () => {
  function makeHarness() {
    const children = new Map<string, string[]>([
      ['root', ['layout']],
      ['layout', ['image', 'shape']],
      ['image', []],
      ['shape', []],
    ])
    const flavours = new Map<string, string>([
      ['root', 'root'],
      ['layout', 'placement-layout'],
      ['image', 'image'],
      ['shape', 'shape'],
    ])
    const props = new Map<string, Record<string, any>>([
      ['root', {}],
      ['layout', {}],
      ['image', {wr: 50, ar: 2, position: {x: 100, y: 100}}],
      ['shape', {
        width: 100,
        height: 40,
        rotation: 90,
        position: {x: 520, y: 100},
      }],
    ])
    const parentOf = (id: string): string | null => {
      for (const [parentId, ids] of children) {
        if (ids.includes(id)) return parentId
      }
      return null
    }
    const imageCapability = {defaultWr: 100, defaultAr: 4 / 3}
    const readonlyIds = new Set<string>()
    const blocks = new Map<string, any>()
    const getBlockById = (id: string) => {
      if (!flavours.has(id)) return null
      const existing = blocks.get(id)
      if (existing) return existing
      const block = {
        id,
        hostElement: document.createElement('div'),
        get flavour() { return flavours.get(id) },
        get parentId() { return parentOf(id) },
        get props() { return props.get(id) ?? {} },
        updateProps: (patch: Record<string, any>) => {
          const target = props.get(id)!
          Object.entries(patch).forEach(([key, value]) => {
            if (value === null) delete target[key]
            else target[key] = value
          })
        },
        changeDetectorRef: {markForCheck() {}},
      }
      blocks.set(id, block)
      return block
    }
    let manager!: BlockPlacementManager
    const doc: any = {
      isReadonly: false,
      config: {},
      rootId: 'root',
      root: {id: 'root', childrenIds: children.get('root')},
      readonlySwitch$: new BehaviorSubject(false),
      onDestroy$: {subscribe: () => ({unsubscribe() {}})},
      schemas: {
        get: (flavour: string) => ({
          metadata: {
            ...(flavour === 'image' ? {objectSizing: imageCapability} : {}),
            ...(['image', 'shape', 'object-group'].includes(flavour)
              ? {placement: {modes: flavour === 'object-group'
                ? ['relative', 'absolute']
                : ['absolute']}}
              : {}),
          },
        }),
        createSnapshot: (
          flavour: string,
          [groupProps]: [Record<string, unknown>],
        ) => ({
          id: 'group',
          flavour,
          nodeType: 'block',
          props: {...groupProps},
          meta: {},
          children: [],
        }),
      },
      model: {
        getChildrenIds: (id: string) => [...(children.get(id) ?? [])],
        getParentId: parentOf,
        getFlavour: (id: string) => flavours.get(id),
        getProps: (id: string) => props.get(id) ?? {},
      },
      getBlockById,
      readonlyManager: {
        isReadonly: (id: string | {id: string}) =>
          readonlyIds.has(typeof id === 'string' ? id : id.id),
        containsReadonly: () => false,
      },
      crud: {
        getYBlock: (id: string) => ({
          get: (key: string) => key === 'children'
            ? {toArray: () => [...(children.get(id) ?? [])]}
            : key === 'props'
              ? {toJSON: () => ({...(props.get(id) ?? {})})}
              : undefined,
        }),
        transact: (fn: () => void) => fn(),
        insertBlockSnapshots: (
          parentId: string,
          index: number,
          snapshots: any[],
        ) => {
          snapshots.forEach(snapshot => {
            flavours.set(snapshot.id, snapshot.flavour)
            props.set(snapshot.id, {...snapshot.props})
            children.set(snapshot.id, [])
          })
          const ids = snapshots.map(snapshot => snapshot.id)
          children.get(parentId)!.splice(index, 0, ...ids)
          return ids
        },
        updateBlockProps: (id: string, patch: Record<string, any>) => {
          const target = props.get(id)!
          Object.entries(patch).forEach(([key, value]) => {
            if (value === null) delete target[key]
            else target[key] = value
          })
        },
        moveBlocks: (
          parentId: string,
          index: number,
          count: number,
          targetId: string,
          targetIndex: number,
        ) => {
          const moved = children.get(parentId)!.splice(index, count)
          children.get(targetId)!.splice(targetIndex, 0, ...moved)
        },
        deleteBlocks: (parentId: string, index: number, count: number) => {
          const removed = children.get(parentId)!.splice(index, count)
          removed.forEach(id => {
            children.delete(id)
            props.delete(id)
            flavours.delete(id)
          })
        },
      },
      selection: {value: null},
      dragController: {state: 'idle'},
      ngZone: {runOutsideAngular: (fn: () => void) => fn()},
      logger: {
        info: jasmine.createSpy('logger.info'),
        warn: jasmine.createSpy('logger.warn'),
      },
    }
    doc.objectSizing = {
      rootContentWidth: 800,
      getCapability: (flavour: string) =>
        flavour === 'image' ? imageCapability : null,
      resolve: (flavour: string, value: Record<string, unknown>) =>
        flavour === 'image'
          ? resolveObjectDimensions(value, 800, imageCapability)
          : null,
      getReferenceWidth: (id: string) => {
        const parentId = parentOf(id)
        return parentId === 'group'
          ? props.get('group')!['width'] - BLOCK_OBJECT_GROUP_PADDING * 2
          : 800
      },
      resolveForBlock: (
        id: string,
        flavour: string,
        value: Record<string, unknown>,
      ) => flavour === 'image'
        ? resolveObjectDimensions(
            value,
            parentOf(id) === 'group'
              ? props.get('group')!['width'] - BLOCK_OBJECT_GROUP_PADDING * 2
              : 800,
            imageCapability,
          )
        : null,
    }
    manager = new BlockPlacementManager(doc)
    doc.placement = manager
    return {
      manager,
      children,
      props,
      flavours,
      readonlyIds,
      logger: doc.logger,
    }
  }

  it('groups fixed and ratio-sized objects into one fixed local plane', () => {
    const h = makeHarness()

    expect(h.manager.canGroup(['shape', 'image'])).toBeTrue()
    expect(h.manager.group(['shape', 'image'])).toBe('group')

    expect(h.children.get('layout')).toEqual(['group'])
    expect(h.children.get('group')).toEqual(['image', 'shape'])
    expect(h.props.get('group')).toEqual({
      width: 506,
      height: 246,
      position: {x: 92, y: 62},
    })
    expect(h.props.get('image')).toEqual(jasmine.objectContaining({
      wr: 81.6327,
      ar: 2,
      position: {x: 0, y: 30},
    }))
    expect(h.props.get('shape')!['position']).toEqual({x: 420, y: 30})
    expect(h.manager.isInObjectGroup('image')).toBeTrue()
    expect(h.manager.getState('image').mode).toBe('absolute')
    expect(h.manager.supports('image', 'relative')).toBeFalse()
    expect(h.manager.supportsObjectLayout('image', 'top-bottom')).toBeFalse()
    expect(h.manager.canMoveForward('image')).toBeFalse()
    expect(h.manager.canMoveBackward('image')).toBeFalse()
    expect(h.manager.setLayer('image', 'under')).toBeFalse()
    expect(h.props.get('image')!['placementLayer']).toBeUndefined()
  })

  it('ungroups children back to root coordinates and root-relative image width', () => {
    const h = makeHarness()
    h.manager.group(['image', 'shape'])

    expect(h.manager.ungroup('group')).toEqual(['image', 'shape'])

    expect(h.children.get('layout')).toEqual(['image', 'shape'])
    expect(h.flavours.has('group')).toBeFalse()
    expect(h.props.get('image')).toEqual(jasmine.objectContaining({
      wr: 50,
      ar: 2,
      position: {x: 100, y: 100},
    }))
    expect(h.props.get('shape')!['position']).toEqual({x: 520, y: 100})
  })

  it('moves the whole group to top-bottom flow without changing local members', () => {
    const h = makeHarness()
    h.manager.group(['image', 'shape'])
    const imageBefore = structuredClone(h.props.get('image'))
    const shapeBefore = structuredClone(h.props.get('shape'))

    expect(h.manager.supportsObjectLayout('group', 'top-bottom')).toBeTrue()
    expect(h.manager.setObjectLayout('group', 'top-bottom')).toBeTrue()

    expect(h.children.get('root')).toEqual(['group', 'layout'])
    expect(h.children.get('layout')).toEqual([])
    expect(h.children.get('group')).toEqual(['image', 'shape'])
    expect(h.props.get('group')!['position']).toBeUndefined()
    expect(h.props.get('group')!['placementLayer']).toBeUndefined()
    expect(h.props.get('image')).toEqual(imageBefore)
    expect(h.props.get('shape')).toEqual(shapeBefore)
    expect(h.manager.getObjectLayout('group')).toBe('top-bottom')
    expect(h.manager.supportsObjectLayout('image', 'top-bottom')).toBeFalse()
  })

  it('keeps a top-bottom group in flow when member geometry tightens its frame', () => {
    const h = makeHarness()
    h.manager.group(['image', 'shape'])
    h.manager.setObjectLayout('group', 'top-bottom')

    expect(h.manager.updateAbsolute('image', {x: -50, y: 30})).toBeTrue()

    expect(h.children.get('root')).toEqual(['group', 'layout'])
    expect(h.children.get('layout')).toEqual([])
    expect(h.props.get('group')!['position']).toBeUndefined()
    expect(h.manager.getObjectLayout('group')).toBe('top-bottom')
    expect(h.props.get('image')!['position']).toEqual({x: 0, y: 30})
  })

  it('rejects mixed layers and non-contiguous ranges', () => {
    const h = makeHarness()
    h.props.get('shape')!['placementLayer'] = 'under'
    expect(h.manager.canGroup(['image', 'shape'])).toBeFalse()

    h.props.get('shape')!['placementLayer'] = undefined
    h.children.get('layout')!.splice(1, 0, 'gap')
    h.flavours.set('gap', 'shape')
    h.props.set('gap', {width: 10, height: 10, position: {x: 0, y: 0}})
    h.children.set('gap', [])
    expect(h.manager.canGroup(['image', 'shape'])).toBeFalse()
  })

  it('rejects grouping before mutation when a selected object is readonly', () => {
    const h = makeHarness()
    h.readonlyIds.add('shape')

    expect(h.manager.canGroup(['image', 'shape'])).toBeFalse()
    expect(h.manager.group(['image', 'shape'])).toBeNull()
    expect(h.children.get('layout')).toEqual(['image', 'shape'])
  })

  it('tightens bounds after a member move and preserves responsive image pixels', () => {
    const h = makeHarness()
    h.manager.group(['image', 'shape'])
    h.logger.info.calls.reset()

    expect(h.manager.updateAbsolute('shape', {x: 600, y: 30})).toBeTrue()

    expect(h.props.get('group')).toEqual({
      width: 686,
      height: 246,
      position: {x: 92, y: 62},
    })
    expect(h.props.get('image')).toEqual(jasmine.objectContaining({
      wr: 59.7015,
      ar: 2,
      position: {x: 0, y: 30},
    }))
    expect(h.props.get('shape')!['position']).toEqual({x: 600, y: 30})

    const [message, metrics] = h.logger.info.calls.mostRecent().args
    expect(message).toMatch(/^\[ObjectGroup\]\[performance\] reflow \d+\.\d{3}ms$/)
    expect(metrics).toEqual(jasmine.objectContaining({
      groupId: 'group',
      reason: 'geometry-commit',
      members: 2,
      changed: true,
    }))
  })

  it('rebases every local position when a member crosses the group origin', () => {
    const h = makeHarness()
    h.manager.group(['image', 'shape'])

    expect(h.manager.updateAbsolute('image', {x: -50, y: 30})).toBeTrue()

    expect(h.props.get('group')).toEqual({
      width: 556,
      height: 246,
      position: {x: 42, y: 62},
    })
    expect(h.props.get('image')).toEqual(jasmine.objectContaining({
      wr: 74.0741,
      position: {x: 0, y: 30},
    }))
    expect(h.props.get('shape')!['position']).toEqual({x: 470, y: 30})
  })
})
