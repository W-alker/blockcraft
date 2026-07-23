import {HeightMap} from './height-map'

export interface ScrollAnchorSnapshot {
  blockId: string
  /** Block top minus scrollTop at capture time. */
  relativeOffset: number
}

export interface ScrollAnchorRestoreResult {
  anchorBlockId: string
  scrollTop: number
  correctionPx: number
}

export function captureScrollAnchor(
  blockIds: readonly string[],
  heights: HeightMap,
  scrollTop: number,
): ScrollAnchorSnapshot | null {
  if (!heights.length) return null
  const top = finiteNonNegative(scrollTop)
  const index = heights.findIndexByOffset(top)
  const blockId = blockIds[index]
  if (blockId === undefined) return null

  return {
    blockId,
    relativeOffset: heights.getOffset(index) - top,
  }
}

export function restoreScrollAnchor(
  snapshot: ScrollAnchorSnapshot,
  resolveIndex: (blockId: string) => number,
  heights: HeightMap,
  currentScrollTop: number,
  viewportHeight: number,
): ScrollAnchorRestoreResult | null {
  if (!Number.isFinite(snapshot.relativeOffset)) return null
  const index = resolveIndex(snapshot.blockId)
  if (!Number.isInteger(index) || index < 0 || index >= heights.length) return null

  const current = finiteNonNegative(currentScrollTop)
  const maxScrollTop = Math.max(
    0,
    heights.totalHeight - finiteNonNegative(viewportHeight),
  )
  const desired = heights.getOffset(index) - snapshot.relativeOffset
  const scrollTop = Math.min(maxScrollTop, Math.max(0, desired))

  return {
    anchorBlockId: snapshot.blockId,
    scrollTop,
    correctionPx: scrollTop - current,
  }
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
