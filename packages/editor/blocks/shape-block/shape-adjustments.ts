import type {ShapeAdjustmentValues, ShapeKind} from './shape.types'
import type {ShapeTextInsets} from './shape-definitions'

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
type CalloutSide = 'top' | 'right' | 'bottom' | 'left'

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

// Keep each preset's original geometry at its default values. Normal editing
// changes named, bounded dimensions rather than exposing every path vertex.
const STAR_PRESETS: Partial<Record<ShapeKind, readonly [number, number, number]>> = {
  'star-4': [4, 150, 490], star: [5, 210, 490], 'star-6': [6, 240, 490],
  'star-7': [7, 245, 490], 'star-8': [8, 260, 490], 'star-10': [10, 290, 490],
  'star-12': [12, 310, 490], 'star-16': [16, 330, 490], 'star-24': [24, 350, 490],
  explosion: [12, 210, 500], sun: [16, 350, 490],
}

const presetAdjustmentProjection = (
  shapeType: ShapeKind,
  values: ShapeAdjustmentValues,
): ShapeAdjustmentProjection | undefined => {
  const star = STAR_PRESETS[shapeType]
  if (star) {
    const [count, fallback, outer] = star
    const innerRadius = clamp(values['innerRadius'], 50, outer - 20, fallback)
    const polar = (angle: number, radius: number) => point(
      Math.round((500 + Math.cos(angle) * radius) * 100) / 100,
      Math.round((500 + Math.sin(angle) * radius) * 100) / 100,
    )
    return {
      path: pointsPath(Array.from({length: count * 2}, (_, i) =>
        polar((-90 + i * 180 / count) * Math.PI / 180, i % 2 ? innerRadius : outer))),
      adjustments: {innerRadius},
      handles: [{...polar((-90 + 180 / count) * Math.PI / 180, innerRadius),
        id: 'innerRadius', label: '调整星角深度'}],
    }
  }
  if (shapeType === 'snipped-rectangle' || shapeType === 'snipped-and-rounded-rectangle') {
    const snip = clamp(values['snip'], 0, 500, 140)
    const rounded = shapeType === 'snipped-and-rounded-rectangle'
    const radius = clamp(values['radius'], 0, 500, 120)
    return {
      path: rounded
        ? `M${snip} 0H${1000 - radius}Q1000 0 1000 ${radius}V1000H0V${snip}Z`
        : `M${snip} 0H1000V1000H0V${snip}Z`,
      adjustments: rounded ? {snip, radius} : {snip},
      handles: [{id: 'snip', x: snip / 2, y: snip / 2, label: '调整剪角'},
        ...(rounded ? [{id: 'radius', x: 1000 - radius, y: 0, label: '调整圆角'}] : [])],
    }
  }
  if (shapeType === 'frame' || shapeType === 'corner') {
    const thickness = clamp(values['thickness'], 40, 450, shapeType === 'frame' ? 160 : 260)
    return {
      path: shapeType === 'frame'
        ? `M0 0H1000V1000H0ZM${thickness} ${thickness}V${1000 - thickness}H${1000 - thickness}V${thickness}Z`
        : `M0 0H${thickness}V${1000 - thickness}H1000V1000H0Z`,
      adjustments: {thickness},
      handles: [{id: 'thickness', x: thickness, y: 250, label: '调整边框厚度'}],
    }
  }
  if (shapeType === 'donut') {
    const innerRadius = clamp(values['innerRadius'], 60, 450, 240)
    return {
      path: `M500 0A500 500 0 1 1 499.9 0ZM500 ${500 - innerRadius}A${innerRadius} ${innerRadius} 0 1 0 500.1 ${500 - innerRadius}Z`,
      adjustments: {innerRadius},
      handles: [{id: 'innerRadius', x: 500 - innerRadius, y: 500, label: '调整圆环宽度'}],
    }
  }
  if (shapeType === 'bookmark' || shapeType.startsWith('ribbon-notched')) {
    const notch = clamp(values['notch'], 0, 450, shapeType === 'bookmark' ? 240 : 100)
    let path = `M0 0H1000V1000L500 ${1000 - notch}L0 1000Z`
    let handle = point(500, 1000 - notch)
    if (shapeType !== 'bookmark') {
      const left = shapeType !== 'ribbon-notched-right'
      const right = shapeType !== 'ribbon-notched-left'
      path = `M0 0H1000${right ? `L${1000 - notch} 500L1000 1000` : 'V1000'}H0${left ? `L${notch} 500` : ''}Z`
      handle = left ? point(notch, 500) : point(1000 - notch, 500)
    }
    return {path, adjustments: {notch}, handles: [{...handle, id: 'notch', label: '调整凹口深度'}]}
  }
  if (shapeType === 'chevron' || shapeType === 'pentagon-arrow' || shapeType === 'notched-right-arrow') {
    const headLength = clamp(values['headLength'], 100, 600, shapeType === 'notched-right-arrow' ? 320 : 380)
    const notch = clamp(values['notch'], 0, Math.min(450, 900 - headLength), shapeType === 'notched-right-arrow' ? 220 : 380)
    const notched = shapeType !== 'pentagon-arrow'
    return {
      path: `M0 0H${1000 - headLength}L1000 500L${1000 - headLength} 1000H0${notched ? `L${notch} 500` : ''}Z`,
      adjustments: notched ? {headLength, notch} : {headLength},
      handles: [{id: 'headLength', x: 1000 - headLength, y: 0, label: '调整箭头长度'},
        ...(notched ? [{id: 'notch', x: notch, y: 500, label: '调整凹口深度'}] : [])],
    }
  }
  return undefined
}

