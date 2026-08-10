/**
 * A safe top-level editable-text pagination boundary.
 *
 * `layoutOffset` belongs to the block host's natural layout coordinate system;
 * `textOffset` belongs to the block's Y.Text UTF-16 coordinate system. Keeping
 * both coordinates lets the pure pagination engine consume pixels while the
 * live view projects the resulting continuation at a stable model anchor.
 *
 * @internal Pagination measurement/view only.
 */
export interface InlinePaginationBreakPoint {
  layoutOffset: number
  textOffset: number
}

/** @internal Pagination measurement/view only. */
export interface InlinePaginationBreakPlan {
  points: readonly InlinePaginationBreakPoint[]
}

const OFFSET_TOLERANCE = 0.5

/**
 * Validate, sort and defensively clone a measured plan. Invalid or duplicate
 * points are discarded rather than allowed to poison the pure engine.
 */
export function createInlinePaginationBreakPlan(
  points: readonly InlinePaginationBreakPoint[],
  maximumLayoutOffset = Number.POSITIVE_INFINITY,
): InlinePaginationBreakPlan | undefined {
  const maximum = Number.isFinite(maximumLayoutOffset)
    ? maximumLayoutOffset
    : Number.POSITIVE_INFINITY
  const normalized = points
    .filter(point =>
      Number.isFinite(point.layoutOffset)
      && point.layoutOffset > 0
      && point.layoutOffset < maximum
      && Number.isInteger(point.textOffset)
      && point.textOffset > 0,
    )
    .map(point => ({
      layoutOffset: point.layoutOffset,
      textOffset: point.textOffset,
    }))
    .sort((left, right) =>
      left.layoutOffset - right.layoutOffset
      || left.textOffset - right.textOffset,
    )

  const unique: InlinePaginationBreakPoint[] = []
  for (const point of normalized) {
    const previous = unique[unique.length - 1]
    if (
      previous
      && (
        Math.abs(previous.layoutOffset - point.layoutOffset) <= OFFSET_TOLERANCE
        || previous.textOffset === point.textOffset
      )
    ) {
      continue
    }
    unique.push(point)
  }
  return unique.length ? {points: unique} : undefined
}

export function cloneInlinePaginationBreakPlan(
  plan: InlinePaginationBreakPlan | undefined,
): InlinePaginationBreakPlan | undefined {
  return plan
    ? {points: plan.points.map(point => ({...point}))}
    : undefined
}

export function inlinePaginationBreakPlansEqual(
  left: InlinePaginationBreakPlan | undefined,
  right: InlinePaginationBreakPlan | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right || left.points.length !== right.points.length) return false
  return left.points.every((point, index) => {
    const candidate = right.points[index]
    return !!candidate
      && point.layoutOffset === candidate.layoutOffset
      && point.textOffset === candidate.textOffset
  })
}

/** Find the text anchor for an engine fragment boundary. */
export function inlineBreakPointAtLayoutOffset(
  plan: InlinePaginationBreakPlan,
  layoutOffset: number,
  tolerance = OFFSET_TOLERANCE,
): InlinePaginationBreakPoint | undefined {
  if (!Number.isFinite(layoutOffset)) return undefined
  let low = 0
  let high = plan.points.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    const point = plan.points[middle]
    const delta = point.layoutOffset - layoutOffset
    if (Math.abs(delta) <= tolerance) return point
    if (delta < 0) low = middle + 1
    else high = middle - 1
  }
  return undefined
}

/**
 * Convert a getBoundingClientRect distance (visual px) to the root host's
 * offsetHeight coordinate system (layout px). This cancels a uniform CSS
 * zoom/transform without assuming that BCR itself has identical semantics in
 * every WebView.
 */
export function visualDistanceToHostLayout(
  visualDistance: number,
  hostVisualHeight: number,
  hostLayoutHeight: number,
): number {
  if (!Number.isFinite(visualDistance)) return Number.NaN
  if (
    !Number.isFinite(hostVisualHeight)
    || !Number.isFinite(hostLayoutHeight)
    || hostVisualHeight <= 0
    || hostLayoutHeight <= 0
  ) {
    return visualDistance
  }
  return visualDistance * hostLayoutHeight / hostVisualHeight
}
