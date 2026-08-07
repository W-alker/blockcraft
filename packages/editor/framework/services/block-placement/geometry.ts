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
  const style = container.ownerDocument.defaultView?.getComputedStyle(container)
  const paddingLeft = parseLayoutLength(style?.paddingLeft)
  const paddingRight = parseLayoutLength(style?.paddingRight)
  const paddingTop = parseLayoutLength(style?.paddingTop)
  const configuredOriginY = Number.parseFloat(
    container.style.getPropertyValue('--bc-placement-content-origin-y'),
  )
  const contentOriginY = Number.isFinite(configuredOriginY)
    ? configuredOriginY
    : 0
  return {
    container,
    originX: rect.left + (container.clientLeft + paddingLeft) * visualScale,
    originY: rect.top + (
      container.clientTop + paddingTop + contentOriginY
    ) * visualScale,
    width: Math.max(
      1,
      (container.clientWidth || rect.width / visualScale || 1)
        - paddingLeft
        - paddingRight,
    ),
    visualScale,
  }
}

const parseLayoutLength = (value: string | undefined): number => {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
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
