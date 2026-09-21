export type RegionBorders = Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>
/** CSS border shorthand is intentionally limited to a width, line style and color. */
export function normalizeRegionBorders(value: unknown): RegionBorders | null {
  if (!value || typeof value !== 'object') return null
  const source = value as RegionBorders
  const result: RegionBorders = {}
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const v = source[side]
    if (v === 'none') result[side] = 'none'
    else if (typeof v === 'string' && /^(?:\d+(?:\.\d+)?)px (?:solid|dashed|dotted|double) (?:#[\da-fA-F]{3,8}|[a-zA-Z]+|rgba?\([\d.,% ]+\))$/.test(v.trim())) {
      const width = parseFloat(v)
      if (width <= 24) result[side] = v.trim()
    }
  }
  return Object.keys(result).length ? result : null
}
export function applyRegionBorders(element: HTMLElement, value: unknown) {
  const borders = normalizeRegionBorders(value)
  element.toggleAttribute('data-bc-region-borders', !!borders)
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    element.style.setProperty(`--bc-region-border-${side}`, borders?.[side] ?? 'none')
  }
}
