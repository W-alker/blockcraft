import type {
  BlockObjectFormatCapability,
  BlockObjectFormatProps,
  ObjectTextFrame,
  ObjectTextStyle,
} from '../../framework'
import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  colorWithOpacity,
  normalizeBlockObjectFormat,
  objectPaintBackgroundPosition,
  objectPaintBackgroundSize,
  objectTextTransformCss,
  resolveBlockPosition,
  resolveTypographyFontFamily,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from '../../framework'

export const WORD_ART_FONT_OPTIONS = [
  {
    id: 'display-sans',
    label: '醒目黑体',
    stack: '"Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'rounded-sans',
    label: '圆体',
    stack: '"Arial Rounded MT Bold", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'serif',
    label: '衬线体',
    stack: 'Georgia, "Songti SC", SimSun, serif',
  },
  {
    id: 'cjk-hei',
    label: '中文黑体',
    stack: '"PingFang SC", "Microsoft YaHei", SimHei, sans-serif',
  },
  {
    id: 'cjk-kai',
    label: '中文楷体',
    stack: 'Kaiti SC, KaiTi, STKaiti, serif',
  },
  {
    id: 'condensed-sans',
    label: '窄体黑体',
    stack: 'Impact, "Arial Narrow", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'humanist-sans',
    label: '人文无衬线',
    stack: 'Trebuchet MS, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'slab-serif',
    label: '粗衬线体',
    stack: 'Rockwell, "Songti SC", SimSun, serif',
  },
  {
    id: 'cjk-song',
    label: '中文宋体',
    stack: 'Songti SC, STSong, SimSun, serif',
  },
  {
    id: 'monospace',
    label: '等宽体',
    stack: 'Menlo, Consolas, "Microsoft YaHei", monospace',
  },
] as const

export type WordArtFontId = typeof WORD_ART_FONT_OPTIONS[number]['id']
export type WordArtFontWeight = 400 | 500 | 600 | 700 | 800 | 900
export type WordArtFillType = 'solid' | 'linear-gradient'
export type WordArtHorizontalAlign = 'left' | 'center' | 'right'
export type WordArtVerticalAlign = 'top' | 'middle' | 'bottom'
export type WordArtEffect =
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

export interface WordArtBlockProps extends BlockObjectFormatProps {
  depth: number
}

export interface NormalizedWordArtBlockProps {
  depth: number
  width: number
  height: number
  rotation: number
  position?: NonNullable<WordArtBlockProps['position']>
  placementLayer?: 'under'
  lockAspectRatio: boolean
  textFrame: ObjectTextFrame
  textStyle: ObjectTextStyle
  fontFamily: WordArtFontId
  fontSize: number
  fontWeight: WordArtFontWeight
  fontStyle: 'normal' | 'italic'
  letterSpacingEm: number
  lineHeight: number
  horizontalAlign: WordArtHorizontalAlign
  verticalAlign: WordArtVerticalAlign
  fillType: WordArtFillType
  fillColor: string
  gradientAngle: number
  gradientColors: string[]
  gradientStops: number[]
  outlineColor: string
  outlineWidthEm: number
  shadowEnabled: boolean
  shadowColor: string
  shadowOpacity: number
  shadowOffsetXEm: number
  shadowOffsetYEm: number
  shadowBlurEm: number
  effect: WordArtEffect
}

type WordArtPresentationInput =
  | Partial<WordArtBlockProps>
  | NormalizedWordArtBlockProps

