import {BlockNodeType} from '../../framework'
import {RenderUnitBlockSchema, resolveRenderUnitDimensions} from './index'

describe('RenderUnitBlockSchema', () => {
  it('preserves responsive sizes and uses the same root-width basis as images', () => {
    const props = RenderUnitBlockSchema.createSnapshot({}, {wr: 50, ar: 2}).props
    expect(props).toEqual({wr: 50, ar: 2})
    expect(resolveRenderUnitDimensions(props, 800)).toEqual(jasmine.objectContaining({width: 400, height: 200}))
    expect(resolveRenderUnitDimensions(props, 400)).toEqual(jasmine.objectContaining({width: 200, height: 100}))
  })

  it('keeps unsized and invalid regions in natural content layout', () => {
    for (const props of [{}, {wr: 50}, {ar: 2}, {wr: NaN, ar: 2}, {wr: 50, ar: 0}]) {
      expect(resolveRenderUnitDimensions(props, 800)).toBeNull()
    }
    expect(RenderUnitBlockSchema.createSnapshot({}, {wr: Infinity, ar: 2}).props).toEqual({})
  })

  it('clamps ratio width and preserves complete legacy pixel sizes', () => {
    expect(RenderUnitBlockSchema.createSnapshot({}, {wr: 200, ar: 2}).props).toEqual({wr: 100, ar: 2})
    expect(RenderUnitBlockSchema.createSnapshot({}, {width: 400, height: 200}).props)
      .toEqual({width: 400, height: 200})
  })

  it('creates a snapshot with canonical surface props', () => {
    const snapshot = RenderUnitBlockSchema.createSnapshot(
      {incl: ['paragraph']},
      {
        p: [12, 18],
        bgi: "url(\"/assets/paper.png\") 50% 50% / contain no-repeat",

        bgo: 0.4,
        backColor: ' #fff7d6 ',
      },
    )

    expect(snapshot.meta).toEqual({incl: ['paragraph']})
    expect(snapshot.props).toEqual({
      p: [12, 18],
      bgi: "url(\"/assets/paper.png\") 50% 50% / contain no-repeat",

      bgo: 0.4,
      backColor: '#fff7d6',
    })
  })

  it('keeps the existing empty createSnapshot call compatible', () => {
    expect(RenderUnitBlockSchema.createSnapshot().props).toEqual({})
  })

  it('adds vertical padding to model-only child height estimates', () => {
    const estimateHeight = RenderUnitBlockSchema.metadata.virtualization
      ?.estimateHeight
    expect(estimateHeight).toBeDefined()

    const height = estimateHeight!({
      blockId: 'region-1',
      flavour: 'render-unit',
      nodeType: BlockNodeType.block,
      props: {p: [20, 0, 24]},
      childIds: ['paragraph-1', 'paragraph-2'],
      layoutMode: 'paginated',
      fallbackHeight: 48,
      rootContentWidth: 680,
      baseFontSize: 16,
      lineHeight: 24,
      estimateChildHeight: () => 32,
    })

    expect(height).toBe(108)
  })

  it('uses the full sized border box for virtual height without adding padding twice', () => {
    const height = RenderUnitBlockSchema.metadata.virtualization!.estimateHeight!({
      blockId: 'region', flavour: 'render-unit', nodeType: BlockNodeType.block,
      props: {wr: 50, ar: 2, p: 16}, childIds: ['paragraph'], layoutMode: 'flow',
      fallbackHeight: 48, rootContentWidth: 800, baseFontSize: 16, lineHeight: 24,
      estimateChildHeight: () => 300,
    })
    expect(height).toBe(200)
  })
})
