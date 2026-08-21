import {
  DEFAULT_SHAPE_GRADIENT,
  normalizeShapeGradient,
  normalizeShapeGradientAngle,
  SHAPE_FILL_GRADIENT_PRESETS,
  shapeGradientToCss,
  shapeGradientToSvgVector,
} from './shape-fill'
import {
  normalizeShapeProps,
  resolveShapeFillGradient,
} from './shape.types'

describe('shape fill gradient model', () => {
  it('normalizes angle into the 0..360 range', () => {
    expect(normalizeShapeGradientAngle(160)).toBe(160)
    expect(normalizeShapeGradientAngle(-90)).toBe(270)
    expect(normalizeShapeGradientAngle(450)).toBe(90)
    expect(normalizeShapeGradientAngle('bad'))
      .toBe(DEFAULT_SHAPE_GRADIENT.angle)
  })

  it('keeps a valid two-stop gradient and expands short hex colors', () => {
    const gradient = normalizeShapeGradient(160, ['#26405e', '#fa0'], [0, 1])
    expect(gradient.angle).toBe(160)
    expect(gradient.colors).toEqual(['#26405E', '#FFAA00'])
    expect(gradient.stops).toEqual([0, 1])
  })

  it('sorts color stops and clamps them to 0..1', () => {
    const gradient = normalizeShapeGradient(
      90,
      ['#111111', '#222222', '#333333'],
      [1.5, 0.4, -1],
    )
    expect(gradient.stops).toEqual([0, 0.4, 1])
    expect(gradient.colors).toEqual(['#333333', '#222222', '#111111'])
  })

  it('falls back to the default gradient when colors are unusable', () => {
    const gradient = normalizeShapeGradient(200, 'nope', [0, 1])
    expect(gradient.colors).toEqual([...DEFAULT_SHAPE_GRADIENT.colors])
    expect(gradient.stops).toEqual([...DEFAULT_SHAPE_GRADIENT.stops])
    expect(gradient.angle).toBe(200)
  })

  it('serializes a CSS preview string with percent stops', () => {
    expect(shapeGradientToCss({
      angle: 160,
      colors: ['#26405E', '#58402E'],
      stops: [0, 1],
    })).toBe('linear-gradient(160deg, #26405E 0%, #58402E 100%)')
  })

  it('maps CSS angles onto SVG objectBoundingBox vectors', () => {
    // 180deg = 从上到下
    expect(shapeGradientToSvgVector(180))
      .toEqual({x1: 0.5, y1: 0, x2: 0.5, y2: 1})
    // 90deg = 从左到右
    expect(shapeGradientToSvgVector(90))
      .toEqual({x1: 0, y1: 0.5, x2: 1, y2: 0.5})
    // 0deg = 从下到上
    expect(shapeGradientToSvgVector(0))
      .toEqual({x1: 0.5, y1: 1, x2: 0.5, y2: 0})
  })

  it('ships only renderable built-in presets', () => {
    const hex = /^#[\dA-F]{6}$/
    for (const preset of SHAPE_FILL_GRADIENT_PRESETS) {
      expect(preset.colors.length).toBeGreaterThanOrEqual(2)
      expect(preset.colors.length).toBeLessThanOrEqual(4)
      expect(preset.stops.length).toBe(preset.colors.length)
      preset.colors.forEach(color => expect(color).toMatch(hex))
      preset.stops.forEach(stop => {
        expect(stop).toBeGreaterThanOrEqual(0)
        expect(stop).toBeLessThanOrEqual(1)
      })
    }
    const ids = SHAPE_FILL_GRADIENT_PRESETS.map(preset => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('shape props fill normalization', () => {
  it('treats missing fillType as solid for legacy documents', () => {
    const props = normalizeShapeProps({fillColor: '#123456'})
    expect(props.fillType).toBe('solid')
    expect(props.gradientColors).toBeUndefined()
    expect(resolveShapeFillGradient(props)).toBeNull()
  })

  it('normalizes gradient props and resolves a renderable gradient', () => {
    const props = normalizeShapeProps({
      fillColor: '#123456',
      fillType: 'linear-gradient',
      gradientAngle: 160,
      gradientColors: ['#26405e', '#58402e'],
      gradientStops: [0, 1],
    })
    expect(props.fillType).toBe('linear-gradient')
    expect(props.gradientColors).toEqual(['#26405E', '#58402E'])
    expect(resolveShapeFillGradient(props)).toEqual({
      angle: 160,
      colors: ['#26405E', '#58402E'],
      stops: [0, 1],
    })
  })

  it('repairs a gradient fill with malformed values instead of dropping it', () => {
    const props = normalizeShapeProps({
      fillType: 'linear-gradient',
      gradientAngle: Number.NaN,
      gradientColors: ['not-a-color'],
      gradientStops: 'bad' as unknown as number[],
    })
    expect(props.fillType).toBe('linear-gradient')
    expect(props.gradientColors).toEqual([...DEFAULT_SHAPE_GRADIENT.colors])
    expect(props.gradientAngle).toBe(DEFAULT_SHAPE_GRADIENT.angle)
  })

  it('keeps stored gradient colors while fillType is solid', () => {
    const props = normalizeShapeProps({
      fillType: 'solid',
      fillColor: '#123456',
      gradientColors: ['#26405E', '#58402E'],
      gradientStops: [0, 1],
    })
    expect(props.fillType).toBe('solid')
    expect(props.gradientColors).toEqual(['#26405E', '#58402E'])
    expect(resolveShapeFillGradient(props)).toBeNull()
  })

  it('rejects a non-linear-gradient fillType value', () => {
    const props = normalizeShapeProps({
      fillType: 'radial-gradient' as never,
    })
    expect(props.fillType).toBe('solid')
  })
})
