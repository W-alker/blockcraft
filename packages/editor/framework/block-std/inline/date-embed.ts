import type {DeltaInsertEmbed} from '../types'
import type {EmbedConverter} from './index'

export const INLINE_DATE_EMBED_KEY = 'date'
export const INLINE_DATE_CLASS = 'bc-inline-date'
const INLINE_DATE_VALUE_CLASS = 'bc-inline-date__value'

/**
 * Stored value is a frozen local wall-clock stamp (`YYYY-MM-DDTHH:mm`), never a
 * UTC instant: the embed shows the moment the author picked, so re-opening the
 * document in another timezone must not shift it.
 *
 * The display format lives in `attributes.format` rather than inside the value,
 * so switching format never rewrites — or risks losing — the frozen value.
 */
export const INLINE_DATE_FORMAT_ATTR = 'format'

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** Selectable display formats, ordered as they appear in the edit dialog. */
export const INLINE_DATE_FORMATS = [
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD',
  'YYYY年M月D日 HH:mm',
  'YYYY年M月D日',
  'YYYY年M月D日 dddd',
  'YYYY-MM-DD dddd HH:mm',
  'M月D日',
  'HH:mm',
  'YYYY/MM/DD HH:mm',
  'YYYY/MM/DD',
  'MMM D, YYYY',
] as const

export type InlineDateFormat = typeof INLINE_DATE_FORMATS[number]

export const DEFAULT_INLINE_DATE_FORMAT: InlineDateFormat = 'YYYY-MM-DD HH:mm'

export interface InlineDateData {
  /** Frozen local stamp, `YYYY-MM-DDTHH:mm`. */
  value: string
  format: string
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

const VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/

interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/**
 * Parses a stored stamp. Out-of-range fields are rejected instead of letting
 * `Date` roll them over (month 13 would silently become next January, and the
 * weekday rendered from it would be wrong rather than obviously broken).
 */
function parseParts(value: string): DateParts | null {
  const matched = VALUE_PATTERN.exec(value.trim())
  if (!matched) return null
  const [, y, mo, d, h = '00', mi = '00'] = matched
  const parts: DateParts = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
  }
  if (parts.month < 1 || parts.month > 12) return null
  if (parts.day < 1 || parts.day > 31) return null
  if (parts.hour > 23 || parts.minute > 59) return null
  return parts
}

/** Serializes a `Date` to the frozen local stamp. */
export function toInlineDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${
    pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** Reverses {@link toInlineDateValue}; returns `null` for unparsable input. */
export function parseInlineDateValue(value: string): Date | null {
  const parts = parseParts(value)
  if (!parts) return null
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  )
}

export function isInlineDateFormat(value: unknown): value is InlineDateFormat {
  return typeof value === 'string' &&
    (INLINE_DATE_FORMATS as readonly string[]).includes(value)
}

/**
 * Renders a stored stamp through a format string. Unparsable values are echoed
 * verbatim — visible bad data beats a silently blank embed.
 *
 * Tokens are replaced in a single pass with one regex, longest alternative
 * first (`YYYY` before `MM` before `M`). Chained `replace` calls would let an
 * earlier substitution's output be re-matched as a token by a later one.
 */
export function formatInlineDateValue(value: string, format: string): string {
  const parts = parseParts(value)
  if (!parts) return value
  const weekday = new Date(parts.year, parts.month - 1, parts.day).getDay()
  const table: Record<string, string> = {
    YYYY: String(parts.year),
    MMM: MONTH_ABBR[parts.month - 1],
    dddd: `星期${WEEK_NAMES[weekday]}`,
    ddd: `周${WEEK_NAMES[weekday]}`,
    MM: pad2(parts.month),
    DD: pad2(parts.day),
    HH: pad2(parts.hour),
    mm: pad2(parts.minute),
    M: String(parts.month),
    D: String(parts.day),
    H: String(parts.hour),
  }
  return format.replace(
    /YYYY|MMM|dddd|ddd|MM|DD|HH|mm|M|D|H/g,
    token => table[token] ?? token,
  )
}

