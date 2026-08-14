import {
  normalizeBlockSurfaceProps,
  resolveBlockPlacement,
  type BlockPositionState,
  type BlockSurfacePadding,
  type BlockSurfaceProps,
} from '../../framework'
import {getShapeDefinition} from '../shape-block/shape-definitions'
import {
  isShapeKind,
  type ShapeKind,
  type ShapeStrokeStyle,
} from '../shape-block/shape.types'
import {
  normalizeWordArtProps,
  type NormalizedWordArtBlockProps,
  type WordArtBlockProps,
} from '../word-art-block/word-art.types'

export type TextBoxWordArtStyle = Pick<
  NormalizedWordArtBlockProps,
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'fontStyle'
  | 'letterSpacingEm'
  | 'lineHeight'
  | 'horizontalAlign'
  | 'verticalAlign'
  | 'fillType'
  | 'fillColor'
  | 'gradientAngle'
  | 'gradientColors'
  | 'gradientStops'
  | 'outlineColor'
  | 'outlineWidthEm'
  | 'shadowEnabled'
  | 'shadowColor'
  | 'shadowOpacity'
  | 'shadowOffsetXEm'
  | 'shadowOffsetYEm'
  | 'shadowBlurEm'
  | 'effect'
>

export interface TextBoxBlockProps extends BlockSurfaceProps {
  width: number
  height: number
  rotation: number
  /** Compact shape-shell kind; geometry remains catalog-side. */
  sh?: ShapeKind
  /** Shape fill opacity. */
  fo?: number
  /** Shape outline width in layout px. */
  bw?: number
  /** Shape outline style. */
  bs?: ShapeStrokeStyle
  /** Canonical serialized WordArt-compatible text effect value object. */
  wa?: string | null
}

export interface NormalizedTextBoxBlockProps extends TextBoxBlockProps {
  width: number
  height: number
  rotation: number
  p: BlockSurfacePadding
  backColor: string
  borderColor: string
  sh: ShapeKind
  fo: number
  bw: number
  bs: ShapeStrokeStyle
  wa?: string
}

export const DEFAULT_TEXT_BOX_PROPS:
Readonly<NormalizedTextBoxBlockProps> = {
  width: 240,
  height: 120,
  rotation: 0,
  p: [8, 12],
  backColor: '#FFFFFF',
  borderColor: '#64748B',
  sh: 'rectangle',
  fo: 1,
  bw: 1,
  bs: 'solid',
}

const MIN_WIDTH = 48
const MIN_HEIGHT = 32
const MAX_DIMENSION = 2_000

export function normalizeTextBoxProps(
  value: Readonly<Partial<TextBoxBlockProps>> | null | undefined,
): NormalizedTextBoxBlockProps {
  const input = value as Readonly<Record<string, unknown>> | null | undefined
  const surface = normalizeBlockSurfaceProps(input)
  const placement = normalizePlacement(input?.['placement'])
  const wordArt = serializeTextBoxWordArtStyle(input?.['wa'])

  return {
    ...surface,
    width: boundedDimension(
      input?.['width'],
      DEFAULT_TEXT_BOX_PROPS.width,
      MIN_WIDTH,
    ),
    height: boundedDimension(
      input?.['height'],
      DEFAULT_TEXT_BOX_PROPS.height,
      MIN_HEIGHT,
    ),
    rotation: normalizeRotation(input?.['rotation']),
    p: clonePadding(surface.p ?? DEFAULT_TEXT_BOX_PROPS.p),
    backColor: normalizeColor(
      input?.['backColor'],
      DEFAULT_TEXT_BOX_PROPS.backColor,
    ),
    borderColor: normalizeColor(
      input?.['borderColor'],
      DEFAULT_TEXT_BOX_PROPS.borderColor,
    ),
    sh: normalizeTextBoxShape(input?.['sh']),
    fo: boundedNumber(input?.['fo'], DEFAULT_TEXT_BOX_PROPS.fo, 0, 1),
    bw: boundedNumber(input?.['bw'], DEFAULT_TEXT_BOX_PROPS.bw, 0, 20),
    bs: input?.['bs'] === 'dashed' ? 'dashed' : 'solid',
    ...(wordArt ? {wa: wordArt} : {}),
    ...(placement ? {placement} : {}),
  }
}

export function normalizeTextBoxWordArtStyle(
  value: unknown,
): TextBoxWordArtStyle | undefined {
  let source = value
  if (typeof source === 'string') {
    if (!source || source.length > 16_000) return undefined
    try {
      source = JSON.parse(source)
    } catch {
      return undefined
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return undefined
  }
  const props = normalizeWordArtProps(source as Partial<WordArtBlockProps>)
  return {
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight,
    fontStyle: props.fontStyle,
    letterSpacingEm: props.letterSpacingEm,
    lineHeight: props.lineHeight,
    horizontalAlign: props.horizontalAlign,
    verticalAlign: props.verticalAlign,
    fillType: props.fillType,
    fillColor: props.fillColor,
    gradientAngle: props.gradientAngle,
    gradientColors: [...props.gradientColors],
    gradientStops: [...props.gradientStops],
    outlineColor: props.outlineColor,
    outlineWidthEm: props.outlineWidthEm,
    shadowEnabled: props.shadowEnabled,
    shadowColor: props.shadowColor,
    shadowOpacity: props.shadowOpacity,
    shadowOffsetXEm: props.shadowOffsetXEm,
    shadowOffsetYEm: props.shadowOffsetYEm,
    shadowBlurEm: props.shadowBlurEm,
    effect: props.effect,
  }
}

export function serializeTextBoxWordArtStyle(value: unknown): string | undefined {
  const style = normalizeTextBoxWordArtStyle(value)
  return style ? JSON.stringify(style) : undefined
}

function boundedDimension(
  value: unknown,
  fallback: number,
  minimum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(MAX_DIMENSION, Math.max(minimum, value))
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

function normalizeRotation(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TEXT_BOX_PROPS.rotation
  const normalized = ((parsed % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.trim() || fallback
}

function clonePadding(value: BlockSurfacePadding): BlockSurfacePadding {
  if (!Array.isArray(value)) return value
  return [...value] as BlockSurfacePadding
}

function normalizeTextBoxShape(value: unknown): ShapeKind {
  if (!isShapeKind(value)) return DEFAULT_TEXT_BOX_PROPS.sh
  return getShapeDefinition(value).supportsText === false
    ? DEFAULT_TEXT_BOX_PROPS.sh
    : value
}

function normalizePlacement(value: unknown): BlockPositionState | undefined {
  const placement = resolveBlockPlacement(value)
  if (placement.mode !== 'absolute') return undefined
  return {
    mode: 'absolute',
    x: placement.x,
    y: placement.y,
    ...(placement.unit === 'px' ? {unit: 'px' as const} : {}),
    ...(placement.layer === 'under' ? {layer: 'under' as const} : {}),
  }
}
