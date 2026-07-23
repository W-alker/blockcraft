import {HeightMap} from './height-map'
import {
  captureScrollAnchor,
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
