import type {
  BlockPlacementLayer,
  BlockPosition,
} from '../../block-std/types'

export const finitePlacementNumber = (
  value: unknown,
  fallback = 0,
): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export const resolvePlacementLayer = (value: unknown): BlockPlacementLayer =>
  value === 'under' ? 'under' : 'over'

/** Decode only the compact persisted form; runtime geometry stays numeric. */
export function parseBlockPosition(value: unknown): BlockPosition | null {
  if (typeof value !== 'string' || value.length > 128) return null
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 2 || parts.some(part =>
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(part),
  )) return null
  const [x, y] = parts.map(Number)
  return Number.isFinite(x) && Number.isFinite(y) ? {x: x!, y: y!} : null
}

export function resolveBlockPosition(value: unknown): BlockPosition {
  return parseBlockPosition(value) ?? {x: 0, y: 0}
}

/** Quantize once at commit/export, without reducing drag-preview precision. */
export function storeBlockPosition(value: Readonly<BlockPosition>): string {
  const coordinate = (number: number) => String(Number(finitePlacementNumber(number).toFixed(2)))
  return `${coordinate(value.x)} ${coordinate(value.y)}`
}
