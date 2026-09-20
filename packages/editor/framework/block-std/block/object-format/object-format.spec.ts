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
  storeBlockObjectFormat,
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
  it('quantizes grouped strings while leaving structured reads and source objects unchanged', () => {
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
    expect(stored.textFont).toBe('48px 400 normal')
    expect(stored.textSpacing).toBe('-0.12em 1.2')
    expect(stored.textOutline).toBe('1.25px #000000')
    expect(stored.textShadow).toBe('61deg 5px 2px #000000 / 0.27')
    expect(stored.textGlow).toBe('none')
    expect(stored.textFill).toBe('linear-gradient(135deg, color-mix(in srgb, #000000 50%, transparent) 33%, #FFFFFF 100%)')
    expect(stored.textFillOpacity).toBe(0.8)
    expect(storeObjectTextStyle(normalizeObjectTextStyle(stored))).toEqual(stored)
    expect(storeObjectEffects(normalizeObjectEffects(storeObjectEffects(effects))))
      .toEqual(storeObjectEffects(effects))
    expect(JSON.stringify(style)).toBe(source)

    const frame = {...DEFAULT_OBJECT_TEXT_FRAME, margins: [8.1, 8.8, 0, 1000] as [number, number, number, number]}
    expect(normalizeObjectTextFrame(frame).margins).toEqual([8.1, 8.8, 0, 1000])
    expect(storeObjectTextFrame(frame)).toEqual(jasmine.objectContaining({textPadding: '8 9 0 1000'}))
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, width: 1.2}).outline).toBe('1.25px solid #000000')
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, width: 0.25}).outline).toBe('0.25px solid #000000')
  })

  it('bounds invalid values before quantizing and retains no-outline states', () => {
    const stored = storeObjectEffects({
      shadow: {...DEFAULT_OBJECT_EFFECTS.shadow, enabled: true, blur: NaN, angle: -400, distance: Infinity},
      glow: {...DEFAULT_OBJECT_EFFECTS.glow, enabled: true, radius: 200, opacity: -1},
    })
    expect(stored).toEqual(jasmine.objectContaining({shadow: '-360deg 2px 4px #000000 / 0.25', glow: '100px #4857E2 / 0'}))
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, width: -3}).outline).toBe('0px solid #000000')
    expect(storeObjectLine({...DEFAULT_OBJECT_LINE, type: 'none', width: 0.3})).toEqual({outline: 'none'})
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

  it('stores gradient paints as CSS strings', () => {
    const stored = storeObjectPaint({
      type: 'linear-gradient', opacity: .8, angle: 30,
      stops: [
        {color: '#111111', offset: 0, opacity: 1},
        {color: '#222222', offset: 1, opacity: .5},
      ],
    })
    expect(stored).toBe('linear-gradient(30deg, #111111 0%, color-mix(in srgb, #222222 50%, transparent) 100%)')
    expect(CSS.supports('background-image', stored as string)).toBeTrue()
    expect(JSON.stringify(stored).length).toBeLessThan(200)
  })
  it('omits every default appearance group and discards disabled effect parameters', () => {
    const empty = storeBlockObjectFormat(capability.defaults, capability)
    expect(Object.keys(empty).sort()).toEqual(['height', 'lockRatio', 'rotation', 'shape', 'width'])
    const format = {...capability.defaults, shapeEffects: {
      shadow: {...DEFAULT_OBJECT_EFFECTS.shadow, color: '#FF0000', blur: 80},
      glow: {...DEFAULT_OBJECT_EFFECTS.glow, radius: 90},
    }}
    expect(storeBlockObjectFormat(format, capability)).toEqual(empty)
    expect(normalizeBlockObjectFormat(empty, capability)).toEqual(capability.defaults)
  })

  it('stores only changed groups, preserves explicit none, and round trips without accumulating defaults', () => {
    const format = {...capability.defaults,
      shapeFill: {type: 'none' as const},
      shapeOutline: {...DEFAULT_OBJECT_LINE, endArrow: 'triangle' as const},
      textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, fontSize: 24},
      textFrame: {...DEFAULT_OBJECT_TEXT_FRAME, margins: [18, 22, 18, 22] as [number, number, number, number]},
    }
    const stored = storeBlockObjectFormat(format, capability)
    expect(stored.fill).toBe('none')
    expect(stored.outline).toBeUndefined()
    expect(stored.arrows).toBe('none triangle')
    expect(stored.textFont).toBe('24px 400 normal')
    expect(stored.textPadding).toBe('18 22')
    expect(stored.textFamily).toBeUndefined()
    expect(stored.textShadow).toBeUndefined()
    const restored = normalizeBlockObjectFormat(stored, capability)
    expect(restored).toEqual(format)
    expect(storeBlockObjectFormat(restored, capability)).toEqual(stored)
  })

  it('keeps explicit disabled overrides when the schema enables an effect', () => {
    const styled = {...capability, defaults: {...capability.defaults,
      textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, effects: {
        ...DEFAULT_OBJECT_EFFECTS, shadow: {...DEFAULT_OBJECT_EFFECTS.shadow, enabled: true},
      }},
    }}
    const stored = storeBlockObjectFormat({...styled.defaults, textStyle: DEFAULT_OBJECT_TEXT_STYLE}, styled)
    expect(stored.textShadow).toBe('none')
    expect(normalizeBlockObjectFormat(stored, styled).textStyle!.effects.shadow.enabled).toBeFalse()
  })

  it('ignores retired effects/textFrame/textStyle records and safely bounds malformed groups', () => {
    const result = normalizeBlockObjectFormat({effects: {se: true}, textFrame: {mt: 90}, textStyle: {z: 90},
      shadow: 'bad', textFont: 'NaNpx 999 bad', textPadding: '1 2 bad',
    } as never, capability)
    expect(result).toEqual(capability.defaults)
  })

  it('never treats object dimensions as outline width and retains explicit widths', () => {
    expect(normalizeBlockObjectFormat({width: 960, height: 480}, capability).shapeOutline!.width).toBe(1)
    expect(normalizeBlockObjectFormat({width: 960, outline: '100px solid #000000'}, capability).shapeOutline!.width).toBe(100)
    const color = 'rgb(10 20 30 / 0.5)'
    expect(normalizeObjectPaint(storeObjectPaint({type: 'solid', color, opacity: 0.8})))
      .toEqual({type: 'solid', color, opacity: 0.8})
  })

  it('drops groups that become defaults after rounding on the first write', () => {
    const props = storeBlockObjectFormat({...capability.defaults,
      textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, fontSize: 16.000001},
      textFrame: {...DEFAULT_OBJECT_TEXT_FRAME, margins: [0.1, 0, 0, 0]},
    }, capability)
    expect(props.textFont).toBeUndefined()
    expect(props.textPadding).toBeUndefined()
    expect(storeBlockObjectFormat(normalizeBlockObjectFormat(props, capability), capability)).toEqual(props)
  })

})

