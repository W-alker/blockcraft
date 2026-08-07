import type {
  BlockPlacementLayer,
  ResolvedBlockPosition,
} from '../../block-std/types'
import type {PlacementBox} from './types'

export const resolvePlacementContainerBox = (
  container: HTMLElement,
): PlacementBox => {
  const rect = container.getBoundingClientRect()
  const measuredScale = container.clientWidth > 0
    ? rect.width / container.clientWidth
    : 1
  const visualScale = Number.isFinite(measuredScale) && measuredScale > 0
    ? measuredScale
    : 1
  const configuredOriginY = Number.parseFloat(
    container.style.getPropertyValue('--bc-placement-content-origin-y'),
  )
  const contentOriginY = Number.isFinite(configuredOriginY)
    ? configuredOriginY
    : 0
  return {
    container,
    originX: rect.left + container.clientLeft * visualScale,
    originY: rect.top + (container.clientTop + contentOriginY) * visualScale,
    width: container.clientWidth || rect.width || 1,
    visualScale,
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
    x: Math.round((rect.left - box.originX) / box.visualScale),
    y: Math.round((rect.top - box.originY) / box.visualScale),
    unit: 'px',
    layer,
  }
}

export function measureBlockPlacement(host: HTMLElement): ResolvedBlockPosition {
  const box = resolvePlacementBox(host)
  if (!box) {
    return {mode: 'absolute', x: 0, y: 0, unit: 'px', layer: 'over'}
  }
  return measureObjectPlacement(host, box.container)
}
