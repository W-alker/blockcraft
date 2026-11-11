/**
 * 形状填充的「纯色 / 线性渐变」值对象与换算工具。
 *
 * 渐变持久化沿用 WordArt 的结构化契约（fillType + gradientAngle +
 * gradientColors + gradientStops），不持久化裸 CSS background 字符串：
 * SVG 渲染本来就需要拆开的色标数据来生成 <linearGradient>。
 */

export type ShapeFillType = 'solid' | 'linear-gradient'

/** 归一化后的渐变值对象：颜色 2..4 个大写 hex，stops 已按 0..1 升序排好。 */
export interface ShapeGradientFill {
  angle: number
  colors: string[]
  stops: number[]
}

export interface ShapeFillGradientPreset extends ShapeGradientFill {
  id: string
  label: string
}

export const DEFAULT_SHAPE_GRADIENT: Readonly<ShapeGradientFill> = {
  angle: 160,
  colors: ['#60A5FA', '#2563EB'],
  stops: [0, 1],
}

/**
 * 内置渐变预设（Word「渐变」库的简化版）。预设 ID 不持久化，
 * 套用时把具体的 angle/colors/stops 写入 props。
 */
export const SHAPE_FILL_GRADIENT_PRESETS:
  ReadonlyArray<ShapeFillGradientPreset> = [
  {id: 'sky', label: '晴空', angle: 180, colors: ['#DBEAFE', '#60A5FA'], stops: [0, 1]},
  {id: 'ocean', label: '海洋', angle: 160, colors: ['#60A5FA', '#2563EB'], stops: [0, 1]},
  {id: 'dusk', label: '暮色', angle: 160, colors: ['#26405E', '#58402E'], stops: [0, 1]},
  {id: 'mint', label: '青提', angle: 160, colors: ['#6EE7B7', '#0D9488'], stops: [0, 1]},
  {id: 'violet', label: '紫罗兰', angle: 135, colors: ['#C4B5FD', '#7C3AED'], stops: [0, 1]},
  {id: 'sunset', label: '落日', angle: 180, colors: ['#FDE047', '#F97316', '#DC2626'], stops: [0, 0.58, 1]},
  {id: 'sakura', label: '樱粉', angle: 135, colors: ['#FDA4AF', '#E11D48'], stops: [0, 1]},
  {id: 'silver', label: '银灰', angle: 180, colors: ['#F8FAFC', '#94A3B8'], stops: [0, 1]},
  {id: 'graphite', label: '石墨', angle: 160, colors: ['#475569', '#0F172A'], stops: [0, 1]},
  {id: 'gold', label: '鎏金', angle: 120, colors: ['#FCD34D', '#B45309'], stops: [0, 1]},
  {id: 'cyan', label: '天青', angle: 200, colors: ['#BAE6FD', '#0284C7'], stops: [0, 1]},
  {id: 'forest', label: '松林', angle: 160, colors: ['#4ADE80', '#14532D'], stops: [0, 1]},
]

const HEX_COLOR = /^#[\da-f]{3}(?:[\da-f]{3})?$/i

const normalizeHexColor = (
  value: unknown,
  fallback: string,
): string => {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return fallback
  const normalized = value.toUpperCase()
  if (normalized.length === 7) return normalized
  return `#${normalized.slice(1).split('')
    .map(character => `${character}${character}`)
    .join('')}`
}

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

export function normalizeShapeGradientAngle(value: unknown): number {
  const angle = Number(value)
  if (!Number.isFinite(angle)) return DEFAULT_SHAPE_GRADIENT.angle
  const normalized = ((angle % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

/**
 * 校验渐变色标：颜色 2..4 个 hex、stop 0..1，输出按 stop 升序配对。
 * 数据不完整时回退到默认渐变，保证消费者拿到的一定是可渲染值。
 */
export function normalizeShapeGradient(
  angleValue: unknown,
  colorsValue: unknown,
  stopsValue: unknown,
): ShapeGradientFill {
  const sourceColors = Array.isArray(colorsValue)
    ? colorsValue.slice(0, 4)
    : []
  const colors = sourceColors.map((color, index) => normalizeHexColor(
    color,
    DEFAULT_SHAPE_GRADIENT.colors[
      Math.min(index, DEFAULT_SHAPE_GRADIENT.colors.length - 1)
    ],
  ))
  if (colors.length < 2) {
    return {
      angle: normalizeShapeGradientAngle(angleValue),
      colors: [...DEFAULT_SHAPE_GRADIENT.colors],
      stops: [...DEFAULT_SHAPE_GRADIENT.stops],
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
    angle: normalizeShapeGradientAngle(angleValue),
    colors: pairs.map(pair => pair.color),
    stops: pairs.map(pair => pair.stop),
  }
}

/** 生成 CSS 预览串，供工具条色块与预设九宫格展示当前渐变。 */
export function shapeGradientToCss(gradient: ShapeGradientFill): string {
  const stops = gradient.colors.map((color, index) =>
    `${color} ${Math.round(gradient.stops[index] * 10_000) / 100}%`)
  return `linear-gradient(${gradient.angle}deg, ${stops.join(', ')})`
}

export interface ShapeGradientSvgVector {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * 把 CSS 角度语义（0deg 朝上、顺时针增加）换算成 objectBoundingBox
 * 坐标系下的 <linearGradient> 端点。非正方形形状会随 viewBox 拉伸，
 * 与 CSS 投影存在轻微角度差，预设均为常规角度，视觉可接受。
 */
export function shapeGradientToSvgVector(
  angle: number,
): ShapeGradientSvgVector {
  const radians = normalizeShapeGradientAngle(angle) * Math.PI / 180
  const dx = Math.sin(radians) / 2
  const dy = -Math.cos(radians) / 2
  const round = (value: number) => Math.round(value * 10_000) / 10_000
  return {
    x1: round(0.5 - dx),
    y1: round(0.5 - dy),
    x2: round(0.5 + dx),
    y2: round(0.5 + dy),
  }
}
