import {HeightMap} from './height-map'
import {VerticalLayoutProjection} from './layout-projection'

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
    relativeOffset: finishScrollAnchorCapture(heights.getOffset(index), top),
  }
}

/** @internal Capture an anchor against projected content coordinates. */
export function captureProjectedScrollAnchor(
  blockIds: readonly string[],
  projection: VerticalLayoutProjection,
  scrollTop: number,
): ScrollAnchorSnapshot | null {
  if (!projection.length) return null
  const top = finiteNonNegative(scrollTop)
  const index = projection.indexAtOffset(top)
  const blockId = blockIds[index]
  if (blockId === undefined) return null

  return {
    blockId,
    relativeOffset: finishScrollAnchorCapture(
      projection.contentOffsetAt(index),
      top,
    ),
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

  const scrollTop = finishScrollAnchorRestore(desired, maxScrollTop)
  return {
    anchorBlockId: snapshot.blockId,
    scrollTop,
    correctionPx: scrollTop - current,
  }
}

/** @internal Restore an anchor against projected content coordinates. */
export function restoreProjectedScrollAnchor(
  snapshot: ScrollAnchorSnapshot,
  resolveIndex: (blockId: string) => number,
  projection: VerticalLayoutProjection,
  currentScrollTop: number,
  viewportHeight: number,
): ScrollAnchorRestoreResult | null {
  if (!Number.isFinite(snapshot.relativeOffset)) return null
  const index = resolveIndex(snapshot.blockId)
  if (!Number.isInteger(index) || index < 0 || index >= projection.length) {
    return null
  }

  const current = finiteNonNegative(currentScrollTop)
  const maxScrollTop = Math.max(
    0,
    projection.totalHeight - finiteNonNegative(viewportHeight),
  )
  const desired =
    projection.contentOffsetAt(index) - snapshot.relativeOffset

  const scrollTop = finishScrollAnchorRestore(desired, maxScrollTop)
  return {
    anchorBlockId: snapshot.blockId,
    scrollTop,
    correctionPx: scrollTop - current,
  }
}

function finishScrollAnchorCapture(
  blockOffset: number,
  scrollTop: number,
): number {
  return blockOffset - scrollTop
}

function finishScrollAnchorRestore(
  desiredScrollTop: number,
  maxScrollTop: number,
): number {
  return Math.min(maxScrollTop, Math.max(0, desiredScrollTop))
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