const calloutSide = (tailX: number, tailY: number): CalloutSide => {
  const distances: readonly [CalloutSide, number][] = [
    ['top', tailY],
    ['right', 1000 - tailX],
    ['bottom', 1000 - tailY],
    ['left', tailX],
  ]
  return distances.reduce((nearest, candidate) =>
    candidate[1] < nearest[1] ? candidate : nearest,
  distances[2]!)[0]
}

const calloutPath = (
  side: CalloutSide,
  tailX: number,
  tailY: number,
  rounded: boolean,
  wedge: boolean,
): string => {
  const halfBase = wedge ? 85 : 55
  const left = clamp(tailX - halfBase, 120, 780, 415)
  const right = clamp(tailX + halfBase, 220, 880, 585)
  const top = clamp(tailY - halfBase, 120, 780, 415)
  const bottom = clamp(tailY + halfBase, 220, 880, 585)
  if (!rounded) {
    if (side === 'top') {
      return `M0 240H${left}L${tailX} ${tailY}L${right} 240H1000V1000H0Z`
    }
    if (side === 'right') {
      return `M0 0H760V${top}L${tailX} ${tailY}L760 ${bottom}V1000H0Z`
    }
    if (side === 'left') {
      return `M240 0H1000V1000H240V${bottom}L${tailX} ${tailY}L240 ${top}Z`
    }
    return `M0 0H1000V760H${right}L${tailX} ${tailY}L${left} 760H0Z`
  }
  if (side === 'top') {
    return `M120 240H${left}L${tailX} ${tailY}L${right} 240H880` +
      'Q1000 240 1000 360V880Q1000 1000 880 1000H120' +
      'Q0 1000 0 880V360Q0 240 120 240Z'
  }
  if (side === 'right') {
    return `M120 0H640Q760 0 760 120V${top}L${tailX} ${tailY}` +
      `L760 ${bottom}V880Q760 1000 640 1000H120` +
      'Q0 1000 0 880V120Q0 0 120 0Z'
  }
  if (side === 'left') {
    return `M360 0H880Q1000 0 1000 120V880Q1000 1000 880 1000H360` +
      `Q240 1000 240 880V${bottom}L${tailX} ${tailY}L240 ${top}` +
      'V120Q240 0 360 0Z'
  }
  return `M120 0H880Q1000 0 1000 120V640Q1000 760 880 760` +
    `H${right}L${tailX} ${tailY}L${left} 760H120` +
    'Q0 760 0 640V120Q0 0 120 0Z'
}

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
  const path = calloutPath(
    calloutSide(tailX, tailY), tailX, tailY, rounded, wedge,
  )
  return {
    path,
    adjustments: {tailX, tailY},
    handles: [{id: 'tail', x: tailX, y: tailY, label: '调整标注指向'}],
  }
}

/**
 * DrawingML-style shape text rectangle, before user text-frame margins.
 * The roundRect inset is radius * 29289 / 100000; triangle/trapezoid/arrow
 * rectangles follow the corresponding presetShapeDefinitions.xml guides.
 * Adapted to our existing 1000-unit paths (including their orientation and
 * callout body). Do not apply Office's default radius or short-side scaling:
 * that would change the geometry of existing documents.
 * Source: https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/drawingml/customshapes/presetShapeDefinitions.xml
 */
