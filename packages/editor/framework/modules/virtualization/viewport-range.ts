import {HeightMap} from './height-map'
import {VerticalLayoutProjection} from './layout-projection'
import {RenderedSegment} from './types'

/** Convert scroll geometry into a bounded direct-root-child interval. */
export function calculateViewportRange(
  heights: HeightMap,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): RenderedSegment {
  if (!heights.length) return [-1, -1]

  const top = finiteNonNegative(scrollTop)
  const height = finiteNonNegative(viewportHeight)
  const padding = Number.isFinite(overscan)
    ? Math.max(0, Math.floor(overscan))
    : 0
  const start = heights.findIndexByOffset(top)
  const end = heights.findIndexByOffset(top + height)

  return finishViewportRange(heights.length, start, end, padding)
}

/** @internal Convert projected scroll geometry into a bounded interval. */
export function calculateProjectedViewportRange(
  projection: VerticalLayoutProjection,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): RenderedSegment {
  if (!projection.length) return [-1, -1]

  const top = finiteNonNegative(scrollTop)
  const height = finiteNonNegative(viewportHeight)
  const padding = Number.isFinite(overscan)
    ? Math.max(0, Math.floor(overscan))
    : 0
  const start = projection.indexAtOffset(top)
  const end = projection.indexAtOffset(top + height)

  return finishViewportRange(projection.length, start, end, padding)
}

function finishViewportRange(
  length: number,
  start: number,
  end: number,
  padding: number,
): RenderedSegment {
  return [
    Math.max(0, start - padding),
    Math.min(length - 1, end + padding),
  ]
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
