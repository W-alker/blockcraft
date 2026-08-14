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

export function resolveBlockPosition(value: unknown): BlockPosition {
  if (!value || typeof value !== 'object') {
    return {x: 0, y: 0}
  }
  const position = value as Partial<BlockPosition>
  return {
    x: finitePlacementNumber(position.x),
    y: finitePlacementNumber(position.y),
  }
}
