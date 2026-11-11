import type {ObjectLinearGradientPaint, ObjectGradientStop} from './object-format'

/** Split only top-level CSS commas; rgb()/color-mix() remain a single token. */
function splitCssList(value: string): string[] | null {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
    if (depth < 0 || depth > 8) return null
  }
  if (depth !== 0) return null
  parts.push(value.slice(start).trim())
  return parts.every(Boolean) ? parts : null
}

function stopColor(color: string, opacity: number): string {
  return opacity === 1 ? color
    : `color-mix(in srgb, ${color} ${Number((opacity * 100).toFixed(8))}%, transparent)`
}

/** Global paint opacity is owned by the sibling fillOpacity/textFillOpacity prop. */
export function encodeObjectGradient(paint: Readonly<ObjectLinearGradientPaint>): string {
  return `linear-gradient(${paint.angle}deg, ${paint.stops.map(stop =>
    `${stopColor(stop.color, stop.opacity)} ${Number((stop.offset * 100).toFixed(8))}%`,
  ).join(', ')})`
}

/** Bounded, DOM-free parser for the editor's 2–4 stop linear-gradient subset. */
export function decodeObjectGradient(value: string): ObjectLinearGradientPaint | null {
  if (value.length > 2048 || /[;{}]|url\s*\(/i.test(value)) return null
  const match = /^linear-gradient\((.*)\)$/i.exec(value.trim())
  const parts = match ? splitCssList(match[1]!) : null
  if (!parts) return null
  let angle = 180
  const direction = /^(to (?:top|right|bottom|left)(?: (?:top|right|bottom|left))?|[+-]?(?:\d+\.?\d*|\.\d+)(?:deg|turn|rad|grad))$/i.exec(parts[0]!)
  if (direction) {
    const token = parts.shift()!.toLowerCase()
    const directions: Record<string, number> = {
      'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270,
      'to top right': 45, 'to right top': 45, 'to bottom right': 135,
      'to right bottom': 135, 'to bottom left': 225, 'to left bottom': 225,
      'to top left': 315, 'to left top': 315,
    }
    angle = token.startsWith('to ') ? directions[token]!
      : parseFloat(token) * (token.endsWith('turn') ? 360
        : token.endsWith('grad') ? 0.9 : token.endsWith('rad') ? 180 / Math.PI : 1)
    if (!Number.isFinite(angle)) return null
  }
  if (parts.length < 2 || parts.length > 4) return null
  const stops: Array<Omit<ObjectGradientStop, 'offset'> & {offset?: number}> = []
  for (const part of parts) {
    const positioned = /^(.*?)\s+([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(part)
    let color = positioned ? positioned[1]!.trim() : part
    let opacity = 1
    // This canonical color-mix wrapper preserves the independently editable
    // stop alpha, including when the original color itself contains alpha.
    const mixed = /^color-mix\((.*)\)$/i.exec(color)
    const mix = mixed ? splitCssList(mixed[1]!) : null
    if (mix?.length === 3 && mix[0] === 'in srgb' && mix[2] === 'transparent') {
      const component = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(mix[1]!)
      if (!component) return null
      color = component[1]!.trim()
      opacity = Number(component[2]) / 100
      if (opacity > 1) return null
    }
    if (!color || color.length > 128 || !splitCssList(color) || splitCssList(color)!.length !== 1 ||
      !/^(?:#[\da-f]{3,8}|[a-z][\w-]*|[a-z][\w-]*\(.*\))$/i.test(color)) return null
    const offset = positioned ? Number(positioned[2]) / 100 : undefined
    if (offset !== undefined && (offset < 0 || offset > 1)) return null
    stops.push({color, opacity, offset})
  }
  stops[0]!.offset ??= 0
  stops[stops.length - 1]!.offset ??= 1
  let anchor = 0
  for (let i = 1; i < stops.length; i++) {
    if (stops[i]!.offset === undefined) continue
    const end = Math.max(stops[anchor]!.offset!, stops[i]!.offset!)
    stops[i]!.offset = end
    for (let j = anchor + 1; j < i; j++) {
      stops[j]!.offset = stops[anchor]!.offset! + (end - stops[anchor]!.offset!) * (j - anchor) / (i - anchor)
    }
    anchor = i
  }
  return {type: 'linear-gradient', angle, opacity: 1, stops: stops as ObjectGradientStop[]}
}
