import {getWordArtPreset, type WordArtPresetId} from '../word-art-block'
import {BUBBLE_R_TEXT_BOX_PRESETS} from './presets/bubble-r'
import {OUTLINE_R_TEXT_BOX_PRESETS} from './presets/outline-r'
import {RECT_R_TEXT_BOX_PRESETS} from './presets/rect-r'
import {
  normalizeTextBoxWordArtStyle,
  serializeTextBoxWordArtStyle,
  type TextBoxBlockProps,
  type TextBoxWritingMode,
} from './text-box.types'

export type TextBoxPresetPatch = Partial<TextBoxBlockProps>

/** Catalog grouping, mirroring Word's text-box shape tabs. */
export const TEXT_BOX_PRESET_CATEGORIES = [
  {id: 'featured', label: '精选'},
  {id: 'outline', label: '线框'},
  {id: 'rect', label: '矩形'},
  {id: 'bubble', label: '气泡'},
] as const

export type TextBoxPresetCategory =
  typeof TEXT_BOX_PRESET_CATEGORIES[number]['id']

export interface TextBoxPresetDefinition {
  id: string
  label: string
  defaultWidth: number
  defaultHeight: number
  /** Catalog tab. Omitted entries appear in every tab. */
  cat?: TextBoxPresetCategory
  /**
   * Directions this preset is offered in. Omitted means both — direction is a
   * frame flag, not a second copy of the data. Only geometries whose decoration
   * has a fixed orientation (bubble tails) restrict themselves.
   */
  wm?: readonly TextBoxWritingMode[]
  props: Readonly<TextBoxPresetPatch>
}

const wordArt = (id: WordArtPresetId): string =>
  serializeTextBoxWordArtStyle(
    normalizeTextBoxWordArtStyle(getWordArtPreset(id).props),
  )!

/**
 * The original curated set, kept first as Word's 精选 tab so existing entries
 * stay reachable at their old ids after the shape tabs were introduced.
 */
const FEATURED_TEXT_BOX_PRESETS = [
  {
    id: 'classic',
    label: '经典白框',
    cat: 'featured',
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
    cat: 'featured',
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
    cat: 'featured',
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
    cat: 'featured',
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
    cat: 'featured',
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
    cat: 'featured',
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
    cat: 'featured',
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
    cat: 'featured',
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

/**
 * Catalog-side Word-like text-box styles. Preset IDs are never persisted;
 * choosing one writes its concrete appearance values into the block props.
 *
 * Each shape tab lives in its own module so the catalog can grow without one
 * file becoming the merge point for every contributor. `as const` is load
 * bearing on every part: an explicit `TextBoxPresetDefinition[]` annotation
 * anywhere in this chain widens `id` to `string` and collapses
 * `TextBoxPresetId` from a literal union.
 */
export const TEXT_BOX_PRESETS = [
  // The 精选 tab is the original curated set and is left alone.
  ...FEATURED_TEXT_BOX_PRESETS,
  // One decorated set per shape tab, each entry replicating a specific cell of
  // a reference sheet rather than invented from scratch. Earlier drafts that
  // improvised their own ornament vocabulary were replaced wholesale: a catalog
  // reads as a set only when every entry answers to the same source.
  ...OUTLINE_R_TEXT_BOX_PRESETS,
  ...RECT_R_TEXT_BOX_PRESETS,
  ...BUBBLE_R_TEXT_BOX_PRESETS,
] as const satisfies readonly TextBoxPresetDefinition[]

export type TextBoxPresetId = typeof TEXT_BOX_PRESETS[number]['id']

/**
 * A catalog entry with its id narrowed back to the union. The widened
 * `TextBoxPresetDefinition` view is needed to read optional keys off the
 * `as const` union, but callers that emit a pick still need the literal type.
 */
export type TextBoxPresetEntry =
  Omit<TextBoxPresetDefinition, 'id'> & {id: TextBoxPresetId}

export function getTextBoxPreset(value: unknown): TextBoxPresetDefinition {
  return TEXT_BOX_PRESETS.find(item => item.id === value) ?? TEXT_BOX_PRESETS[0]
}

/**
 * Presets offered for a direction. A preset opts out by listing directions
 * explicitly — bundled speech bubbles are horizontal-only because their tails
 * are baked into a stretched, non-rotating path.
 */
export function getTextBoxPresetsFor(
  wm: TextBoxWritingMode,
  cat?: TextBoxPresetCategory,
): readonly TextBoxPresetEntry[] {
  // Widened view: the `as const` union drops absent optional keys entirely, so
  // `preset.wm` is unreadable on it. `TEXT_BOX_PRESETS` itself stays literal
  // because `TextBoxPresetId` is derived from it.
  const all: readonly TextBoxPresetEntry[] = TEXT_BOX_PRESETS
  return all.filter(preset =>
    (!preset.wm || preset.wm.includes(wm)) &&
    (!cat || !preset.cat || preset.cat === cat),
  )
}

/** Tabs that still have at least one preset in the given direction. */
export function getTextBoxPresetCategoriesFor(
  wm: TextBoxWritingMode,
): readonly {id: TextBoxPresetCategory; label: string}[] {
  return TEXT_BOX_PRESET_CATEGORIES.filter(category =>
    getTextBoxPresetsFor(wm, category.id).length > 0,
  )
}
