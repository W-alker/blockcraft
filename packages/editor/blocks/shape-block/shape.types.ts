import {resolveBlockPosition, type IBlockProps} from '../../framework'
import {
  normalizeCustomShapeGeometry,
  normalizeShapeAdjustments,
} from './shape-geometry'
import {SHAPE_GEOMETRY_VERSION} from './shape-geometry.constants'
import {
  DEFAULT_SHAPE_GRADIENT,
  normalizeShapeGradient,
  type ShapeFillType,
  type ShapeGradientFill,
} from './shape-fill'

export {SHAPE_GEOMETRY_VERSION} from './shape-geometry.constants'
export * from './shape-fill'

export const SHAPE_KINDS = [
  'rectangle',
  'rounded-rectangle',
  'single-rounded-rectangle',
  'same-side-rounded-rectangle',
  'snipped-rectangle',
  'snipped-and-rounded-rectangle',
  'ellipse',
  'triangle',
  'right-triangle',
  'diamond',
  'trapezoid',
  'heptagon',
  'octagon',
  'decagon',
  'dodecagon',
  'teardrop',
  'frame',
  'half-frame',
  'corner',
  'diagonal-stripe',
  'plus',
  'plaque',
  'can',
  'cube',
  'bevel',
  'donut',
  'no-symbol',
  'pie',
  'folded-corner',
  'smiley-face',
  'heart',
  'lightning-bolt',
  'sun',
  'moon',
  'cloud',
  'line',
  'line-arrow',
  'line-double-arrow',
  'elbow-connector',
  'elbow-arrow-connector',
  'curved-connector',
  'curved-arrow-connector',
  'scribble',
  'right-arrow',
  'left-arrow',
  'up-arrow',
  'down-arrow',
  'left-right-arrow',
  'up-down-arrow',
  'quad-arrow',
  'left-right-up-arrow',
  'bent-arrow',
  'u-turn-arrow',
  'left-up-arrow',
  'bent-up-arrow',
  'striped-right-arrow',
  'chevron',
  'pentagon-arrow',
  'math-plus',
  'math-minus',
  'math-multiply',
  'math-divide',
  'math-equal',
  'math-not-equal',
  'flow-process',
  'flow-alternate-process',
  'flow-decision',
  'flow-data',
  'flow-predefined-process',
  'flow-internal-storage',
  'flow-document',
  'flow-multi-document',
  'flow-terminator',
  'flow-preparation',
  'flow-manual-input',
  'flow-manual-operation',
  'flow-connector',
  'flow-offpage-connector',
  'flow-delay',
  'flow-display',
  'star-4',
  'star',
  'star-6',
  'star-7',
  'star-8',
  'star-10',
  'star-12',
  'star-16',
  'star-24',
  'explosion',
  'ribbon',
  'ribbon-2',
  'wave',
  'double-wave',
  'rounded-speech-bubble',
  'cloud-callout',
  'wedge-rect-callout',
  'wedge-round-callout',
  'wedge-ellipse-callout',
  'parallelogram',
  'hexagon',
  'speech-bubble',
  'notched-right-arrow',
] as const

export type ShapeKind = typeof SHAPE_KINDS[number]
export type ShapeStrokeStyle = 'solid' | 'dashed'
export type ShapeTextAlign = 'left' | 'center' | 'right'
export type ShapeVerticalAlign = 'top' | 'middle' | 'bottom'

/**
 * Word/DrawingML-style parameter values for catalogue geometry. The catalogue
 * owns the formulas; snapshots only retain the user's compact inputs.
 */
export type ShapeAdjustmentValues = Record<string, number>

declare const serializedCustomShapeGeometry: unique symbol
export type SerializedCustomShapeGeometry = string & {
  readonly [serializedCustomShapeGeometry]: true
}

export interface ShapeMovePathCommand {
  type: 'move'
  x: number
  y: number
}

export interface ShapeLinePathCommand {
  type: 'line'
  x: number
  y: number
}

export interface ShapeCubicPathCommand {
  type: 'cubic'
  control1X: number
  control1Y: number
  control2X: number
  control2Y: number
  x: number
  y: number
}

export interface ShapeArcPathCommand {
  type: 'arc'
  radiusX: number
  radiusY: number
  rotation: number
  largeArc: boolean
  sweep: boolean
  x: number
  y: number
}

export interface ShapeClosePathCommand {
  type: 'close'
}

export type ShapePathCommand =
  | ShapeMovePathCommand
  | ShapeLinePathCommand
  | ShapeCubicPathCommand
  | ShapeArcPathCommand
  | ShapeClosePathCommand

export interface CustomShapePath {
  /** Open linework stays unfilled; closed freeforms opt in explicitly. */
  fill: boolean
  commands: ShapePathCommand[]
}

/**
 * A safe, editable alternative to arbitrary SVG markup. Geometry coordinates
 * live in their own view box while placement/size/rotation stay on the block.
 */
export interface CustomShapeGeometry {
  version: typeof SHAPE_GEOMETRY_VERSION
  width: number
  height: number
  fillRule?: 'evenodd'
  paths: CustomShapePath[]
}

export interface ShapeBlockProps extends IBlockProps {
  shapeType: ShapeKind
  width: number
  height: number
  rotation?: number
  fillColor: string
  /** 缺省视为 'solid'，旧文档无需迁移。 */
  fillType?: ShapeFillType
  /** CSS 角度语义（0deg 朝上、顺时针）。仅 fillType 为渐变时参与渲染。 */
  gradientAngle?: number
  gradientColors?: string[]
  gradientStops?: number[]
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
  strokeStyle: ShapeStrokeStyle
  textColor: string
  shapeTextAlign: ShapeTextAlign
  verticalAlign: ShapeVerticalAlign
  adjustments?: ShapeAdjustmentValues
  /** Versioned, validated CustomShapeGeometry encoded as one atomic JSON value. */
  customGeometry?: SerializedCustomShapeGeometry
}