export function resolveAdjustedShapeTextInsets(
  shapeType: ShapeKind,
  values: ShapeAdjustmentValues | undefined,
  fallback: ShapeTextInsets,
): ShapeTextInsets {
  const adjustments = values ?? {}
  if (shapeType === 'rectangle') return {top: 0, right: 0, bottom: 0, left: 0}
  if (
    shapeType === 'rounded-rectangle' ||
    shapeType === 'single-rounded-rectangle' ||
    shapeType === 'same-side-rounded-rectangle'
  ) {
    const inset = clamp(adjustments['radius'], 0, 500, 120) * .29289 / 1000
    if (shapeType === 'single-rounded-rectangle') {
      // Our single rounded corner is top-left (Office round1Rect is top-right).
      return {top: 0, right: 0, bottom: 0, left: inset}
    }
    return {
      top: inset,
      right: shapeType === 'same-side-rounded-rectangle' ? 0 : inset,
      bottom: inset,
      left: inset,
    }
  }
  if (shapeType === 'snipped-rectangle') {
    const inset = clamp(adjustments['snip'], 0, 500, 140) / 2000
    return {top: inset, right: 0, bottom: 0, left: inset}
  }
  if (shapeType === 'snipped-and-rounded-rectangle') {
    const round = clamp(adjustments['radius'], 0, 500, 120) * .29289 / 1000
    return {top: round, right: round, bottom: 0, left: clamp(adjustments['snip'], 0, 500, 140) / 2000}
  }
  if (shapeType === 'ellipse') {
    const inset = (1 - Math.SQRT1_2) / 2
    return {top: inset, right: inset, bottom: inset, left: inset}
  }
  if (shapeType === 'triangle') {
    const left = clamp(adjustments['apexX'], 0, 1000, 500) / 2000
    return {top: .5, right: .5 - left, bottom: 0, left}
  }
  if (shapeType === 'parallelogram') {
    const inset = (1 + 5 * clamp(adjustments['inset'], 0, 500, 200) / 1000) / 12
    return {top: inset, right: inset, bottom: inset, left: inset}
  }
  if (shapeType === 'trapezoid') {
    const inset = clamp(adjustments['inset'], 0, 500, 200) / 1500
    return {top: inset, right: inset, bottom: 0, left: inset}
  }
  if (
    shapeType === 'right-arrow' || shapeType === 'left-arrow' ||
    shapeType === 'up-arrow' || shapeType === 'down-arrow' ||
    shapeType === 'left-right-arrow' || shapeType === 'up-down-arrow'
  ) {
    const bidirectional = shapeType === 'left-right-arrow' || shapeType === 'up-down-arrow'
    const head = clamp(adjustments['headLength'], 100, bidirectional ? 420 : 650, bidirectional ? 260 : 380)
    const shaft = clamp(adjustments['shaftThickness'], 160, 900, 500)
    const edge = (1000 - shaft) / 2000
    const tip = head * shaft / 1_000_000
    if (shapeType === 'up-down-arrow') return {top: tip, right: edge, bottom: tip, left: edge}
    if (shapeType === 'up-arrow') return {top: tip, right: edge, bottom: 0, left: edge}
    if (shapeType === 'down-arrow') return {top: 0, right: edge, bottom: tip, left: edge}
    return {
      top: edge,
      right: shapeType === 'left-arrow' ? 0 : tip,
      bottom: edge,
      left: bidirectional || shapeType === 'left-arrow' ? tip : 0,
    }
  }
  if (
    shapeType !== 'speech-bubble' &&
    shapeType !== 'rounded-speech-bubble' &&
    shapeType !== 'wedge-rect-callout' &&
    shapeType !== 'wedge-round-callout'
  ) return fallback
  const side = calloutSide(
    clamp(adjustments['tailX'], 0, 1000, 130),
    clamp(adjustments['tailY'], 0, 1000, 1000),
  )
  const rounded = shapeType === 'rounded-speech-bubble' || shapeType === 'wedge-round-callout'
  const edgeInset = rounded ? .12 * .29289 : 0
  // Our callout path reserves 240/1000 on the pointer side for its tail.
  const bodyInset = .24 + edgeInset
  return {
    top: side === 'top' ? bodyInset : edgeInset,
    right: side === 'right' ? bodyInset : edgeInset,
    bottom: side === 'bottom' ? bodyInset : edgeInset,
    left: side === 'left' ? bodyInset : edgeInset,
  }
}

export function resolveShapeAdjustmentProjection(
  shapeType: ShapeKind,
  values: ShapeAdjustmentValues | undefined,
): ShapeAdjustmentProjection | undefined {
  const adjustmentValues = values ?? {}
  const preset = presetAdjustmentProjection(shapeType, adjustmentValues)
  if (preset) return preset
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
  if (handleId === 'radius') next['radius'] = shapeType === 'snipped-and-rounded-rectangle' ? 1000 - x : x
  if (handleId === 'snip') next['snip'] = x + y
  if (handleId === 'thickness') next['thickness'] = x
  if (handleId === 'innerRadius') {
    const star = STAR_PRESETS[shapeType]
    const angle = star ? (-90 + 180 / star[0]) * Math.PI / 180 : 0
    next['innerRadius'] = star ? (x - 500) * Math.cos(angle) + (y - 500) * Math.sin(angle) : 500 - x
  }
  if (handleId === 'notch') next['notch'] = shapeType === 'bookmark' ? 1000 - y
    : shapeType === 'ribbon-notched-right' ? 1000 - x : x
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
