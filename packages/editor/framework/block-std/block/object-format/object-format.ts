import {decodeCssPicture, encodeCssPicture} from './object-picture'
import {decodeObjectGradient, encodeObjectGradient} from './object-gradient'
import {quantizeObjectFormatNumber} from './object-format-number'
import type {IBlockProps} from '@ccc/blockcraft/framework/model'

/** 只读行内解码时保留合法精度；持久化构造使用缺省精度。 */
type ObjectFormatStorageOptions = Readonly<{preservePrecision?: boolean}>

export type ObjectPaintType = 'none' | 'solid' | 'linear-gradient' | 'picture'
export type ObjectPictureFit = 'cover' | 'contain' | 'stretch'

export interface ObjectNonePaint {
  type: 'none'
}

export interface ObjectSolidPaint {
  type: 'solid'
  color: string
  opacity: number
}

export interface ObjectGradientStop {
  color: string
  offset: number
  opacity: number
}

export interface ObjectLinearGradientPaint {
  type: 'linear-gradient'
  opacity: number
  angle: number
  stops: ObjectGradientStop[]
}

export interface ObjectPicturePaint {
  type: 'picture'
  opacity: number
  src: string
  fit: ObjectPictureFit
  positionX: number
  positionY: number
}

export type ObjectPaint =
  | ObjectNonePaint
  | ObjectSolidPaint
  | ObjectLinearGradientPaint
  | ObjectPicturePaint

export type ObjectLineDash =
  | 'solid'
  | 'dot'
  | 'dash'
  | 'dash-dot'
  | 'long-dash'
  | 'long-dash-dot'
export type ObjectLineCap = 'butt' | 'round' | 'square'
export type ObjectLineJoin = 'miter' | 'round' | 'bevel'
export type ObjectLineArrow = 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval'

export interface ObjectLine {
  type: 'none' | 'line'
  color: string
  opacity: number
  width: number
  dash: ObjectLineDash
  cap: ObjectLineCap
  join: ObjectLineJoin
  startArrow: ObjectLineArrow
  endArrow: ObjectLineArrow
}

export interface ObjectShadow {
  enabled: boolean
  color: string
  opacity: number
  blur: number
  angle: number
  distance: number
}

export interface ObjectGlow {
  enabled: boolean
  color: string
  opacity: number
  radius: number
}

export interface ObjectEffects {
  shadow: ObjectShadow
  glow: ObjectGlow
}

export type ObjectTextOutline =
  | {type: 'none'}
  | {type: 'line'; color: string; width: number}

export type ObjectTextDirection =
  | 'horizontal'
  | 'vertical-rl'
  | 'rotate-90'
  | 'rotate-270'
export type ObjectTextHorizontalAlign = 'left' | 'center' | 'right' | 'justify'
export type ObjectTextVerticalAlign = 'top' | 'middle' | 'bottom'
export type ObjectTextAutoFit = 'none' | 'resize-shape'

export interface ObjectTextFrame {
  /** top, right, bottom, left in layout pixels. */
  margins: [number, number, number, number]
  direction: ObjectTextDirection
  horizontalAlign: ObjectTextHorizontalAlign
  verticalAlign: ObjectTextVerticalAlign
  wrap: boolean
  autoFit: ObjectTextAutoFit
  rotateWithShape: boolean
}

export type ObjectTextTransform =
  | 'none'
  | 'slant-left'
  | 'slant-right'
  | 'slant-up'
  | 'slant-down'
  | 'perspective-left'
  | 'perspective-right'
  | 'perspective-up'
  | 'perspective-down'
  | 'wide'
  | 'narrow'
  | 'tall'
  | 'short'
  | 'inflate'
  | 'deflate'
  | 'arch-up'
  | 'arch-down'
  | 'circle'
  | 'wave'

export interface ObjectTextStyle {
  /** Registered family id or a bounded host-provided CSS font family. */
  fontFamily: string
  fontSize: number
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900
  fontStyle: 'normal' | 'italic'
  letterSpacingEm: number
  lineHeight: number
  fill: ObjectPaint
  outline: ObjectTextOutline
  effects: ObjectEffects
  transform: ObjectTextTransform
}

/** CSS paint token. Overall gradient/image alpha is stored by the owning props group. */
export type StoredObjectPaint = string
export interface StoredObjectLine {
  outline: string
  lineEnds?: string
  arrows?: string
}
export interface StoredObjectEffects {
  shadow: string
  glow: string
}
export interface StoredObjectTextFrame {
  textPadding: string
  textAlignment: string
  textDirection: ObjectTextDirection
  textWrap: boolean
  textAutoFit: ObjectTextAutoFit
  textRotate: boolean
}
export type StoredObjectTextOutline = string
export interface StoredObjectTextStyle {
  textFamily: string
  textFont: string
  textSpacing: string
  textFill: StoredObjectPaint
  textFillOpacity?: number
  textOutline: string
  textShadow: string
  textGlow: string
  textTransform: ObjectTextTransform
}

/** Each independent group is one atomic collaborative prop. */
export interface BlockObjectFormatProps extends IBlockProps {
  width: number
  height: number
  rotation: number
  lockRatio?: boolean | null
  shape?: string | null
  fill?: StoredObjectPaint | null
  fillOpacity?: number | null
  outline?: string | null
  lineEnds?: string | null
  arrows?: string | null
  shadow?: string | null
  glow?: string | null
  textPadding?: string | null
  textAlignment?: string | null
  textDirection?: ObjectTextDirection | null
  textWrap?: boolean | null
  textAutoFit?: ObjectTextAutoFit | null
  textRotate?: boolean | null
  textFamily?: string | null
  textFont?: string | null
  textSpacing?: string | null
  textFill?: StoredObjectPaint | null
  textFillOpacity?: number | null
  textOutline?: string | null
  textShadow?: string | null
  textGlow?: string | null
  textTransform?: ObjectTextTransform | null
}

