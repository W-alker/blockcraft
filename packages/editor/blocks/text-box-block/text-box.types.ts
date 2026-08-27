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
  type BlockSurfacePadding,
  type BlockSurfaceProps,
} from '../../framework'
import {getShapeDefinition} from '../shape-block/shape-definitions'
import {normalizeShapeAdjustments} from '../shape-block/shape-geometry'
import {
  SHAPE_KINDS,
  isShapeKind,
  type ShapeAdjustmentValues,
  type ShapeKind,
  type ShapeStrokeStyle,
} from '../shape-block/shape.types'
/**
 * Compact text flow direction. `h` keeps the document's normal
 * `horizontal-tb`; `v` switches the frame to Word-style vertical text.
 *
 * Only the frame carries the direction — child paragraphs stay ordinary
 * Blocks, and CSS logical axes flip alignment and block stacking on their own.
 */
export type TextBoxWritingMode = 'h' | 'v'

export interface TextBoxBlockProps extends BlockObjectFormatProps {
  /** Shape-shell kind; geometry remains catalog-side. */
  shape?: ShapeKind | null
  /** Shape-catalogue adjustment values, such as a callout tail position. */
  adjustments?: ShapeAdjustmentValues | null
  /** Built-in catalog decoration. Never reused as a user picture URL. */
  artwork?: string | null
}

export interface NormalizedTextBoxBlockProps {
  width: number
  height: number
  rotation: number
  position?: NonNullable<TextBoxBlockProps['position']>
  placementLayer?: 'under'
  artwork?: string
  adjustments?: ShapeAdjustmentValues
  lockAspectRatio: boolean
  shapeType: ShapeKind
  shapeFill: ObjectPaint
  shapeOutline: ObjectLine
  shapeEffects: ObjectEffects
  textFrame: ObjectTextFrame
  textStyle: ObjectTextStyle
  p: BlockSurfacePadding
  bgi?: NonNullable<BlockSurfaceProps['bgi']>
  bgs?: NonNullable<BlockSurfaceProps['bgs']>
  bgx?: NonNullable<BlockSurfaceProps['bgx']>
  bgy?: NonNullable<BlockSurfaceProps['bgy']>
  bgo?: NonNullable<BlockSurfaceProps['bgo']>
  backColor: string
  borderColor: string
  fo: number
  bw: number
  bs: ShapeStrokeStyle
  wm: TextBoxWritingMode
}

export const TEXT_BOX_SHAPE_KINDS = SHAPE_KINDS.filter(shapeType =>
  getShapeDefinition(shapeType).supportsText !== false,
)

const DEFAULT_TEXT_BOX_FILL = {...DEFAULT_OBJECT_PAINT, color: '#FFFFFF'}
const DEFAULT_TEXT_BOX_OUTLINE = {...DEFAULT_OBJECT_LINE, color: '#000000'}
const DEFAULT_TEXT_BOX_FRAME = {
  ...DEFAULT_OBJECT_TEXT_FRAME,
  margins: [8, 12, 8, 12] as [number, number, number, number],
  horizontalAlign: 'left' as const,
  verticalAlign: 'top' as const,
}
const DEFAULT_TEXT_BOX_STYLE = {
  ...DEFAULT_OBJECT_TEXT_STYLE,
  fontFamily: 'cjk-hei',
}

export const TEXT_BOX_OBJECT_FORMAT_CAPABILITY: BlockObjectFormatCapability = {
  kind: 'text-box',
  features: {
    geometry: true,
    shape: true,
    pictureFill: true,
    lineArrows: false,
    textFrame: true,
    textStyle: 'rich-default',
  },
  defaults: {
    width: 240,
    height: 120,
    rotation: 0,
    lockAspectRatio: false,
    shapeType: 'rectangle',
    shapeFill: DEFAULT_TEXT_BOX_FILL,
    shapeOutline: DEFAULT_TEXT_BOX_OUTLINE,
    shapeEffects: DEFAULT_OBJECT_EFFECTS,
    textFrame: DEFAULT_TEXT_BOX_FRAME,
    textStyle: DEFAULT_TEXT_BOX_STYLE,
  },
  shapeTypes: TEXT_BOX_SHAPE_KINDS,
}

export const DEFAULT_TEXT_BOX_PROPS: Readonly<TextBoxBlockProps> = {
  width: 240,
  height: 120,
  rotation: 0,
  lockRatio: false,
  shape: 'rectangle',
  fill: storeObjectPaint(DEFAULT_TEXT_BOX_FILL),
  outline: storeObjectLine(DEFAULT_TEXT_BOX_OUTLINE),
  effects: storeObjectEffects(DEFAULT_OBJECT_EFFECTS),
  textFrame: storeObjectTextFrame(DEFAULT_TEXT_BOX_FRAME),
  textStyle: storeObjectTextStyle(DEFAULT_TEXT_BOX_STYLE),
}

