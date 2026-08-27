import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  normalizeBlockObjectFormat,
  resolveBlockPosition,
  storeObjectEffects,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  storeObjectTextStyle,
  type BlockObjectFormatCapability,
  type BlockObjectFormatProps,
  type ObjectEffects,
  type ObjectLine,
  type ObjectPaint,
  type ObjectTextFrame,
  type ObjectTextStyle,
} from '../../framework'
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
import {getShapeDefinition} from './shape-definitions'

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

export interface ShapeBlockProps extends BlockObjectFormatProps {
  shape: ShapeKind
  adjustments?: ShapeAdjustmentValues
  /** Versioned, validated CustomShapeGeometry encoded as one atomic JSON value. */
  customGeometry?: SerializedCustomShapeGeometry
}

export interface NormalizedShapeBlockProps {
  width: number
  height: number
  position?: NonNullable<ShapeBlockProps['position']>
  placementLayer?: 'under'
  adjustments?: ShapeAdjustmentValues
  customGeometry?: SerializedCustomShapeGeometry
  shapeType: ShapeKind
  rotation: number
  lockAspectRatio: boolean
  shapeFill: ObjectPaint
  shapeOutline: ObjectLine
  shapeEffects: ObjectEffects
  textFrame: ObjectTextFrame
  textStyle: ObjectTextStyle
  fillColor: string
  fillType: ShapeFillType
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
}

const DEFAULT_SHAPE_FILL = {...DEFAULT_OBJECT_PAINT, color: '#93C5FD'}
const DEFAULT_SHAPE_OUTLINE = {
  ...DEFAULT_OBJECT_LINE,
  color: '#2563EB',
  width: 2,
}
const DEFAULT_SHAPE_TEXT_FRAME = {...DEFAULT_OBJECT_TEXT_FRAME}
const DEFAULT_SHAPE_TEXT_STYLE = {
  ...DEFAULT_OBJECT_TEXT_STYLE,
  fill: {...DEFAULT_OBJECT_TEXT_STYLE.fill, color: '#0F172A'},
}

export const SHAPE_OBJECT_FORMAT_CAPABILITY: BlockObjectFormatCapability = {
  kind: 'shape',
  features: {
    geometry: true,
    shape: true,
    pictureFill: true,
    lineArrows: true,
    textFrame: true,
    textStyle: 'rich-default',
  },
  defaults: {
    width: 180,
    height: 100,
    rotation: 0,
    lockAspectRatio: false,
    shapeType: 'rectangle',
    shapeFill: DEFAULT_SHAPE_FILL,
    shapeOutline: DEFAULT_SHAPE_OUTLINE,
    shapeEffects: DEFAULT_OBJECT_EFFECTS,
    textFrame: DEFAULT_SHAPE_TEXT_FRAME,
    textStyle: DEFAULT_SHAPE_TEXT_STYLE,
  },
  shapeTypes: SHAPE_KINDS,
  textlessShapeTypes: SHAPE_KINDS.filter(shapeType =>
    getShapeDefinition(shapeType).supportsText === false,
  ),
  lineArrowShapeTypes: SHAPE_KINDS.filter(shapeType =>
    getShapeDefinition(shapeType).supportsText === false,
  ),
}

export const DEFAULT_SHAPE_BLOCK_PROPS: Readonly<ShapeBlockProps> = {
  shape: 'rectangle',
  width: 180,
  height: 100,
  rotation: 0,
  lockRatio: false,
  fill: storeObjectPaint(DEFAULT_SHAPE_FILL),
  outline: storeObjectLine(DEFAULT_SHAPE_OUTLINE),
  effects: storeObjectEffects(DEFAULT_OBJECT_EFFECTS),
  textFrame: storeObjectTextFrame(DEFAULT_SHAPE_TEXT_FRAME),
  textStyle: storeObjectTextStyle(DEFAULT_SHAPE_TEXT_STYLE),
}