const DEFAULT_WORD_ART_TEXT_FRAME = {
  ...DEFAULT_OBJECT_TEXT_FRAME,
  horizontalAlign: 'center' as const,
  verticalAlign: 'middle' as const,
}
const DEFAULT_WORD_ART_TEXT_STYLE: ObjectTextStyle = {
  ...DEFAULT_OBJECT_TEXT_STYLE,
  fontFamily: 'display-sans',
  fontSize: 48,
  fontWeight: 900,
  lineHeight: 1.1,
  fill: {
    type: 'linear-gradient',
    opacity: 1,
    angle: 180,
    stops: [
      {color: '#FDE047', offset: 0, opacity: 1},
      {color: '#F97316', offset: 0.58, opacity: 1},
      {color: '#DC2626', offset: 1, opacity: 1},
    ],
  },
  outline: {type: 'line', color: '#9A3412', width: 1.44},
  effects: {
    ...DEFAULT_OBJECT_EFFECTS,
    shadow: {
      enabled: true,
      color: '#7C2D12',
      opacity: 0.3,
      blur: 1.92,
      angle: 56.31,
      distance: 6.92,
    },
    glow: {...DEFAULT_OBJECT_EFFECTS.glow},
  },
  transform: 'none',
}

export const WORD_ART_OBJECT_FORMAT_CAPABILITY: BlockObjectFormatCapability = {
  kind: 'word-art',
  features: {
    geometry: true,
    shape: false,
    pictureFill: true,
    lineArrows: false,
    textFrame: true,
    textStyle: 'uniform',
  },
  defaults: {
    width: 320,
    height: 96,
    rotation: 0,
    lockAspectRatio: false,
    textFrame: DEFAULT_WORD_ART_TEXT_FRAME,
    textStyle: DEFAULT_WORD_ART_TEXT_STYLE,
  },
}

export const DEFAULT_WORD_ART_PROPS: Readonly<NormalizedWordArtBlockProps> = {
  depth: 0,
  width: 320,
  height: 96,
  rotation: 0,
  lockAspectRatio: false,
  textFrame: {...DEFAULT_WORD_ART_TEXT_FRAME},
  textStyle: {...DEFAULT_WORD_ART_TEXT_STYLE},
  fontFamily: 'display-sans',
  fontSize: 48,
  fontWeight: 900,
  fontStyle: 'normal',
  letterSpacingEm: 0,
  lineHeight: 1.1,
  horizontalAlign: 'center',
  verticalAlign: 'middle',
  fillType: 'linear-gradient',
  fillColor: '#F97316',
  gradientAngle: 180,
  gradientColors: ['#FDE047', '#F97316', '#DC2626'],
  gradientStops: [0, 0.58, 1],
  outlineColor: '#9A3412',
  outlineWidthEm: 0.03,
  shadowEnabled: true,
  shadowColor: '#7C2D12',
  shadowOpacity: 0.3,
  shadowOffsetXEm: 0.08,
  shadowOffsetYEm: 0.12,
  shadowBlurEm: 0.04,
  effect: 'none',
}

const HEX_COLOR = /^#[\da-f]{3}(?:[\da-f]{3})?$/i
const FONT_IDS = new Set<string>(
  WORD_ART_FONT_OPTIONS.map(item => item.id),
)
const FONT_WEIGHTS = new Set<number>([400, 500, 600, 700, 800, 900])
const EFFECTS = new Set<string>([
  'none',
  'slant-left',
  'slant-right',
  'slant-up',
  'slant-down',
  'perspective-left',
  'perspective-right',
  'perspective-up',
  'perspective-down',
  'wide',
  'narrow',
  'tall',
  'short',
  'inflate',
  'deflate',
  'arch-up',
  'arch-down',
  'circle',
  'wave',
])

const finiteNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback
}

const normalizeColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return fallback
  const normalized = value.toUpperCase()
  if (normalized.length === 7) return normalized
  return `#${normalized.slice(1).split('')
    .map(character => `${character}${character}`)
    .join('')}`
}

