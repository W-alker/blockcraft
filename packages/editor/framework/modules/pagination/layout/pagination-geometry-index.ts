import {BlockNodeType} from '../../../block-std/types/block.type'
import {TableRowGeom} from '../view/item-builder'
import {
  cloneTableCellFlowPlan,
  TableCellFlowAnchor,
  TableCellFlowPlan,
} from '../engine/table-cell-flow'
import {getTableCellFlowPlan} from '../engine/table-cell-flow-metadata'
import {
  cloneInlinePaginationBreakPlan,
  createInlinePaginationBreakPlan,
  InlinePaginationBreakPlan,
  inlinePaginationBreakPlansEqual,
} from '../view/inline-break-plan'
import {shouldApplyModelHeightEstimate} from '../../virtualization/model-height-estimator'

/** DOM/layout coordinates may drift by a fraction of a CSS pixel across mounts. */
const LAYOUT_TOLERANCE = 0.5

export interface PaginationMeasureContext {
  readonly contentWidth: number
  /** Regular-page content height; controls whether text is oversized and needs line anchors. */
  readonly contentHeight: number
  /** Minimum visual lines retained on each side of an inline split. */
  readonly widowOrphanLines: number
  readonly theme: string
  readonly fontEpoch: number
  readonly rendererRevision: number
}

export interface PaginationGeometrySeed {
  readonly blockId: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly isHeading: boolean
  readonly estimatedHeight: number
  readonly modelDriven: boolean
}

export interface PaginationGeometryEstimate {
  readonly blockId: string
  readonly height: number
  readonly modelDriven: boolean
}

export interface PaginationGeometryEntry {
  readonly blockId: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly isHeading: boolean
  readonly contentRevision: number
  readonly measureContextRevision: number
  /** Natural-DOM measurement generation; freshness only, not geometry identity. */
  readonly measurementEpoch: number
  readonly source: 'estimated' | 'measured'
  readonly naturalHeight: number
  /** 分页实际占位高度；宽度/高度 fit 后可小于 naturalHeight。 */
  readonly effectiveHeight: number
  /** 已计入高度、由同一稳定 DOM 帧捕获的块尾间距。 */
  readonly trailingSpacing?: number
  readonly splitOffsets?: readonly number[]
  readonly inlineBreakPlan?: InlinePaginationBreakPlan
  readonly preferredSplitOffsets?: readonly number[]
  readonly tableRows?: readonly TableRowGeom[]
  readonly lockHeight?: number
  /** 流式图片/视频媒体 wrapper 约束比例；由完整 DOM 测量提供。 */
  readonly fitScale?: number
  readonly repeatHeaderHeight?: number
  readonly tableCellFlowPlan?: TableCellFlowPlan
}

export interface PaginationGeometryMeasurement {
  readonly id: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly isHeading: boolean
  readonly naturalHeight: number
  readonly height: number
  readonly trailingSpacing?: number
  readonly splitOffsets?: readonly number[]
  readonly inlineBreakPlan?: InlinePaginationBreakPlan
  readonly preferredSplitOffsets?: readonly number[]
  readonly tableRows?: readonly TableRowGeom[]
  readonly lockHeight?: number
  readonly fitScale?: number
  readonly repeatHeaderHeight?: number
}

function assertNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`)
  }
}

function validateOffsets(values: readonly number[] | undefined, field: string): void {
  values?.forEach((value, index) => assertNonNegativeFinite(value, `${field}[${index}]`))
}

function validateRows(rows: readonly TableRowGeom[] | undefined): void {
  rows?.forEach((row, index) => {
    assertNonNegativeFinite(row.top, `tableRows[${index}].top`)
    assertNonNegativeFinite(row.bottom, `tableRows[${index}].bottom`)
    if (row.bottom < row.top) {
      throw new RangeError(`tableRows[${index}].bottom must not be smaller than top`)
    }
  })
}

function validateInlineBreakPlan(
  measurement: PaginationGeometryMeasurement,
): void {
  const plan = measurement.inlineBreakPlan
  if (!plan) return

  const normalized = createInlinePaginationBreakPlan(
    plan.points,
    measurement.naturalHeight,
  )
  if (!normalized || !inlinePaginationBreakPlansEqual(plan, normalized)) {
    throw new RangeError(
      `inlineBreakPlan for ${measurement.id} must contain ordered, unique points within naturalHeight`,
    )
  }

  let previousTextOffset = 0
  for (const [index, point] of plan.points.entries()) {
    if (point.textOffset <= previousTextOffset) {
      throw new RangeError(
        `inlineBreakPlan.points[${index}].textOffset for ${measurement.id} must be strictly increasing`,
      )
    }
    previousTextOffset = point.textOffset
  }

  const layoutOffsets = plan.points.map(point => point.layoutOffset)
  if (!arraysEqual(layoutOffsets, measurement.splitOffsets)) {
    throw new RangeError(
      `inlineBreakPlan for ${measurement.id} must map every splitOffset`,
    )
  }
}

function validateSeed(seed: PaginationGeometrySeed): void {
  assertNonNegativeFinite(seed.estimatedHeight, `estimatedHeight for ${seed.blockId}`)
}

function validateMeasurement(measurement: PaginationGeometryMeasurement): void {
  assertNonNegativeFinite(measurement.naturalHeight, `naturalHeight for ${measurement.id}`)
  assertNonNegativeFinite(measurement.height, `height for ${measurement.id}`)
  if (measurement.lockHeight != null) {
    assertNonNegativeFinite(measurement.lockHeight, `lockHeight for ${measurement.id}`)
  }
  if (
    measurement.fitScale != null &&
    (!Number.isFinite(measurement.fitScale) || measurement.fitScale <= 0 || measurement.fitScale > 1)
  ) {
    throw new RangeError(`fitScale for ${measurement.id} must be within (0, 1]`)
  }
  if (measurement.repeatHeaderHeight != null) {
    assertNonNegativeFinite(measurement.repeatHeaderHeight, `repeatHeaderHeight for ${measurement.id}`)
  }
  if (measurement.trailingSpacing != null) {
    if (!Number.isFinite(measurement.trailingSpacing)) {
      throw new RangeError(`trailingSpacing for ${measurement.id} must be finite`)
    }
  }
  validateOffsets(measurement.splitOffsets, `splitOffsets for ${measurement.id}`)
  validateInlineBreakPlan(measurement)
  validateOffsets(measurement.preferredSplitOffsets, `preferredSplitOffsets for ${measurement.id}`)
  validateRows(measurement.tableRows)
}

function validateContext(context: PaginationMeasureContext): void {
  assertNonNegativeFinite(context.contentWidth, 'contentWidth')
  assertNonNegativeFinite(context.contentHeight, 'contentHeight')
  assertNonNegativeFinite(context.widowOrphanLines, 'widowOrphanLines')
  assertNonNegativeFinite(context.fontEpoch, 'fontEpoch')
  assertNonNegativeFinite(context.rendererRevision, 'rendererRevision')
}

function cloneRows(rows: readonly TableRowGeom[] | undefined): readonly TableRowGeom[] | undefined {
  return rows?.map(row => ({...row}))
}

function cloneEntry(entry: PaginationGeometryEntry): PaginationGeometryEntry {
  return {
    ...entry,
    splitOffsets: entry.splitOffsets ? [...entry.splitOffsets] : undefined,
    inlineBreakPlan: cloneInlinePaginationBreakPlan(entry.inlineBreakPlan),
    preferredSplitOffsets: entry.preferredSplitOffsets ? [...entry.preferredSplitOffsets] : undefined,
    tableRows: cloneRows(entry.tableRows),
    tableCellFlowPlan: entry.tableCellFlowPlan
      ? cloneTableCellFlowPlan(entry.tableCellFlowPlan)
      : undefined,
  }
}

/**
 * Keep only the last-known extent when model state invalidates a DOM
 * measurement. Split anchors, table flow and media constraints belong to the
 * exact DOM/content pair that produced them and must not survive as estimates.
 */
function invalidateMeasuredMetadata(
  entry: PaginationGeometryEntry,
  overrides: Partial<PaginationGeometryEntry> = {},
): PaginationGeometryEntry {
  return {
    blockId: entry.blockId,
    flavour: entry.flavour,
    nodeType: entry.nodeType,
    isHeading: entry.isHeading,
    contentRevision: entry.contentRevision,
    measureContextRevision: entry.measureContextRevision,
    measurementEpoch: 0,
    source: 'estimated',
    naturalHeight: entry.naturalHeight,
    effectiveHeight: entry.effectiveHeight,
    ...(entry.trailingSpacing != null
      ? {trailingSpacing: entry.trailingSpacing}
      : {}),
    ...overrides,
  }
}

function numbersEqual(
  left: number | undefined,
  right: number | undefined,
  tolerance = LAYOUT_TOLERANCE,
): boolean {
  if (left === right) return true
  if (left == null || right == null) return false
  return Math.abs(left - right) <= tolerance
}

function arraysEqual(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((value, index) => numbersEqual(value, right[index]))
}

function rowsEqual(left: readonly TableRowGeom[] | undefined, right: readonly TableRowGeom[] | undefined): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((row, index) => {
    const other = right[index]!
    return row.id === other.id
      && numbersEqual(row.top, other.top)
      && numbersEqual(row.bottom, other.bottom)
      && row.coveredFromAbove === other.coveredFromAbove
      && row.coveredByContentMerge === other.coveredByContentMerge
  })
}

function anchorsEqual(
  left: TableCellFlowAnchor,
  right: TableCellFlowAnchor,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'block' && right.kind === 'block') {
    return left.blockId === right.blockId
  }
  if (left.kind === 'text' && right.kind === 'text') {
    return left.blockId === right.blockId && left.offset === right.offset
  }
  return true
}

function plansEqual(
  left: TableCellFlowPlan | undefined,
  right: TableCellFlowPlan | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  if (
    !numbersEqual(left.paginationHeight, right.paginationHeight)
    || !arraysEqual(left.splitOffsets, right.splitOffsets)
    || left.segments.length !== right.segments.length
  ) return false

  return left.segments.every((segment, index) => {
    const other = right.segments[index]
    if (
      !other
      || !numbersEqual(segment.fromOffset, other.fromOffset)
      || !numbersEqual(segment.toOffset, other.toOffset)
      || !numbersEqual(segment.height, other.height)
      || segment.breakAfter?.kind !== other.breakAfter?.kind
    ) return false

    const split = segment.breakAfter
    const otherSplit = other.breakAfter
    if (!split || !otherSplit) return split === otherSplit
    if (split.kind === 'row' && otherSplit.kind === 'row') {
      return split.beforeRowId === otherSplit.beforeRowId
    }
    if (split.kind !== 'cell-flow' || otherSplit.kind !== 'cell-flow') return false
    return split.rowId === otherSplit.rowId
      && split.continuations.length === otherSplit.continuations.length
      && split.continuations.every((continuation, continuationIndex) => {
        const otherContinuation = otherSplit.continuations[continuationIndex]
        return !!otherContinuation
          && continuation.cellId === otherContinuation.cellId
          && numbersEqual(continuation.pageOffset, otherContinuation.pageOffset)
          && anchorsEqual(continuation.anchor, otherContinuation.anchor)
      })
  })
}

function entriesEqual(left: PaginationGeometryEntry, right: PaginationGeometryEntry): boolean {
  return left.blockId === right.blockId
    && left.flavour === right.flavour
    && left.nodeType === right.nodeType
    && left.isHeading === right.isHeading
    && left.contentRevision === right.contentRevision
    && left.measureContextRevision === right.measureContextRevision
    && left.source === right.source
    && numbersEqual(left.naturalHeight, right.naturalHeight)
    && numbersEqual(left.effectiveHeight, right.effectiveHeight)
    && numbersEqual(left.trailingSpacing, right.trailingSpacing)
    && numbersEqual(left.lockHeight, right.lockHeight)
    // fitScale is dimensionless and can amplify across very wide media. Its
    // derived max-width/max-height are unavailable here, so keep it exact.
    && numbersEqual(left.fitScale, right.fitScale, 0)
    && numbersEqual(left.repeatHeaderHeight, right.repeatHeaderHeight)
    && arraysEqual(left.splitOffsets, right.splitOffsets)
    && inlinePaginationBreakPlansEqual(left.inlineBreakPlan, right.inlineBreakPlan)
    && arraysEqual(left.preferredSplitOffsets, right.preferredSplitOffsets)
    && rowsEqual(left.tableRows, right.tableRows)
    && plansEqual(left.tableCellFlowPlan, right.tableCellFlowPlan)
}

function estimatedGeometryEqual(
  current: PaginationGeometryEntry,
  estimated: PaginationGeometryEntry,
): boolean {
  return entriesEqual(current, {
    ...estimated,
    // Source/provenance changes do not alter pagination geometry. A model
    // estimate may therefore take ownership without manufacturing a revision.
    source: current.source,
  })
}

function contextsEqual(left: PaginationMeasureContext | null, right: PaginationMeasureContext): boolean {
  return left?.contentWidth === right.contentWidth
    && left.contentHeight === right.contentHeight
    && left.widowOrphanLines === right.widowOrphanLines
    && left.theme === right.theme
    && left.fontEpoch === right.fontEpoch
    && left.rendererRevision === right.rendererRevision
}

export class PaginationGeometryIndex {
  private readonly entries = new Map<string, PaginationGeometryEntry>()
  private readonly measuredGeometryIds = new Set<string>()
  private readonly modelDrivenEstimateIds = new Set<string>()
  private revisionValue = 0
  private measureContextRevisionValue = 0
  private measureContext: PaginationMeasureContext | null = null

  get revision(): number {
    return this.revisionValue
  }

  get measureContextRevision(): number {
    return this.measureContextRevisionValue
  }

  syncRootOrder(seeds: readonly PaginationGeometrySeed[]): boolean {
    const seedIds = this.validateSeeds(seeds)

    let changed = false
    for (const blockId of this.entries.keys()) {
      if (!seedIds.has(blockId)) {
        this.entries.delete(blockId)
        this.measuredGeometryIds.delete(blockId)
        this.modelDrivenEstimateIds.delete(blockId)
        changed = true
      }
    }

    changed = this.syncSeeds(seeds) || changed

    if (changed) this.revisionValue++
    return changed
  }

  /**
   * Refresh semantics for selected roots without pruning unrelated entries or
   * rerunning model-height estimators. Props changes keep root order stable and
   * heading identity is independent from the retained last-known extent.
   */
  syncRootSemantics(
    semantics: readonly Omit<
      PaginationGeometrySeed,
      'estimatedHeight' | 'modelDriven'
    >[],
  ): boolean {
    const ids = new Set<string>()
    for (const next of semantics) {
      if (ids.has(next.blockId)) {
        throw new Error(`Duplicate pagination root id: ${next.blockId}`)
      }
      ids.add(next.blockId)
    }

    let changed = false
    for (const next of semantics) {
      const current = this.entries.get(next.blockId)
      if (!current) continue
      if (
        current.flavour === next.flavour
        && current.nodeType === next.nodeType
        && current.isHeading === next.isHeading
      ) continue

      this.entries.set(next.blockId, invalidateMeasuredMetadata(current, {
        flavour: next.flavour,
        nodeType: next.nodeType,
        isHeading: next.isHeading,
      }))
      this.measuredGeometryIds.delete(next.blockId)
      this.modelDrivenEstimateIds.delete(next.blockId)
      changed = true
    }
    if (changed) this.revisionValue++
    return changed
  }

  private validateSeeds(
    seeds: readonly PaginationGeometrySeed[],
  ): Set<string> {
    const seedIds = new Set<string>()
    for (const seed of seeds) {
      validateSeed(seed)
      if (seedIds.has(seed.blockId)) {
        throw new Error(`Duplicate pagination root id: ${seed.blockId}`)
      }
      seedIds.add(seed.blockId)
    }
    return seedIds
  }

  private syncSeeds(seeds: readonly PaginationGeometrySeed[]): boolean {
    let changed = false
    for (const seed of seeds) {
      const current = this.entries.get(seed.blockId)
      if (!current) {
        this.entries.set(seed.blockId, {
          blockId: seed.blockId,
          flavour: seed.flavour,
          nodeType: seed.nodeType,
          isHeading: seed.isHeading,
          contentRevision: 0,
          measureContextRevision: this.measureContextRevisionValue,
          measurementEpoch: 0,
          source: 'estimated',
          naturalHeight: seed.estimatedHeight,
          effectiveHeight: seed.estimatedHeight,
        })
        this.measuredGeometryIds.delete(seed.blockId)
        this.syncModelDrivenProvenance(seed.blockId, seed.modelDriven)
        changed = true
        continue
      }

      const semanticsChanged = current.flavour !== seed.flavour
        || current.nodeType !== seed.nodeType
        || current.isHeading !== seed.isHeading
      if (semanticsChanged) {
        this.entries.set(seed.blockId, {
          blockId: seed.blockId,
          flavour: seed.flavour,
          nodeType: seed.nodeType,
          isHeading: seed.isHeading,
          contentRevision: current.contentRevision,
          measureContextRevision: this.measureContextRevisionValue,
          measurementEpoch: 0,
          source: 'estimated',
          naturalHeight: seed.estimatedHeight,
          effectiveHeight: seed.estimatedHeight,
        })
        this.measuredGeometryIds.delete(seed.blockId)
        this.syncModelDrivenProvenance(seed.blockId, seed.modelDriven)
        changed = true
        continue
      }

      // Root-order reconciliation runs for every layout computation. A fresh
      // DOM measurement is more authoritative than that routine seed; actual
      // model changes first dirty the entry and then flow through the estimate
      // application policy below (or applyEstimatedHeights()).
      if (
        this.measuredGeometryIds.has(seed.blockId)
        && current.source === 'measured'
      ) {
        this.syncModelDrivenProvenance(seed.blockId, seed.modelDriven)
        continue
      }

      const shouldApply = this.shouldApplyEstimate(seed.blockId, current, {
        height: seed.estimatedHeight,
        modelDriven: seed.modelDriven,
      })
      this.syncModelDrivenProvenance(seed.blockId, seed.modelDriven)
      if (shouldApply) {
        const next = invalidateMeasuredMetadata(current, {
          naturalHeight: seed.estimatedHeight,
          effectiveHeight: seed.estimatedHeight,
        })
        if (estimatedGeometryEqual(current, next)) {
          this.entries.set(seed.blockId, next)
          this.measuredGeometryIds.delete(seed.blockId)
        } else {
          this.entries.set(seed.blockId, next)
          this.measuredGeometryIds.delete(seed.blockId)
          changed = true
        }
      }
    }
    return changed
  }

  markContentDirty(rootIds: readonly string[]): boolean {
    let changed = false
    for (const blockId of new Set(rootIds)) {
      const entry = this.entries.get(blockId)
      if (!entry) continue
      this.entries.set(blockId, invalidateMeasuredMetadata(entry, {
        contentRevision: entry.contentRevision + 1,
      }))
      changed = true
    }

    if (changed) this.revisionValue++
    return changed
  }

  /**
   * Structural changes invalidate both DOM metadata and the retained measured
   * extent. The following root-order sync may therefore install its freshly
   * computed model seed for each affected root.
   */
  markStructureDirty(rootIds: readonly string[]): boolean {
    const uniqueIds = [...new Set(rootIds)]
    const changed = this.markContentDirty(uniqueIds)
    uniqueIds.forEach(blockId => this.measuredGeometryIds.delete(blockId))
    return changed
  }

  applyEstimatedHeights(
    estimates: readonly PaginationGeometryEstimate[],
  ): boolean {
    let changed = false
    for (const estimate of estimates) {
      assertNonNegativeFinite(
        estimate.height,
        `estimatedHeight for ${estimate.blockId}`,
      )
      const current = this.entries.get(estimate.blockId)
      if (!current) continue
      const shouldApply = this.shouldApplyEstimate(
        estimate.blockId,
        current,
        estimate,
      )
      this.syncModelDrivenProvenance(
        estimate.blockId,
        estimate.modelDriven,
      )
      if (!shouldApply) continue
      const next = invalidateMeasuredMetadata(current, {
        naturalHeight: estimate.height,
        effectiveHeight: estimate.height,
      })
      if (estimatedGeometryEqual(current, next)) {
        this.entries.set(estimate.blockId, next)
        this.measuredGeometryIds.delete(estimate.blockId)
        continue
      }
      this.entries.set(estimate.blockId, next)
      this.measuredGeometryIds.delete(estimate.blockId)
      changed = true
    }
    if (changed) this.revisionValue++
    return changed
  }

  setMeasureContext(context: PaginationMeasureContext): boolean {
    validateContext(context)
    if (contextsEqual(this.measureContext, context)) return false

    this.measureContext = {...context}
    this.measureContextRevisionValue++
    for (const [blockId, entry] of this.entries) {
      this.entries.set(blockId, {
        ...entry,
        measureContextRevision: this.measureContextRevisionValue,
        source: 'estimated',
      })
    }
    this.revisionValue++
    return true
  }

  applyMeasured(
    measurements: readonly PaginationGeometryMeasurement[],
    measurementEpoch = 0,
  ): boolean {
    assertNonNegativeFinite(measurementEpoch, 'measurementEpoch')
    const measurementIds = new Set<string>()
    for (const measurement of measurements) {
      if (measurementIds.has(measurement.id)) {
        throw new Error(`Duplicate pagination measurement id: ${measurement.id}`)
      }
      measurementIds.add(measurement.id)
    }

    for (const measurement of measurements) {
      validateMeasurement(measurement)
      const current = this.entries.get(measurement.id)
      if (!current) continue
      if (current.flavour !== measurement.flavour
        || current.nodeType !== measurement.nodeType
        || current.isHeading !== measurement.isHeading) {
        throw new Error(`Pagination measurement semantics mismatch for ${measurement.id}`)
      }
    }

    const updates = new Map<string, PaginationGeometryEntry>()
    const freshnessUpdates = new Map<string, PaginationGeometryEntry>()
    for (const measurement of measurements) {
      const blockId = measurement.id
      const current = this.entries.get(blockId)
      if (!current) continue
      const tableCellFlowPlan = getTableCellFlowPlan(measurement)
      const next: PaginationGeometryEntry = {
        blockId,
        flavour: current.flavour,
        nodeType: current.nodeType,
        isHeading: current.isHeading,
        contentRevision: current.contentRevision,
        measureContextRevision: this.measureContextRevisionValue,
        measurementEpoch,
        source: 'measured',
        naturalHeight: measurement.naturalHeight,
        effectiveHeight: measurement.height,
        ...(measurement.trailingSpacing != null
          ? {trailingSpacing: measurement.trailingSpacing}
          : {}),
        splitOffsets: measurement.splitOffsets ? [...measurement.splitOffsets] : undefined,
        inlineBreakPlan: cloneInlinePaginationBreakPlan(measurement.inlineBreakPlan),
        preferredSplitOffsets: measurement.preferredSplitOffsets ? [...measurement.preferredSplitOffsets] : undefined,
        tableRows: cloneRows(measurement.tableRows),
        lockHeight: measurement.lockHeight,
        fitScale: measurement.fitScale,
        repeatHeaderHeight: measurement.repeatHeaderHeight,
        tableCellFlowPlan: tableCellFlowPlan
          ? cloneTableCellFlowPlan(tableCellFlowPlan)
          : undefined,
      }
      if (!entriesEqual(current, next)) {
        updates.set(blockId, next)
      } else if (current.measurementEpoch !== measurementEpoch) {
        // Refreshing an identical geometry for a newer natural-DOM epoch makes
        // the entry exact again without manufacturing a geometry revision.
        freshnessUpdates.set(blockId, {
          ...current,
          measurementEpoch,
        })
      }
    }

    freshnessUpdates.forEach((entry, blockId) => {
      this.entries.set(blockId, entry)
      this.measuredGeometryIds.add(blockId)
    })
    if (!updates.size) return false
    updates.forEach((entry, blockId) => {
      this.entries.set(blockId, entry)
      this.measuredGeometryIds.add(blockId)
    })
    this.revisionValue++
    return true
  }

  entriesFor(rootIds: readonly string[]): readonly PaginationGeometryEntry[] {
    const result: PaginationGeometryEntry[] = []
    for (const blockId of rootIds) {
      const entry = this.entries.get(blockId)
      if (entry) result.push(cloneEntry(entry))
    }
    return result
  }

  get(blockId: string): PaginationGeometryEntry | undefined {
    const entry = this.entries.get(blockId)
    return entry ? cloneEntry(entry) : undefined
  }

  private shouldApplyEstimate(
    blockId: string,
    current: PaginationGeometryEntry,
    estimate: Pick<PaginationGeometryEstimate, 'height' | 'modelDriven'>,
  ): boolean {
    return shouldApplyModelHeightEstimate(estimate, {
      previousModelDriven: this.modelDrivenEstimateIds.has(blockId),
      hasMeasuredHeight: this.measuredGeometryIds.has(blockId),
      measurementFresh: current.source === 'measured',
    })
  }

  private syncModelDrivenProvenance(
    blockId: string,
    modelDriven: boolean,
  ): void {
    if (modelDriven) this.modelDrivenEstimateIds.add(blockId)
    else this.modelDrivenEstimateIds.delete(blockId)
  }

  clear(): void {
    const hadEntries = this.entries.size > 0
    this.entries.clear()
    this.measuredGeometryIds.clear()
    this.modelDrivenEstimateIds.clear()
    if (hadEntries) this.revisionValue++
  }
}
