import {
  createInlineShapeDelta,
  inlineShapeEmbedConverter,
  readInlineShapeDelta,
} from './shape-embed'

describe('inline shape embed', () => {
  it('preserves shape props, text and wrap layout through the DOM converter', () => {
    const delta = createInlineShapeDelta({
      shapeType: 'ellipse',
      width: 210,
      height: 130,
      rotation: 25,
      fillColor: '#93C5FD',
      fillOpacity: 0.7,
      strokeColor: '#2563EB',
      strokeWidth: 3,
      strokeStyle: 'dashed',
      textColor: '#0F172A',
      shapeTextAlign: 'right',
      verticalAlign: 'bottom',
      position: {x: 12, y: 40},
      placementLayer: 'under',
    }, [{insert: '流程图'}], {
      wrap: true,
      x: 0.4,
      gap: 16,
    })

    const view = inlineShapeEmbedConverter.toView(delta)
    expect(view.matches(
      '.bc-inline-object-shell[data-bc-inline-object="shape"]',
    )).toBeTrue()
    expect(view.dataset['bcInlineFloatLayout']).toBe('wrap')
    expect(view.querySelector('path')?.getAttribute('stroke-dasharray'))
      .toBe('10 7')
    expect(view.querySelector('.bc-inline-shape__text')?.textContent)
      .toBe('流程图')

    const roundTrip = inlineShapeEmbedConverter.toDelta(view)
    const data = readInlineShapeDelta(roundTrip)
    expect(data.props.shapeType).toBe('ellipse')
    expect(data.props.rotation).toBe(25)
    expect(data.props['position']).toBeUndefined()
    expect(data.props['placementLayer']).toBeUndefined()
    expect(data.text).toEqual([{insert: '流程图'}])
    expect(data).toEqual(jasmine.objectContaining({
      width: 210,
      height: 130,
      wrap: true,
      x: 0.4,
      gap: 16,
    }))
    expect(roundTrip.attributes?.['side']).toBeUndefined()
  })

  it('drops legacy text-side metadata and always renders automatic wrapping', () => {
    const delta = createInlineShapeDelta(
      {shapeType: 'ellipse'},
      [{insert: '旧形状'}],
      {wrap: true, x: 0.2, gap: 12},
    )
    delta.attributes = {...delta.attributes, side: 'left'}

    const view = inlineShapeEmbedConverter.toView(delta)
    expect(view.dataset['bcInlineFloatSide']).toBe('auto')
    expect(readInlineShapeDelta(delta)).not.toEqual(
      jasmine.objectContaining({side: jasmine.anything()}),
    )
    expect(inlineShapeEmbedConverter.toDelta(view).attributes?.['side'])
      .toBeUndefined()
  })

  it('renders open lines without a fill or editable text surface', () => {
    const view = inlineShapeEmbedConverter.toView(createInlineShapeDelta({
      shapeType: 'line-double-arrow',
      strokeColor: '#2563EB',
      strokeWidth: 3,
    }, [{insert: '不会显示'}]))
    const path = view.querySelector('path')
    const text = view.querySelector<HTMLElement>('.bc-inline-shape__text')

    expect(path?.getAttribute('fill')).toBe('none')
    expect(text?.hidden).toBeTrue()
  })

  it('renders construction strokes separately from the filled geometry', () => {
    const view = inlineShapeEmbedConverter.toView(createInlineShapeDelta({
      shapeType: 'cube',
    }))
    const paths = view.querySelectorAll('path')

    expect(paths.length).toBe(2)
    expect(paths[0].getAttribute('fill')).not.toBe('none')
    expect(paths[1].getAttribute('fill')).toBe('none')
  })
})
