import {HeightMap} from './height-map'
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

  return [
    Math.max(0, start - padding),
    Math.min(heights.length - 1, end + padding),
  ]
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
