import {RenderedSegment} from './types'

/** Merge a viewport interval and sparse leases without expanding the viewport. */
export function mergeToSegments(
  viewport: RenderedSegment,
  pinnedIndices: ReadonlySet<number>,
  mergeGap: number,
  documentLength: number,
  canMergeGap: (start: number, end: number) => boolean = () => true,
): RenderedSegment[] {
  if (!Number.isFinite(documentLength) || documentLength <= 0) return []
  const length = Math.floor(documentLength)
  const gap = Number.isFinite(mergeGap)
    ? Math.max(0, Math.floor(mergeGap))
    : 0
  const candidates: RenderedSegment[] = []

  const viewportStart = Math.max(0, Math.ceil(viewport[0]))
  const viewportEnd = Math.min(length - 1, Math.floor(viewport[1]))
  if (
    Number.isFinite(viewport[0]) &&
    Number.isFinite(viewport[1]) &&
    viewportStart <= viewportEnd
  ) {
    candidates.push([viewportStart, viewportEnd])
  }

  for (const index of pinnedIndices) {
    if (Number.isInteger(index) && index >= 0 && index < length) {
      candidates.push([index, index])
    }
  }
  if (!candidates.length) return []

  candidates.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const merged: RenderedSegment[] = []
  let currentStart = candidates[0][0]
  let currentEnd = candidates[0][1]

  for (let index = 1; index < candidates.length; index++) {
    const next = candidates[index]
    const omittedCount = next[0] - currentEnd - 1
    if (
      omittedCount <= gap &&
      (omittedCount <= 0 || canMergeGap(currentEnd + 1, next[0] - 1))
    ) {
      currentEnd = Math.max(currentEnd, next[1])
      continue
    }
    merged.push([currentStart, currentEnd])
    currentStart = next[0]
    currentEnd = next[1]
  }
  merged.push([currentStart, currentEnd])
  return merged
}