export interface NormalizedShapeBlockProps extends ShapeBlockProps {
  rotation: number
  fillType: ShapeFillType
}

export const DEFAULT_SHAPE_PROPS: Readonly<NormalizedShapeBlockProps> = {
  shapeType: 'rectangle',
  width: 180,
  height: 100,
  rotation: 0,
  fillColor: '#93C5FD',
  fillType: 'solid',
  fillOpacity: 1,
  strokeColor: '#2563EB',
  strokeWidth: 2,
  strokeStyle: 'solid',
  textColor: '#0F172A',
  shapeTextAlign: 'center',
  verticalAlign: 'middle',
}

const HEX_COLOR = /^#[\da-f]{3}(?:[\da-f]{3})?$/i

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === 'string' &&
    (SHAPE_KINDS as readonly string[]).includes(value)
}

export function normalizeShapeRotation(value: unknown): number {
  const rotation = Number(value)
  if (!Number.isFinite(rotation)) return DEFAULT_SHAPE_PROPS.rotation
  const normalized = ((rotation % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

export function normalizeShapeProps(
  props: Partial<ShapeBlockProps> | null | undefined,
): NormalizedShapeBlockProps {
  const width = Number(props?.width)
  const height = Number(props?.height)
  const fillOpacity = Number(props?.fillOpacity)
  const strokeWidth = Number(props?.strokeWidth)
  const position = props?.position && typeof props.position === 'object'
    ? resolveBlockPosition(props.position)
    : null
  const adjustments = normalizeShapeAdjustments(props?.adjustments)
  const customGeometry = normalizeCustomShapeGeometry(props?.customGeometry)
  const fillType: ShapeFillType = props?.fillType === 'linear-gradient'
    ? 'linear-gradient'
    : 'solid'
  // 渐变值对象在两种情况下保留：正在使用渐变，或曾配置过渐变
  // （切回纯色后再切回渐变时不丢用户配色）。
  const gradient = fillType === 'linear-gradient' ||
    Array.isArray(props?.gradientColors)
    ? normalizeShapeGradient(
      props?.gradientAngle,
      props?.gradientColors,
      props?.gradientStops,
    )
    : null

  return {
    shapeType: isShapeKind(props?.shapeType)
      ? props.shapeType
      : DEFAULT_SHAPE_PROPS.shapeType,
    width: Number.isFinite(width)
      ? Math.max(48, width)
      : DEFAULT_SHAPE_PROPS.width,
    height: Number.isFinite(height)
      ? Math.max(32, height)
      : DEFAULT_SHAPE_PROPS.height,
    rotation: normalizeShapeRotation(props?.rotation),
    fillColor: HEX_COLOR.test(props?.fillColor ?? '')
      ? props!.fillColor!
      : DEFAULT_SHAPE_PROPS.fillColor,
    fillType,
    ...(gradient ? {
      gradientAngle: gradient.angle,
      gradientColors: gradient.colors,
      gradientStops: gradient.stops,
    } : {}),
    fillOpacity: Number.isFinite(fillOpacity)
      ? Math.min(1, Math.max(0, fillOpacity))
      : DEFAULT_SHAPE_PROPS.fillOpacity,
    strokeColor: HEX_COLOR.test(props?.strokeColor ?? '')
      ? props!.strokeColor!
      : DEFAULT_SHAPE_PROPS.strokeColor,
    strokeWidth: Number.isFinite(strokeWidth)
      ? Math.min(20, Math.max(0, strokeWidth))
      : DEFAULT_SHAPE_PROPS.strokeWidth,
    strokeStyle: props?.strokeStyle === 'dashed'
      ? 'dashed'
      : DEFAULT_SHAPE_PROPS.strokeStyle,
    textColor: HEX_COLOR.test(props?.textColor ?? '')
      ? props!.textColor!
      : DEFAULT_SHAPE_PROPS.textColor,
    shapeTextAlign:
      props?.shapeTextAlign === 'left' || props?.shapeTextAlign === 'right'
        ? props.shapeTextAlign
        : DEFAULT_SHAPE_PROPS.shapeTextAlign,
    verticalAlign:
      props?.verticalAlign === 'top' || props?.verticalAlign === 'bottom'
        ? props.verticalAlign
        : DEFAULT_SHAPE_PROPS.verticalAlign,
    ...(position ? {position} : {}),
    ...(props?.placementLayer === 'under' ? {placementLayer: 'under' as const} : {}),
    ...(adjustments ? {adjustments} : {}),
    ...(customGeometry ? {
      customGeometry: JSON.stringify(customGeometry) as
        SerializedCustomShapeGeometry,
    } : {}),
  }
}

/**
 * 渲染侧取当前生效的渐变填充；纯色返回 null。
 * 入参须是 normalizeShapeProps 的产物（渐变字段已保证有效）。
 */
export function resolveShapeFillGradient(
  props: NormalizedShapeBlockProps,
): ShapeGradientFill | null {
  if (props.fillType !== 'linear-gradient') return null
  return {
    angle: props.gradientAngle ?? DEFAULT_SHAPE_GRADIENT.angle,
    colors: props.gradientColors ?? [...DEFAULT_SHAPE_GRADIENT.colors],
    stops: props.gradientStops ?? [...DEFAULT_SHAPE_GRADIENT.stops],
  }
}
