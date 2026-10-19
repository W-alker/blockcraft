import {BlockNodeType, TYPOGRAPHY_FONT_FAMILIES} from '../../framework'
import {RenderUnitBlockSchema, applyRegionBorders, applyRenderUnitTypography, resolveRenderUnitDimensions, resolveRenderUnitWidth} from './index'

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

  it('preserves an independent width without inventing a fixed height', () => {
    for (const [input, normalized, width] of [
      [{wr: 50, ar: null}, {wr: 50}, 400],
      [{wr: 200}, {wr: 100}, 800],
      [{width: 320, height: null}, {width: 320}, 320],
      [{wr: NaN, width: 320}, {width: 320}, 320],
      [{wr: -1, width: Infinity}, {}, null],
      [{ar: 2, height: 200}, {}, null],
    ] as const) {
      const props = RenderUnitBlockSchema.createSnapshot({}, input).props
      expect(props).toEqual(normalized)
      expect(resolveRenderUnitWidth(props, 800)).toBe(width)
      expect(resolveRenderUnitDimensions(props, 800)).toBeNull()
    }
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

  it('keeps optional background opacity bounded without changing legacy defaults', () => {
    expect(RenderUnitBlockSchema.createSnapshot({}, {backOpacity: 0.6}).props)
      .toEqual({backOpacity: 0.6})
    expect(RenderUnitBlockSchema.createSnapshot({}, {backOpacity: 2}).props)
      .toEqual({backOpacity: 1})
    expect(RenderUnitBlockSchema.createSnapshot({}, {backOpacity: NaN}).props)
      .toEqual({})
  })

  it('keeps the existing empty createSnapshot call compatible', () => {
    expect(RenderUnitBlockSchema.createSnapshot().props).toEqual({})
  })

  it('compacts equal borders and catalog fonts while preserving distinct sides and custom fonts', () => {
    const uniform = {top: '2px solid #123456', right: '2px solid #123456',
      bottom: '2px solid #123456', left: '2px solid #123456'}
    expect(RenderUnitBlockSchema.createSnapshot({}, {
      borders: uniform, textFamily: TYPOGRAPHY_FONT_FAMILIES.find(font => font.id === 'arial')!.css,
    }).props).toEqual({border: '2px solid #123456', textFamily: 'arial'})
    expect(RenderUnitBlockSchema.createSnapshot({}, {
      borders: {top: 'none', left: '1px dotted #abcdef'},
      textFamily: 'Acme Custom, serif',
    }).props).toEqual({
      border: 'none', borderLeft: '1px dotted #abcdef',
      textFamily: 'Acme Custom, serif',
    })
  })

  it('projects the base border and side override, then clears both', () => {
    const host = document.createElement('div')
    applyRegionBorders(host, {border: '2px solid #123456', borderLeft: 'none'})
    expect(host.style.getPropertyValue('--bc-region-border-top')).toBe('2px solid #123456')
    expect(host.style.getPropertyValue('--bc-region-border-left')).toBe('none')
    expect(host.hasAttribute('data-bc-region-borders')).toBeTrue()
    applyRegionBorders(host, {})
    expect(host.hasAttribute('data-bc-region-borders')).toBeFalse()
  })

  it('normalizes region text defaults and clears their projected styles', () => {
    const props = RenderUnitBlockSchema.createSnapshot({}, {
      textFamily: 'serif', textFont: '22px 700 italic',
      textSpacing: '0.05em 1.5', textFill: '#224466',
    }).props
    const host = document.createElement('div')
    applyRenderUnitTypography(host, props)
    expect(host.style.getPropertyValue('--bc-render-unit-text-font-size')).toBe('22px')
    expect(host.style.getPropertyValue('--bc-render-unit-text-font-weight')).toBe('700')
    expect(host.style.getPropertyValue('--bc-render-unit-text-color')).toBe('rgba(34, 68, 102, 1)')
    applyRenderUnitTypography(host, {})
    expect(host.style.getPropertyValue('--bc-render-unit-text-font-size')).toBe('')
    expect(host.style.getPropertyValue('--bc-render-unit-text-color')).toBe('')
  })

  it('adds vertical padding to model-only child height estimates', () => {
    const estimateHeight = RenderUnitBlockSchema.metadata.virtualization
      ?.estimateHeight
    expect(estimateHeight).toBeDefined()

    const height = estimateHeight!({
      blockId: 'region-1',
      flavour: 'render-unit',
      nodeType: BlockNodeType.block,
      props: {p: [20, 0, 24], wr: 50},
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
