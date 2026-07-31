import type {
  WordArtBlockProps,
} from './word-art.types'

export const WORD_ART_PRESETS = [
  {
    id: 'sunset',
    label: '落日金',
    props: {
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
    },
  },
  {
    id: 'ocean',
    label: '深海蓝',
    props: {
      fillType: 'linear-gradient',
      fillColor: '#2563EB',
      gradientAngle: 90,
      gradientColors: ['#67E8F9', '#4F46E5', '#C026D3'],
      gradientStops: [0, 0.55, 1],
      outlineColor: '#312E81',
      outlineWidthEm: 0.025,
      shadowEnabled: true,
      shadowColor: '#312E81',
      shadowOpacity: 0.32,
      shadowOffsetXEm: 0.04,
      shadowOffsetYEm: 0.14,
      shadowBlurEm: 0.08,
      effect: 'perspective-left',
    },
  },
  {
    id: 'mint',
    label: '薄荷青',
    props: {
      fillType: 'solid',
      fillColor: '#14B8A6',
      gradientAngle: 180,
      gradientColors: ['#5EEAD4', '#0F766E'],
      gradientStops: [0, 1],
      outlineColor: '#134E4A',
      outlineWidthEm: 0.025,
      shadowEnabled: true,
      shadowColor: '#0F766E',
      shadowOpacity: 0.24,
      shadowOffsetXEm: 0.06,
      shadowOffsetYEm: 0.1,
      shadowBlurEm: 0.08,
      effect: 'none',
    },
  },
  {
    id: 'berry',
    label: '莓果紫',
    props: {
      fillType: 'linear-gradient',
      fillColor: '#9333EA',
      gradientAngle: 135,
      gradientColors: ['#F0ABFC', '#9333EA', '#4C1D95'],
      gradientStops: [0, 0.55, 1],
      outlineColor: '#581C87',
      outlineWidthEm: 0.035,
      shadowEnabled: true,
      shadowColor: '#3B0764',
      shadowOpacity: 0.34,
      shadowOffsetXEm: 0.08,
      shadowOffsetYEm: 0.1,
      shadowBlurEm: 0.05,
      effect: 'slant-right',
    },
  },
  {
    id: 'mono',
    label: '黑白经典',
    props: {
      fillType: 'solid',
      fillColor: '#F8FAFC',
      gradientAngle: 180,
      gradientColors: ['#F8FAFC', '#CBD5E1'],
      gradientStops: [0, 1],
      outlineColor: '#0F172A',
      outlineWidthEm: 0.045,
      shadowEnabled: true,
      shadowColor: '#0F172A',
      shadowOpacity: 0.4,
      shadowOffsetXEm: 0.07,
      shadowOffsetYEm: 0.09,
      shadowBlurEm: 0,
      effect: 'none',
    },
  },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  props: Partial<WordArtBlockProps>
}>

export type WordArtPresetId = typeof WORD_ART_PRESETS[number]['id']

export function getWordArtPreset(
  value: unknown,
): typeof WORD_ART_PRESETS[number] {
  return WORD_ART_PRESETS.find(item => item.id === value) ??
    WORD_ART_PRESETS[0]
}
