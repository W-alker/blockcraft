function number2letter(n: number) {
  const ordA = 'a'.charCodeAt(0);
  const ordZ = 'z'.charCodeAt(0);
  const len = ordZ - ordA + 1;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % len) + ordA) + s;
    n = Math.floor(n / len) - 1;
  }
  return s;
}

/** Persisted identifier for a preset in the ordered marker library. */
export type OrderedMarkerStyleId =
  | 'n1'
  | 'n2'
  | 'n3'
  | 'n4'
  | 'n5'
  | 'a1'
  | 'a2'
  | 'r1'
  | 'r2'
  | 'c1'
  | 'c2'
  | 'o1'

export type OrderedMarkerEnclosure = 'circle' | null

export interface OrderedMarkerStyleDescriptor {
  readonly id: OrderedMarkerStyleId
  readonly label: string
  readonly preview: readonly [string, string, string]
  readonly enclosure: OrderedMarkerEnclosure
}

/** Word-like marker presets in their picker order. */
export const ORDERED_MARKER_STYLES: readonly OrderedMarkerStyleDescriptor[] =
  Object.freeze([
    {id: 'n1', label: '数字加句点', preview: ['1.', '2.', '3.'], enclosure: null},
    {id: 'n2', label: '数字加右括号', preview: ['1)', '2)', '3)'], enclosure: null},
    {id: 'n3', label: '括号数字', preview: ['(1)', '(2)', '(3)'], enclosure: null},
    {id: 'n4', label: '数字加顿号', preview: ['1、', '2、', '3、'], enclosure: null},
    {id: 'n5', label: '补零数字', preview: ['01.', '02.', '03.'], enclosure: null},
    {id: 'a1', label: '小写字母', preview: ['a.', 'b.', 'c.'], enclosure: null},
    {id: 'a2', label: '大写字母', preview: ['A.', 'B.', 'C.'], enclosure: null},
    {id: 'r1', label: '小写罗马数字', preview: ['i.', 'ii.', 'iii.'], enclosure: null},
    {id: 'r2', label: '大写罗马数字', preview: ['I.', 'II.', 'III.'], enclosure: null},
    {id: 'c1', label: '中文数字', preview: ['一、', '二、', '三、'], enclosure: null},
    {id: 'c2', label: '中文大写数字', preview: ['壹、', '贰、', '叁、'], enclosure: null},
    {id: 'o1', label: '圆圈数字', preview: ['1', '2', '3'], enclosure: 'circle'},
  ] as const)

const ORDERED_MARKER_STYLE_IDS = new Set<string>(
  ORDERED_MARKER_STYLES.map(style => style.id),
)

export const isOrderedMarkerStyleId = (
  value: unknown,
): value is OrderedMarkerStyleId =>
  typeof value === 'string' && ORDERED_MARKER_STYLE_IDS.has(value)

// Derive from https://gist.github.com/imilu/00f32c61e50b7ca296f91e9d96d8e976
export function number2roman(num: number) {
  const lookup: { [key: string]: number } = {
    M: 1000,
    CM: 900,
    D: 500,
    CD: 400,
    C: 100,
    XC: 90,
    L: 50,
    XL: 40,
    X: 10,
    IX: 9,
    V: 5,
    IV: 4,
    I: 1,
  };
  let romanStr = '';
  for (const i in lookup) {
    while (num >= lookup[i]) {
      romanStr += i;
      num -= lookup[i];
    }
  }
  return romanStr;
}

function getPrefix(depth: number, index: number) {
  const map = [() => index + 1, number2letter, () => number2roman(index + 1)];
  return map[depth % map.length](index);
}

export function getNumberPrefix(index: number, depth: number) {
  return `${getPrefix(depth, index)}`;
}

const CJK_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const
const CJK_UNITS = ['', '十', '百', '千'] as const
const CJK_FORMAL_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'] as const
const CJK_FORMAL_UNITS = ['', '拾', '佰', '仟'] as const

const normalizeMarkerIndex = (index: number) => {
  const value = Number(index)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

const formatCjkNumber = (
  value: number,
  digits: readonly string[],
  units: readonly string[],
) => {
  if (value <= 0 || value > 9999) return `${value}`

  const source = `${value}`
  let result = ''
  let pendingZero = false
  for (let index = 0; index < source.length; index++) {
    const digit = Number(source[index])
    const unitIndex = source.length - index - 1
    if (digit === 0) {
      pendingZero = true
      continue
    }
    if (pendingZero && result) result += digits[0]
    pendingZero = false
    if (digit === 1 && unitIndex === 1 && index === 0) {
      result += units[unitIndex]
    } else {
      result += `${digits[digit]}${units[unitIndex]}`
    }
  }
  return result
}

const formatRoman = (value: number, upper: boolean) => {
  const roman = value <= 3999 ? number2roman(value) : `${value}`
  return upper ? roman : roman.toLowerCase()
}

/** Format a 0-based order using one explicit marker-library preset. */
export const formatOrderedMarker = (
  index: number,
  style: OrderedMarkerStyleId,
): string => {
  const safeIndex = normalizeMarkerIndex(index)
  const value = safeIndex + 1
  switch (style) {
    case 'n2':
      return `${value})`
    case 'n3':
      return `(${value})`
    case 'n4':
      return `${value}、`
    case 'n5':
      return `${`${value}`.padStart(2, '0')}.`
    case 'a1':
      return `${number2letter(safeIndex)}.`
    case 'a2':
      return `${number2letter(safeIndex).toUpperCase()}.`
    case 'r1':
      return `${formatRoman(value, false)}.`
    case 'r2':
      return `${formatRoman(value, true)}.`
    case 'c1':
      return `${formatCjkNumber(value, CJK_DIGITS, CJK_UNITS)}、`
    case 'c2':
      return `${formatCjkNumber(value, CJK_FORMAL_DIGITS, CJK_FORMAL_UNITS)}、`
    case 'o1':
      return `${value}`
    case 'n1':
    default:
      return `${value}.`
  }
}

/**
 * Single rendering seam shared by the live block and Snapshot Viewer.
 * Missing or unknown styles retain the historical depth-cycling appearance.
 */
export const resolveOrderedMarker = (
  index: number,
  depth: number,
  style?: OrderedMarkerStyleId | null,
): {text: string; enclosure: OrderedMarkerEnclosure} => {
  if (!isOrderedMarkerStyleId(style)) {
    return {text: `${getNumberPrefix(index, depth)}.`, enclosure: null}
  }
  const descriptor = ORDERED_MARKER_STYLES.find(item => item.id === style)
  return {
    text: formatOrderedMarker(index, style),
    enclosure: descriptor?.enclosure ?? null,
  }
}

/** Keep circle content optically smaller than ordinary marker text. */
export const resolveOrderedMarkerDigitScale = (
  text: string,
  enclosure: OrderedMarkerEnclosure,
): string | null => {
  if (enclosure !== 'circle') return null
  const length = [...text].length
  if (length <= 1) return '0.72em'
  return length === 2 ? '0.62em' : '0.5em'
}
