import {BUBBLE_R_TEXT_BOX_PRESETS} from './presets/bubble-r'
import {OUTLINE_R_TEXT_BOX_PRESETS} from './presets/outline-r'
import {RECT_R_TEXT_BOX_PRESETS} from './presets/rect-r'
import {
  TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
  type TextBoxBlockProps,
  type TextBoxWritingMode,
} from './text-box.types'
import {
  createObjectPaint,
  storeObjectEffects,
  storeObjectLine,
  storeObjectPaint,
  storeObjectTextFrame,
  storeObjectTextStyle,
  type ObjectPaint,
  type ObjectPictureFit,
  type ObjectTextFrame,
} from '../../framework'
import {TEXT_BOX_ARTWORK_SCHEME} from './presets/artwork'
import type {ShapeKind} from '../shape-block/shape.types'

export type TextBoxPresetPatch = Partial<TextBoxBlockProps>

export interface TextBoxPresetAuthoringProps {
  sh?: ShapeKind
  p?: number | [number] | [number, number] |
    [number, number, number] | [number, number, number, number]
  backColor?: string
  borderColor?: string
  bw?: number
  bs?: 'solid' | 'dashed'
  fo?: number
  bgi?: string
  bgs?: ObjectPictureFit
  bgo?: number
  wm?: TextBoxWritingMode
  wa?: null
}

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
  props: Readonly<TextBoxPresetAuthoringProps>
}

/** Resolved catalog entry written directly through DocCRUD/Yjs. */
export interface ResolvedTextBoxPresetDefinition
  extends Omit<TextBoxPresetDefinition, 'props'> {
  props: Readonly<TextBoxPresetPatch>
}

/**
 * The catalog source files intentionally remain compact design data. Convert
 * them at the catalog boundary so every newly inserted preset persists only
 * the unified public object-format contract; this is not a legacy-document
 * migration path.
 */
function canonicalizePreset<T extends TextBoxPresetDefinition>(
  preset: T,
): Omit<T, 'props'> & {props: Readonly<TextBoxPresetPatch>} {
  const source = preset.props
  const defaults = TEXT_BOX_OBJECT_FORMAT_CAPABILITY.defaults
  const defaultFill = defaults.shapeFill ?? createObjectPaint('solid')
  const defaultOutline = defaults.shapeOutline!
  const opacity = typeof source['fo'] === 'number'
    ? Math.min(1, Math.max(0, source['fo']))
    : 1
  const image = typeof source['bgi'] === 'string' ? source['bgi'].trim() : ''
  const artwork = image.startsWith(TEXT_BOX_ARTWORK_SCHEME) ? image : ''
  const color = typeof source['backColor'] === 'string'
    ? source['backColor'].trim()
    : defaultFill.type === 'solid'
      ? defaultFill.color
      : '#FFFFFF'
  const shapeFill: ObjectPaint = image && !artwork
    ? {
        ...createObjectPaint('picture'),
        src: image,
        fit: normalizePictureFit(source['bgs']),
        opacity: typeof source['bgo'] === 'number'
          ? Math.min(1, Math.max(0, source['bgo']))
          : opacity,
      }
    : {
        ...(opacity === 0 || color === 'transparent'
          ? {type: 'none' as const}
          : {
              type: 'solid' as const,
              color,
              opacity,
            }),
      }
  const outlineWidth = typeof source['bw'] === 'number'
    ? Math.max(0, source['bw'])
    : defaultOutline.width
  const outlineColor = typeof source['borderColor'] === 'string'
    ? source['borderColor'].trim()
    : defaultOutline.color
  const textFrame: ObjectTextFrame = {
    ...defaults.textFrame!,
    margins: normalizeMargins(source['p'], defaults.textFrame!.margins),
    direction: source['wm'] === 'v' ? 'vertical-rl' : 'horizontal',
  }
  return {
    ...preset,
    props: {
      width: preset.defaultWidth,
      height: preset.defaultHeight,
      rotation: defaults.rotation,
      lockRatio: defaults.lockAspectRatio,
      shape: source.sh ?? 'rectangle',
      fill: storeObjectPaint(shapeFill),
      outline: storeObjectLine({
        ...defaultOutline,
        type: outlineWidth === 0 || outlineColor === 'transparent'
          ? 'none'
          : 'line',
        color: outlineColor === 'transparent'
          ? defaultOutline.color
          : outlineColor,
        width: outlineWidth,
        dash: source['bs'] === 'dashed' ? 'dash' : 'solid',
      }),
      effects: storeObjectEffects(defaults.shapeEffects!),
      textFrame: storeObjectTextFrame(textFrame),
      textStyle: storeObjectTextStyle(defaults.textStyle!),
      ...(artwork ? {artwork} : {}),
    },
  }
}

function normalizeMargins(
  value: unknown,
  fallback: ObjectTextFrame['margins'],
): ObjectTextFrame['margins'] {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 4)) {
    return [...fallback]
  }
  const numbers = value.map(item => typeof item === 'number' && Number.isFinite(item)
    ? Math.min(200, Math.max(0, item))
    : 0)
  return value.length === 2
    ? [numbers[0]!, numbers[1]!, numbers[0]!, numbers[1]!]
    : [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3]!]
}

function normalizePictureFit(value: unknown): ObjectPictureFit {
  return value === 'contain' || value === 'stretch' ? value : 'cover'
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

const CANONICAL_CLASSIC_TEXT_BOX_PRESET = canonicalizePreset(
  CLASSIC_TEXT_BOX_PRESET,
)

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
  ...CURATED_TEXT_BOX_PRESETS.map(canonicalizePreset),
  // One decorated set per shape tab, each entry replicating a specific cell of
  // a reference sheet rather than invented from scratch. Earlier drafts that
  // improvised their own ornament vocabulary were replaced wholesale: a catalog
  // reads as a set only when every entry answers to the same source.
  ...OUTLINE_R_TEXT_BOX_PRESETS.map(canonicalizePreset),
  ...RECT_R_TEXT_BOX_PRESETS.map(canonicalizePreset),
  ...BUBBLE_R_TEXT_BOX_PRESETS.map(canonicalizePreset),
] as const satisfies readonly ResolvedTextBoxPresetDefinition[]

export type TextBoxPresetId = typeof TEXT_BOX_PRESETS[number]['id']

/**
 * A catalog entry with its id narrowed back to the union. The widened
 * `TextBoxPresetDefinition` view is needed to read optional keys off the
 * `as const` union, but callers that emit a pick still need the literal type.
 */
export type TextBoxPresetEntry =
  Omit<ResolvedTextBoxPresetDefinition, 'id'> & {id: TextBoxPresetId}

export function getTextBoxPreset(
  value: unknown,
): ResolvedTextBoxPresetDefinition {
  // Unknown ids fall back to the classic white frame, not to whatever entry
  // happens to lead the catalog — the no-fill entry took the first slot, and
  // a stale id silently resolving to a fill-less frame would look like data
  // loss rather than a fallback. The default is the named constant itself, so
  // renaming or retiring the id breaks the build instead of a runtime lookup.
  return TEXT_BOX_PRESETS.find(item => item.id === value) ??
    CANONICAL_CLASSIC_TEXT_BOX_PRESET
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
