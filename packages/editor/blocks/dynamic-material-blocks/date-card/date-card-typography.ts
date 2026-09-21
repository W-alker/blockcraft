import {showsWeek, showsYear} from './date-card-format.util'

export const DATE_CARD_FONT_KEYS = ['fsCalendar', 'fsSquare', 'fsBanner', 'fsMinibar', 'fsTicket', 'fsStamp', 'fsFlip'] as const
export type DateCardFontKey = typeof DATE_CARD_FONT_KEYS[number]
export type DateCardFontRole = 'day' | 'primary' | 'secondary'
export type DateCardTypographyProps = Partial<Record<DateCardFontKey, string | null>> & {ff?: string | null}

// 每档的三个文字层级；尺寸是未缩放的设计像素，与既有样式一致。
const DEFINITIONS: Record<string, {key: DateCardFontKey; sizes: readonly number[]; labels: readonly string[]}> = {
  calendar: {key: 'fsCalendar', sizes: [48, 16, 13.8], labels: ['日期', '月份/星期', '年月']},
  square: {key: 'fsSquare', sizes: [47.6, 15.4, 15.4], labels: ['日期', '年月', '星期']},
  banner: {key: 'fsBanner', sizes: [45, 12, 12.7], labels: ['日期', '月份', '年份/星期']},
  minibar: {key: 'fsMinibar', sizes: [27, 11, 11], labels: ['日期', '年月', '星期']},
  ticket: {key: 'fsTicket', sizes: [43.7, 17.1, 14.3], labels: ['日期', '年月', '星期']},
  stamp: {key: 'fsStamp', sizes: [39.6, 12.5, 10.6], labels: ['日期', '年月', '星期']},
  flip: {key: 'fsFlip', sizes: [51.7, 12.2, 11.6], labels: ['日期', '年月', '星期']},
}
const ROLES: readonly DateCardFontRole[] = ['day', 'primary', 'secondary']
// 面板限制的是缩放后的显示字号，设计字号可能在缩小卡片时超过该上限。
const validSize = (value: number): boolean => Number.isFinite(value) && value > 0

/** 返回全部层级，visible 只控制面板，不删除隐藏层级的设置。 */
export function dateCardFonts(style: string | undefined, props: DateCardTypographyProps, format?: string) {
  const id = style && Object.hasOwn(DEFINITIONS, style) ? style : 'calendar'
  const definition = DEFINITIONS[id]
  const raw = props[definition.key]
  const values = typeof raw === 'string' ? raw.trim().split(/\s+/) : []
  return ROLES.map((role, index) => {
    const value = Number(values[index])
    const fallback = definition.sizes[index]
    const visible = role !== 'secondary' || (id === 'calendar' ? showsYear(format)
      : id === 'banner' ? showsYear(format) || showsWeek(format) : showsWeek(format))
    return {role, key: definition.key, label: definition.labels[index], size: validSize(value) ? value : fallback, fallback, visible}
  })
}

/** 当前样式单独存储；默认值用 '-' 占位，尾部默认省略，恢复默认删除字段。 */
export function storeDateCardFont(style: string | undefined, props: DateCardTypographyProps, role: DateCardFontRole, size: number): Partial<Record<DateCardFontKey, string | null>> {
  if (!ROLES.includes(role) || !validSize(size)) return {}
  const fonts = dateCardFonts(style, props)
  const values = fonts.map(font => {
    const value = Math.round((font.role === role ? size : font.size) * 100) / 100
    return value === font.fallback ? '-' : String(value)
  })
  while (values.at(-1) === '-') values.pop()
  return {[fonts[0].key]: values.length ? values.join(' ') : null}
}
