import {BlockNodeType} from '../../block-std'
import {AbsolutePlacementVisibilityIndex} from './absolute-placement-visibility-index'

describe('AbsolutePlacementVisibilityIndex', () => {
  it('projects persisted root-relative y and model media height', () => {
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['image']),
      image: block('image', [], {
        position: {x: 25, y: 600},
        wr: 50,
        ar: 2,
      }),
    })
    doc.objectSizing.resolve.and.callFake((flavour: string) =>
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
    )
    const index = new AbsolutePlacementVisibilityIndex(doc as any)

    index.rebuild(['layout'])

    expect(index.bottom).toBeGreaterThan(0)
    expect(index.visibleLayoutIds(0, 100, 100)).toEqual([])
    expect(index.visibleLayoutIds(450, 100, 100)).toEqual(['layout'])
    expect(index.visibleLayoutIds(801, 100, 0)).toEqual([])
  })

  it('expands a rotated fixed-size shape around its root-relative y', () => {
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['shape']),
      shape: block('shape', [], {
        position: {x: 0, y: 400},
        width: 200,
        height: 100,
        rotation: 90,
      }),
    })
    const index = new AbsolutePlacementVisibilityIndex(doc as any)

    index.rebuild(['layout'])

    // A 90° rotation grows the visual vertical extent from 100px to 200px,
    // centered around the unrotated box.
    expect(index.visibleLayoutIds(350, 1, 0)).toEqual(['layout'])
    expect(index.visibleLayoutIds(348, 1, 0)).toEqual([])
  })

  it('rebuilds moved objects without retaining stale visibility bands', () => {
    const imageProps = {
      position: {x: 0, y: 800},
      height: 120,
    }
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['image']),
      image: block('image', [], imageProps),
    })
    const index = new AbsolutePlacementVisibilityIndex(doc as any)
    index.rebuild(['layout'])
    expect(index.bottom).toBeGreaterThan(0)
    expect(index.visibleLayoutIds(0, 100, 100)).toEqual([])

    imageProps.position = {x: 0, y: 20}
    index.rebuild(['layout'])

    expect(index.visibleLayoutIds(0, 100, 100)).toEqual(['layout'])
  })
  it('includes freely positioned objects and drops the extent when the last object is removed', () => {
    const layout = block('placement-layout', ['image'])
    const doc = createDoc({
      root: block('root', ['layout']), layout,
      image: block('image', [], {position: {x: 0, y: 800}, height: 120}),
    })
    ;(doc as any).placement = {surface: {measuredWidth: () => undefined, measuredHeight: () => undefined}}
    const index = new AbsolutePlacementVisibilityIndex(doc as any)
    index.rebuild(['layout'])
    expect(index.bottom).toBe(920)
    expect(index.visibleLayoutIds(910, 1, 0)).toEqual(['layout'])
    layout.children = []
    index.rebuild(['layout'])
    expect(index.bottom).toBe(0)
  })

  it('refreshes a measured band once without another model edit', () => {
    const doc = createDoc({
      root: block('root', ['layout']), layout: block('placement-layout', ['image']),
      image: block('image', [], {position: {x: 0, y: 800}, height: 120}),
    })
    const surface = {revision: 0, measuredWidth: () => undefined, measuredHeight: () => 150}
    ;(doc as any).placement = {surface}
    const index = new AbsolutePlacementVisibilityIndex(doc as any)
    index.rebuild(['layout'])
    expect(index.visibleLayoutIds(1000, 1, 0)).toEqual([])
    surface.measuredHeight = () => 350
    surface.revision++
    expect(index.visibleLayoutIds(1000, 1, 0)).toEqual(['layout'])
    const getProps = spyOn(doc.model, 'getProps').and.callThrough()
    index.visibleLayoutIds(1010, 1, 0)
    expect(getProps).not.toHaveBeenCalled()
  })

})

function block(
  flavour: string,
  children: string[],
  props: Record<string, any> = {},
) {
  return {
    flavour,
    nodeType: BlockNodeType.block,
    props,
    children,
  }
}

function createDoc(
  blocks: Record<string, ReturnType<typeof block>>,
) {
  return {
    model: {
      getFlavour: (id: string) => blocks[id]?.flavour,
      getNodeType: (id: string) => blocks[id]?.nodeType,
      getProps: (id: string) => blocks[id]?.props,
      getChildrenIds: (id: string) => blocks[id]?.children ?? [],
      getTextDeltas: () => [],
    },
    objectSizing: {
      rootContentWidth: 800,
      resolve: jasmine.createSpy('resolve').and.returnValue(null),
    },
  }
}