export function normalizeWordArtRotation(value: unknown): number {
  const rotation = Number(value)
  if (!Number.isFinite(rotation)) return DEFAULT_WORD_ART_PROPS.rotation
  const normalized = ((rotation % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

const normalizePosition = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? resolveBlockPosition(value)
    : undefined

const normalizeGradient = (
  colorsValue: unknown,
  stopsValue: unknown,
): {colors: string[]; stops: number[]} => {
  const sourceColors = Array.isArray(colorsValue)
    ? colorsValue.slice(0, 4)
    : []
  const colors = sourceColors
    .map((color, index) => normalizeColor(
      color,
      DEFAULT_WORD_ART_PROPS.gradientColors[
        Math.min(index, DEFAULT_WORD_ART_PROPS.gradientColors.length - 1)
      ],
    ))
  if (colors.length < 2) {
    return {
      colors: [...DEFAULT_WORD_ART_PROPS.gradientColors],
      stops: [...DEFAULT_WORD_ART_PROPS.gradientStops],
    }
  }

  const sourceStops = Array.isArray(stopsValue) ? stopsValue : []
  const pairs = colors.map((color, index) => ({
    color,
    stop: finiteNumber(
      sourceStops[index],
      index / (colors.length - 1),
      0,
      1,
    ),
  })).sort((left, right) => left.stop - right.stop)
  return {
    colors: pairs.map(pair => pair.color),
    stops: pairs.map(pair => pair.stop),
  }
}

export function normalizeWordArtProps(
  value: Partial<WordArtBlockProps> | null | undefined,
): NormalizedWordArtBlockProps {
  const objectFormat = normalizeBlockObjectFormat(
    value,
    WORD_ART_OBJECT_FORMAT_CAPABILITY,
  )
  const style = objectFormat.textStyle!
  const frame = objectFormat.textFrame!
  const gradient = style.fill.type === 'linear-gradient'
    ? normalizeGradient(
        style.fill.stops.map(stop => stop.color),
        style.fill.stops.map(stop => stop.offset),
      )
    : {
        colors: [...DEFAULT_WORD_ART_PROPS.gradientColors],
        stops: [...DEFAULT_WORD_ART_PROPS.gradientStops],
      }
  const fontWeight = Number(style.fontWeight)
  const position = normalizePosition(value?.position)
  const shadow = style.effects.shadow
  const radians = shadow.angle * Math.PI / 180

  return {
    ...value,
    depth: 0,
    width: Math.max(48, objectFormat.width),
    height: Math.max(32, objectFormat.height),
    rotation: objectFormat.rotation,
    lockAspectRatio: objectFormat.lockAspectRatio,
    textFrame: frame,
    textStyle: style,
    ...(position ? {position} : {}),
    ...(value?.placementLayer === 'under'
      ? {placementLayer: 'under' as const}
      : {}),
    fontFamily:
      typeof style.fontFamily === 'string' && FONT_IDS.has(style.fontFamily)
        ? style.fontFamily as WordArtFontId
        : DEFAULT_WORD_ART_PROPS.fontFamily,
    fontSize: style.fontSize,
    fontWeight: FONT_WEIGHTS.has(fontWeight)
      ? fontWeight as WordArtFontWeight
      : DEFAULT_WORD_ART_PROPS.fontWeight,
    fontStyle: style.fontStyle,
    letterSpacingEm: style.letterSpacingEm,
    lineHeight: style.lineHeight,
    horizontalAlign:
      frame.horizontalAlign === 'left' || frame.horizontalAlign === 'right'
        ? frame.horizontalAlign
        : 'center',
    verticalAlign:
      frame.verticalAlign === 'top' || frame.verticalAlign === 'bottom'
        ? frame.verticalAlign
        : 'middle',
    fillType: style.fill.type === 'linear-gradient' ? 'linear-gradient' : 'solid',
    fillColor: style.fill.type === 'solid'
      ? style.fill.color
      : style.fill.type === 'linear-gradient'
        ? style.fill.stops[0]?.color ?? 'transparent'
        : 'transparent',
    gradientAngle: style.fill.type === 'linear-gradient'
      ? style.fill.angle
      : DEFAULT_WORD_ART_PROPS.gradientAngle,
    gradientColors: gradient.colors,
    gradientStops: gradient.stops,
    outlineColor: style.outline.type === 'none' ? 'transparent' : style.outline.color,
    outlineWidthEm: style.outline.type === 'none'
      ? 0
      : style.outline.width / Math.max(1, style.fontSize),
    shadowEnabled: shadow.enabled,
    shadowColor: shadow.color,
    shadowOpacity: shadow.opacity,
    shadowOffsetXEm: Math.cos(radians) * shadow.distance / Math.max(1, style.fontSize),
    shadowOffsetYEm: Math.sin(radians) * shadow.distance / Math.max(1, style.fontSize),
    shadowBlurEm: shadow.blur / Math.max(1, style.fontSize),
    effect: EFFECTS.has(style.transform)
      ? style.transform as WordArtEffect
      : DEFAULT_WORD_ART_PROPS.effect,
  }
}

/** Canonical persisted WordArt props; presentation aliases stay render-only. */
export function normalizeWordArtSnapshotProps(
  value: Partial<WordArtBlockProps> | null | undefined,
): WordArtBlockProps {
  const normalized = normalizeWordArtProps(value)
  return {
    depth: 0,
    width: normalized.width,
    height: normalized.height,
    rotation: normalized.rotation,
    lockRatio: normalized.lockAspectRatio,
    textFrame: storeObjectTextFrame(normalized.textFrame),
    textStyle: storeObjectTextStyle(normalized.textStyle),
    ...(normalized.position ? {position: normalized.position} : {}),
    ...(normalized.placementLayer === 'under'
      ? {placementLayer: 'under' as const}
      : {}),
  }
}

export interface WordArtPresentation {
  props: NormalizedWordArtBlockProps
  fontFamily: string
  fallbackColor: string
  textColor: string
  backgroundImage: string
  textStroke: string
  textShadow: string
  effectTransform: string
  textOpacity: number
}

export function getWordArtFontStack(fontId: WordArtFontId): string {
  return WORD_ART_FONT_OPTIONS.find(item => item.id === fontId)?.stack ??
    WORD_ART_FONT_OPTIONS[0].stack
}

function resolveObjectTextFontStack(value: string): string {
  return WORD_ART_FONT_OPTIONS.find(item => item.id === value)?.stack ??
    resolveTypographyFontFamily(value) ?? WORD_ART_FONT_OPTIONS[0].stack
}

const hexToRgba = (hex: string, opacity: number): string => {
  const normalized = hex.slice(1)
  const expanded = normalized.length === 3
    ? normalized.split('').map(char => `${char}${char}`).join('')
    : normalized
  const value = Number.parseInt(expanded, 16)
  const red = value >> 16 & 255
  const green = value >> 8 & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`
}

export function resolveWordArtProjectionPath(
  effect: WordArtEffect,
  width: number,
  height: number,
): string | null {
  if (effect === 'arch-up') {
    return `M 8 ${height * .78} Q ${width / 2} ${height * .05} ${width - 8} ${height * .78}`
  }
  if (effect === 'arch-down') {
    return `M 8 ${height * .22} Q ${width / 2} ${height * .95} ${width - 8} ${height * .22}`
  }
  if (effect === 'circle') {
    return `M ${width / 2} ${height * .08} A ${width * .42} ${height * .42} 0 1 1 ${width / 2 - .01} ${height * .08}`
  }
  if (effect === 'wave') {
    return `M 8 ${height / 2} C ${width * .2} ${height * .08}, ${width * .3} ${height * .92}, ${width / 2} ${height / 2} S ${width * .8} ${height * .08}, ${width - 8} ${height / 2}`
  }
  return null
}

export function resolveWordArtPresentation(
  value: WordArtPresentationInput | null | undefined,
): WordArtPresentation {
  const canonical = value as Partial<WordArtBlockProps> | null | undefined
  const props = normalizeWordArtProps(canonical)
  const objectFormat = normalizeBlockObjectFormat(
    canonical,
    WORD_ART_OBJECT_FORMAT_CAPABILITY,
  )
  const textFill = objectFormat.textStyle!.fill
  const gradientStops = textFill.type === 'linear-gradient'
    ? textFill.stops.map(stop =>
    `${colorWithOpacity(
      stop.color,
      stop.opacity * textFill.opacity,
    )} ${Math.round(stop.offset * 10_000) / 100}%`
      )
    : []
  const isGradient = textFill.type === 'linear-gradient'
  const isPicture = textFill.type === 'picture' && Boolean(textFill.src)
  const fillOpacity = textFill.type === 'none' ? 0 : textFill.opacity
  const fallbackColor = colorWithOpacity(
    isGradient ? props.gradientColors[0] : props.fillColor,
    fillOpacity,
  )
  const backgroundImage = isPicture
    ? `url("${textFill.src.replace(/["\\]/g, '\\$&')}")`
    : isGradient
    ? `linear-gradient(${props.gradientAngle}deg, ${gradientStops.join(', ')})`
    : 'none'
  const textShadow = props.shadowEnabled
    ? [
        `${props.shadowOffsetXEm}em`,
        `${props.shadowOffsetYEm}em`,
        `${props.shadowBlurEm}em`,
        hexToRgba(props.shadowColor, props.shadowOpacity),
      ].join(' ')
    : 'none'

  return {
    props,
    // Object text styles may persist a shared typography id or a bounded CSS
    // font stack. Resolve that canonical field instead of falling back through
    // the removed WordArt-only top-level alias.
    fontFamily: resolveObjectTextFontStack(objectFormat.textStyle!.fontFamily),
    fallbackColor,
    textColor: isGradient || isPicture
      ? 'transparent'
      : colorWithOpacity(props.fillColor, fillOpacity),
    backgroundImage,
    textStroke: `${Math.round(props.outlineWidthEm * 10_000) / 10_000}em ${props.outlineColor}`,
    textShadow,
    effectTransform: objectTextTransformCss(props.effect),
    textOpacity: isPicture ? fillOpacity : textFill.type === 'none' ? 0 : 1,
  }
}

export function wordArtPresentationToInlineStyle(
  value: WordArtPresentationInput | null | undefined,
): string {
  const presentation = resolveWordArtPresentation(value)
  const props = presentation.props
  return [
    `width:${props.width}px`,
    `height:${props.height}px`,
    `font-family:${presentation.fontFamily}`,
    `font-size:${props.fontSize}px`,
    `font-weight:${props.fontWeight}`,
    `font-style:${props.fontStyle}`,
    `letter-spacing:${props.letterSpacingEm}em`,
    `line-height:${props.lineHeight}`,
    `text-align:${props.horizontalAlign}`,
    `color:${presentation.textColor}`,
    `-webkit-text-fill-color:${presentation.textColor}`,
    `caret-color:${presentation.fallbackColor}`,
    `background-image:${presentation.backgroundImage}`,
    `background-size:${resolveTextPaintBackgroundSize(value)}`,
    `background-position:${resolveTextPaintBackgroundPosition(value)}`,
    'background-clip:text',
    '-webkit-background-clip:text',
    `-webkit-text-stroke:${presentation.textStroke}`,
    `text-shadow:${presentation.textShadow}`,
    `transform:${presentation.effectTransform || 'none'}`,
    `opacity:${presentation.textOpacity}`,
    'white-space:pre-wrap',
  ].join(';')
}

function resolveTextPaintBackgroundSize(
  value: WordArtPresentationInput | null | undefined,
): string {
  const fill = normalizeBlockObjectFormat(
    value as Partial<WordArtBlockProps> | null | undefined,
    WORD_ART_OBJECT_FORMAT_CAPABILITY,
  ).textStyle!.fill
  return fill.type === 'picture' ? objectPaintBackgroundSize(fill) : 'auto'
}

function resolveTextPaintBackgroundPosition(
  value: WordArtPresentationInput | null | undefined,
): string {
  const fill = normalizeBlockObjectFormat(
    value as Partial<WordArtBlockProps> | null | undefined,
    WORD_ART_OBJECT_FORMAT_CAPABILITY,
  ).textStyle!.fill
  return fill.type === 'picture' ? objectPaintBackgroundPosition(fill) : '0% 0%'
}
