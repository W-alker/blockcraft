import type {SimpleBasicType} from '../../../global'
import type {IBlockProps} from '../types'

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

export interface StoredObjectPaint extends Record<string, SimpleBasicType> {
  t: 'n' | 's' | 'g' | 'p'
  c?: string
  o?: number
  a?: number
  n?: number
  c0?: string
  p0?: number
  q0?: number
  c1?: string
  p1?: number
  q1?: number
  c2?: string
  p2?: number
  q2?: number
  c3?: string
  p3?: number
  q3?: number
  u?: string
  f?: ObjectPictureFit
  x?: number
  y?: number
}

export interface StoredObjectLine extends Record<string, SimpleBasicType> {
  t: 'n' | 'l'
  c?: string
  o?: number
  w?: number
  d?: ObjectLineDash
  p?: ObjectLineCap
  j?: ObjectLineJoin
  s?: ObjectLineArrow
  e?: ObjectLineArrow
}

export interface StoredObjectEffects extends Record<string, SimpleBasicType> {
  se: boolean
  sc: string
  so: number
  sb: number
  sa: number
  sd: number
  ge: boolean
  gc: string
  go: number
  gr: number
}

export interface StoredObjectTextFrame extends Record<string, SimpleBasicType> {
  mt: number
  mr: number
  mb: number
  ml: number
  d: ObjectTextDirection
  h: ObjectTextHorizontalAlign
  v: ObjectTextVerticalAlign
  w: boolean
  a: ObjectTextAutoFit
  r: boolean
}

export interface StoredObjectTextOutline extends Record<string, SimpleBasicType> {
  t: 'n' | 'l'
  c?: string
  w?: number
}

export interface StoredObjectTextStyle extends Record<string, SimpleBasicType> {
  f: string
  z: number
  w: ObjectTextStyle['fontWeight']
  i: boolean
  s: number
  l: number
  pt: StoredObjectPaint['t']
  pc?: string
  po?: number
  pa?: number
  pn?: number
  pc0?: string
  pp0?: number
  pq0?: number
  pc1?: string
  pp1?: number
  pq1?: number
  pc2?: string
  pp2?: number
  pq2?: number
  pc3?: string
  pp3?: number
  pq3?: number
  pu?: string
  pf?: ObjectPictureFit
  px?: number
  py?: number
  ot: StoredObjectTextOutline['t']
  oc?: string
  ow?: number
  se: boolean
  sc: string
  so: number
  sb: number
  sa: number
  sd: number
  ge: boolean
  gc: string
  go: number
  gr: number
  t: ObjectTextTransform
}