/**
 * Builds the embed delta. Unrecognised formats fall back to the default, but an
 * unparsable value is preserved as-is so bad data survives a round-trip instead
 * of being erased on the next save.
 */
export function createInlineDateDelta(
  input: Date | string,
  format?: unknown,
): DeltaInsertEmbed | null {
  const value = input instanceof Date
    ? toInlineDateValue(input)
    : String(input ?? '').trim().replace(' ', 'T')
  if (!value) return null
  return {
    insert: {[INLINE_DATE_EMBED_KEY]: value},
    attributes: {
      [INLINE_DATE_FORMAT_ATTR]: isInlineDateFormat(format)
        ? format
        : DEFAULT_INLINE_DATE_FORMAT,
    },
  }
}

export function readInlineDateDelta(delta: DeltaInsertEmbed): InlineDateData {
  const raw = delta.insert[INLINE_DATE_EMBED_KEY]
  const format = delta.attributes?.[INLINE_DATE_FORMAT_ATTR]
  return {
    value: typeof raw === 'string' ? raw : '',
    format: isInlineDateFormat(format) ? format : DEFAULT_INLINE_DATE_FORMAT,
  }
}

/**
 * Click hit-testing: resolves the embed only from itself or its ancestor chain.
 *
 * Deliberately never searches downward. A descendant search would report a hit
 * for any click on a line that merely *contains* a date — the plugin would then
 * swallow that `mousedown` and the caret would never land.
 */
export function closestInlineDateElement(
  element: HTMLElement,
): HTMLElement | null {
  return element.closest<HTMLElement>(`.${INLINE_DATE_CLASS}`)
}

/**
 * DOM reconstruction: searches upward first, then into the subtree.
 *
 * The downward leg exists for `toDelta`, which is handed the wrapper element
 * rather than the embed itself when HTML is pasted or imported. Never use this
 * for hit-testing — see {@link closestInlineDateElement}.
 */
export function findInlineDateElement(
  element: HTMLElement,
): HTMLElement | null {
  return closestInlineDateElement(element) ??
    element.querySelector<HTMLElement>(`.${INLINE_DATE_CLASS}`)
}

/** Reads the frozen value and format back off a rendered embed element. */
export function readInlineDateElement(element: HTMLElement): InlineDateData {
  const host = findInlineDateElement(element)
  const format = host?.dataset['bcDateFormat']
  return {
    value: host?.dataset['bcDateValue'] ?? '',
    format: isInlineDateFormat(format) ? format : DEFAULT_INLINE_DATE_FORMAT,
  }
}

/**
 * The value and format are mirrored onto `data-*` so `toDelta` can rebuild the
 * delta from DOM alone (copy/paste, HTML import). The text node is derived and
 * never read back — the stamp is the single source of truth.
 *
 * A factory rather than a shared constant: bundled capabilities require one
 * converter instance per document, so a converter can never be reused across
 * two surfaces even after it grows state.
 */
export function createInlineDateEmbedConverter(): EmbedConverter {
  return {
    toView: delta => {
      const {value, format} = readInlineDateDelta(delta)
      const span = document.createElement('span')
      const icon = document.createElement('i')
      const text = document.createElement('span')
      span.className = INLINE_DATE_CLASS
      span.dataset['bcDateValue'] = value
      span.dataset['bcDateFormat'] = format
      icon.className = 'csicon csicon-date-time'
      icon.setAttribute('aria-hidden', 'true')
      text.className = INLINE_DATE_VALUE_CLASS
      text.textContent = formatInlineDateValue(value, format)
      span.append(icon, text)
      return span
    },
    toDelta: element => {
      const {value, format} = readInlineDateElement(element)
      return createInlineDateDelta(value || element.textContent || '', format) ??
        {insert: {[INLINE_DATE_EMBED_KEY]: ''}}
    },
  }
}
