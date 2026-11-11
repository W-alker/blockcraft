import {HeightMap} from './height-map'
import {ContinuousLayoutProjection} from './layout-projection'

describe('ContinuousLayoutProjection', () => {
  it('maps continuous HeightMap geometry without changing its coordinates', () => {
    const heights = new HeightMap()
    heights.bulkInit([10, 20, 40])
    const projection = new ContinuousLayoutProjection(heights)

    expect(projection.revision).toBe(0)
    expect(projection.length).toBe(3)
    expect(projection.totalHeight).toBe(70)
    expect(projection.offsetAt(2)).toBe(30)
    expect(projection.contentOffsetAt(2)).toBe(30)
    expect(projection.extentAt(2)).toBe(40)
    expect(projection.rangeHeight(1, 2)).toBe(60)
    expect(projection.indexAtOffset(30)).toBe(2)

    projection.dispose()
  })

  it('publishes one monotonic revision for an owner-coalesced height batch', () => {
    const heights = new HeightMap()
    heights.bulkInit([10, 20])
    const projection = new ContinuousLayoutProjection(heights)
    const revisions: number[] = []
    projection.change$.subscribe(change => revisions.push(change.revision))

    heights.update(0, 11)
    heights.update(1, 21)
    projection.notifyChange()
    projection.notifyChange()

    expect(revisions).toEqual([1, 2])
    expect(projection.revision).toBe(2)

    projection.dispose()
  })

  it('completes its change stream on disposal', () => {
    const projection = new ContinuousLayoutProjection(new HeightMap())
    const complete = jasmine.createSpy('complete')
    projection.change$.subscribe({complete})

    projection.dispose()
    projection.dispose()

    expect(complete).toHaveBeenCalledTimes(1)
  })
})
