import {BUBBLE_R_TEXT_BOX_PRESETS} from './presets/bubble-r'
import {OUTLINE_R_TEXT_BOX_PRESETS} from './presets/outline-r'
import {RECT_R_TEXT_BOX_PRESETS} from './presets/rect-r'
import {
  type TextBoxBlockProps,
  type TextBoxWritingMode,
} from './text-box.types'

export type TextBoxPresetPatch = Partial<TextBoxBlockProps>

/** Catalog grouping, mirroring Word's text-box shape tabs. */
export const TEXT_BOX_PRESET_CATEGORIES = [
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

/**
 * The retained defaults are assigned to their semantic shape tab instead of
 * occupying a parallel "featured" category.
 *
 * 极简 and 默认白框 are the SAME classic frame diverging only in fill opacity —
 * the shared fields live once so retuning the border/padding/default size moves
 * both entries together, instead of relying on a spec assertion to notice drift.
 */
// Typed annotation, NOT `as const`: the shared const carries no `id`, so no
// literal type is load-bearing here — and a const-asserted `p: [10, 14]` loses
// literal "freshness" when spread, which the mutable-tuple BlockSurfacePadding
// target then rejects (fresh literals inside `as const satisfies` get the
// readonly relaxation; a spread from a standalone const does not).
const CLASSIC_FRAME: Pick<TextBoxPresetDefinition, 'cat' | 'defaultWidth' | 'defaultHeight' | 'props'> = {
  cat: 'outline',
  defaultWidth: 260,
  defaultHeight: 132,
  props: {
    sh: 'rectangle',
    p: [10, 14],
    backColor: '#FFFFFF',
    borderColor: '#64748B',
    bw: 1,
    bs: 'solid',
    wa: null,
  },
}

/** Named default: `getTextBoxPreset` falls back here, not to a magic-id lookup. */
const CLASSIC_TEXT_BOX_PRESET = {
  id: 'classic',
  label: '默认白框',
  ...CLASSIC_FRAME,
  props: {...CLASSIC_FRAME.props, fo: 1},
} as const satisfies TextBoxPresetDefinition

const CURATED_TEXT_BOX_PRESETS = [
  {
    // The classic frame with its fill zeroed — `fo: 0` is the same value the
    // 无填充 button writes, so the panel state reads consistently and
    // re-picking a fill color restores `fo: 1` on its own. The border stays,
    // which is what keeps the thumbnail and the canvas presence visible; a
    // fully invisible variant was considered and rejected for exactly that
    // blank-swatch problem.
    id: 'no-fill',
    label: '极简',
    ...CLASSIC_FRAME,
    props: {...CLASSIC_FRAME.props, fo: 0},
  },
  CLASSIC_TEXT_BOX_PRESET,
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
  // The curated pair leads the outline tab: 极简 first, 默认白框 second.
  ...CURATED_TEXT_BOX_PRESETS,
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
  // Unknown ids fall back to the classic white frame, not to whatever entry
  // happens to lead the catalog — the no-fill entry took the first slot, and
  // a stale id silently resolving to a fill-less frame would look like data
  // loss rather than a fallback. The default is the named constant itself, so
  // renaming or retiring the id breaks the build instead of a runtime lookup.
  return TEXT_BOX_PRESETS.find(item => item.id === value) ?? CLASSIC_TEXT_BOX_PRESET
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