/**
 * Vertical frames are drawn tall rather than wide. Callers that insert without
 * picking a preset use this to seed the drawing gesture.
 */
export const DEFAULT_VERTICAL_TEXT_BOX_SIZE = {
  width: DEFAULT_TEXT_BOX_PROPS.height,
  height: DEFAULT_TEXT_BOX_PROPS.width,
} as const

const MIN_WIDTH = 48
const MIN_HEIGHT = 32
const MAX_DIMENSION = 2_000

export function normalizeTextBoxProps(
  value: Readonly<Partial<TextBoxBlockProps>> | null | undefined,
): NormalizedTextBoxBlockProps {
  const input = value as Readonly<Record<string, unknown>> | null | undefined
  const objectFormat = normalizeBlockObjectFormat(
    value,
    TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
  )
  const fill = objectFormat.shapeFill!
  const outline = objectFormat.shapeOutline!
  const textFrame = objectFormat.textFrame!
  const position = normalizePosition(input?.['position'])
  const textStyle = objectFormat.textStyle!
  const adjustments = normalizeShapeAdjustments(input?.['adjustments'])

  return {
    width: boundedDimension(objectFormat.width, DEFAULT_TEXT_BOX_PROPS.width, MIN_WIDTH),
    height: boundedDimension(objectFormat.height, DEFAULT_TEXT_BOX_PROPS.height, MIN_HEIGHT),
    rotation: objectFormat.rotation,
    lockAspectRatio: objectFormat.lockAspectRatio,
    shapeType: normalizeTextBoxShape(objectFormat.shapeType),
    shapeFill: fill,
    shapeOutline: outline,
    shapeEffects: objectFormat.shapeEffects!,
    textFrame,
    textStyle,
    p: clonePadding(textFrame.margins),
    backColor: paintColor(fill),
    borderColor: outline.type === 'none' ? 'transparent' : outline.color,
    fo: fill.type === 'none' ? 0 : fill.opacity,
    bw: outline.type === 'none' ? 0 : outline.width,
    bs: outline.dash === 'solid' ? 'solid' : 'dashed',
    wm: textFrame.direction === 'horizontal' ? 'h' : 'v',
    ...(fill.type === 'picture' && fill.src ? {
      bgi: fill.src,
      bgs: fill.fit,
      bgx: fill.positionX,
      bgy: fill.positionY,
      bgo: fill.opacity,
    } : {}),
    ...(typeof input?.['artwork'] === 'string'
      ? {artwork: input['artwork']}
      : {}),
    ...(adjustments ? {adjustments} : {}),
    ...(position ? {position} : {}),
    ...(input?.['placementLayer'] === 'under'
      ? {placementLayer: 'under' as const}
      : {}),
  }
}

/** Canonical persisted TextBox props; legacy render aliases never enter Yjs. */
export function normalizeTextBoxSnapshotProps(
  value: Readonly<Partial<TextBoxBlockProps>> | null | undefined,
): TextBoxBlockProps {
  const normalized = normalizeTextBoxProps(value)
  return {
    width: normalized.width,
    height: normalized.height,
    rotation: normalized.rotation,
    lockRatio: normalized.lockAspectRatio,
    shape: normalized.shapeType,
    fill: storeObjectPaint(normalized.shapeFill),
    outline: storeObjectLine(normalized.shapeOutline),
    effects: storeObjectEffects(normalized.shapeEffects),
    textFrame: storeObjectTextFrame(normalized.textFrame),
    textStyle: storeObjectTextStyle(normalized.textStyle),
    ...(normalized.artwork ? {artwork: normalized.artwork} : {}),
    ...(normalized.adjustments ? {adjustments: normalized.adjustments} : {}),
    ...(normalized.position ? {position: normalized.position} : {}),
    ...(normalized.placementLayer === 'under'
      ? {placementLayer: 'under' as const}
      : {}),
  }
}

function boundedDimension(
  value: unknown,
  fallback: number,
  minimum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(MAX_DIMENSION, Math.max(minimum, value))
}

function paintColor(paint: ObjectPaint): string {
  if (paint.type === 'none' || paint.type === 'picture') return 'transparent'
  return paint.type === 'solid'
    ? paint.color
    : paint.stops[0]?.color ?? 'transparent'
}

function clonePadding(value: BlockSurfacePadding): BlockSurfacePadding {
  if (!Array.isArray(value)) return value
  return [...value] as BlockSurfacePadding
}

function normalizeTextBoxShape(value: unknown): ShapeKind {
  if (!isShapeKind(value)) return 'rectangle'
  return getShapeDefinition(value).supportsText === false
    ? 'rectangle'
    : value
}

function normalizePosition(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return resolveBlockPosition(value)
}
