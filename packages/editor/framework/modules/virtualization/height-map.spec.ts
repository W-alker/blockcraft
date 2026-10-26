import {HeightMap} from './height-map'

describe('HeightMap', () => {
  let heights: HeightMap

  beforeEach(() => {
    heights = new HeightMap()
  })

  it('initializes height, offsets, and closed range sums', () => {
    heights.bulkInit([10, 20, 30, 40])

    expect(heights.length).toBe(4)
    expect(heights.totalHeight).toBe(100)
    expect(heights.getOffset(0)).toBe(0)
    expect(heights.getOffset(2)).toBe(30)
    expect(heights.getOffset(4)).toBe(100)
    expect(heights.getRangeHeight(1, 2)).toBe(50)
    expect(heights.getRangeHeight(3, 2)).toBe(0)
  })

  it('locates exact and clamped offsets with binary search', () => {
    heights.bulkInit([10, 20, 30])

    expect(heights.findIndexByOffset(-10)).toBe(0)
    expect(heights.findIndexByOffset(0)).toBe(0)
    expect(heights.findIndexByOffset(9.99)).toBe(0)
    expect(heights.findIndexByOffset(10)).toBe(1)
    expect(heights.findIndexByOffset(29.99)).toBe(1)
    expect(heights.findIndexByOffset(30)).toBe(2)
    expect(heights.findIndexByOffset(60)).toBe(2)
    expect(heights.findIndexByOffset(1_000)).toBe(2)
  })

  it('returns no index for an empty map', () => {
    expect(heights.findIndexByOffset(0)).toBe(-1)
    expect(heights.totalHeight).toBe(0)
  })

  it('updates, inserts, and removes heights while preserving order', () => {
    heights.bulkInit([10, 40])
    heights.insertAt(1, [20, 30])
    heights.update(2, 35)
    heights.removeAt(0, 1)

    expect(heights.length).toBe(3)
    expect(heights.get(0)).toBe(20)
    expect(heights.get(1)).toBe(35)
    expect(heights.get(2)).toBe(40)
    expect(heights.totalHeight).toBe(95)
  })

  it('keeps repeated height updates and prefix reads incremental', () => {
    heights.bulkInit(Array.from({length: 2048}, () => 10))
    const recompute = spyOn(heights, 'recompute').and.callThrough()

    for (let index = 0; index < 100; index++) {
      heights.update(index * 7, 11)
      expect(heights.getOffset(index * 7 + 1)).toBe((index * 7 + 1) * 10 + index + 1)
    }

    expect(recompute).not.toHaveBeenCalled()
  })

  it('matches naive prefix sums and offset lookup through mixed mutations', () => {
    const values = [5, 0, 13, 2]
    heights.bulkInit(values)

    const expectNaiveParity = () => {
      const total = values.reduce((sum, value) => sum + value, 0)
      expect(heights.length).toBe(values.length)
      expect(heights.totalHeight).toBe(total)
      for (let index = 0; index <= values.length; index++) {
        expect(heights.getOffset(index)).toBe(
          values.slice(0, index).reduce((sum, value) => sum + value, 0),
        )
      }
      for (let offset = 0; offset <= total + 1; offset += 0.5) {
        const expected = offset <= 0
          ? 0
          : offset >= total
            ? values.length - 1
            : values.findIndex((_, index) => (
                values.slice(0, index + 1).reduce((sum, value) => sum + value, 0) > offset
              ))
        expect(heights.findIndexByOffset(offset)).toBe(expected)
      }
    }

    expectNaiveParity()
    values.push(7)
    heights.append(7)
    expectNaiveParity()
    values[1] = 4
    heights.update(1, 4)
    expectNaiveParity()
    values.splice(2, 0, 0, 6)
    heights.insertAt(2, [0, 6])
    expectNaiveParity()
    values.splice(4, 2)
    heights.removeAt(4, 2)
    expectNaiveParity()
  })

  it('supports zero-count structural operations as no-ops', () => {
    heights.bulkInit([10, 20])
    heights.insertAt(1, [])
    heights.removeAt(1, 0)

    expect(heights.length).toBe(2)
    expect(heights.totalHeight).toBe(30)
  })

  it('grows beyond its initial storage capacity', () => {
    for (let index = 0; index < 100; index++) heights.append(1)

    expect(heights.length).toBe(100)
    expect(heights.totalHeight).toBe(100)
  })

  it('rejects invalid heights without mutating existing data', () => {
    heights.bulkInit([10, 20])

    expect(() => heights.update(0, Number.NaN)).toThrowError(RangeError)
    expect(() => heights.insertAt(1, [-1])).toThrowError(RangeError)
    expect(() => heights.bulkInit([Number.POSITIVE_INFINITY])).toThrowError(RangeError)
    expect(heights.length).toBe(2)
    expect(heights.totalHeight).toBe(30)
  })

  it('rejects invalid structural and access indices', () => {
    heights.bulkInit([10, 20])

    expect(() => heights.get(-1)).toThrowError(RangeError)
    expect(() => heights.getOffset(3)).toThrowError(RangeError)
    expect(() => heights.insertAt(3, [30])).toThrowError(RangeError)
    expect(() => heights.removeAt(1, 2)).toThrowError(RangeError)
    expect(() => heights.removeAt(0, -1)).toThrowError(RangeError)
    expect(() => heights.getRangeHeight(-1, 0)).toThrowError(RangeError)
  })
})
