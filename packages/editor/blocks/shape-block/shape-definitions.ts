import type {ShapeKind} from './shape.types'

export interface ShapeTextInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ShapeDefinition {
  type: ShapeKind
  label: string
  path: string
  textInsets: ShapeTextInsets
}

const DEFAULT_INSETS: ShapeTextInsets = {
  top: 0.14,
  right: 0.14,
  bottom: 0.14,
  left: 0.14,
}

export const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
  {
    type: 'rectangle',
    label: '矩形',
    path: 'M0 0H1000V1000H0Z',
    textInsets: DEFAULT_INSETS,
  },
  {
    type: 'rounded-rectangle',
    label: '圆角矩形',
    path: 'M120 0H880Q1000 0 1000 120V880Q1000 1000 880 1000H120Q0 1000 0 880V120Q0 0 120 0Z',
    textInsets: DEFAULT_INSETS,
  },
  {
    type: 'ellipse',
    label: '椭圆',
    path: 'M500 0A500 500 0 1 1 499.9 0Z',
    textInsets: {top: 0.2, right: 0.2, bottom: 0.2, left: 0.2},
  },
  {
    type: 'triangle',
    label: '三角形',
    path: 'M500 0L1000 1000H0Z',
    textInsets: {top: 0.36, right: 0.2, bottom: 0.12, left: 0.2},
  },
  {
    type: 'diamond',
    label: '菱形',
    path: 'M500 0L1000 500L500 1000L0 500Z',
    textInsets: {top: 0.25, right: 0.25, bottom: 0.25, left: 0.25},
  },
  {
    type: 'star',
    label: '五角星',
    path: 'M500 18L612 365L976 365L682 578L794 924L500 710L206 924L318 578L24 365L388 365Z',
    textInsets: {top: 0.3, right: 0.25, bottom: 0.28, left: 0.25},
  },
  {
    type: 'right-arrow',
    label: '右箭头',
    path: 'M0 250H620V0L1000 500L620 1000V750H0Z',
    textInsets: {top: 0.28, right: 0.32, bottom: 0.28, left: 0.1},
  },
  {
    type: 'left-right-arrow',
    label: '双向箭头',
    path: 'M0 500L260 0V250H740V0L1000 500L740 1000V750H260V1000Z',
    textInsets: {top: 0.3, right: 0.28, bottom: 0.3, left: 0.28},
  },
  {
    type: 'parallelogram',
    label: '平行四边形',
    path: 'M200 0H1000L800 1000H0Z',
    textInsets: {top: 0.14, right: 0.22, bottom: 0.14, left: 0.22},
  },
  {
    type: 'hexagon',
    label: '六边形',
    path: 'M250 0H750L1000 500L750 1000H250L0 500Z',
    textInsets: {top: 0.14, right: 0.24, bottom: 0.14, left: 0.24},
  },
  {
    type: 'speech-bubble',
    label: '对话气泡',
    path: 'M120 0H880Q1000 0 1000 120V720Q1000 840 880 840H360L130 1000L190 840H120Q0 840 0 720V120Q0 0 120 0Z',
    textInsets: {top: 0.12, right: 0.14, bottom: 0.28, left: 0.14},
  },
  {
    type: 'notched-right-arrow',
    label: '燕尾箭头',
    path: 'M0 0H680L1000 500L680 1000H0L220 500Z',
    textInsets: {top: 0.14, right: 0.32, bottom: 0.14, left: 0.24},
  },
] as const

const DEFINITIONS_BY_TYPE = new Map(
  SHAPE_DEFINITIONS.map(definition => [definition.type, definition]),
)

export function getShapeDefinition(type: ShapeKind): ShapeDefinition {
  return DEFINITIONS_BY_TYPE.get(type) ?? SHAPE_DEFINITIONS[0]
}
