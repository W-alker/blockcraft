import {HeightMap} from './height-map'
import {ContinuousLayoutProjection} from './layout-projection'
import {
  calculateProjectedViewportRange,
  calculateViewportRange,
} from './viewport-range'

describe('calculateViewportRange', () => {
  it('returns an empty interval for an empty document', () => {
    expect(calculateViewportRange(new HeightMap(), 0, 100, 5)).toEqual([-1, -1])
  })

  it('maps viewport offsets through HeightMap and applies viewport overscan', () => {
    const heights = createHeightMap([10, 10, 10, 10, 10, 10, 10])

    expect(calculateViewportRange(heights, 20, 20, 1)).toEqual([0, 6])
  })

  it('accepts query-only projected geometry', () => {
    const heights = createHeightMap([100, 100, 100, 100])
    const projection = new ContinuousLayoutProjection(heights)

    expect(calculateProjectedViewportRange(projection, 100, 100, 0)).toEqual([1, 2])

    projection.dispose()
  })

  it('fills a three-viewport projected window and redistributes edge preload', () => {
    const heights = createHeightMap(Array.from({length: 20}, () => 10))
    const projection = new ContinuousLayoutProjection(heights)

    expect(calculateProjectedViewportRange(projection, 0, 20, 1))
      .toEqual([0, 6])
    expect(calculateProjectedViewportRange(projection, 80, 20, 1))
      .toEqual([6, 12])
    expect(calculateProjectedViewportRange(projection, 180, 20, 1))
      .toEqual([14, 19])

    projection.dispose()
  })

  it('does not expand by root count around oversized blocks', () => {
    const heights = createHeightMap([20, 1_000, 1_000, 20])

    expect(calculateViewportRange(heights, 20, 100, 1)).toEqual([0, 1])
  })

  it('clamps elastic negative scrolling to the first block', () => {
    const heights = createHeightMap([10, 10, 10])

    expect(calculateViewportRange(heights, -100, 5, 1)).toEqual([0, 1])
  })

  it('clamps scrolling beyond total height to the final block', () => {
    const heights = createHeightMap([10, 10, 10, 10])

    expect(calculateViewportRange(heights, 1_000, 20, 1)).toEqual([0, 3])
  })

  it('uses the block at an exact boundary for a zero-height viewport', () => {
    const heights = createHeightMap([10, 20, 30])

    expect(calculateViewportRange(heights, 10, 0, 0)).toEqual([1, 1])
  })

  it('normalizes invalid viewport sizes and overscan values', () => {
    const heights = createHeightMap([10, 10, 10])

    expect(calculateViewportRange(heights, Number.NaN, Number.NaN, -4.2)).toEqual([0, 0])
    expect(calculateViewportRange(heights, 0, 0, 1.9)).toEqual([0, 0])
  })

  it('keeps a bounded initial window when every estimated height is zero', () => {
    const heights = createHeightMap([0, 0, 0, 0])

    expect(calculateViewportRange(heights, 0, 0, 2)).toEqual([0, 0])
  })
})

function createHeightMap(values: readonly number[]): HeightMap {
  const heights = new HeightMap()
  heights.bulkInit(values)
  return heights
}
