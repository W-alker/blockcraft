import {BlockNodeType} from '../../block-std'
import {AbsolutePlacementVisibilityIndex} from './absolute-placement-visibility-index'

describe('AbsolutePlacementVisibilityIndex', () => {
  it('projects persisted root-relative y and model media height', () => {
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['image']),
      image: block('image', [], {
        placement: {mode: 'absolute', x: 25, y: 600},
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

    expect(index.visibleLayoutIds(0, 100, 100)).toEqual([])
    expect(index.visibleLayoutIds(450, 100, 100)).toEqual(['layout'])
    expect(index.visibleLayoutIds(801, 100, 0)).toEqual([])
  })

  it('expands a rotated fixed-size shape around its root-relative y', () => {
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['shape']),
      shape: block('shape', [], {
        placement: {mode: 'absolute', x: 0, y: 400},
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
      placement: {mode: 'absolute', x: 0, y: 800},
      height: 120,
    }
    const doc = createDoc({
      root: block('root', ['layout']),
      layout: block('placement-layout', ['image']),
      image: block('image', [], imageProps),
    })
    const index = new AbsolutePlacementVisibilityIndex(doc as any)
    index.rebuild(['layout'])
    expect(index.visibleLayoutIds(0, 100, 100)).toEqual([])

    imageProps.placement = {mode: 'absolute', x: 0, y: 20}
    index.rebuild(['layout'])

    expect(index.visibleLayoutIds(0, 100, 100)).toEqual(['layout'])
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