export interface NormalizedBlockObjectFormat {
  width: number
  height: number
  rotation: number
  lockAspectRatio: boolean
  shapeType?: string
  shapeFill?: ObjectPaint
  shapeOutline?: ObjectLine
  shapeEffects?: ObjectEffects
  textFrame?: ObjectTextFrame
  textStyle?: ObjectTextStyle
}

export type ObjectFormatDefaults = NormalizedBlockObjectFormat

export interface ObjectFormatFeatureSet {
  geometry: boolean
  shape: boolean
  pictureFill: boolean
  lineArrows: boolean
  textFrame: boolean
  textStyle: false | 'rich-default' | 'uniform'
}

export interface BlockObjectFormatCapability {
  kind: 'shape' | 'text-box' | 'word-art'
  features: ObjectFormatFeatureSet
  defaults: ObjectFormatDefaults
  shapeTypes?: readonly string[]
  /** Targets that cannot retain object text; filtered for objects with content. */
  textlessShapeTypes?: readonly string[]
  /** Shape kinds whose open line geometry accepts start/end arrows. */
  lineArrowShapeTypes?: readonly string[]
}

export interface ObjectFormatPatch {
  width?: number | null
  height?: number | null
  rotation?: number | null
  lockAspectRatio?: boolean | null
  shapeType?: string | null
  shapeFill?: ObjectPaint | null
  shapeOutline?: ObjectLine | null
  shapeEffects?: ObjectEffects | null
  textFrame?: ObjectTextFrame | null
  textStyle?: ObjectTextStyle | null
}

export const DEFAULT_OBJECT_PAINT: Readonly<ObjectSolidPaint> = {
  type: 'solid',
  color: '#FFFFFF',
  opacity: 1,
}

export const DEFAULT_OBJECT_GRADIENT_PAINT: Readonly<ObjectLinearGradientPaint> = {
  type: 'linear-gradient',
  opacity: 1,
  angle: 180,
  stops: [
    {color: '#FFFFFF', offset: 0, opacity: 1},
    {color: '#000000', offset: 1, opacity: 1},
  ],
}

export const DEFAULT_OBJECT_PICTURE_PAINT: Readonly<ObjectPicturePaint> = {
  type: 'picture',
  opacity: 1,
  src: '',
  fit: 'cover',
  positionX: 50,
  positionY: 50,
}

export const DEFAULT_OBJECT_LINE: Readonly<ObjectLine> = {
  type: 'line',
  color: '#000000',
  opacity: 1,
  width: 1,
  dash: 'solid',
  cap: 'butt',
  join: 'miter',
  startArrow: 'none',
  endArrow: 'none',
}

export const DEFAULT_OBJECT_EFFECTS: Readonly<ObjectEffects> = {
  shadow: {
    enabled: false,
    color: '#000000',
    opacity: 0.25,
    blur: 4,
    angle: 45,
    distance: 2,
  },
  glow: {
    enabled: false,
    color: '#4857E2',
    opacity: 0.35,
    radius: 4,
  },
}

export const DEFAULT_OBJECT_TEXT_FRAME: Readonly<ObjectTextFrame> = {
  margins: [0, 0, 0, 0],
  direction: 'horizontal',
  horizontalAlign: 'center',
  verticalAlign: 'middle',
  wrap: true,
  autoFit: 'none',
  rotateWithShape: true,
}

export const DEFAULT_OBJECT_TEXT_STYLE: Readonly<ObjectTextStyle> = {
  fontFamily: 'arial',
  fontSize: 16,
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacingEm: 0,
  lineHeight: 1.2,
  fill: {...DEFAULT_OBJECT_PAINT, color: '#0F172A'},
  outline: {type: 'none'},
  effects: cloneEffects(DEFAULT_OBJECT_EFFECTS),
  transform: 'none',
}

const PAINT_TYPES = new Set<ObjectPaintType>([
  'none', 'solid', 'linear-gradient', 'picture',
])
const PICTURE_FITS = new Set<ObjectPictureFit>(['cover', 'contain', 'stretch'])
const LINE_DASHES = new Set<ObjectLineDash>([
  'solid', 'dot', 'dash', 'dash-dot', 'long-dash', 'long-dash-dot',
])
const LINE_CAPS = new Set<ObjectLineCap>(['butt', 'round', 'square'])
const LINE_JOINS = new Set<ObjectLineJoin>(['miter', 'round', 'bevel'])
const LINE_ARROWS = new Set<ObjectLineArrow>([
  'none', 'triangle', 'stealth', 'diamond', 'oval',
])
const TEXT_DIRECTIONS = new Set<ObjectTextDirection>([
  'horizontal', 'vertical-rl', 'rotate-90', 'rotate-270',
])
const HORIZONTAL_ALIGNS = new Set<ObjectTextHorizontalAlign>([
  'left', 'center', 'right', 'justify',
])
const VERTICAL_ALIGNS = new Set<ObjectTextVerticalAlign>([
  'top', 'middle', 'bottom',
])
const TEXT_TRANSFORMS = new Set<ObjectTextTransform>([
  'none',
  'slant-left', 'slant-right', 'slant-up', 'slant-down',
  'perspective-left', 'perspective-right',
  'perspective-up', 'perspective-down',
  'wide', 'narrow', 'tall', 'short', 'inflate', 'deflate',
  'arch-up', 'arch-down', 'circle', 'wave',
])
const FONT_WEIGHTS = new Set([400, 500, 600, 700, 800, 900])
export function normalizeObjectPaint(
  value: unknown,
  fallback: Readonly<ObjectPaint> | undefined = DEFAULT_OBJECT_PAINT,
): ObjectPaint {
  fallback ??= DEFAULT_OBJECT_PAINT
  const source = typeof value === 'string' ? readPaintString(value) : parseSection(value)
  const type = normalizePaintType(
    source?.['type'],
    fallback.type,
  )
  if (type === 'none') return {type: 'none'}
  if (type === 'solid') {
    const defaults = fallback.type === 'solid' ? fallback : DEFAULT_OBJECT_PAINT
    return {
      type,
      color: normalizeColor(source?.['color'], defaults.color),
      opacity: bounded(source?.['opacity'], defaults.opacity, 0, 1),
    }
  }
  if (type === 'linear-gradient') {
    const defaults = fallback.type === 'linear-gradient'
      ? fallback
      : DEFAULT_OBJECT_GRADIENT_PAINT
    return {
      type,
      opacity: bounded(source?.['opacity'], defaults.opacity, 0, 1),
      angle: bounded(source?.['angle'], defaults.angle, -360, 360),
      stops: normalizeGradientStops(
        source?.['stops'],
        defaults.stops,
      ),
    }
  }
  const defaults = fallback.type === 'picture'
    ? fallback
    : DEFAULT_OBJECT_PICTURE_PAINT
  return {
    type,
    opacity: bounded(source?.['opacity'], defaults.opacity, 0, 1),
    src: normalizeImageSource(source?.['src'], defaults.src),
    fit: isInSet(source?.['fit'], PICTURE_FITS)
      ? (source?.['fit']) as ObjectPictureFit
      : defaults.fit,
    positionX: bounded(
      source?.['positionX'],
      defaults.positionX,
      0,
      100,
    ),
    positionY: bounded(
      source?.['positionY'],
      defaults.positionY,
      0,
      100,
    ),
  }
}

