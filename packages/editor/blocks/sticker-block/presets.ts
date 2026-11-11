/** Built-in SVGs are authored here, never read from document data. */
export interface StickerPreset {
  readonly id: string
  readonly version: number
  readonly label: string
  readonly width: number
  readonly height: number
  readonly colors: Readonly<Record<string, string>>
  readonly render: (colors: Readonly<Record<string, string>>) => string
}

const svg = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`

export const STICKER_PRESETS: readonly StickerPreset[] = Object.freeze([
  {
    id: 'sunburst', version: 1, label: '日光徽章', width: 160, height: 160,
    colors: Object.freeze({sun: '#F9CD46', center: '#FFF4BC', ink: '#3C5A6E'}),
    render: (c: Readonly<Record<string, string>>) => svg(160, 160, `<path fill="${c['sun']}" d="M80 2 91 27l23-14 1 27 27-1-14 23 25 11-25 11 14 23-27-1-1 27-23-14-11 25-11-25-23 14-1-27-27 1 14-23L7 73l25-11-14-23 27 1 1-27 23 14z"/><circle cx="80" cy="73" r="48" fill="${c['center']}"/><path fill="none" stroke="${c['ink']}" stroke-width="5" stroke-linecap="round" d="M58 68h1m42 0h1M63 91q17 19 34 0"/>`),
  },
  {
    id: 'leaf-label', version: 1, label: '植物标签', width: 180, height: 120,
    colors: Object.freeze({paper: '#FBEAD9', leaf: '#5E9274', ink: '#725444'}),
    render: (c: Readonly<Record<string, string>>) => svg(180, 120, `<path fill="${c['paper']}" stroke="${c['ink']}" stroke-width="3" d="M8 12h164v96H8z"/><path fill="${c['leaf']}" d="M87 95C52 73 56 39 85 23c15 31 16 54 2 72zm7-1c2-37 20-58 52-61-3 34-17 55-52 61z"/><path fill="none" stroke="${c['ink']}" stroke-width="3" stroke-linecap="round" d="M89 99V55m0 34 38-36"/>`),
  },
  {
    id: 'ribbon-star', version: 1, label: '星星缎带', width: 180, height: 140,
    colors: Object.freeze({ribbon: '#5479B8', star: '#FFDC67', ink: '#334D70'}),
    render: (c: Readonly<Record<string, string>>) => svg(180, 140, `<path fill="${c['ribbon']}" d="M13 27h154v78H13l17-39z"/><path fill="${c['star']}" stroke="${c['ink']}" stroke-width="3" stroke-linejoin="round" d="m90 34 10 22 24 3-18 17 5 25-21-12-21 12 5-25-18-17 24-3z"/>`),
  },
].map(preset => Object.freeze(preset)))

export const getStickerPreset = (id: unknown, version: unknown): StickerPreset | null =>
  STICKER_PRESETS.find(preset => preset.id === id && preset.version === version) ?? null

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Keep only known, changed, valid slots. A default color is represented by absence. */
export function normalizeStickerColors(
  preset: StickerPreset,
  source: unknown,
): Record<string, string> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  const values = source as Record<string, unknown>
  const result: Record<string, string> = {}
  for (const [slot, defaultColor] of Object.entries(preset.colors)) {
    const value = values[slot]
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) continue
    const color = value.toUpperCase()
    if (color !== defaultColor.toUpperCase()) result[slot] = color
  }
  return result
}

export function setStickerColor(
  preset: StickerPreset,
  source: unknown,
  slot: string,
  color: string,
): Record<string, string> {
  const next = {...normalizeStickerColors(preset, source)}
  if (!Object.prototype.hasOwnProperty.call(preset.colors, slot)) return next
  if (!HEX_COLOR.test(color)) return next
  const normalized = color.toUpperCase()
  if (normalized === preset.colors[slot].toUpperCase()) delete next[slot]
  else next[slot] = normalized
  return next
}

const imageCache = new Map<string, string>()
const MAX_RENDER_CACHE = 128

/** The SVG stays outside the snapshot. `<img>` renders it in image mode. */
export function renderStickerDataUrl(
  id: unknown,
  version: unknown,
  colors: unknown,
): string | null {
  const preset = getStickerPreset(id, version)
  if (!preset) return null
  const overrides = normalizeStickerColors(preset, colors)
  const key = `${preset.id}@${preset.version}:${JSON.stringify(overrides)}`
  const cached = imageCache.get(key)
  if (cached) return cached
  const source = preset.render({...preset.colors, ...overrides})
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  if (imageCache.size >= MAX_RENDER_CACHE) imageCache.delete(imageCache.keys().next().value!)
  imageCache.set(key, url)
  return url
}
