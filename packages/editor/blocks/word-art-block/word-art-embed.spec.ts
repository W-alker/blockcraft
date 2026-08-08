import {
  createInlineWordArtDelta,
  inlineWordArtEmbedConverter,
  readInlineWordArtDelta,
} from './word-art-embed'

describe('inline WordArt embed', () => {
  it('preserves presentation, text and inline layout without placement props', () => {
    const delta = createInlineWordArtDelta({
      width: 280,
      height: 88,
      rotation: 12,
      fontFamily: 'serif',
      fontSize: 42,
      fillType: 'solid',
      fillColor: '#FF0000',
      placement: {mode: 'absolute', x: 10, y: 30},
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
    expect(data.props.fontFamily).toBe('serif')
    expect(data.props.rotation).toBe(12)
    expect(data.props.placement).toBeUndefined()
    expect(data.text).toEqual([{insert: '发布会'}])
    expect(data.width).toBe(280)
    expect(data.height).toBe(88)
  })
})
