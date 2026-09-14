import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  normalizeBlockObjectFormat,
  normalizeObjectLine,
  normalizeObjectPaint,
  normalizeObjectEffects,
  normalizeObjectTextStyle,
  normalizeObjectTextFrame,
  storeObjectEffects,
  storeObjectTextStyle,
  storeObjectTextFrame,
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
  it('quantizes stored sections while leaving legacy reads and source objects unchanged', () => {
    const effects = {
      shadow: {...DEFAULT_OBJECT_EFFECTS.shadow, enabled: true,
        blur: 2.4000000000000004, angle: 60.94539590092286,
        distance: 4.94190246763776, opacity: 0.2700000000000001},
      glow: {...DEFAULT_OBJECT_EFFECTS.glow, radius: 3.6},
    }
    const style = {...DEFAULT_OBJECT_TEXT_STYLE, effects,
      fontSize: 48.00000000000001, letterSpacingEm: -0.123456789,
      lineHeight: 1.2000000000000002,
      outline: {type: 'line' as const, color: '#000000', width: 1.2000000000000002},
      fill: {type: 'linear-gradient' as const, opacity: 0.8000000000000002,
        angle: 135.123456789,
        stops: [{color: '#000000', offset: 0.3333333333333333, opacity: 0.5},
          {color: '#FFFFFF', offset: 1, opacity: 1}]},
    }
    const source = JSON.stringify(style)
    expect(normalizeObjectTextStyle(style)).toEqual(style)
    const stored = storeObjectTextStyle(style)
    expect(stored).toEqual(jasmine.objectContaining({
      z: 48, s: -0.12, l: 1.2, ow: 1.25, pa: 135, po: 0.8, pp0: 0.33,
      sb: 2, sa: 61, sd: 5, so: 0.27, gr: 4,
    }))
    expect(JSON.stringify(stored).length).toBeLessThan(
      JSON.stringify({...stored, sb: effects.shadow.blur, sa: effects.shadow.angle,
        sd: effects.shadow.distance, ow: style.outline.width}).length,
    )
    expect(storeObjectTextStyle(normalizeObjectTextStyle(stored))).toEqual(stored)
    expect(storeObjectEffects(normalizeObjectEffects(storeObjectEffects(effects))))
      .toEqual(storeObjectEffects(effects))
    expect(JSON.stringify(style)).toBe(source)

    const frame = {...DEFAULT_OBJECT_TEXT_FRAME, margins: [8.1, 8.8, 0, 1000] as [number, number, number, number]}
    expect(normalizeObjectTextFrame(frame).margins).toEqual([8.1, 8.8, 0, 1000])
    expect(storeObjectTextFrame(frame)).toEqual(jasmine.objectContaining({mt: 8, mr: 9, mb: 0, ml: 1000}))
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, width: 1.2}).w).toBe(1.25)
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, width: 0.25}).w).toBe(0.25)
  })

  it('bounds invalid values before quantizing and retains no-outline states', () => {
    const stored = storeObjectEffects({
      shadow: {...DEFAULT_OBJECT_EFFECTS.shadow, blur: NaN, angle: -400, distance: Infinity},
      glow: {...DEFAULT_OBJECT_EFFECTS.glow, radius: 200, opacity: -1},
    })
    expect(stored).toEqual(jasmine.objectContaining({sb: 4, sa: -360, sd: 2, gr: 100, go: 0}))
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, width: -3}).w).toBe(0)
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, type: 'none', width: 0.3})).toEqual({t: 'n'})
  })

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