export const DEFAULT_SHAPE_PROPS: Readonly<NormalizedShapeBlockProps> = {
  width: 180,
  height: 100,
  rotation: 0,
  shapeType: 'rectangle',
  lockAspectRatio: false,
  shapeFill: {...DEFAULT_SHAPE_FILL},
  shapeOutline: {...DEFAULT_SHAPE_OUTLINE},
  shapeEffects: {
    shadow: {...DEFAULT_OBJECT_EFFECTS.shadow},
    glow: {...DEFAULT_OBJECT_EFFECTS.glow},
  },
  textFrame: {...DEFAULT_SHAPE_TEXT_FRAME},
  textStyle: {...DEFAULT_SHAPE_TEXT_STYLE},
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
  const objectFormat = normalizeBlockObjectFormat(
    props,
    SHAPE_OBJECT_FORMAT_CAPABILITY,
  )
  const fill = objectFormat.shapeFill!
  const outline = objectFormat.shapeOutline!
  const textFrame = objectFormat.textFrame!
  const textStyle = objectFormat.textStyle!
  const position = props?.position && typeof props.position === 'object'
    ? resolveBlockPosition(props.position)
    : null
  const adjustments = normalizeShapeAdjustments(props?.adjustments)
  const customGeometry = normalizeCustomShapeGeometry(props?.customGeometry)
  const fillType: ShapeFillType = fill.type === 'linear-gradient'
    ? 'linear-gradient'
    : 'solid'
  const gradient = fill.type === 'linear-gradient'
    ? normalizeShapeGradient(
        fill.angle,
        fill.stops.map(stop => stop.color),
        fill.stops.map(stop => stop.offset),
      )
    : null

  return {
    ...props,
    shapeType: objectFormat.shapeType as ShapeKind,
    width: Math.max(48, objectFormat.width),
    height: Math.max(32, objectFormat.height),
    rotation: objectFormat.rotation,
    lockAspectRatio: objectFormat.lockAspectRatio,
    shapeFill: fill,
    shapeOutline: outline,
    shapeEffects: objectFormat.shapeEffects!,
    textFrame,
    textStyle,
    fillColor: paintColor(fill),
    fillType,
    ...(gradient ? {
      gradientAngle: gradient.angle,
      gradientColors: gradient.colors,
      gradientStops: gradient.stops,
    } : {}),
    fillOpacity: fill.type === 'none' ? 0 : fill.opacity,
    strokeColor: outline.type === 'none' ? 'transparent' : outline.color,
    strokeWidth: outline.type === 'none' ? 0 : outline.width,
    strokeStyle: outline.dash === 'solid' ? 'solid' : 'dashed',
    textColor: paintColor(textStyle.fill),
    shapeTextAlign: textFrame.horizontalAlign === 'justify'
      ? 'left'
      : textFrame.horizontalAlign,
    verticalAlign: textFrame.verticalAlign,
    ...(position ? {position} : {}),
    ...(props?.placementLayer === 'under' ? {placementLayer: 'under' as const} : {}),
    ...(adjustments ? {adjustments} : {}),
    ...(customGeometry ? {
      customGeometry: JSON.stringify(customGeometry) as
        SerializedCustomShapeGeometry,
    } : {}),
  }
}

/** Canonical persisted Shape props; presentation aliases stay render-only. */
export function normalizeShapeSnapshotProps(
  value: Partial<ShapeBlockProps> | null | undefined,
): ShapeBlockProps {
  const normalized = normalizeShapeProps(value)
  return {
    shape: normalized.shapeType,
    width: normalized.width,
    height: normalized.height,
    rotation: normalized.rotation,
    lockRatio: normalized.lockAspectRatio,
    fill: storeObjectPaint(normalized.shapeFill),
    outline: storeObjectLine(normalized.shapeOutline),
    effects: storeObjectEffects(normalized.shapeEffects),
    textFrame: storeObjectTextFrame(normalized.textFrame),
    textStyle: storeObjectTextStyle(normalized.textStyle),
    ...(normalized.position ? {position: normalized.position} : {}),
    ...(normalized.placementLayer === 'under'
      ? {placementLayer: 'under' as const}
      : {}),
    ...(normalized.adjustments ? {adjustments: normalized.adjustments} : {}),
    ...(normalized.customGeometry
      ? {customGeometry: normalized.customGeometry}
      : {}),
  }
}

function paintColor(paint: ObjectPaint): string {
  if (paint.type === 'none' || paint.type === 'picture') return 'transparent'
  return paint.type === 'solid'
    ? paint.color
    : paint.stops[0]?.color ?? 'transparent'
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
