import {HeightMap} from './height-map'
import {VerticalLayoutProjection} from './layout-projection'
import {RenderedSegment} from './types'

/** Convert scroll geometry into a bounded direct-root-child interval. */
export function calculateViewportRange(
  heights: HeightMap,
  scrollTop: number,
  viewportHeight: number,
  overscanViewports: number,
): RenderedSegment {
  if (!heights.length) return [-1, -1]

  const [windowTop, windowBottom] = resolveWindowOffsets(
    scrollTop,
    viewportHeight,
    overscanViewports,
    heights.totalHeight,
  )
  const windowStart = heights.findIndexByOffset(windowTop)
  const windowEnd = heights.findIndexByOffset(windowBottom)

  return finishViewportRange(
    heights.length,
    windowStart,
    windowEnd,
  )
}

/** @internal Convert projected scroll geometry into a bounded interval. */
export function calculateProjectedViewportRange(
  projection: VerticalLayoutProjection,
  scrollTop: number,
  viewportHeight: number,
  overscanViewports: number,
): RenderedSegment {
  if (!projection.length) return [-1, -1]

  const [windowTop, windowBottom] = resolveWindowOffsets(
    scrollTop,
    viewportHeight,
    overscanViewports,
    projection.totalHeight,
  )
  const windowStart = projection.indexAtOffset(windowTop)
  const windowEnd = projection.indexAtOffset(windowBottom)

  return finishViewportRange(
    projection.length,
    windowStart,
    windowEnd,
  )
}

function finishViewportRange(
  length: number,
  start: number,
  end: number,
): RenderedSegment {
  return [
    Math.max(0, start),
    Math.min(length - 1, end),
  ]
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Expand the visible viewport by a projected-height budget.
 *
 * Near either document edge, the unavailable pre-rendering budget is shifted
 * to the other side so a long document still materializes the requested total
 * height. The budget is height-based rather than item-based so a small number
 * of oversized tables or media blocks cannot accidentally materialize an
 * unbounded amount of DOM.
 */
function resolveWindowOffsets(
  scrollTop: number,
  viewportHeight: number,
  overscanViewports: number,
  totalHeight: number,
): readonly [top: number, bottom: number] {
  const top = finiteNonNegative(scrollTop)
  const height = finiteNonNegative(viewportHeight)
  const total = finiteNonNegative(totalHeight)
  const overscan = Number.isFinite(overscanViewports)
    ? Math.max(0, overscanViewports)
    : 0
  const requested = height * (1 + overscan * 2)
  if (height === 0 || requested <= height || total === 0) {
    return [top, top + height]
  }

  const windowHeight = Math.min(total, requested)
  const maximumTop = Math.max(0, total - windowHeight)
  const preferredTop = top - Math.max(0, (windowHeight - height) / 2)
  const windowTop = Math.min(maximumTop, Math.max(0, preferredTop))
  return [windowTop, windowTop + windowHeight]
}
