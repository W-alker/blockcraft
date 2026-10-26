import {EMPTY} from 'rxjs'
import {HeightMap} from './height-map'
import {VerticalLayoutProjection} from './layout-projection'
import {
  captureProjectedScrollAnchor,
  captureScrollAnchor,
  restoreProjectedScrollAnchor,
  restoreScrollAnchor,
  ScrollAnchorSnapshot,
} from './scroll-anchor'

describe('scroll anchor math', () => {
  it('captures the visible block ID and its viewport-relative top', () => {
    const heights = createHeightMap([20, 30, 40])

    expect(captureScrollAnchor(['a', 'b', 'c'], heights, 25)).toEqual({
      blockId: 'b',
      relativeOffset: -5,
    })
  })

  it('restores the same visual offset after height changes above the anchor', () => {
    const before = createHeightMap([20, 30, 40])
    const snapshot = captureScrollAnchor(['a', 'b', 'c'], before, 25)!
    const after = createHeightMap([50, 30, 40])

    expect(restoreScrollAnchor(snapshot, indexResolver(['a', 'b', 'c']), after, 25, 40)).toEqual({
      anchorBlockId: 'b',
      scrollTop: 55,
      correctionPx: 30,
    })
  })

  it('captures and restores through projected content offsets', () => {
    const before = fakeProjection([0, 15, 45], [0, 20, 50], 90)
    expect(before.offsetAt(1)).toBe(15)
    expect(before.contentOffsetAt(1)).toBe(20)

    const snapshot = captureProjectedScrollAnchor(['a', 'b', 'c'], before, 25)!
    const after = fakeProjection([0, 45, 75], [0, 50, 80], 120)
    expect(after.offsetAt(1)).toBe(45)
    expect(after.contentOffsetAt(1)).toBe(50)

    expect(snapshot).toEqual({blockId: 'b', relativeOffset: -5})
    expect(restoreProjectedScrollAnchor(
      snapshot,
      indexResolver(['a', 'b', 'c']),
      after,
      25,
      40,
    )).toEqual({
      anchorBlockId: 'b',
      scrollTop: 55,
      correctionPx: 30,
    })
  })

  it('follows an anchor ID after a block is inserted above it', () => {
    const snapshot = captureScrollAnchor(
      ['a', 'b'],
      createHeightMap([20, 20]),
      10,
    )!

    expect(restoreScrollAnchor(
      snapshot,
      indexResolver(['inserted', 'a', 'b']),
      createHeightMap([30, 20, 20]),
      10,
      20,
    )).toEqual({
      anchorBlockId: 'a',
      scrollTop: 40,
      correctionPx: 30,
    })
  })

  it('returns null when the anchor block was deleted', () => {
    const snapshot: ScrollAnchorSnapshot = {blockId: 'gone', relativeOffset: 0}

    expect(restoreScrollAnchor(
      snapshot,
      indexResolver(['a']),
      createHeightMap([20]),
      10,
      10,
    )).toBeNull()
  })

  it('clamps restoration to the current scrollable range', () => {
    const snapshot: ScrollAnchorSnapshot = {blockId: 'b', relativeOffset: -15}

    expect(restoreScrollAnchor(
      snapshot,
      indexResolver(['a', 'b']),
      createHeightMap([10, 10]),
      50,
      20,
    )).toEqual({
      anchorBlockId: 'b',
      scrollTop: 0,
      correctionPx: -50,
    })
  })

  it('returns null when no model ID corresponds to the height index', () => {
    expect(captureScrollAnchor([], createHeightMap([20]), 0)).toBeNull()
  })

  it('normalizes non-finite scroll geometry', () => {
    const heights = createHeightMap([20])
    const snapshot = captureScrollAnchor(['a'], heights, Number.NaN)!

    expect(restoreScrollAnchor(
      snapshot,
      indexResolver(['a']),
      heights,
      Number.NaN,
      Number.NaN,
    )?.scrollTop).toBe(0)
  })
})

function createHeightMap(values: readonly number[]): HeightMap {
  const heights = new HeightMap()
  heights.bulkInit(values)
  return heights
}

function indexResolver(ids: readonly string[]): (blockId: string) => number {
  const byId = new Map(ids.map((id, index) => [id, index]))
  return blockId => byId.get(blockId) ?? -1
}

function fakeProjection(
  offsets: readonly number[],
  contentOffsets: readonly number[],
  totalHeight: number,
): VerticalLayoutProjection {
  return {
    revision: 0,
    length: offsets.length,
    totalHeight,
    change$: EMPTY,
    offsetAt: index => offsets[index] ?? totalHeight,
    contentOffsetAt: index => contentOffsets[index] ?? totalHeight,
    extentAt: index =>
      (offsets[index + 1] ?? totalHeight) - (offsets[index] ?? totalHeight),
    rangeHeight: (start, end) =>
      (offsets[end + 1] ?? totalHeight) - (offsets[start] ?? totalHeight),
    indexAtOffset: offset => {
      for (let index = offsets.length - 1; index > 0; index--) {
        if ((offsets[index] ?? 0) <= offset) return index
      }
      return offsets.length ? 0 : -1
    },
  }
}
