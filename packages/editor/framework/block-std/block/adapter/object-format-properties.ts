import type {Element} from 'hast'
import {
  normalizeBlockObjectFormat, storeBlockObjectFormat, OBJECT_FORMAT_SECTION_KEYS,
  type BlockObjectFormatCapability, type BlockObjectFormatProps,
} from '../../..'

const GROUPS = [...new Set(Object.values(OBJECT_FORMAT_SECTION_KEYS).flat())]
const propertyName = (key: string): string =>
  `dataBcObject${key[0]!.toUpperCase()}${key.slice(1)}`

/** CSS paint strings and compact groups remain ordinary HTML attributes. */
export function objectFormatPropsFromHtml(node: Element): Partial<BlockObjectFormatProps> {
  const result: Record<string, unknown> = {}
  for (const key of GROUPS) {
    const value = node.properties?.[propertyName(key)]
    if (value === undefined || value === null) continue
    if (key === 'width' || key === 'height' || key === 'rotation' || key === 'fillOpacity' || key === 'textFillOpacity') {
      const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
      if (Number.isFinite(number)) result[key] = number
    } else if (key === 'lockRatio' || key === 'textWrap' || key === 'textRotate') {
      if (value === true || value === 'true') result[key] = true
      else if (value === false || value === 'false') result[key] = false
    } else if (typeof value === 'string' && value.length <= 32_000) {
      result[key] = value
    }
  }
  return result as Partial<BlockObjectFormatProps>
}

export function objectFormatPropsToHtml(
  props: Readonly<Partial<BlockObjectFormatProps>>,
  capability: Readonly<BlockObjectFormatCapability>,
): Record<string, string | number | boolean> {
  const stored = storeBlockObjectFormat(normalizeBlockObjectFormat(props, capability), capability)
  const result: Record<string, string | number | boolean> = {}
  for (const key of GROUPS) {
    const value = stored[key]
    if (value !== undefined && value !== null) {
      result[propertyName(key)] = typeof value === 'object' ? JSON.stringify(value) : value
    }
  }
  return result
}
