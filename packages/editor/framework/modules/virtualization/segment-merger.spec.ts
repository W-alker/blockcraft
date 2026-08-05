import {mergeToSegments} from './segment-merger'

describe('mergeToSegments', () => {
  it('returns the viewport when there are no pins', () => {
    expect(mergeToSegments([10, 15], new Set(), 2, 100)).toEqual([[10, 15]])
  })

  it('returns no segments for an empty document', () => {
    expect(mergeToSegments([0, 10], new Set([2]), 2, 0)).toEqual([])
  })

  it('supports pin-only segments in ascending order', () => {
    expect(mergeToSegments([-1, -1], new Set([60, 5, 20]), 0, 100)).toEqual([
      [5, 5],
      [20, 20],
      [60, 60],
    ])
  })

  it('merges pins separated by at most mergeGap unmounted indices', () => {
    expect(mergeToSegments([10, 15], new Set([18, 20]), 2, 100)).toEqual([
      [10, 20],
    ])
  })

  it('keeps a short index gap sparse when its projected height is expensive', () => {
    const canMergeGap = jasmine.createSpy('canMergeGap').and.returnValue(false)

    expect(mergeToSegments(
      [10, 15],
      new Set([18]),
      2,
      100,
      canMergeGap,
    )).toEqual([
      [10, 15],
      [18, 18],
    ])
    expect(canMergeGap).toHaveBeenCalledOnceWith(16, 17)
  })

  it('keeps distant pins as separate segments', () => {
    expect(mergeToSegments([40, 50], new Set([2, 54, 90]), 2, 100)).toEqual([
      [2, 2],
      [40, 50],
      [54, 54],
      [90, 90],
    ])
  })

  it('clamps viewport bounds and ignores stale pinned indices', () => {
    expect(mergeToSegments([-5, 50], new Set([-1, 2, 99]), 0, 5)).toEqual([
      [0, 4],
    ])
  })

  it('treats a viewport fully outside the document as empty', () => {
    expect(mergeToSegments([20, 30], new Set([2]), 2, 10)).toEqual([[2, 2]])
  })

  it('normalizes a non-integer negative merge gap to zero', () => {
    expect(mergeToSegments([5, 5], new Set([7]), -1.5, 10)).toEqual([
      [5, 5],
      [7, 7],
    ])
  })
})
