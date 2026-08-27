import {
  createInlineWordArtDelta,
  inlineWordArtEmbedConverter,
  readInlineWordArtDelta,
} from '.'
import {
  normalizeBlockObjectFormat,
  storeObjectTextStyle,
} from '../../framework'
import {WORD_ART_OBJECT_FORMAT_CAPABILITY} from '../../blocks/word-art-block/word-art.types'

describe('inline WordArt embed', () => {
  it('preserves presentation, text and inline layout without placement props', () => {
    const delta = createInlineWordArtDelta({
      width: 280,
      height: 88,
      rotation: 12,
      textStyle: storeObjectTextStyle({
        ...WORD_ART_OBJECT_FORMAT_CAPABILITY.defaults.textStyle!,
        fontFamily: 'serif',
        fontSize: 42,
        fill: {
          type: 'solid', color: '#FF0000',
          opacity: 1,
        },
        outline: {
          ...WORD_ART_OBJECT_FORMAT_CAPABILITY.defaults.textStyle!.outline,
          type: 'line', color: '#111111', width: 1.26,
        },
        effects: {
          ...WORD_ART_OBJECT_FORMAT_CAPABILITY.defaults.textStyle!.effects,
          shadow: {
            ...WORD_ART_OBJECT_FORMAT_CAPABILITY.defaults.textStyle!.effects.shadow,
            enabled: true, color: '#7C2D12', opacity: .3,
          },
        },
      }),
      position: {x: 10, y: 30},
      placementLayer: 'under',
    }, [{insert: '发布会'}])

    const view = inlineWordArtEmbedConverter.toView(delta)
    expect(view.matches(
      '.bc-inline-object-shell[data-bc-inline-object="word-art"]',
    )).toBeTrue()
    const text = view.querySelector<HTMLElement>('.bc-inline-word-art__text')!
    expect(text.textContent).toBe('发布会')
    expect(text.style.fontSize).toBe('42px')
    expect(text.style.color).toBe('rgb(255, 0, 0)')
    expect(text.style.webkitTextFillColor).toBe('rgb(255, 0, 0)')
    expect(text.style.backgroundImage).toBe('none')
    expect(text.style.backgroundClip).toBe('text')
    expect(text.style.getPropertyValue('-webkit-background-clip')).toBe('text')
    expect(text.style.getPropertyValue('-webkit-text-stroke'))
      .toContain('0.03em')
    expect(text.style.textShadow).toContain('rgba(124, 45, 18, 0.3)')
    expect(text.style.transform).toBe('')
    expect(view.querySelector('svg')).toBeNull()

    const data = readInlineWordArtDelta(
      inlineWordArtEmbedConverter.toDelta(view),
    )
    expect(normalizeBlockObjectFormat(
      data.props,
      WORD_ART_OBJECT_FORMAT_CAPABILITY,
    ).textStyle?.fontFamily).toBe('serif')
    expect(data.props.rotation).toBe(12)
    expect(data.props['position']).toBeUndefined()
    expect(data.props['placementLayer']).toBeUndefined()
    expect(data.text).toEqual([{insert: '发布会'}])
    expect(data.width).toBe(280)
    expect(data.height).toBe(88)
  })

  it('drops legacy text-side metadata from wrapped WordArt', () => {
    const delta = createInlineWordArtDelta(
      {width: 240, height: 80},
      [{insert: '旧艺术字'}],
      {wrap: true, x: 0.25, gap: 12},
    )
    delta.attributes = {...delta.attributes, side: 'right'}

    const view = inlineWordArtEmbedConverter.toView(delta)
    expect(view.dataset['bcInlineFloatSide']).toBe('auto')
    expect(readInlineWordArtDelta(delta)).not.toEqual(
      jasmine.objectContaining({side: jasmine.anything()}),
    )
    expect(inlineWordArtEmbedConverter.toDelta(view).attributes?.['side'])
      .toBeUndefined()
  })
})
