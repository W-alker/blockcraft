import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  normalizeBlockObjectFormat,
  normalizeObjectLine,
  normalizeObjectPaint,
  storeObjectLine,
  storeObjectPaint,
  type BlockObjectFormatCapability,
} from './object-format'

const capability: BlockObjectFormatCapability = {
  kind: 'shape',
  features: {
    geometry: true, shape: true, pictureFill: true,
    lineArrows: true, textFrame: true, textStyle: 'rich-default',
  },
  defaults: {
    width: 180, height: 100, rotation: 0, lockAspectRatio: false,
    shapeType: 'rectangle', shapeFill: DEFAULT_OBJECT_PAINT,
    shapeOutline: DEFAULT_OBJECT_LINE, shapeEffects: DEFAULT_OBJECT_EFFECTS,
    textFrame: DEFAULT_OBJECT_TEXT_FRAME, textStyle: DEFAULT_OBJECT_TEXT_STYLE,
  },
  shapeTypes: ['rectangle', 'line'],
}

describe('object format domain', () => {
  it('normalizes malformed or oversized sections without throwing', () => {
    expect(() => normalizeBlockObjectFormat({
      width: Number.NaN,
      fill: '{bad' as never,
      outline: 'x'.repeat(40_000) as never,
    }, capability)).not.toThrow()
    const result = normalizeBlockObjectFormat({fill: '{bad' as never}, capability)
    expect(result.width).toBe(180)
    expect(result.shapeFill).toEqual(DEFAULT_OBJECT_PAINT)
    expect(result.shapeOutline).toEqual(DEFAULT_OBJECT_LINE)
    expect(normalizeBlockObjectFormat({width: null as never}, capability).width)
      .toBe(180)
  })

  it('keeps explicit no-fill and no-outline states', () => {
    expect(normalizeObjectPaint(storeObjectPaint({type: 'none'})).type)
      .toBe('none')
    expect(normalizeObjectLine(storeObjectLine({
      ...DEFAULT_OBJECT_LINE, type: 'none',
    })).type).toBe('none')
  })

  it('bounds gradient stops, opacity and arrow values', () => {
    const paint = normalizeObjectPaint({
      type: 'linear-gradient',
      opacity: 1,
      angle: 180,
      stops: [
        {color: '#111111', offset: 2, opacity: -1},
        {color: '#222222', offset: -1, opacity: .5},
        {color: '#333333', offset: .7, opacity: 2},
        {color: '#444444', offset: .3, opacity: 1},
        {color: '#555555', offset: .5, opacity: 1},
      ],
    })
    expect(paint.type).toBe('linear-gradient')
    if (paint.type !== 'linear-gradient') return
    expect(paint.stops.length).toBe(4)
    expect(paint.stops.map(stop => stop.offset)).toEqual([0, .3, .7, 1])
    expect(paint.stops.map(stop => stop.opacity)).toEqual([.5, 1, 1, 0])
    expect(normalizeObjectLine({startArrow: 'diamond', endArrow: 'bad'}))
      .toEqual(jasmine.objectContaining({startArrow: 'diamond', endArrow: 'none'}))
  })

  it('accepts legal image references and rejects script-like values', () => {
    const src = (value: string) => {
      const paint = normalizeObjectPaint({type: 'picture', src: value})
      return paint.type === 'picture' ? paint.src : null
    }
    expect(src('/files/a.png')).toBe('/files/a.png')
    expect(src('javascript:alert(1)')).toBe('')
    expect(src('bc:catalog-art')).toBe('')
  })

  it('ignores removed flat style fields and falls back to canonical defaults', () => {
    const result = normalizeBlockObjectFormat({
      fillColor: '#FF0000',
      strokeWidth: 99,
      fontSize: 72,
    } as never, capability)
    expect(result.shapeFill).toEqual(DEFAULT_OBJECT_PAINT)
    expect(result.shapeOutline).toEqual(DEFAULT_OBJECT_LINE)
    expect(result.textStyle).toEqual(DEFAULT_OBJECT_TEXT_STYLE)
  })

  it('stores each section as a compact primitive record, never a JSON string', () => {
    const stored = storeObjectPaint({
      type: 'linear-gradient', opacity: .8, angle: 30,
      stops: [
        {color: '#111111', offset: 0, opacity: 1},
        {color: '#222222', offset: 1, opacity: .5},
      ],
    })
    expect(typeof stored).toBe('object')
    expect(stored).toEqual(jasmine.objectContaining({
      t: 'g', o: .8, a: 30, n: 2, c0: '#111111', p1: 1,
    }))
    expect(JSON.stringify(stored).length).toBeLessThan(200)
  })
})