export interface BlockObjectFormatProps extends IBlockProps {
  width: number
  height: number
  rotation: number
  lockRatio?: boolean | null
  shape?: string | null
  /** Each section is one atomic collaborative value. */
  fill?: StoredObjectPaint | null
  outline?: StoredObjectLine | null
  effects?: StoredObjectEffects | null
  textFrame?: StoredObjectTextFrame | null
  textStyle?: StoredObjectTextStyle | null
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
  const source = parseSection(value)
  const type = normalizeStoredPaintType(
    source?.['type'] ?? source?.['t'],
    fallback.type,
  )
  if (type === 'none') return {type: 'none'}
  if (type === 'solid') {
    const defaults = fallback.type === 'solid' ? fallback : DEFAULT_OBJECT_PAINT
    return {
      type,
      color: normalizeColor(source?.['color'] ?? source?.['c'], defaults.color),
      opacity: bounded(source?.['opacity'] ?? source?.['o'], defaults.opacity, 0, 1),
    }
  }
  if (type === 'linear-gradient') {
    const defaults = fallback.type === 'linear-gradient'
      ? fallback
      : DEFAULT_OBJECT_GRADIENT_PAINT
    return {
      type,
      opacity: bounded(source?.['opacity'] ?? source?.['o'], defaults.opacity, 0, 1),
      angle: bounded(source?.['angle'] ?? source?.['a'], defaults.angle, -360, 360),
      stops: normalizeGradientStops(
        source?.['stops'] ?? readStoredGradientStops(source),
        defaults.stops,
      ),
    }
  }
  const defaults = fallback.type === 'picture'
    ? fallback
    : DEFAULT_OBJECT_PICTURE_PAINT
  return {
    type,
    opacity: bounded(source?.['opacity'] ?? source?.['o'], defaults.opacity, 0, 1),
    src: normalizeImageSource(source?.['src'] ?? source?.['u'], defaults.src),
    fit: isInSet(source?.['fit'] ?? source?.['f'], PICTURE_FITS)
      ? (source?.['fit'] ?? source?.['f']) as ObjectPictureFit
      : defaults.fit,
    positionX: bounded(
      source?.['positionX'] ?? source?.['x'],
      defaults.positionX,
      0,
      100,
    ),
    positionY: bounded(
      source?.['positionY'] ?? source?.['y'],
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

export function storeObjectPaint(value: Readonly<ObjectPaint>): StoredObjectPaint {
  const paint = normalizeObjectPaint(value)
  if (paint.type === 'none') return {t: 'n'}
  if (paint.type === 'solid') {
    return {t: 's', c: paint.color, o: paint.opacity}
  }
  if (paint.type === 'linear-gradient') {
    const stored: StoredObjectPaint = {
      t: 'g',
      o: paint.opacity,
      a: paint.angle,
      n: paint.stops.length,
    }
    paint.stops.forEach((stop, index) => {
      stored[`c${index}` as keyof StoredObjectPaint] = stop.color as never
      stored[`p${index}` as keyof StoredObjectPaint] = stop.offset as never
      stored[`q${index}` as keyof StoredObjectPaint] = stop.opacity as never
    })
    return stored
  }
  return {
    t: 'p',
    o: paint.opacity,
    u: paint.src,
    f: paint.fit,
    x: paint.positionX,
    y: paint.positionY,
  }
}

export function normalizeObjectLine(
  value: unknown,
  fallback: Readonly<ObjectLine> | undefined = DEFAULT_OBJECT_LINE,
): ObjectLine {
  fallback ??= DEFAULT_OBJECT_LINE
  const source = parseSection(value)
  const rawType = source?.['type'] ?? source?.['t']
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

export function storeObjectLine(value: Readonly<ObjectLine>): StoredObjectLine {
  const line = normalizeObjectLine(value)
  if (line.type === 'none') return {t: 'n'}
  return {
    t: 'l',
    c: line.color,
    o: line.opacity,
    w: line.width,
    d: line.dash,
    p: line.cap,
    j: line.join,
    s: line.startArrow,
    e: line.endArrow,
  }
}

export function normalizeObjectEffects(
  value: unknown,
  fallback: Readonly<ObjectEffects> | undefined = DEFAULT_OBJECT_EFFECTS,
): ObjectEffects {
  fallback ??= DEFAULT_OBJECT_EFFECTS
  const source = parseSection(value)
  const shadow = record(source?.['shadow']) ?? source
  const glow = record(source?.['glow']) ?? source
  return {
    shadow: {
      enabled: booleanValue(
        shadow?.['enabled'] ?? shadow?.['se'],
        fallback.shadow.enabled,
      ),
      color: normalizeColor(
        shadow?.['color'] ?? shadow?.['sc'],
        fallback.shadow.color,
      ),
      opacity: bounded(
        shadow?.['opacity'] ?? shadow?.['so'],
        fallback.shadow.opacity,
        0,
        1,
      ),
      blur: bounded(shadow?.['blur'] ?? shadow?.['sb'], fallback.shadow.blur, 0, 100),
      angle: bounded(
        shadow?.['angle'] ?? shadow?.['sa'],
        fallback.shadow.angle,
        -360,
        360,
      ),
      distance: bounded(
        shadow?.['distance'] ?? shadow?.['sd'],
        fallback.shadow.distance,
        0,
        200,
      ),
    },
    glow: {
      enabled: booleanValue(
        glow?.['enabled'] ?? glow?.['ge'],
        fallback.glow.enabled,
      ),
      color: normalizeColor(glow?.['color'] ?? glow?.['gc'], fallback.glow.color),
      opacity: bounded(
        glow?.['opacity'] ?? glow?.['go'],
        fallback.glow.opacity,
        0,
        1,
      ),
      radius: bounded(glow?.['radius'] ?? glow?.['gr'], fallback.glow.radius, 0, 100),
    },
  }
}

export function storeObjectEffects(
  value: Readonly<ObjectEffects>,
): StoredObjectEffects {
  const effects = normalizeObjectEffects(value)
  return {
    se: effects.shadow.enabled,
    sc: effects.shadow.color,
    so: effects.shadow.opacity,
    sb: effects.shadow.blur,
    sa: effects.shadow.angle,
    sd: effects.shadow.distance,
    ge: effects.glow.enabled,
    gc: effects.glow.color,
    go: effects.glow.opacity,
    gr: effects.glow.radius,
  }
}

export function normalizeObjectTextFrame(
  value: unknown,
  fallback: Readonly<ObjectTextFrame> | undefined = DEFAULT_OBJECT_TEXT_FRAME,
): ObjectTextFrame {
  fallback ??= DEFAULT_OBJECT_TEXT_FRAME
  const source = parseSection(value)
  const rawMargins = source?.['margins'] ?? (
    source && ['mt', 'mr', 'mb', 'ml'].some(key => key in source)
      ? [source['mt'], source['mr'], source['mb'], source['ml']]
      : undefined
  )
  const margins = Array.isArray(rawMargins)
    ? rawMargins as unknown[]
    : []
  return {
    margins: [0, 1, 2, 3].map(index =>
      bounded(margins[index], fallback.margins[index]!, 0, 1_000),
    ) as [number, number, number, number],
    direction: isInSet(source?.['direction'] ?? source?.['d'], TEXT_DIRECTIONS)
      ? (source?.['direction'] ?? source?.['d']) as ObjectTextDirection
      : fallback.direction,
    horizontalAlign: isInSet(
      source?.['horizontalAlign'] ?? source?.['h'],
      HORIZONTAL_ALIGNS,
    )
      ? (source?.['horizontalAlign'] ?? source?.['h']) as ObjectTextHorizontalAlign
      : fallback.horizontalAlign,
    verticalAlign: isInSet(
      source?.['verticalAlign'] ?? source?.['v'],
      VERTICAL_ALIGNS,
    )
      ? (source?.['verticalAlign'] ?? source?.['v']) as ObjectTextVerticalAlign
      : fallback.verticalAlign,
    wrap: booleanValue(source?.['wrap'] ?? source?.['w'], fallback.wrap),
    autoFit: (source?.['autoFit'] ?? source?.['a']) === 'resize-shape'
      ? 'resize-shape'
      : (source?.['autoFit'] ?? source?.['a']) === 'none'
        ? 'none'
        : fallback.autoFit,
    rotateWithShape: booleanValue(
      source?.['rotateWithShape'] ?? source?.['r'],
      fallback.rotateWithShape,
    ),
  }
}

export function storeObjectTextFrame(
  value: Readonly<ObjectTextFrame>,
): StoredObjectTextFrame {
  const frame = normalizeObjectTextFrame(value)
  return {
    mt: frame.margins[0],
    mr: frame.margins[1],
    mb: frame.margins[2],
    ml: frame.margins[3],
    d: frame.direction,
    h: frame.horizontalAlign,
    v: frame.verticalAlign,
    w: frame.wrap,
    a: frame.autoFit,
    r: frame.rotateWithShape,
  }
}

export function normalizeObjectTextStyle(
  value: unknown,
  fallback: Readonly<ObjectTextStyle> | undefined = DEFAULT_OBJECT_TEXT_STYLE,
): ObjectTextStyle {
  fallback ??= DEFAULT_OBJECT_TEXT_STYLE
  const source = parseSection(value)
  const rawWeight = Number(source?.['fontWeight'] ?? source?.['w'])
  const storedPaint = readPrefixedStoredPaint(source)
  const storedOutline = readStoredTextOutline(source)
  const storedEffects = readStoredTextEffects(source)
  const rawFontStyle = source?.['fontStyle'] ?? (
    typeof source?.['i'] === 'boolean'
      ? source['i'] ? 'italic' : 'normal'
      : undefined
  )
  return {
    fontFamily: normalizeFontFamily(
      source?.['fontFamily'] ?? source?.['f'],
      fallback.fontFamily,
    ),
    fontSize: bounded(source?.['fontSize'] ?? source?.['z'], fallback.fontSize, 4, 512),
    fontWeight: FONT_WEIGHTS.has(rawWeight)
      ? rawWeight as ObjectTextStyle['fontWeight']
      : fallback.fontWeight,
    fontStyle: rawFontStyle === 'italic'
      ? 'italic'
      : rawFontStyle === 'normal'
        ? 'normal'
        : fallback.fontStyle,
    letterSpacingEm: bounded(
      source?.['letterSpacingEm'] ?? source?.['s'],
      fallback.letterSpacingEm,
      -1,
      5,
    ),
    lineHeight: bounded(source?.['lineHeight'] ?? source?.['l'], fallback.lineHeight, 0.5, 5),
    fill: normalizeObjectPaint(source?.['fill'] ?? storedPaint, fallback.fill),
    outline: normalizeObjectTextOutline(
      source?.['outline'] ?? storedOutline,
      fallback.outline,
    ),
    effects: normalizeObjectEffects(
      source?.['effects'] ?? storedEffects,
      fallback.effects,
    ),
    transform: isInSet(source?.['transform'] ?? source?.['t'], TEXT_TRANSFORMS)
      ? (source?.['transform'] ?? source?.['t']) as ObjectTextTransform
      : fallback.transform,
  }
}

export function storeObjectTextStyle(
  value: Readonly<ObjectTextStyle>,
): StoredObjectTextStyle {
  const style = normalizeObjectTextStyle(value)
  const paint = storeObjectPaint(style.fill)
  const outline = storeObjectTextOutline(style.outline)
  const effects = storeObjectEffects(style.effects)
  const stored: StoredObjectTextStyle = {
    f: style.fontFamily,
    z: style.fontSize,
    w: style.fontWeight,
    i: style.fontStyle === 'italic',
    s: style.letterSpacingEm,
    l: style.lineHeight,
    pt: paint.t,
    ot: outline.t,
    ...effects,
    t: style.transform,
  }
  copyStoredPaint(stored, paint)
  if (outline.c !== undefined) stored.oc = outline.c
  if (outline.w !== undefined) stored.ow = outline.w
  return stored
}

export function normalizeObjectTextOutline(
  value: unknown,
  fallback: Readonly<ObjectTextOutline> | undefined = {type: 'none'},
): ObjectTextOutline {
  fallback ??= {type: 'none'}
  const source = parseSection(value)
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
): StoredObjectTextOutline {
  const outline = normalizeObjectTextOutline(value)
  return outline.type === 'none'
    ? {t: 'n'}
    : {t: 'l', c: outline.color, w: outline.width}
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
      shapeFill: normalizeObjectPaint(props?.fill, defaults.shapeFill),
      shapeOutline: normalizeObjectLine(
        props?.outline,
        defaults.shapeOutline,
      ),
      shapeEffects: normalizeObjectEffects(
        props?.effects,
        defaults.shapeEffects,
      ),
    } : {}),
    ...(capability.features.textFrame ? {
      textFrame: normalizeObjectTextFrame(props?.textFrame, defaults.textFrame),
    } : {}),
    ...(capability.features.textStyle ? {
      textStyle: normalizeObjectTextStyle(props?.textStyle, defaults.textStyle),
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
  if (!hex) return normalized
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

function readStoredGradientStops(
  source: Record<string, unknown> | null,
): Array<{c: unknown; p: unknown; o: unknown}> | undefined {
  if (!source || source['t'] !== 'g') return undefined
  const count = Math.round(bounded(source['n'], 0, 0, 4))
  if (count < 2) return undefined
  return Array.from({length: count}, (_, index) => ({
    c: source[`c${index}`],
    p: source[`p${index}`],
    o: source[`q${index}`],
  }))
}

function readPrefixedStoredPaint(
  source: Record<string, unknown> | null,
): StoredObjectPaint | null {
  if (!source || !['n', 's', 'g', 'p'].includes(String(source['pt']))) {
    return null
  }
  const paint: StoredObjectPaint = {t: source['pt'] as StoredObjectPaint['t']}
  const mappings = [
    ['pc', 'c'], ['po', 'o'], ['pa', 'a'], ['pn', 'n'],
    ['pc0', 'c0'], ['pp0', 'p0'], ['pq0', 'q0'],
    ['pc1', 'c1'], ['pp1', 'p1'], ['pq1', 'q1'],
    ['pc2', 'c2'], ['pp2', 'p2'], ['pq2', 'q2'],
    ['pc3', 'c3'], ['pp3', 'p3'], ['pq3', 'q3'],
    ['pu', 'u'], ['pf', 'f'], ['px', 'x'], ['py', 'y'],
  ] as const
  const target = paint as unknown as Record<string, unknown>
  for (const [from, to] of mappings) {
    if (source[from] !== undefined) target[to] = source[from]
  }
  return paint
}

function copyStoredPaint(
  target: StoredObjectTextStyle,
  paint: StoredObjectPaint,
): void {
  const source = paint as unknown as Record<string, unknown>
  const output = target as unknown as Record<string, unknown>
  const mappings = [
    ['c', 'pc'], ['o', 'po'], ['a', 'pa'], ['n', 'pn'],
    ['c0', 'pc0'], ['p0', 'pp0'], ['q0', 'pq0'],
    ['c1', 'pc1'], ['p1', 'pp1'], ['q1', 'pq1'],
    ['c2', 'pc2'], ['p2', 'pp2'], ['q2', 'pq2'],
    ['c3', 'pc3'], ['p3', 'pp3'], ['q3', 'pq3'],
    ['u', 'pu'], ['f', 'pf'], ['x', 'px'], ['y', 'py'],
  ] as const
  for (const [from, to] of mappings) {
    if (source[from] !== undefined) output[to] = source[from]
  }
}

function readStoredTextOutline(
  source: Record<string, unknown> | null,
): StoredObjectTextOutline | null {
  if (!source || (source['ot'] !== 'n' && source['ot'] !== 'l')) return null
  return {
    t: source['ot'],
    ...(typeof source['oc'] === 'string' ? {c: source['oc']} : {}),
    ...(typeof source['ow'] === 'number' ? {w: source['ow']} : {}),
  }
}

function readStoredTextEffects(
  source: Record<string, unknown> | null,
): StoredObjectEffects | null {
  if (!source || typeof source['se'] !== 'boolean' ||
    typeof source['ge'] !== 'boolean') return null
  return {
    se: source['se'],
    sc: String(source['sc'] ?? ''),
    so: Number(source['so']),
    sb: Number(source['sb']),
    sa: Number(source['sa']),
    sd: Number(source['sd']),
    ge: source['ge'],
    gc: String(source['gc'] ?? ''),
    go: Number(source['go']),
    gr: Number(source['gr']),
  }
}

function normalizeStoredPaintType(
  value: unknown,
  fallback: ObjectPaintType,
): ObjectPaintType {
  if (isInSet(value, PAINT_TYPES)) return value as ObjectPaintType
  if (value === 'n') return 'none'
  if (value === 's') return 'solid'
  if (value === 'g') return 'linear-gradient'
  if (value === 'p') return 'picture'
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
