import type {
  BlockPositionState,
  IEditableBlockProps,
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

export interface WordArtBlockProps extends IEditableBlockProps {
  width: number
  height: number
  rotation: number
  placement?: BlockPositionState

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

export interface NormalizedWordArtBlockProps extends WordArtBlockProps {
  placement?: BlockPositionState
}

export const DEFAULT_WORD_ART_PROPS: Readonly<NormalizedWordArtBlockProps> = {
  depth: 0,
  width: 320,
  height: 96,
  rotation: 0,
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

const normalizePlacement = (
  value: unknown,
): BlockPositionState | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const placement = value as Record<string, unknown>
  if (placement['mode'] !== 'absolute') return undefined
  const unit = placement['unit'] === 'px' ? 'px' as const : undefined
  return {
    mode: 'absolute',
    x: finiteNumber(placement['x'], 0, 0, unit === 'px' ? 1_000_000 : 100),
    y: finiteNumber(placement['y'], 0, 0, 1_000_000),
    ...(unit ? {unit} : {}),
    layer: placement['layer'] === 'under' ? 'under' : 'over',
  }
}

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
  const gradient = normalizeGradient(
    value?.gradientColors,
    value?.gradientStops,
  )
  const fontWeight = Number(value?.fontWeight)
  const placement = normalizePlacement(value?.placement)

  return {
    depth: 0,
    width: finiteNumber(
      value?.width,
      DEFAULT_WORD_ART_PROPS.width,
      48,
      2_000,
    ),
    height: finiteNumber(
      value?.height,
      DEFAULT_WORD_ART_PROPS.height,
      32,
      2_000,
    ),
    rotation: normalizeWordArtRotation(value?.rotation),
    ...(placement ? {placement} : {}),
    fontFamily:
      typeof value?.fontFamily === 'string' &&
      FONT_IDS.has(value.fontFamily)
        ? value.fontFamily as WordArtFontId
        : DEFAULT_WORD_ART_PROPS.fontFamily,
    fontSize: finiteNumber(
      value?.fontSize,
      DEFAULT_WORD_ART_PROPS.fontSize,
      8,
      512,
    ),
    fontWeight: FONT_WEIGHTS.has(fontWeight)
      ? fontWeight as WordArtFontWeight
      : DEFAULT_WORD_ART_PROPS.fontWeight,
    fontStyle: value?.fontStyle === 'italic' ? 'italic' : 'normal',
    letterSpacingEm: finiteNumber(
      value?.letterSpacingEm,
      DEFAULT_WORD_ART_PROPS.letterSpacingEm,
      -0.2,
      1,
    ),
    lineHeight: finiteNumber(
      value?.lineHeight,
      DEFAULT_WORD_ART_PROPS.lineHeight,
      0.8,
      3,
    ),
    horizontalAlign:
      value?.horizontalAlign === 'left' ||
      value?.horizontalAlign === 'right'
        ? value.horizontalAlign
        : 'center',
    verticalAlign:
      value?.verticalAlign === 'top' ||
      value?.verticalAlign === 'bottom'
        ? value.verticalAlign
        : 'middle',
    fillType: value?.fillType === 'solid'
      ? 'solid'
      : 'linear-gradient',
    fillColor: normalizeColor(
      value?.fillColor,
      DEFAULT_WORD_ART_PROPS.fillColor,
    ),
    gradientAngle: finiteNumber(
      value?.gradientAngle,
      DEFAULT_WORD_ART_PROPS.gradientAngle,
      0,
      360,
    ),
    gradientColors: gradient.colors,
    gradientStops: gradient.stops,
    outlineColor: normalizeColor(
      value?.outlineColor,
      DEFAULT_WORD_ART_PROPS.outlineColor,
    ),
    outlineWidthEm: finiteNumber(
      value?.outlineWidthEm,
      DEFAULT_WORD_ART_PROPS.outlineWidthEm,
      0,
      0.2,
    ),
    shadowEnabled: value?.shadowEnabled !== false,
    shadowColor: normalizeColor(
      value?.shadowColor,
      DEFAULT_WORD_ART_PROPS.shadowColor,
    ),
    shadowOpacity: finiteNumber(
      value?.shadowOpacity,
      DEFAULT_WORD_ART_PROPS.shadowOpacity,
      0,
      1,
    ),
    shadowOffsetXEm: finiteNumber(
      value?.shadowOffsetXEm,
      DEFAULT_WORD_ART_PROPS.shadowOffsetXEm,
      -1,
      1,
    ),
    shadowOffsetYEm: finiteNumber(
      value?.shadowOffsetYEm,
      DEFAULT_WORD_ART_PROPS.shadowOffsetYEm,
      -1,
      1,
    ),
    shadowBlurEm: finiteNumber(
      value?.shadowBlurEm,
      DEFAULT_WORD_ART_PROPS.shadowBlurEm,
      0,
      1,
    ),
    effect:
      typeof value?.effect === 'string' && EFFECTS.has(value.effect)
        ? value.effect as WordArtEffect
        : DEFAULT_WORD_ART_PROPS.effect,
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
}

export function getWordArtFontStack(fontId: WordArtFontId): string {
  return WORD_ART_FONT_OPTIONS.find(item => item.id === fontId)?.stack ??
    WORD_ART_FONT_OPTIONS[0].stack
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

const resolveEffectTransform = (effect: WordArtEffect): string => {
  if (effect === 'slant-left') return 'skewX(-10deg)'
  if (effect === 'slant-right') return 'skewX(10deg)'
  if (effect === 'slant-up') return 'skewY(-8deg)'
  if (effect === 'slant-down') return 'skewY(8deg)'
  if (effect === 'perspective-left') {
    return 'perspective(600px) rotateY(-12deg)'
  }
  if (effect === 'perspective-right') {
    return 'perspective(600px) rotateY(12deg)'
  }
  if (effect === 'perspective-up') {
    return 'perspective(600px) rotateX(12deg)'
  }
  if (effect === 'perspective-down') {
    return 'perspective(600px) rotateX(-12deg)'
  }
  if (effect === 'wide') return 'scaleX(1.18)'
  if (effect === 'narrow') return 'scaleX(0.82)'
  if (effect === 'tall') return 'scaleY(1.18)'
  if (effect === 'short') return 'scaleY(0.82)'
  if (effect === 'inflate') return 'scale(1.08)'
  if (effect === 'deflate') return 'scale(0.92)'
  return ''
}

export function resolveWordArtPresentation(
  value: Partial<WordArtBlockProps> | null | undefined,
): WordArtPresentation {
  const props = normalizeWordArtProps(value)
  const gradientStops = props.gradientColors.map((color, index) =>
    `${color} ${Math.round(props.gradientStops[index] * 10_000) / 100}%`
  )
  const isGradient = props.fillType === 'linear-gradient'
  const fallbackColor = isGradient
    ? props.gradientColors[0]
    : props.fillColor
  const backgroundImage = isGradient
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
    fontFamily: getWordArtFontStack(props.fontFamily),
    fallbackColor,
    textColor: isGradient ? 'transparent' : props.fillColor,
    backgroundImage,
    textStroke: `${props.outlineWidthEm}em ${props.outlineColor}`,
    textShadow,
    effectTransform: resolveEffectTransform(props.effect),
  }
}

export function wordArtPresentationToInlineStyle(
  value: Partial<WordArtBlockProps> | null | undefined,
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
    'background-clip:text',
    '-webkit-background-clip:text',
    `-webkit-text-stroke:${presentation.textStroke}`,
    `text-shadow:${presentation.textShadow}`,
    `transform:${presentation.effectTransform || 'none'}`,
    'white-space:pre-wrap',
  ].join(';')
}
