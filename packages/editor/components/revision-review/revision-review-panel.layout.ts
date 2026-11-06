export interface RevisionReviewCardLayoutInput<T> {
  readonly value: T
  readonly anchorTop: number
  readonly height: number
  readonly anchorPinned?: boolean
}

export interface RevisionReviewCardLayout<T>
  extends RevisionReviewCardLayoutInput<T> {
  readonly top: number
}

/**
 * Keeps mounted review cards close to their document anchors without overlap.
 * The active card stays pinned while neighbours yield in both directions.
 */
export function layoutRevisionReviewCards<T>(
  items: readonly RevisionReviewCardLayoutInput<T>[],
  gap = 8,
): RevisionReviewCardLayout<T>[] {
  const sorted = items
    .map((item, documentOrder) => ({item, documentOrder}))
    .sort((left, right) =>
      left.item.anchorTop - right.item.anchorTop ||
      left.documentOrder - right.documentOrder)
    .map(entry => entry.item)
  if (!sorted.length) return []

  const leadingSpaces = new Array<number>(sorted.length).fill(0)
  for (let index = 1; index < sorted.length; index += 1) {
    leadingSpaces[index] = leadingSpaces[index - 1] +
      Math.max(0, sorted[index - 1].height) + gap
  }

  const targets = sorted.map((item, index) =>
    item.anchorTop - leadingSpaces[index])
  const pinnedIndex = sorted.findIndex(item => item.anchorPinned)
  let fitted: number[]

  if (pinnedIndex < 0) {
    fitted = fitIsotonicTargets(targets)
  } else {
    const pinnedTarget = targets[pinnedIndex]
    const before = fitIsotonicTargets(targets.slice(0, pinnedIndex))
      .map(target => Math.min(target, pinnedTarget))
    const after = fitIsotonicTargets(targets.slice(pinnedIndex + 1))
      .map(target => Math.max(target, pinnedTarget))
    fitted = [...before, pinnedTarget, ...after]
  }

  return sorted.map((item, index) => ({
    ...item,
    top: fitted[index] + leadingSpaces[index],
  }))
}

function fitIsotonicTargets(targets: readonly number[]): number[] {
  interface IsotonicBlock {
    readonly start: number
    end: number
    sum: number
    count: number
  }

  const blocks: IsotonicBlock[] = []
  targets.forEach((target, index) => {
    blocks.push({start: index, end: index, sum: target, count: 1})
    while (blocks.length >= 2) {
      const right = blocks[blocks.length - 1]
      const left = blocks[blocks.length - 2]
      if (left.sum / left.count <= right.sum / right.count) break
      left.end = right.end
      left.sum += right.sum
      left.count += right.count
      blocks.pop()
    }
  })

  const fitted = new Array<number>(targets.length)
  blocks.forEach(block => {
    const mean = block.sum / block.count
    for (let index = block.start; index <= block.end; index += 1) {
      fitted[index] = mean
    }
  })
  return fitted
}
