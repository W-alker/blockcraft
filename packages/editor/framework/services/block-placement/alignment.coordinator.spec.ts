import {BlockPlacementAlignmentCoordinator} from './alignment.coordinator'
import {
  resolvePlacementObjectGeometry,
  resolvePlacementObjectVisualBounds,
} from './object-geometry'
import {BlockPlacementRuntime} from './runtime'

describe('BlockPlacementAlignmentCoordinator', () => {
  it('aligns rotation-aware visual left edges in one model transaction', () => {
    const {coordinator, doc, propsById, transact, updateBlockProps} =
      makeAlignmentHarness()

    expect(coordinator.alignObjects(
      ['shape-a', 'image-b', 'shape-c'],
      'left',
    )).toBeTrue()
    expect(transact).toHaveBeenCalledTimes(1)
    expect(updateBlockProps).toHaveBeenCalledTimes(2)
    expect(propsById.get('shape-a')!['position']).toEqual({x: 10, y: 20})
    expect(propsById.get('image-b')!['position']).toEqual({x: 10, y: 40})
    expect(propsById.get('shape-c')!['position']).toEqual({x: 5, y: 80})
    expect(propsById.get('image-b')!['wr']).toBe(20)
    expect(propsById.get('image-b')!['ar']).toBe(2)
    expect(propsById.get('shape-c')!['width']).toBe(20)
    expect(propsById.get('shape-c')!['height']).toBe(10)

    const visualLefts = ['shape-a', 'image-b', 'shape-c'].map(id => {
      const geometry = resolvePlacementObjectGeometry(doc as any, id)!
      return resolvePlacementObjectVisualBounds(geometry).left
    })
    expect(visualLefts).toEqual([10, 10, 10])
  })

  it('centers all selected objects on both average axes', () => {
    const {coordinator, propsById} = makeAlignmentHarness()

    expect(coordinator.alignObjects(['shape-a', 'image-b'], 'center')).toBeTrue()
    expect(propsById.get('shape-a')!['position']).toEqual({x: 35, y: 32.5})
    expect(propsById.get('image-b')!['position']).toEqual({x: 25, y: 27.5})
  })

  it('supports independent horizontal and vertical center alignment', () => {
    const horizontal = makeAlignmentHarness()
    expect(horizontal.coordinator.alignObjects(
      ['shape-a', 'image-b'],
      'horizontal-center',
    )).toBeTrue()
    expect(horizontal.propsById.get('shape-a')!['position'])
      .toEqual({x: 35, y: 20})
    expect(horizontal.propsById.get('image-b')!['position'])
      .toEqual({x: 25, y: 40})

    const vertical = makeAlignmentHarness()
    expect(vertical.coordinator.alignObjects(
      ['shape-a', 'image-b'],
      'vertical-center',
    )).toBeTrue()
    expect(vertical.propsById.get('shape-a')!['position'])
      .toEqual({x: 10, y: 32.5})
    expect(vertical.propsById.get('image-b')!['position'])
      .toEqual({x: 50, y: 27.5})
  })

  it('requires three objects for distribution and keeps endpoint centers fixed', () => {
    const {coordinator, propsById} = makeAlignmentHarness()

    expect(coordinator.canAlignObjects(
      ['shape-a', 'image-b'],
      'horizontal-distribute',
    )).toBeFalse()
    expect(coordinator.canAlignObjects(
      ['shape-a', 'image-b', 'shape-c'],
      'horizontal-distribute',
    )).toBeTrue()
    expect(coordinator.alignObjects(
      ['shape-a', 'image-b', 'shape-c'],
      'horizontal-distribute',
    )).toBeTrue()
    expect(propsById.get('shape-a')!['position']).toEqual({x: 10, y: 20})
    expect(propsById.get('image-b')!['position']).toEqual({x: 45, y: 40})
    expect(propsById.get('shape-c')!['position']).toEqual({x: 100, y: 80})
  })

  it('distributes vertical centers without changing the endpoints', () => {
    const {coordinator, propsById} = makeAlignmentHarness()

    expect(coordinator.alignObjects(
      ['shape-a', 'image-b', 'shape-c'],
      'vertical-distribute',
    )).toBeTrue()
    expect(propsById.get('shape-a')!['position']).toEqual({x: 10, y: 20})
    expect(propsById.get('image-b')!['position']).toEqual({x: 50, y: 45})
    expect(propsById.get('shape-c')!['position']).toEqual({x: 100, y: 80})
  })

  it('allows mixed layers and an existing group as alignment objects', () => {
    const {coordinator, propsById} = makeAlignmentHarness()

    expect(coordinator.canAlignObjects(['shape-a', 'object-group'])).toBeTrue()
    expect(coordinator.alignObjects(
      ['shape-a', 'object-group'],
      'bottom',
    )).toBeTrue()
    expect(propsById.get('shape-a')!['position']).toEqual({x: 10, y: 50})
    expect(propsById.get('object-group')!['position']).toEqual({x: 150, y: 20})
  })

  it('rejects the whole command when any selected object is readonly', () => {
    const {coordinator, readonlyIds, transact} = makeAlignmentHarness()
    readonlyIds.add('image-b')

    expect(coordinator.alignObjects(['shape-a', 'image-b'], 'right')).toBeFalse()
    expect(transact).not.toHaveBeenCalled()
  })
})

function makeAlignmentHarness() {
  const propsById = new Map<string, Record<string, unknown>>([
    ['shape-a', {
      position: {x: 10, y: 20},
      placementLayer: 'under',
      width: 20,
      height: 10,
    }],
    ['image-b', {
      position: {x: 50, y: 40},
      wr: 20,
      ar: 2,
    }],
    ['shape-c', {
      position: {x: 100, y: 80},
      width: 20,
      height: 10,
      rotation: 90,
    }],
    ['object-group', {
      position: {x: 150, y: 20},
      width: 50,
      height: 40,
    }],
  ])
  const flavours = new Map<string, string>([
    ['layout', 'placement-layout'],
    ['shape-a', 'shape'],
    ['image-b', 'image'],
    ['shape-c', 'shape'],
    ['object-group', 'object-group'],
  ])
  const readonlyIds = new Set<string>()
  const transact = jasmine.createSpy('transact').and.callFake(
    (callback: () => void) => callback(),
  )
  const updateBlockProps = jasmine.createSpy('updateBlockProps').and.callFake(
    (id: string, patch: Record<string, unknown>) => {
      Object.assign(propsById.get(id)!, patch)
    },
  )
  const doc = {
    isReadonly: false,
    model: {
      getFlavour: (id: string) => flavours.get(id),
      getProps: (id: string) => propsById.get(id),
      getParentId: (id: string) => propsById.has(id) ? 'layout' : null,
    },
    schemas: {
      get: (flavour: string) => ({
        metadata: flavour === 'placement-layout'
          ? {}
          : {placement: {modes: ['absolute']}},
      }),
    },
    objectSizing: {
      rootContentWidth: 200,
      getCapability: (flavour: string) => flavour === 'image'
        ? {defaultWr: 100, defaultAr: 1}
        : null,
    },
    readonlyManager: {
      isReadonly: (id: string) => readonlyIds.has(id),
      containsReadonly: (id: string) => readonlyIds.has(id),
    },
    crud: {transact, updateBlockProps},
  }
  const runtime = new BlockPlacementRuntime(doc as any)
  const coordinator = new BlockPlacementAlignmentCoordinator(
    doc as any,
    runtime,
  )
  return {
    coordinator,
    doc,
    propsById,
    readonlyIds,
    transact,
    updateBlockProps,
  }
}