export function createObjectPaint(
  type: 'none',
  current?: Readonly<ObjectPaint>,
): ObjectNonePaint
export function createObjectPaint(
  type: 'solid',
  current?: Readonly<ObjectPaint>,
): ObjectSolidPaint
export function createObjectPaint(
  type: 'linear-gradient',
  current?: Readonly<ObjectPaint>,
): ObjectLinearGradientPaint
export function createObjectPaint(
  type: 'picture',
  current?: Readonly<ObjectPaint>,
): ObjectPicturePaint
export function createObjectPaint(
  type: ObjectPaintType,
  current?: Readonly<ObjectPaint>,
): ObjectPaint
export function createObjectPaint(
  type: ObjectPaintType,
  current?: Readonly<ObjectPaint>,
): ObjectPaint {
  if (current?.type === type) return clonePaint(current)
  if (type === 'none') return {type}
  if (type === 'solid') return {...DEFAULT_OBJECT_PAINT}
  if (type === 'linear-gradient') return clonePaint(DEFAULT_OBJECT_GRADIENT_PAINT)
  return {...DEFAULT_OBJECT_PICTURE_PAINT}
}

export function storeObjectPaint(value: Readonly<ObjectPaint>, options: ObjectFormatStorageOptions = {}): StoredObjectPaint {
  const paint = normalizeObjectPaint(value)
  if (paint.type === 'none') return 'none'
  if (paint.type === 'solid') {
    return colorToken(paint.color, quantizeObjectFormatNumber(paint.opacity, 0.01, options.preservePrecision))
  }
  if (paint.type === 'linear-gradient') {
    const q = (number: number, step: number) => quantizeObjectFormatNumber(number, step, options.preservePrecision)
    return encodeObjectGradient({...paint,
      angle: q(paint.angle, 1),
      stops: paint.stops.map(stop => ({...stop, offset: q(stop.offset, 0.01), opacity: q(stop.opacity, 0.01)})),
    })
  }
  return encodeCssPicture({...paint,
    positionX: quantizeObjectFormatNumber(paint.positionX, 0.01, options.preservePrecision),
    positionY: quantizeObjectFormatNumber(paint.positionY, 0.01, options.preservePrecision),
  })
}

export function normalizeObjectLine(
  value: unknown,
  fallback: Readonly<ObjectLine> | undefined = DEFAULT_OBJECT_LINE,
): ObjectLine {
  fallback ??= DEFAULT_OBJECT_LINE
  const input = parseSection(value)
  const source = input && ['outline', 'lineEnds', 'arrows'].some(key => key in input) ? readLineGroups(input) : input
  const rawType = source?.['type']
  return {
    type: rawType === 'none' || rawType === 'n'
      ? 'none'
      : rawType === 'line' || rawType === 'l'
        ? 'line'
        : fallback.type,
    color: normalizeColor(source?.['color'] ?? source?.['c'], fallback.color),
    opacity: bounded(source?.['opacity'] ?? source?.['o'], fallback.opacity, 0, 1),
    width: bounded(source?.['width'] ?? source?.['w'], fallback.width, 0, 100),
    dash: isInSet(source?.['dash'] ?? source?.['d'], LINE_DASHES)
      ? (source?.['dash'] ?? source?.['d']) as ObjectLineDash
      : fallback.dash,
    cap: isInSet(source?.['cap'] ?? source?.['p'], LINE_CAPS)
      ? (source?.['cap'] ?? source?.['p']) as ObjectLineCap
      : fallback.cap,
    join: isInSet(source?.['join'] ?? source?.['j'], LINE_JOINS)
      ? (source?.['join'] ?? source?.['j']) as ObjectLineJoin
      : fallback.join,
    startArrow: isInSet(source?.['startArrow'] ?? source?.['s'], LINE_ARROWS)
      ? (source?.['startArrow'] ?? source?.['s']) as ObjectLineArrow
      : fallback.startArrow,
    endArrow: isInSet(source?.['endArrow'] ?? source?.['e'], LINE_ARROWS)
      ? (source?.['endArrow'] ?? source?.['e']) as ObjectLineArrow
      : fallback.endArrow,
  }
}

