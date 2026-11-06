const SIDES = ['top', 'right', 'bottom', 'left'] as const
export type RegionBorderSide = typeof SIDES[number]
export type RegionBorders = Partial<Record<RegionBorderSide, string>>
/** Sparse objects are accepted from older documents; new writes use side props. */
export const REGION_BORDER_SIDE_PROPS = {
  top: 'borderTop', right: 'borderRight', bottom: 'borderBottom', left: 'borderLeft',
} as const
export type RegionBorderSideProp = typeof REGION_BORDER_SIDE_PROPS[RegionBorderSide]
export type RegionBorderProps = {border?: string | null; borders?: RegionBorders | null} &
  Partial<Record<RegionBorderSideProp, string | null>>

function normalizeBorder(value: unknown): string | null {
  if (value === 'none') return 'none'
  if (typeof value !== 'string') return null
  const border = value.trim()
  if (!/^(?:\d+(?:\.\d+)?)px (?:solid|dashed|dotted|double) (?:#[\da-fA-F]{3,8}|[a-zA-Z]+|rgba?\([\d.,% ]+\))$/.test(border)) return null
  return parseFloat(border) <= 24 ? border : null
}

/** Older callers can still expand a single shorthand or sparse side object. */
export function normalizeRegionBorders(value: unknown): RegionBorders | null {
  if (typeof value === 'string') {
    const border = normalizeBorder(value)
    return border ? Object.fromEntries(SIDES.map(side => [side, border])) : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as RegionBorders
  const result: RegionBorders = {}
  for (const side of SIDES) {
    const border = normalizeBorder(source[side])
    if (border) result[side] = border
  }
  return Object.keys(result).length ? result : null
}

/** Uniform shorthand is the base; only sides that differ keep their own prop. */
export function normalizeRegionBorderProps(input: Readonly<Record<string, unknown>> | null | undefined): RegionBorderProps {
  if (!input) return {}
  let base = normalizeBorder(input['border'])
  const legacy = base ? null : normalizeRegionBorders(input['borders'])
  if (legacy) {
    const values = SIDES.map(side => legacy[side] ?? 'none')
    base = values.reduce((best, value) =>
      values.filter(item => item === value).length > values.filter(item => item === best).length
        ? value : best, 'none')
  }
  const explicit: RegionBorders = {}
  for (const side of SIDES) {
    const border = normalizeBorder(input[REGION_BORDER_SIDE_PROPS[side]])
    if (border) explicit[side] = border
  }
  if (!base && !legacy && !Object.keys(explicit).length) return {}
  base ??= 'none'
  const values = SIDES.map(side => explicit[side] ?? legacy?.[side] ?? (legacy ? 'none' : base))
  if (values.every(value => value === values[0])) return {border: values[0]}
  const result: RegionBorderProps = {border: base}
  SIDES.forEach((side, index) => {
    if (values[index] !== base) result[REGION_BORDER_SIDE_PROPS[side]] = values[index]
  })
  return result
}

export function resolveRegionBorders(input: Readonly<Record<string, unknown>> | null | undefined): RegionBorders | null {
  const props = normalizeRegionBorderProps(input)
  if (!props.border) return null
  return Object.fromEntries(SIDES.map(side => [side,
    props[REGION_BORDER_SIDE_PROPS[side]] ?? props.border]))
}

/** Clear stale side props in one updateProps patch after a border edit. */
export function regionBorderPatch(input: Readonly<Record<string, unknown>>): RegionBorderProps {
  const normalized = normalizeRegionBorderProps(input)
  return {
    border: normalized.border ?? null,
    borders: null,
    ...Object.fromEntries(SIDES.map(side => {
      const key = REGION_BORDER_SIDE_PROPS[side]
      return [key, normalized[key] ?? null]
    })),
  }
}

export function applyRegionBorders(element: HTMLElement, input: unknown) {
  const value = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Readonly<Record<string, unknown>> : null
  const props = typeof input === 'string' ? {border: input}
    : value && SIDES.some(side => side in value) && !('border' in value) && !('borders' in value)
      ? {borders: value} : value
  const borders = resolveRegionBorders(props)
  element.toggleAttribute('data-bc-region-borders', !!borders)
  for (const side of SIDES) {
    element.style.setProperty(`--bc-region-border-${side}`, borders?.[side] ?? 'none')
  }
}
