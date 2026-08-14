import {resolveBlockPosition, type IBlockProps} from '../../framework'

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

export interface ShapeBlockProps extends IBlockProps {
  shapeType: ShapeKind
  width: number
  height: number
  rotation?: number
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
  strokeStyle: ShapeStrokeStyle
  textColor: string
  shapeTextAlign: ShapeTextAlign
  verticalAlign: ShapeVerticalAlign
}

export interface NormalizedShapeBlockProps extends ShapeBlockProps {
  rotation: number
}

export const DEFAULT_SHAPE_PROPS: Readonly<NormalizedShapeBlockProps> = {
  shapeType: 'rectangle',
  width: 180,
  height: 100,
  rotation: 0,
  fillColor: '#93C5FD',
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
  }
}