describe('CSS paint persistence shared by object fills', () => {
  it('round-trips gradient stop alpha and overall alpha independently', () => {
    const fill = {type: 'linear-gradient' as const, angle: 135, opacity: 0.4,
      stops: [{color: 'rgb(10 20 30 / 0.7)', offset: 0, opacity: 0.25},
        {color: '#FFFFFF', offset: 1, opacity: 1}]}
    const format = {...capability.defaults, shapeFill: fill,
      textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, fill}}
    const stored = storeBlockObjectFormat(format, capability)
    expect(stored.fill).toBe(stored.textFill!)
    expect(stored.fillOpacity).toBe(0.4)
    expect(stored.textFillOpacity).toBe(0.4)
    expect(CSS.supports('background-image', stored.fill!)).toBeTrue()
    const decoded = normalizeBlockObjectFormat(stored, capability)
    expect(decoded.shapeFill).toEqual(fill)
    expect(decoded.textStyle!.fill).toEqual(fill)
    expect(storeBlockObjectFormat(decoded, capability)).toEqual(stored)
  })

  it('inherits schema alpha even when a different CSS gradient is explicitly stored', () => {
    const fill = {type: 'linear-gradient' as const, angle: 90, opacity: 0.5,
      stops: [{color: '#FFFFFF', offset: 0, opacity: 1}, {color: '#000000', offset: 1, opacity: 1}]}
    const custom = {...capability, defaults: {...capability.defaults, shapeFill: fill}}
    const changed = {...custom.defaults, shapeFill: {...fill, angle: 45}}
    const stored = storeBlockObjectFormat(changed, custom)
    expect(stored.fillOpacity).toBeUndefined()
    expect(normalizeBlockObjectFormat(stored, custom).shapeFill).toEqual(changed.shapeFill)
  })

  it('accepts CSS direction and implicit stop positions without splitting color functions', () => {
    expect(normalizeObjectPaint('linear-gradient(to right, rgb(1, 2, 3), #fff 50%, blue)'))
      .toEqual({type: 'linear-gradient', angle: 90, opacity: 1, stops: [
        {color: 'rgb(1, 2, 3)', offset: 0, opacity: 1},
        {color: '#fff', offset: 0.5, opacity: 1},
        {color: 'blue', offset: 1, opacity: 1},
      ]})
  })

  it('round-trips picture source, fit, position and alpha for shape and text fills', () => {
    const src = 'https://example.com/a (1), "b".png?x=1&y=2'
    const fill = {type: 'picture' as const, src, opacity: 0.35, fit: 'stretch' as const,
      positionX: 25.12, positionY: 70.5}
    const stored = storeBlockObjectFormat({...capability.defaults, shapeFill: fill,
      textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, fill}}, capability)
    expect(typeof stored.fill).toBe('string')
    expect(stored.fill).toContain('25.12% 70.5% / 100% 100% no-repeat')
    expect(stored.fillOpacity).toBe(0.35)
    expect(CSS.supports('background', stored.fill!)).toBeTrue()
    expect(normalizeBlockObjectFormat(stored, capability).shapeFill).toEqual(fill)
    expect(normalizeBlockObjectFormat(stored, capability).textStyle!.fill).toEqual(fill)
    const opaque = storeBlockObjectFormat({...capability.defaults, shapeFill: {...fill, opacity: 1}}, capability)
    expect(opaque.fillOpacity).toBeUndefined()
  })

  it('omits disabled/default fills and does not parse retired records or malformed CSS', () => {
    expect(normalizeObjectPaint({t: 'p', u: '/old.png', o: .5})).toEqual(DEFAULT_OBJECT_PAINT)
    for (const fill of [
      'linear-gradient(20deg, #fff)',
      'linear-gradient(20deg, #fff 0%, #000 100%); color:red',
      'linear-gradient(20deg, rgb(1,2,3 0%, #000 100%)',
      'url("javascript:alert(1)") 50% 50% / cover no-repeat',
      'url("https://example.com/a.png") 50% 50% / cover; color:red',
    ]) expect(normalizeObjectPaint(fill)).toEqual(DEFAULT_OBJECT_PAINT)
    const stored = storeBlockObjectFormat({...capability.defaults,
      shapeFill: {type: 'none'}}, capability)
    expect(stored.fill).toBe('none')
    expect(stored.fillOpacity).toBeUndefined()
  })
})
