import {BlockNodeType} from '../../framework'
import {RenderUnitBlockSchema} from './index'

describe('RenderUnitBlockSchema', () => {
  it('creates a snapshot with canonical surface props', () => {
    const snapshot = RenderUnitBlockSchema.createSnapshot(
      {incl: ['paragraph']},
      {
        p: [12, 18],
        bgi: ' /assets/paper.png ',
        bgs: 'contain',
        bgo: 0.4,
        backColor: ' #fff7d6 ',
      },
    )

    expect(snapshot.meta).toEqual({incl: ['paragraph']})
    expect(snapshot.props).toEqual({
      p: [12, 18],
      bgi: '/assets/paper.png',
      bgs: 'contain',
      bgx: 50,
      bgy: 50,
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
})
