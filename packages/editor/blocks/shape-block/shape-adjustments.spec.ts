import {getShapeDefinition} from './shape-definitions'
import {
  resolveAdjustedShapeTextInsets,
  resolveShapeAdjustmentProjection,
  updateShapeAdjustment,
} from './shape-adjustments'
import {resolveShapeRenderGeometry} from './shape-geometry'
import type {ShapeKind} from './shape.types'

describe('Shape catalogue adjustments', () => {
  const textInsets = (kind: ShapeKind, values?: Record<string, number>) =>
    resolveAdjustedShapeTextInsets(kind, values, getShapeDefinition(kind).textInsets)

  it('uses the full rectangle and derives rounded text bounds from its radius', () => {
    expect(textInsets('rectangle')).toEqual({top: 0, right: 0, bottom: 0, left: 0})
    expect(textInsets('rounded-rectangle', {radius: 0}))
      .toEqual(textInsets('rectangle'))
    expect(textInsets('rounded-rectangle').left).toBeCloseTo(.0351468, 8)
    expect(textInsets('rounded-rectangle', {radius: 300}).left).toBeCloseTo(.087867, 8)
    expect(textInsets('rounded-rectangle', {radius: 900}).left).toBeCloseTo(.146445, 8)
    expect(textInsets('rounded-rectangle', {radius: NaN})).toEqual(textInsets('rounded-rectangle'))
    const single = textInsets('single-rounded-rectangle', {radius: 300})
    expect([single.top, single.right, single.bottom]).toEqual([0, 0, 0])
    expect(single.left).toBeCloseTo(.087867, 8)
    expect(textInsets('same-side-rounded-rectangle', {radius: 300}).right).toBe(0)
  })

  it('follows triangle vertices, trapezoid slopes and arrow shafts', () => {
    expect(textInsets('triangle', {apexX: 240}))
      .toEqual({top: .5, right: .38, bottom: 0, left: .12})
    expect(textInsets('trapezoid', {inset: 0})).toEqual(textInsets('rectangle'))
    expect(textInsets('trapezoid', {inset: 300}))
      .toEqual({top: .2, right: .2, bottom: 0, left: .2})
    expect(textInsets('right-arrow', {headLength: 400, shaftThickness: 600}))
      .toEqual({top: .2, right: .24, bottom: .2, left: 0})
    expect(textInsets('up-arrow', {headLength: 400, shaftThickness: 600}))
      .toEqual({top: .24, right: .2, bottom: 0, left: .2})
    expect(textInsets('up-down-arrow', {headLength: 400, shaftThickness: 600}))
      .toEqual({top: .24, right: .2, bottom: .24, left: .2})
    expect(textInsets('ellipse').left).toBeCloseTo(.1464466, 7)
  })

  it('reserves only the callout body and rounded corners before user margins', () => {
    expect(textInsets('speech-bubble'))
      .toEqual({top: 0, right: 0, bottom: .24, left: 0})
    expect(textInsets('wedge-rect-callout', {tailX: 0, tailY: 500}))
      .toEqual({top: 0, right: 0, bottom: 0, left: .24})
    const rounded = textInsets('wedge-round-callout', {tailX: 500, tailY: 0})
    expect(rounded.top).toBeCloseTo(.2751468, 8)
    expect(rounded.bottom).toBeCloseTo(.0351468, 8)
    expect(textInsets('cloud-callout')).toEqual(getShapeDefinition('cloud-callout').textInsets)
  })

  it('provides compact yellow-handle projections for the supported catalogue', () => {
    const kinds: ShapeKind[] = [
      'rounded-rectangle',
      'single-rounded-rectangle',
      'same-side-rounded-rectangle',
      'triangle',
      'parallelogram',
      'trapezoid',
      'right-arrow',
      'left-arrow',
      'up-arrow',
      'down-arrow',
      'left-right-arrow',
      'up-down-arrow',
      'speech-bubble',
      'rounded-speech-bubble',
      'wedge-rect-callout',
      'wedge-round-callout',
    ]

    for (const kind of kinds) {
      const projection = resolveShapeAdjustmentProjection(kind, undefined)
      expect(projection?.handles.length).toBeGreaterThan(0)
      expect(Object.values(projection?.adjustments ?? {}).every(Number.isFinite))
        .toBeTrue()
    }
  })

  it('updates one rounded-rectangle parameter without storing path data', () => {
    const next = updateShapeAdjustment(
      'rounded-rectangle',
      undefined,
      'radius',
      280,
      0,
    )!

    expect(next.adjustments).toEqual({radius: 280})
    expect(next.path).toContain('M280 0H720')
  })

  it('maps arrow handles through their visual orientation', () => {
    const up = updateShapeAdjustment(
      'up-arrow',
      undefined,
      'shaftThickness',
      350,
      500,
    )!
    const left = updateShapeAdjustment(
      'left-arrow',
      undefined,
      'headLength',
      480,
      0,
    )!

    expect(up.adjustments['shaftThickness']).toBe(300)
    expect(left.adjustments['headLength']).toBe(480)
  })

  it('moves a callout pointer with two flat values', () => {
    const next = updateShapeAdjustment(
      'speech-bubble',
      undefined,
      'tail',
      720,
      940,
    )!

    expect(next.adjustments).toEqual({tailX: 720, tailY: 940})
    expect(next.path).toContain('L720 940')
  })

  it('projects callout tails and text-safe insets toward every frame edge', () => {
    const definition = getShapeDefinition('wedge-round-callout')
    const cases = [
      {adjustments: {tailX: 170, tailY: 0}, edge: 'top', token: 'L170 0'},
      {adjustments: {tailX: 1000, tailY: 500}, edge: 'right', token: 'L1000 500'},
      {adjustments: {tailX: 500, tailY: 1000}, edge: 'bottom', token: 'L500 1000'},
      {adjustments: {tailX: 0, tailY: 500}, edge: 'left', token: 'L0 500'},
    ] as const

    for (const item of cases) {
      const projection = resolveShapeAdjustmentProjection(
        'wedge-round-callout',
        item.adjustments,
      )!
      const insets = resolveAdjustedShapeTextInsets(
        'wedge-round-callout',
        item.adjustments,
        definition.textInsets,
      )
      expect(projection.path).withContext(item.edge).toContain(item.token)
      expect(insets[item.edge])
        .withContext(item.edge)
        .toBe(Math.max(...Object.values(insets)))
    }
  })

  it('projects adjustments through the ordinary Shape renderer', () => {
    const resolved = resolveShapeRenderGeometry(
      'triangle',
      getShapeDefinition('triangle'),
      undefined,
      {apexX: 240},
    )

    expect(resolved.paths[0]?.d).toBe('M240 0L1000 1000H0Z')
  })
})
