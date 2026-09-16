import {
  createInlineShapeDelta,
  inlineShapeEmbedConverter,
  readInlineShapeDelta,
} from '.'
import {
  createDefaultEditableShapeGeometry,
  serializeCustomShapeGeometry,
} from '../../blocks/shape-block/shape-geometry'
import {
  normalizeBlockObjectFormat,
  storeObjectLine,
  storeObjectPaint,
  storeObjectFormatSection,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from '../../framework'
import {SHAPE_OBJECT_FORMAT_CAPABILITY} from '../../blocks/shape-block/shape.types'

describe('inline shape embed', () => {
  it('keeps fractional outline strings on read and rounds only when creating a delta', () => {
    const props = {shape: 'rectangle' as const, width: 210, height: 130, rotation: 25,
      outline: '1.2px solid #000000',
    }
    const delta = {insert: {shape: JSON.stringify({props, text: []})}}
    expect(readInlineShapeDelta(delta).props.outline).toBe('1.2px solid #000000')
    const path = inlineShapeEmbedConverter.toView(delta).querySelector('path')!
    expect(path.getAttribute('stroke-width')).toBe('1.2')
    expect(readInlineShapeDelta(createInlineShapeDelta(props)).props.outline).toBe('1.25px solid #000000')
  })

  it('preserves shape props, text and wrap layout through the DOM converter', () => {
    const delta = createInlineShapeDelta({
      shape: 'ellipse',
      width: 210,
      height: 130,
      rotation: 25,
      ...storeObjectFormatSection('shapeFill', {
        type: 'solid', color: '#93C5FD', opacity: 0.7,
      }),
      ...storeObjectLine({
        ...SHAPE_OBJECT_FORMAT_CAPABILITY.defaults.shapeOutline!,
        color: '#2563EB', width: 3, dash: 'dash',
      }),
      ...storeObjectTextFrame({
        ...SHAPE_OBJECT_FORMAT_CAPABILITY.defaults.textFrame!,
        horizontalAlign: 'right', verticalAlign: 'bottom',
      }),
      ...storeObjectTextStyle({
        ...SHAPE_OBJECT_FORMAT_CAPABILITY.defaults.textStyle!,
        fill: {
          type: 'solid', color: '#0F172A', opacity: 1,
        },
      }),
      position: "12 40",
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
      .toBe('12 9')
    expect(view.querySelector('.bc-inline-shape__text')?.textContent)
      .toBe('流程图')

    const roundTrip = inlineShapeEmbedConverter.toDelta(view)
    const data = readInlineShapeDelta(roundTrip)
    expect(data.props.shape).toBe('ellipse')
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
      {shape: 'ellipse'},
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
      shape: 'line-double-arrow',
      ...storeObjectLine({
        ...SHAPE_OBJECT_FORMAT_CAPABILITY.defaults.shapeOutline!,
        color: '#2563EB', width: 3,
      }),
    }, [{insert: '不会显示'}]))
    const path = view.querySelector('path')
    const text = view.querySelector<HTMLElement>('.bc-inline-shape__text')

    expect(path?.getAttribute('fill')).toBe('none')
    expect(text?.hidden).toBeTrue()
  })

  it('renders and preserves validated custom curve geometry', () => {
    const geometry = createDefaultEditableShapeGeometry('curved-connector')!
    geometry.width = 1200
    const customGeometry = serializeCustomShapeGeometry(geometry)!
    const delta = createInlineShapeDelta({
      shape: 'curved-connector',
      customGeometry,
    })
    const view = inlineShapeEmbedConverter.toView(delta)

    expect(view.querySelector('path')?.getAttribute('d'))
      .toContain('C260 800 260 200 520 200')
    expect(readInlineShapeDelta(
      inlineShapeEmbedConverter.toDelta(view),
    ).props.customGeometry).toBe(customGeometry)
  })

  it('renders construction strokes separately from the filled geometry', () => {
    const view = inlineShapeEmbedConverter.toView(createInlineShapeDelta({
      shape: 'cube',
    }))
    const paths = view.querySelectorAll('path')

    expect(paths.length).toBe(2)
    expect(paths[0].getAttribute('fill')).not.toBe('none')
    expect(paths[1].getAttribute('fill')).toBe('none')
  })

  it('renders a linear-gradient fill through an SVG gradient def', () => {
    const view = inlineShapeEmbedConverter.toView(createInlineShapeDelta({
      shape: 'rectangle',
      ...storeObjectFormatSection('shapeFill', {
        type: 'linear-gradient',
        opacity: 1,
        angle: 160,
        stops: [
          {color: '#26405E', offset: 0, opacity: 1},
          {color: '#58402E', offset: 1, opacity: 1},
        ],
      }),
    }))

    const gradient = view.querySelector('defs linearGradient')
    expect(gradient).not.toBeNull()
    const gradientId = gradient!.getAttribute('id')!
    expect(view.querySelector('path')?.getAttribute('fill'))
      .toBe(`url(#${gradientId})`)
    const stops = gradient!.querySelectorAll('stop')
    expect(stops.length).toBe(2)
    expect(stops[0].getAttribute('stop-color')).toBe('#26405E')
    expect(stops[1].getAttribute('stop-color')).toBe('#58402E')

    // round-trip 后渐变仍然生效
    const data = readInlineShapeDelta(inlineShapeEmbedConverter.toDelta(view))
    const format = normalizeBlockObjectFormat(
      data.props,
      SHAPE_OBJECT_FORMAT_CAPABILITY,
    )
    expect(format.shapeFill?.type).toBe('linear-gradient')
    expect(format.shapeFill?.type).toBe('linear-gradient')
    if (format.shapeFill?.type !== 'linear-gradient') return
    expect(format.shapeFill.stops.map(stop => stop.color))
      .toEqual(['#26405E', '#58402E'])
  })
})
