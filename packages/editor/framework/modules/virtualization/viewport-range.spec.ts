import {HeightMap} from './height-map'
import {calculateViewportRange} from './viewport-range'

describe('calculateViewportRange', () => {
  it('returns an empty interval for an empty document', () => {
    expect(calculateViewportRange(new HeightMap(), 0, 100, 5)).toEqual([-1, -1])
  })

  it('maps viewport offsets through HeightMap and applies overscan', () => {
    const heights = createHeightMap([10, 10, 10, 10, 10, 10, 10])

    expect(calculateViewportRange(heights, 20, 20, 1)).toEqual([1, 5])
  })

  it('clamps elastic negative scrolling to the first block', () => {
    const heights = createHeightMap([10, 10, 10])

    expect(calculateViewportRange(heights, -100, 5, 1)).toEqual([0, 1])
  })

  it('clamps scrolling beyond total height to the final block', () => {
    const heights = createHeightMap([10, 10, 10, 10])

    expect(calculateViewportRange(heights, 1_000, 20, 1)).toEqual([2, 3])
  })

  it('uses the block at an exact boundary for a zero-height viewport', () => {
    const heights = createHeightMap([10, 20, 30])

    expect(calculateViewportRange(heights, 10, 0, 0)).toEqual([1, 1])
  })

  it('normalizes invalid viewport sizes and overscan values', () => {
    const heights = createHeightMap([10, 10, 10])

    expect(calculateViewportRange(heights, Number.NaN, Number.NaN, -4.2)).toEqual([0, 0])
    expect(calculateViewportRange(heights, 0, 0, 1.9)).toEqual([0, 1])
  })

  it('keeps a bounded initial window when every estimated height is zero', () => {
    const heights = createHeightMap([0, 0, 0, 0])

    expect(calculateViewportRange(heights, 0, 0, 2)).toEqual([0, 2])
  })
})

function createHeightMap(values: readonly number[]): HeightMap {
  const heights = new HeightMap()
  heights.bulkInit(values)
  return heights
}
