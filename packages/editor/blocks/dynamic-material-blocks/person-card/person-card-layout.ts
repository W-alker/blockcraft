import {calculateShapeResize, type ShapeResizeCalculator, type ShapeResizeHandle} from '../../shape-block/shape-resizer.component'

/** sc 是整体倍率；fsr/fsp/fsc 是按样式分组的字号 shorthand。 */
export interface PersonCardTypographyProps {
  sc?: number
  fsr?: string
  fsp?: string
  fsc?: string
}

export type PersonCardFontRole = 'name' | 'pinyin' | 'desc'
export type PersonCardFontKey = 'fsr' | 'fsp' | 'fsc'

const FONTS: Record<string, {key: PersonCardFontKey; roles: readonly PersonCardFontRole[]; sizes: readonly number[]}> = {
  row: {key: 'fsr', roles: ['name', 'desc'], sizes: [15, 12]},
  rowPinyin: {key: 'fsp', roles: ['name', 'pinyin', 'desc'], sizes: [15, 9.5, 11]},
  column: {key: 'fsc', roles: ['name', 'desc'], sizes: [14, 11]},
}

export function personCardFonts(style: string | undefined, props: PersonCardTypographyProps) {
  const definition = FONTS[style ?? ''] ?? FONTS['row']
  const raw = props[definition.key]
  const values = typeof raw === 'string' ? raw.trim().split(/\s+/) : []
  return definition.roles.map((role, index) => {
    const value = Number(values[index])
    const fallback = definition.sizes[index]
    return {role, key: definition.key, size: Number.isFinite(value) && value > 0 ? value : fallback, fallback}
  })
}

/** '-' 表示沿用默认，裁掉末尾默认项；全部默认返回 null，由 updateProps 删除字段。 */
export function storePersonCardFont(style: string | undefined, props: PersonCardTypographyProps, role: PersonCardFontRole, size: number): Partial<Record<PersonCardFontKey, string | null>> {
  const fonts = personCardFonts(style, props)
  const values = fonts.map(font => {
    const value = Math.round((font.role === role ? size : font.size) * 100) / 100
    return !Number.isFinite(value) || value <= 0 || value === font.fallback ? '-' : String(value)
  })
  while (values.at(-1) === '-') values.pop()
  return {[fonts[0].key]: values.length ? values.join(' ') : null}
}

export function personCardContentScale(props: PersonCardTypographyProps, legacyScale = 1): number {
  const scale = Number(props.sc)
  return Number.isFinite(scale) && scale > 0 ? scale : legacyScale
}

export function isPersonCardCorner(handle: ShapeResizeHandle): boolean {
  return (handle.includes('east') || handle.includes('west')) &&
    (handle.includes('north') || handle.includes('south'))
}

/** 边改排版，角按相对变化较大的轴缩放；最小尺寸与最大宽度一起约束比例。 */
export const calculatePersonCardResize: ShapeResizeCalculator = (handle, start, dx, dy, maxWidth) => {
  if (!isPersonCardCorner(handle)) return calculateShapeResize(handle, start, dx, dy, maxWidth)
  const sx = (start.width + (handle.includes('west') ? -dx : dx)) / start.width
  const sy = (start.height + (handle.includes('north') ? -dy : dy)) / start.height
  const wanted = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy
  const minimum = Math.max(48 / start.width, 32 / start.height)
  const maximum = maxWidth != null && Number.isFinite(maxWidth) ? Math.max(minimum, maxWidth / start.width) : Infinity
  const scale = Math.min(maximum, Math.max(minimum, wanted))
  const width = start.width * scale
  const height = start.height * scale
  return {
    width, height,
    offsetX: start.offsetX + (handle.includes('west') ? start.width - width : 0),
    offsetY: start.offsetY + (handle.includes('north') ? start.height - height : 0),
  }
}