export function storeObjectLine(value: Readonly<ObjectLine>, options: ObjectFormatStorageOptions = {}): StoredObjectLine {
  const line = normalizeObjectLine(value)
  if (line.type === 'none') return {outline: 'none'}
  return {
    outline: `${quantizeObjectFormatNumber(line.width, 0.25, options.preservePrecision)}px ${line.dash} ${colorToken(line.color, quantizeObjectFormatNumber(line.opacity, 0.01, options.preservePrecision))}`,
    lineEnds: `${line.cap} ${line.join}`,
    arrows: `${line.startArrow} ${line.endArrow}`,
  }
}

export function normalizeObjectEffects(
  value: unknown,
  fallback: Readonly<ObjectEffects> | undefined = DEFAULT_OBJECT_EFFECTS,
): ObjectEffects {
  fallback ??= DEFAULT_OBJECT_EFFECTS
  const source = parseSection(value)
  const shadow = typeof source?.['shadow'] === 'string'
    ? readEffectString(source['shadow'], true) : record(source?.['shadow'])
  const glow = typeof source?.['glow'] === 'string'
    ? readEffectString(source['glow'], false) : record(source?.['glow'])
  return {
    shadow: {
      enabled: booleanValue(
        shadow?.['enabled'],
        fallback.shadow.enabled,
      ),
      color: normalizeColor(
        shadow?.['color'],
        fallback.shadow.color,
      ),
      opacity: bounded(
        shadow?.['opacity'],
        fallback.shadow.opacity,
        0,
        1,
      ),
      blur: bounded(shadow?.['blur'], fallback.shadow.blur, 0, 100),
      angle: bounded(
        shadow?.['angle'],
        fallback.shadow.angle,
        -360,
        360,
      ),
      distance: bounded(
        shadow?.['distance'],
        fallback.shadow.distance,
        0,
        200,
      ),
    },
    glow: {
      enabled: booleanValue(
        glow?.['enabled'],
        fallback.glow.enabled,
      ),
      color: normalizeColor(glow?.['color'], fallback.glow.color),
      opacity: bounded(
        glow?.['opacity'],
        fallback.glow.opacity,
        0,
        1,
      ),
      radius: bounded(glow?.['radius'], fallback.glow.radius, 0, 100),
    },
  }
}

export function storeObjectEffects(
  value: Readonly<ObjectEffects>,
  options: ObjectFormatStorageOptions = {},
): StoredObjectEffects {
  const {shadow, glow} = normalizeObjectEffects(value)
  const q = (n: number, step = 1) => quantizeObjectFormatNumber(n, step, options.preservePrecision)
  return {
    shadow: shadow.enabled
      ? `${q(shadow.angle)}deg ${q(shadow.distance)}px ${q(shadow.blur)}px ${colorToken(shadow.color, q(shadow.opacity, 0.01))}` : 'none',
    glow: glow.enabled ? `${q(glow.radius)}px ${colorToken(glow.color, q(glow.opacity, 0.01))}` : 'none',
  }
}

export function normalizeObjectTextFrame(
  value: unknown,
  fallback: Readonly<ObjectTextFrame> | undefined = DEFAULT_OBJECT_TEXT_FRAME,
): ObjectTextFrame {
  fallback ??= DEFAULT_OBJECT_TEXT_FRAME
  const input = parseSection(value)
  const alignment = tokens(input?.['textAlignment'])
  const source = input && Object.keys(input).some(key => key.startsWith('text'))
    ? {margins: readPadding(input?.['textPadding']), direction: input?.['textDirection'],
       horizontalAlign: alignment[0], verticalAlign: alignment[1], wrap: input?.['textWrap'],
       autoFit: input?.['textAutoFit'], rotateWithShape: input?.['textRotate']}
    : input
  const rawMargins = source?.['margins']
  const margins = Array.isArray(rawMargins)
    ? rawMargins as unknown[]
    : []
  return {
    margins: [0, 1, 2, 3].map(index =>
      bounded(margins[index], fallback.margins[index]!, 0, 1_000),
    ) as [number, number, number, number],
    direction: isInSet(source?.['direction'], TEXT_DIRECTIONS)
      ? (source?.['direction']) as ObjectTextDirection
      : fallback.direction,
    horizontalAlign: isInSet(
      source?.['horizontalAlign'],
      HORIZONTAL_ALIGNS,
    )
      ? (source?.['horizontalAlign']) as ObjectTextHorizontalAlign
      : fallback.horizontalAlign,
    verticalAlign: isInSet(
      source?.['verticalAlign'],
      VERTICAL_ALIGNS,
    )
      ? (source?.['verticalAlign']) as ObjectTextVerticalAlign
      : fallback.verticalAlign,
    wrap: booleanValue(source?.['wrap'], fallback.wrap),
    autoFit: (source?.['autoFit']) === 'resize-shape'
      ? 'resize-shape'
      : (source?.['autoFit']) === 'none'
        ? 'none'
        : fallback.autoFit,
    rotateWithShape: booleanValue(
      source?.['rotateWithShape'],
      fallback.rotateWithShape,
    ),
  }
}

export function storeObjectTextFrame(
  value: Readonly<ObjectTextFrame>, options: ObjectFormatStorageOptions = {},
): StoredObjectTextFrame {
  const frame = normalizeObjectTextFrame(value)
  const [t, r, b, l] = frame.margins.map(n => quantizeObjectFormatNumber(n, 1, options.preservePrecision))
  return {
    textPadding: (t === b && r === l ? t === r ? [t] : [t, r] : r === l ? [t, r, b] : [t, r, b, l]).join(' '),
    textAlignment: `${frame.horizontalAlign} ${frame.verticalAlign}`,
    textDirection: frame.direction, textWrap: frame.wrap,
    textAutoFit: frame.autoFit, textRotate: frame.rotateWithShape,
  }
}

