import {getWordArtPreset, type WordArtPresetId} from '../word-art-block'
import {
  normalizeTextBoxWordArtStyle,
  serializeTextBoxWordArtStyle,
  type TextBoxBlockProps,
} from './text-box.types'

export type TextBoxPresetPatch = Partial<TextBoxBlockProps>

export interface TextBoxPresetDefinition {
  id: string
  label: string
  defaultWidth: number
  defaultHeight: number
  props: Readonly<TextBoxPresetPatch>
}

const wordArt = (id: WordArtPresetId): string =>
  serializeTextBoxWordArtStyle(
    normalizeTextBoxWordArtStyle(getWordArtPreset(id).props),
  )!

/**
 * Catalog-side Word-like text-box styles. Preset IDs are never persisted;
 * choosing one writes its concrete appearance values into the block props.
 */
export const TEXT_BOX_PRESETS = [
  {
    id: 'classic',
    label: '经典白框',
    defaultWidth: 260,
    defaultHeight: 132,
    props: {
      sh: 'rectangle',
      p: [10, 14],
      backColor: '#FFFFFF',
      borderColor: '#64748B',
      fo: 1,
      bw: 1,
      bs: 'solid',
      wa: null,
    },
  },
  {
    id: 'soft-blue',
    label: '柔和蓝',
    defaultWidth: 280,
    defaultHeight: 140,
    props: {
      sh: 'rounded-rectangle',
      p: [8, 12],
      backColor: '#EFF6FF',
      borderColor: '#60A5FA',
      fo: 1,
      bw: 2,
      bs: 'solid',
      wa: null,
    },
  },
  {
    id: 'paper-note',
    label: '便笺纸',
    defaultWidth: 250,
    defaultHeight: 150,
    props: {
      sh: 'folded-corner',
      p: [6, 10],
      backColor: '#FEF3C7',
      borderColor: '#D97706',
      fo: 1,
      bw: 1.5,
      bs: 'solid',
      wa: null,
    },
  },
  {
    id: 'speech',
    label: '对话气泡',
    defaultWidth: 300,
    defaultHeight: 170,
    props: {
      sh: 'rounded-speech-bubble',
      p: [4, 8],
      backColor: '#F8FAFC',
      borderColor: '#2563EB',
      fo: 1,
      bw: 2,
      bs: 'solid',
      wa: null,
    },
  },
  {
    id: 'cloud',
    label: '灵感云',
    defaultWidth: 310,
    defaultHeight: 190,
    props: {
      sh: 'cloud-callout',
      p: [2, 6],
      backColor: '#F3E8FF',
      borderColor: '#9333EA',
      fo: 0.96,
      bw: 2,
      bs: 'dashed',
      wa: null,
    },
  },
  {
    id: 'ink-title',
    label: '墨蓝标题',
    defaultWidth: 340,
    defaultHeight: 150,
    props: {
      sh: 'rounded-rectangle',
      p: [6, 12],
      backColor: '#0F172A',
      borderColor: '#38BDF8',
      fo: 1,
      bw: 2,
      bs: 'solid',
      wa: wordArt('ice'),
    },
  },
  {
    id: 'royal-banner',
    label: '皇家横幅',
    defaultWidth: 360,
    defaultHeight: 170,
    props: {
      sh: 'ribbon',
      p: [2, 8],
      backColor: '#581C87',
      borderColor: '#FDE68A',
      fo: 1,
      bw: 2,
      bs: 'solid',
      wa: wordArt('royal'),
    },
  },
  {
    id: 'neon-card',
    label: '霓虹卡片',
    defaultWidth: 320,
    defaultHeight: 150,
    props: {
      sh: 'snipped-and-rounded-rectangle',
      p: [6, 10],
      backColor: '#18181B',
      borderColor: '#22D3EE',
      fo: 1,
      bw: 2,
      bs: 'solid',
      wa: wordArt('neon'),
    },
  },
] as const satisfies readonly TextBoxPresetDefinition[]

export type TextBoxPresetId = typeof TEXT_BOX_PRESETS[number]['id']

export function getTextBoxPreset(value: unknown): TextBoxPresetDefinition {
  return TEXT_BOX_PRESETS.find(item => item.id === value) ?? TEXT_BOX_PRESETS[0]
}
