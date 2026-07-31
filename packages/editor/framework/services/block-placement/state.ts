import type {
  BlockPlacementLayer,
  BlockPositionState,
  ResolvedBlockPosition,
} from '../../block-std/types'

export const finitePlacementNumber = (
  value: unknown,
  fallback = 0,
): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * `normal` / `top` are accepted as legacy persisted values from the
 * unreleased three-tier implementation and both collapse to `over`.
 */
const resolveLayer = (value: unknown): BlockPlacementLayer =>
  value === 'under' ? 'under' : 'over'

export function resolveBlockPlacement(value: unknown): ResolvedBlockPosition {
  if (!value || typeof value !== 'object') {
    return {mode: 'relative', x: 0, y: 0, layer: 'over'}
  }
  const placement = value as Partial<BlockPositionState>
  if (placement.mode !== 'absolute') {
    return {mode: 'relative', x: 0, y: 0, layer: 'over'}
  }
  return {
    mode: 'absolute',
    x: finitePlacementNumber(placement.x),
    y: finitePlacementNumber(placement.y),
    layer: resolveLayer(placement.layer),
  }
}