export function normalizeObjectTextStyle(
  value: unknown,
  fallback: Readonly<ObjectTextStyle> | undefined = DEFAULT_OBJECT_TEXT_STYLE,
): ObjectTextStyle {
  fallback ??= DEFAULT_OBJECT_TEXT_STYLE
  const input = parseSection(value)
  const font = tokens(input?.['textFont'])
  const spacing = tokens(input?.['textSpacing'])
  const source = input && Object.keys(input).some(key => key.startsWith('text'))
    ? {fontFamily: input['textFamily'], fontSize: tokenNumber(font[0], 'px'),
       fontWeight: tokenNumber(font[1]), fontStyle: font[2],
       letterSpacingEm: tokenNumber(spacing[0], 'em'), lineHeight: tokenNumber(spacing[1]),
       fill: readStoredPaint(input['textFill'], input['textFillOpacity'], fallback.fill), outline: input['textOutline'],
       effects: {shadow: input['textShadow'], glow: input['textGlow']}, transform: input['textTransform']}
    : input
  const rawWeight = Number(source?.['fontWeight'])
  const rawFontStyle = source?.['fontStyle']
  return {
    fontFamily: normalizeFontFamily(
      source?.['fontFamily'],
      fallback.fontFamily,
    ),
    fontSize: bounded(source?.['fontSize'], fallback.fontSize, 4, 512),
    fontWeight: FONT_WEIGHTS.has(rawWeight)
      ? rawWeight as ObjectTextStyle['fontWeight']
      : fallback.fontWeight,
    fontStyle: rawFontStyle === 'italic'
      ? 'italic'
      : rawFontStyle === 'normal'
        ? 'normal'
        : fallback.fontStyle,
    letterSpacingEm: bounded(
      source?.['letterSpacingEm'],
      fallback.letterSpacingEm,
      -1,
      5,
    ),
    lineHeight: bounded(source?.['lineHeight'], fallback.lineHeight, 0.5, 5),
    fill: normalizeObjectPaint(source?.['fill'], fallback.fill),
    outline: normalizeObjectTextOutline(
      source?.['outline'],
      fallback.outline,
    ),
    effects: normalizeObjectEffects(
      source?.['effects'],
      fallback.effects,
    ),
    transform: isInSet(source?.['transform'], TEXT_TRANSFORMS)
      ? (source?.['transform']) as ObjectTextTransform
      : fallback.transform,
  }
}

export function storeObjectTextStyle(
  value: Readonly<ObjectTextStyle>, options: ObjectFormatStorageOptions = {},
): StoredObjectTextStyle {
  const style = normalizeObjectTextStyle(value)
  const effects = storeObjectEffects(style.effects, options)
  const q = (n: number) => quantizeObjectFormatNumber(n, 0.01, options.preservePrecision)
  return {
    textFamily: style.fontFamily,
    textFont: `${q(style.fontSize)}px ${style.fontWeight} ${style.fontStyle}`,
    textSpacing: `${q(style.letterSpacingEm)}em ${q(style.lineHeight)}`,
    textFill: storeObjectPaint(style.fill, options),
    ...((style.fill.type === 'linear-gradient' || style.fill.type === 'picture') ? {textFillOpacity: q(style.fill.opacity)} : {}),
    textOutline: storeObjectTextOutline(style.outline, options),
    textShadow: effects.shadow, textGlow: effects.glow, textTransform: style.transform,
  }
}

export function normalizeObjectTextOutline(
  value: unknown,
  fallback: Readonly<ObjectTextOutline> | undefined = {type: 'none'},
): ObjectTextOutline {
  fallback ??= {type: 'none'}
  const source = typeof value === 'string' ? readOutlineString(value) : parseSection(value)
  const rawType = source?.['type'] ?? source?.['t']
  const type = rawType === 'line' || rawType === 'l'
    ? 'line'
    : rawType === 'none' || rawType === 'n'
      ? 'none'
      : fallback.type
  if (type === 'none') return {type}
  const defaults = fallback.type === 'line'
    ? fallback
    : {type: 'line' as const, color: '#000000', width: 1}
  return {
    type,
    color: normalizeColor(source?.['color'] ?? source?.['c'], defaults.color),
    width: bounded(source?.['width'] ?? source?.['w'], defaults.width, 0, 100),
  }
}

export function storeObjectTextOutline(
  value: Readonly<ObjectTextOutline>,
  options: ObjectFormatStorageOptions = {},
): StoredObjectTextOutline {
  const outline = normalizeObjectTextOutline(value)
  return outline.type === 'none'
    ? 'none'
    : `${quantizeObjectFormatNumber(outline.width, 0.25, options.preservePrecision)}px ${outline.color}`
}

export function normalizeBlockObjectFormat(
  props: Readonly<Partial<BlockObjectFormatProps>> | null | undefined,
  capability: Readonly<BlockObjectFormatCapability>,
): NormalizedBlockObjectFormat {
  const defaults = capability.defaults
  const width = bounded(props?.width, defaults.width, 1, 20_000)
  const height = bounded(props?.height, defaults.height, 1, 20_000)
  const rotation = normalizeRotation(props?.rotation, defaults.rotation)
  const shapeType = capability.features.shape
    ? normalizeShapeType(props?.shape, capability, defaults.shapeType)
    : undefined
  return {
    width,
    height,
    rotation,
    lockAspectRatio: booleanValue(
      props?.lockRatio,
      defaults.lockAspectRatio,
    ),
    ...(shapeType ? {shapeType} : {}),
    ...(capability.features.shape ? {
      shapeFill: readStoredPaint(props?.fill, props?.fillOpacity, defaults.shapeFill),
      shapeOutline: normalizeObjectLine(
        pickFormatGroups(props, 'shapeOutline'),
        defaults.shapeOutline,
      ),
      shapeEffects: normalizeObjectEffects(
        props,
        defaults.shapeEffects,
      ),
    } : {}),
    ...(capability.features.textFrame ? {
      textFrame: normalizeObjectTextFrame(pickFormatGroups(props, 'textFrame'), defaults.textFrame),
    } : {}),
    ...(capability.features.textStyle ? {
      textStyle: normalizeObjectTextStyle(pickFormatGroups(props, 'textStyle'), defaults.textStyle),
    } : {}),
  }
}

