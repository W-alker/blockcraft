import type {ShapeAdjustmentValues, ShapeKind} from './shape.types'

export interface ShapeAdjustmentHandle {
  id: string
  x: number
  y: number
  label: string
}

export interface ShapeAdjustmentProjection {
  path: string
  adjustments: ShapeAdjustmentValues
  handles: readonly ShapeAdjustmentHandle[]
}

type Point = {x: number; y: number}
type CardinalArrowKind = 'right-arrow' | 'left-arrow' | 'up-arrow' | 'down-arrow'

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Number(value)
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback
}

const point = (x: number, y: number): Point => ({x, y})
const pointsPath = (points: readonly Point[]): string => points
  .map(({x, y}, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`)
  .join('') + 'Z'

const orientCardinalPoint = (
  shapeType: CardinalArrowKind,
  value: Point,
): Point => {
  if (shapeType === 'left-arrow') return point(1000 - value.x, value.y)
  if (shapeType === 'up-arrow') return point(value.y, 1000 - value.x)
  if (shapeType === 'down-arrow') return point(1000 - value.y, value.x)
  return value
}

const cardinalPointToRight = (
  shapeType: CardinalArrowKind,
  value: Point,
): Point => {
  if (shapeType === 'left-arrow') return point(1000 - value.x, value.y)
  if (shapeType === 'up-arrow') return point(1000 - value.y, value.x)
  if (shapeType === 'down-arrow') return point(value.y, 1000 - value.x)
  return value
}

const cardinalArrowProjection = (
  shapeType: CardinalArrowKind,
  values: ShapeAdjustmentValues,
): ShapeAdjustmentProjection => {
  const headLength = clamp(values['headLength'], 100, 650, 380)
  const shaftThickness = clamp(values['shaftThickness'], 160, 900, 500)
  const neck = 1000 - headLength
  const top = (1000 - shaftThickness) / 2
  const bottom = 1000 - top
  const transform = (value: Point) => orientCardinalPoint(shapeType, value)
  return {
    path: pointsPath([
      point(0, top), point(neck, top), point(neck, 0), point(1000, 500),
      point(neck, 1000), point(neck, bottom), point(0, bottom),
    ].map(transform)),
    adjustments: {headLength, shaftThickness},
    handles: [
      {...transform(point(neck, 0)), id: 'headLength', label: '调整箭头长度'},
      {...transform(point(0, top)), id: 'shaftThickness', label: '调整箭身粗细'},
    ],
  }
}

const bidirectionalArrowProjection = (
  shapeType: 'left-right-arrow' | 'up-down-arrow',
  values: ShapeAdjustmentValues,
): ShapeAdjustmentProjection => {
  const headLength = clamp(values['headLength'], 100, 420, 260)
  const shaftThickness = clamp(values['shaftThickness'], 160, 900, 500)
  const top = (1000 - shaftThickness) / 2
  const bottom = 1000 - top
  const transform = (value: Point): Point => shapeType === 'up-down-arrow'
    ? point(value.y, 1000 - value.x)
    : value
  return {
    path: pointsPath([
      point(0, 500), point(headLength, 0), point(headLength, top),
      point(1000 - headLength, top), point(1000 - headLength, 0),
      point(1000, 500), point(1000 - headLength, 1000),
      point(1000 - headLength, bottom), point(headLength, bottom),
      point(headLength, 1000),
    ].map(transform)),
    adjustments: {headLength, shaftThickness},
    handles: [
      {...transform(point(headLength, 0)), id: 'headLength', label: '调整箭头长度'},
      {...transform(point(500, top)), id: 'shaftThickness', label: '调整箭身粗细'},
    ],
  }
}

const calloutProjection = (
  shapeType: 'speech-bubble' | 'rounded-speech-bubble' |
    'wedge-rect-callout' | 'wedge-round-callout',
  values: ShapeAdjustmentValues,
): ShapeAdjustmentProjection => {
  const tailX = clamp(values['tailX'], 0, 1000, 130)
  const tailY = clamp(values['tailY'], 0, 1000, 1000)
  const rounded = shapeType === 'rounded-speech-bubble' ||
    shapeType === 'wedge-round-callout'
  const wedge = shapeType === 'wedge-rect-callout' ||
    shapeType === 'wedge-round-callout'
  const rightBase = wedge ? 430 : 360
  const leftBase = wedge ? 260 : 190
  const path = rounded
    ? `M120 0H880Q1000 0 1000 120V640Q1000 760 880 760` +
      `H${rightBase}L${tailX} ${tailY}L${leftBase} 760H120` +
      'Q0 760 0 640V120Q0 0 120 0Z'
    : `M0 0H1000V760H${rightBase}L${tailX} ${tailY}` +
      `L${leftBase} 760H0Z`
  return {
    path,
    adjustments: {tailX, tailY},
    handles: [{id: 'tail', x: tailX, y: tailY, label: '调整标注指向'}],
  }
}

export function resolveShapeAdjustmentProjection(
  shapeType: ShapeKind,
  values: ShapeAdjustmentValues | undefined,
): ShapeAdjustmentProjection | undefined {
  const adjustmentValues = values ?? {}
  if (
    shapeType === 'rounded-rectangle' ||
    shapeType === 'single-rounded-rectangle' ||
    shapeType === 'same-side-rounded-rectangle'
  ) {
    const radius = clamp(adjustmentValues['radius'], 0, 500, 120)
    const path = shapeType === 'rounded-rectangle'
      ? `M${radius} 0H${1000 - radius}Q1000 0 1000 ${radius}` +
        `V${1000 - radius}Q1000 1000 ${1000 - radius} 1000` +
        `H${radius}Q0 1000 0 ${1000 - radius}V${radius}Q0 0 ${radius} 0Z`
      : shapeType === 'single-rounded-rectangle'
        ? `M${radius} 0H1000V1000H0V${radius}Q0 0 ${radius} 0Z`
        : `M${radius} 0H1000V1000H${radius}Q0 1000 0 ${1000 - radius}` +
          `V${radius}Q0 0 ${radius} 0Z`
    return {
      path,
      adjustments: {radius},
      handles: [{id: 'radius', x: radius, y: 0, label: '调整圆角'}],
    }
  }
  if (shapeType === 'triangle') {
    const apexX = clamp(adjustmentValues['apexX'], 0, 1000, 500)
    return {
      path: `M${apexX} 0L1000 1000H0Z`,
      adjustments: {apexX},
      handles: [{id: 'apexX', x: apexX, y: 0, label: '调整顶点'}],
    }
  }
  if (shapeType === 'parallelogram' || shapeType === 'trapezoid') {
    const inset = clamp(adjustmentValues['inset'], 0, 500, 200)
    return {
      path: shapeType === 'parallelogram'
        ? `M${inset} 0H1000L${1000 - inset} 1000H0Z`
        : `M${inset} 0H${1000 - inset}L1000 1000H0Z`,
      adjustments: {inset},
      handles: [{id: 'inset', x: inset, y: 0, label: '调整斜度'}],
    }
  }
  if (
    shapeType === 'right-arrow' || shapeType === 'left-arrow' ||
    shapeType === 'up-arrow' || shapeType === 'down-arrow'
  ) {
    return cardinalArrowProjection(shapeType, adjustmentValues)
  }
  if (shapeType === 'left-right-arrow' || shapeType === 'up-down-arrow') {
    return bidirectionalArrowProjection(shapeType, adjustmentValues)
  }
  if (
    shapeType === 'speech-bubble' || shapeType === 'rounded-speech-bubble' ||
    shapeType === 'wedge-rect-callout' || shapeType === 'wedge-round-callout'
  ) {
    return calloutProjection(shapeType, adjustmentValues)
  }
  return undefined
}

export function updateShapeAdjustment(
  shapeType: ShapeKind,
  values: ShapeAdjustmentValues | undefined,
  handleId: string,
  x: number,
  y: number,
): ShapeAdjustmentProjection | undefined {
  const projection = resolveShapeAdjustmentProjection(shapeType, values)
  if (!projection) return undefined
  const next = {...projection.adjustments}
  if (handleId === 'radius') next['radius'] = x
  if (handleId === 'apexX') next['apexX'] = x
  if (handleId === 'inset') next['inset'] = x
  if (handleId === 'tail') {
    next['tailX'] = x
    next['tailY'] = y
  }
  if (handleId === 'headLength' || handleId === 'shaftThickness') {
    let canonical = point(x, y)
    if (
      shapeType === 'right-arrow' || shapeType === 'left-arrow' ||
      shapeType === 'up-arrow' || shapeType === 'down-arrow'
    ) {
      canonical = cardinalPointToRight(shapeType, canonical)
    } else if (shapeType === 'up-down-arrow') {
      canonical = point(1000 - y, x)
    }
    if (handleId === 'headLength') {
      next['headLength'] = shapeType === 'left-right-arrow' ||
        shapeType === 'up-down-arrow'
        ? canonical.x
        : 1000 - canonical.x
    } else {
      next['shaftThickness'] = Math.abs(500 - canonical.y) * 2
    }
  }
  return resolveShapeAdjustmentProjection(shapeType, next)
}
