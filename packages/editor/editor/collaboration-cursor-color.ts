export interface CollaborationUser {
  id: string
  name: string
  /** Optional concrete CSS color. Invalid values fall back to the built-in palette. */
  color?: string
}

export interface CollaborationCursorColors {
  solid: string
  selection: string
}

export const COLLABORATION_CURSOR_PALETTE = [
  '#2563EB',
  '#0F766E',
  '#B45309',
  '#BE123C',
  '#7C3AED',
  '#0E7490',
  '#15803D',
  '#C2410C',
  '#A21CAF',
  '#4338CA',
] as const

const SELECTION_ALPHA = 0.18

let colorContext: CanvasRenderingContext2D | null | undefined

function getColorContext(): CanvasRenderingContext2D | null {
  if (colorContext !== undefined) return colorContext
  if (typeof document === 'undefined') return colorContext = null
  colorContext = document.createElement('canvas').getContext('2d')
  return colorContext
}

function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value)
  if (!match) return null
  const hex = match[1]
  if (hex.length === 3 || hex.length === 4) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ]
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function parseSerializedRgb(value: string): [number, number, number] | null {
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value)
  if (!match) return null
  const channels = match.slice(1, 4).map(channel => Number.parseFloat(channel))
  if (channels.some(channel => !Number.isFinite(channel))) return null
  return channels.map(channel => Math.max(0, Math.min(255, Math.round(channel)))) as [
    number,
    number,
    number,
  ]
}

function parseConcreteCssColor(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const directHex = parseHexColor(trimmed)
  if (directHex) return directHex

  const context = getColorContext()
  if (!context) return null

  // Canvas normalizes concrete browser-supported colors without attaching a
  // probe to the DOM. Two sentinels distinguish an invalid assignment from a
  // valid color that happens to equal one sentinel.
  context.fillStyle = '#010203'
  context.fillStyle = trimmed
  const first = context.fillStyle
  context.fillStyle = '#040506'
  context.fillStyle = trimmed
  const second = context.fillStyle
  if (first !== second) return null
  return parseHexColor(first) ?? parseSerializedRgb(first)
}

function toHexColor([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function toSelectionColor([red, green, blue]: [number, number, number]): string {
  return `rgba(${red}, ${green}, ${blue}, ${SELECTION_ALPHA})`
}

function stableUserHash(userId: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function resolveCollaborationCursorColor(
  user: Pick<CollaborationUser, 'id' | 'color'>,
): CollaborationCursorColors {
  const explicit = parseConcreteCssColor(user.color)
  const solid = explicit
    ? toHexColor(explicit)
    : COLLABORATION_CURSOR_PALETTE[
      stableUserHash(user.id) % COLLABORATION_CURSOR_PALETTE.length
    ]
  const rgb = explicit ?? parseHexColor(solid)!
  return {
    solid,
    selection: toSelectionColor(rgb),
  }
}