export function objectLineDasharray(line: Readonly<ObjectLine>): string | null {
  if (line.type === 'none' || line.dash === 'solid') return null
  const unit = Math.max(1, line.width)
  if (line.dash === 'dot') return `${unit} ${unit * 2}`
  if (line.dash === 'dash') return `${unit * 4} ${unit * 3}`
  if (line.dash === 'dash-dot') return `${unit * 4} ${unit * 2} ${unit} ${unit * 2}`
  if (line.dash === 'long-dash') return `${unit * 8} ${unit * 3}`
  return `${unit * 8} ${unit * 2} ${unit} ${unit * 2}`
}

/** SVG image alignment used by every shape projection path. */
export function objectPicturePreserveAspectRatio(
  paint: Readonly<ObjectPicturePaint>,
): string {
  if (paint.fit === 'stretch') return 'none'
  const horizontal = paint.positionX < 34
    ? 'xMin'
    : paint.positionX > 66 ? 'xMax' : 'xMid'
  const vertical = paint.positionY < 34
    ? 'YMin'
    : paint.positionY > 66 ? 'YMax' : 'YMid'
  return `${horizontal}${vertical} ${paint.fit === 'contain' ? 'meet' : 'slice'}`
}

export function objectPaintBackgroundSize(
  paint: Pick<ObjectPicturePaint, 'fit'>,
): string {
  return paint.fit === 'stretch' ? '100% 100%' : paint.fit
}

export function objectPaintBackgroundPosition(
  paint: Pick<ObjectPicturePaint, 'positionX' | 'positionY'>,
): string {
  return `${paint.positionX}% ${paint.positionY}%`
}

export function objectPaintCssBackground(paint: Readonly<ObjectPaint>): string | null {
  if (paint.type === 'picture' && paint.src) {
    return `url("${paint.src.replace(/["\\]/g, '\\$&')}")`
  }
  if (paint.type !== 'linear-gradient') return null
  const stops = paint.stops.map(stop =>
    `${colorWithOpacity(
      stop.color,
      stop.opacity * paint.opacity,
    )} ${stop.offset * 100}%`,
  )
  return `linear-gradient(${paint.angle}deg, ${stops.join(', ')})`
}

export function objectPaintTextColor(paint: Readonly<ObjectPaint>): string {
  if (paint.type === 'none' || paint.type === 'picture' ||
    paint.type === 'linear-gradient') return 'transparent'
  return colorWithOpacity(paint.color, paint.opacity)
}

export function objectTextTransformCss(transform: ObjectTextTransform): string {
  if (transform === 'slant-left') return 'skewX(-10deg)'
  if (transform === 'slant-right') return 'skewX(10deg)'
  if (transform === 'slant-up') return 'skewY(-8deg)'
  if (transform === 'slant-down') return 'skewY(8deg)'
  if (transform === 'perspective-left') return 'perspective(600px) rotateY(-12deg)'
  if (transform === 'perspective-right') return 'perspective(600px) rotateY(12deg)'
  if (transform === 'perspective-up') return 'perspective(600px) rotateX(12deg)'
  if (transform === 'perspective-down') return 'perspective(600px) rotateX(-12deg)'
  if (transform === 'wide') return 'scaleX(1.18)'
  if (transform === 'narrow') return 'scaleX(.82)'
  if (transform === 'tall') return 'scaleY(1.18)'
  if (transform === 'short') return 'scaleY(.82)'
  if (transform === 'inflate') return 'scale(1.08)'
  if (transform === 'deflate') return 'scale(.92)'
  return ''
}

export function objectLineArrowPath(arrow: ObjectLineArrow): string {
  if (arrow === 'stealth') return 'M 0 1 L 10 5 L 0 9 L 3 5 Z'
  if (arrow === 'diamond') return 'M 0 5 L 5 0 L 10 5 L 5 10 Z'
  if (arrow === 'oval') {
    return 'M 0 5 A 5 4 0 1 0 10 5 A 5 4 0 1 0 0 5 Z'
  }
  return 'M 0 0 L 10 5 L 0 10 Z'
}

export function objectEffectsFilter(effects: Readonly<ObjectEffects>): string {
  const filters: string[] = []
  if (effects.shadow.enabled) {
    const radians = effects.shadow.angle * Math.PI / 180
    const x = Math.cos(radians) * effects.shadow.distance
    const y = Math.sin(radians) * effects.shadow.distance
    filters.push(
      `drop-shadow(${round(x)}px ${round(y)}px ${effects.shadow.blur}px ` +
      `${colorWithOpacity(effects.shadow.color, effects.shadow.opacity)})`,
    )
  }
  if (effects.glow.enabled) {
    const color = colorWithOpacity(effects.glow.color, effects.glow.opacity)
    filters.push(`drop-shadow(0 0 ${effects.glow.radius}px ${color})`)
  }
  return filters.join(' ')
}

export function colorWithOpacity(color: string, opacity: number): string {
  const normalized = normalizeColor(color, '#000000')
  const alpha = bounded(opacity, 1, 0, 1)
  const hex = /^#([\da-f]{6})$/i.exec(normalized)
  if (!hex) return alpha === 1 ? normalized : `color-mix(in srgb, ${normalized} ${round(alpha * 100)}%, transparent)`
  const value = hex[1]!
  return `rgba(${parseInt(value.slice(0, 2), 16)}, ` +
    `${parseInt(value.slice(2, 4), 16)}, ` +
    `${parseInt(value.slice(4, 6), 16)}, ${alpha})`
}

