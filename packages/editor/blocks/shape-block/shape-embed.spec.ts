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
      placement: {mode: 'absolute', x: 12, y: 40},
    }, [{insert: '流程图'}], {
      wrap: true,
      side: 'left',
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
    expect(data.props.placement).toBeUndefined()
    expect(data.text).toEqual([{insert: '流程图'}])
    expect(data).toEqual(jasmine.objectContaining({
      width: 210,
      height: 130,
      wrap: true,
      side: 'left',
      x: 0.4,
      gap: 16,
    }))
  })
})

