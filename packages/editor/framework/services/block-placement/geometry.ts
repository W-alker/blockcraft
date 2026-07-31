import type {
  BlockPlacementLayer,
  ResolvedBlockPosition,
} from '../../block-std/types'
import type {PlacementBox} from './types'

export const resolvePlacementContainerBox = (
  container: HTMLElement,
): PlacementBox => {
  const rect = container.getBoundingClientRect()
  return {
    container,
    originX: rect.left + container.clientLeft,
    originY: rect.top + container.clientTop,
    width: container.clientWidth || rect.width || 1,
  }
}

export function resolvePlacementBox(host: HTMLElement): PlacementBox | null {
  const container = host.parentElement
  if (!container) return null
  return resolvePlacementContainerBox(container)
}

/**
 * Measure any rendered object against the target block-children container.
 * This lets an inline representation become an absolute block without first
 * rendering the new block at a temporary flow position.
 */
export function measureObjectPlacement(
  element: HTMLElement,
  container: HTMLElement,
  layer: BlockPlacementLayer = 'over',
): ResolvedBlockPosition {
  const box = resolvePlacementContainerBox(container)
  const rect = element.getBoundingClientRect()
  return {
    mode: 'absolute',
    x: Math.round(((rect.left - box.originX) / box.width) * 1000) / 10,
    y: Math.round(rect.top - box.originY),
    layer,
  }
}

export function measureBlockPlacement(host: HTMLElement): ResolvedBlockPosition {
  const box = resolvePlacementBox(host)
  if (!box) return {mode: 'absolute', x: 0, y: 0, layer: 'over'}
  return measureObjectPlacement(host, box.container)
}