function parseSection(value: unknown): Record<string, unknown> | null {
  return record(value)
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isInSet<T extends string>(value: unknown, set: ReadonlySet<T>): boolean {
  return typeof value === 'string' && set.has(value as T)
}

function normalizeRotation(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const parsed = value
  const normalized = ((parsed % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const color = value.trim()
  if (
    !color || color.length > 128 ||
    /[;{}]|url\s*\(/i.test(color)
  ) return fallback
  return color
}

function normalizeFontFamily(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const family = value.trim()
  return family && family.length <= 256 && !/[;{}]/.test(family)
    ? family
    : fallback
}

function normalizeImageSource(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const src = value.trim()
  if (!src || src.length > 16_000) return fallback
  return /^(?:https?:|blob:|data:image\/|\/|\.{1,2}\/|[\w-]+\/)/i.test(src)
    ? src
    : fallback
}

function normalizeGradientStops(
  value: unknown,
  fallback: readonly ObjectGradientStop[],
): ObjectGradientStop[] {
  const source = Array.isArray(value) ? value.slice(0, 4) : []
  const stops = source.map((item, index) => {
    const stop = record(item)
    const defaults = fallback[Math.min(index, fallback.length - 1)] ?? {
      color: '#000000',
      offset: index / Math.max(1, source.length - 1),
      opacity: 1,
    }
    return {
      color: normalizeColor(stop?.['color'] ?? stop?.['c'], defaults.color),
      offset: bounded(stop?.['offset'] ?? stop?.['p'], defaults.offset, 0, 1),
      opacity: bounded(stop?.['opacity'] ?? stop?.['o'], defaults.opacity, 0, 1),
    }
  })
  const result = stops.length >= 2
    ? stops
    : fallback.map(stop => ({...stop})).slice(0, 4)
  result.sort((a, b) => a.offset - b.offset)
  return result
}

function normalizePaintType(
  value: unknown,
  fallback: ObjectPaintType,
): ObjectPaintType {
  if (isInSet(value, PAINT_TYPES)) return value as ObjectPaintType
  return fallback
}

function normalizeShapeType(
  value: unknown,
  capability: Readonly<BlockObjectFormatCapability>,
  fallback: string | undefined,
): string | undefined {
  if (typeof value !== 'string') return fallback
  const shapeTypes = capability.shapeTypes
  return !shapeTypes || shapeTypes.includes(value) ? value : fallback
}

function cloneEffects(value: Readonly<ObjectEffects>): ObjectEffects {
  return {shadow: {...value.shadow}, glow: {...value.glow}}
}

function clonePaint(value: Readonly<ObjectPaint>): ObjectPaint {
  return value.type === 'linear-gradient'
    ? {...value, stops: value.stops.map(stop => ({...stop}))}
    : {...value}
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Persisted groups owned by each public structured formatting operation. */
export const OBJECT_FORMAT_SECTION_KEYS = {
  width: ['width'], height: ['height'], rotation: ['rotation'],
  lockAspectRatio: ['lockRatio'], shapeType: ['shape'], shapeFill: ['fill', 'fillOpacity'],
  shapeOutline: ['outline', 'lineEnds', 'arrows'], shapeEffects: ['shadow', 'glow'],
  textFrame: ['textPadding', 'textAlignment', 'textDirection', 'textWrap', 'textAutoFit', 'textRotate'],
  textStyle: ['textFamily', 'textFont', 'textSpacing', 'textFill', 'textFillOpacity', 'textOutline', 'textShadow', 'textGlow', 'textTransform'],
} as const

/** Encode a structured operation; callers spread this fragment into props. */
export function storeObjectFormatSection(
  key: 'shapeFill', value: Readonly<ObjectPaint>, options?: ObjectFormatStorageOptions,
): Pick<BlockObjectFormatProps, 'fill' | 'fillOpacity'>
export function storeObjectFormatSection(
  key: keyof typeof OBJECT_FORMAT_SECTION_KEYS, value: unknown,
  options?: ObjectFormatStorageOptions,
): Partial<BlockObjectFormatProps>
export function storeObjectFormatSection(
  key: keyof typeof OBJECT_FORMAT_SECTION_KEYS, value: unknown,
  options: ObjectFormatStorageOptions = {},
): Partial<BlockObjectFormatProps> {
  if (key === 'shapeFill') {
    const paint = normalizeObjectPaint(value)
    return {fill: storeObjectPaint(paint, options),
      ...((paint.type === 'linear-gradient' || paint.type === 'picture') ? {fillOpacity: quantizeObjectFormatNumber(paint.opacity, 0.01, options.preservePrecision)} : {})}
  }
  if (key === 'shapeOutline') return {...storeObjectLine(value as ObjectLine, options)}
  if (key === 'shapeEffects') return {...storeObjectEffects(value as ObjectEffects, options)}
  if (key === 'textFrame') return {...storeObjectTextFrame(value as ObjectTextFrame, options)}
  if (key === 'textStyle') return {...storeObjectTextStyle(value as ObjectTextStyle, options)}
  return {[OBJECT_FORMAT_SECTION_KEYS[key][0]]: value} as Partial<BlockObjectFormatProps>
}

/** Canonical snapshot encoding. Missing groups inherit this block's schema defaults. */
export function storeBlockObjectFormat(
  format: Readonly<NormalizedBlockObjectFormat>,
  capability: Readonly<BlockObjectFormatCapability>,
  options: ObjectFormatStorageOptions = {},
): BlockObjectFormatProps {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(OBJECT_FORMAT_SECTION_KEYS) as Array<keyof typeof OBJECT_FORMAT_SECTION_KEYS>) {
    const value = format[key]
    if (value === undefined) continue
    const encoded = storeObjectFormatSection(key, value, options)
    if (key === 'width' || key === 'height' || key === 'rotation' || key === 'shapeType' || key === 'lockAspectRatio') {
      Object.assign(result, encoded)
      continue
    }
    const precise = storeObjectFormatSection(key, value, {preservePrecision: true})
    const fallback = capability.defaults[key]
    const defaults = fallback === undefined ? {} : storeObjectFormatSection(key, fallback, {preservePrecision: true})
    for (const group of OBJECT_FORMAT_SECTION_KEYS[key]) {
      if (encoded[group] === undefined) continue
      const defaultValue = JSON.stringify((group === 'fillOpacity' || group === 'textFillOpacity') ? defaults[group] ?? 1 : defaults[group])
      if (JSON.stringify(precise[group]) !== defaultValue && JSON.stringify(encoded[group]) !== defaultValue) {
        result[group] = encoded[group]
      }
    }
  }
  return result as unknown as BlockObjectFormatProps
}

function tokens(value: unknown): string[] {
  return typeof value === 'string' && value.length <= 512 ? value.trim().split(/\s+/) : []
}

function tokenNumber(value: string | undefined, unit = ''): number | undefined {
  if (value === undefined) return undefined
  const raw = unit && value.endsWith(unit) ? value.slice(0, -unit.length) : value
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return undefined
  const number = Number(raw)
  return Number.isFinite(number) ? number : undefined
}

function colorToken(color: string, opacity: number): string {
  return opacity === 1 ? color : `${color} / ${opacity}`
}

function readPaintString(value: string): Record<string, unknown> | null {
  if (/^linear-gradient\(/i.test(value.trim())) return decodeObjectGradient(value) as unknown as Record<string, unknown> | null
  if (/^url\(/i.test(value.trim())) {
    const picture = decodeCssPicture(value)
    return picture ? {type: 'picture', opacity: 1, ...picture} : null
  }
  if (value.length > 512) return null
  if (value === 'none') return {type: 'none'}
  let depth = 0, separator = -1
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === '/' && depth === 0) separator = index
    if (depth < 0) return null
  }
  if (depth !== 0) return null
  const color = (separator < 0 ? value : value.slice(0, separator)).trim()
  const opacity = separator < 0 ? 1 : tokenNumber(value.slice(separator + 1).trim())
  if (!normalizeColor(color, '') || opacity === undefined) return null
  return {type: 'solid', color, opacity}

}

function readLineGroups(input: Record<string, unknown>): Record<string, unknown> {
  const value = input['outline']
  const match = typeof value === 'string' && value.length <= 512
    ? /^(\S+)\s+(\S+)\s+(.+)$/.exec(value) : null
  const paint = match ? readPaintString(match[3]!) : null
  const ends = tokens(input['lineEnds'])
  const arrows = tokens(input['arrows'])
  return {
    type: value === 'none' ? 'none' : match && paint ? 'line' : undefined,
    width: match ? tokenNumber(match[1], 'px') : undefined,
    dash: match?.[2], color: paint?.['color'], opacity: paint?.['opacity'],
    cap: ends[0], join: ends[1], startArrow: arrows[0], endArrow: arrows[1],
  }
}

function readOutlineString(value: string): Record<string, unknown> | null {
  if (value === 'none') return {type: 'none'}
  const match = value.length <= 512 ? /^(\S+)\s+(.+)$/.exec(value) : null
  return match ? {type: 'line', width: tokenNumber(match[1], 'px'), color: match[2]} : null
}

function readEffectString(value: string, shadow: boolean): Record<string, unknown> | null {
  if (value === 'none') return {enabled: false}
  const match = value.length <= 512
    ? (shadow ? /^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/ : /^(\S+)\s+(.+)$/).exec(value) : null
  if (!match) return null
  const paint = readPaintString(match[shadow ? 4 : 2]!)
  if (!paint || paint['type'] !== 'solid') return null
  const first = tokenNumber(match[1], shadow ? 'deg' : 'px')
  const distance = shadow ? tokenNumber(match[2], 'px') : undefined
  const blur = shadow ? tokenNumber(match[3], 'px') : undefined
  if (first === undefined || shadow && (distance === undefined || blur === undefined)) return null
  return {enabled: true, color: paint['color'], opacity: paint['opacity'],
    ...(shadow ? {angle: first, distance, blur} : {radius: first})}
}

function readPadding(value: unknown): number[] | undefined {
  const parts = tokens(value)
  if (!parts.length || parts.length > 4) return undefined
  const numbers = parts.map(part => tokenNumber(part, 'px'))
  if (numbers.some(n => n === undefined)) return undefined
  const [t, r = t, b = t, l = r] = numbers as number[]
  return [t!, r!, b!, l!]
}

/** Never pass geometry or retired aliases into a section's runtime normalizer. */
function pickFormatGroups(
  props: Readonly<Partial<BlockObjectFormatProps>> | null | undefined,
  section: keyof typeof OBJECT_FORMAT_SECTION_KEYS,
): Record<string, unknown> {
  return Object.fromEntries(OBJECT_FORMAT_SECTION_KEYS[section].map(key => [key, props?.[key]]))
}

/** CSS paint contains image options/stop alphas; the sibling owns overall alpha. */
function readStoredPaint(value: unknown, opacity: unknown, fallback?: Readonly<ObjectPaint>): ObjectPaint {
  const paint = normalizeObjectPaint(value, fallback)
  if (paint.type !== 'linear-gradient' && paint.type !== 'picture') return paint
  const defaultOpacity = fallback?.type === 'linear-gradient' || fallback?.type === 'picture'
    ? fallback.opacity : 1
  return {...paint, opacity: bounded(opacity, defaultOpacity, 0, 1)}
}
