import {BlockNodeType} from '../../../block-std/types/block.type'
import {TableRowGeom} from '../view/item-builder'
import {
  cloneTableCellFlowPlan,
  TableCellFlowAnchor,
  TableCellFlowPlan,
} from '../engine/table-cell-flow'
import {getTableCellFlowPlan} from '../engine/table-cell-flow-metadata'

export interface PaginationMeasureContext {
  readonly contentWidth: number
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
}

export interface PaginationGeometryEstimate {
  readonly blockId: string
  readonly height: number
}

export interface PaginationGeometryEntry {
  readonly blockId: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly isHeading: boolean
  readonly contentRevision: number
  readonly measureContextRevision: number
  readonly source: 'estimated' | 'measured'
  readonly naturalHeight: number
  /** 分页实际占位高度；宽度/高度 fit 后可小于 naturalHeight。 */
  readonly effectiveHeight: number
  /** 已计入高度、由同一稳定 DOM 帧捕获的块尾间距。 */
  readonly trailingSpacing?: number
  readonly splitOffsets?: readonly number[]
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
  validateOffsets(measurement.preferredSplitOffsets, `preferredSplitOffsets for ${measurement.id}`)
  validateRows(measurement.tableRows)
}

function validateContext(context: PaginationMeasureContext): void {
  assertNonNegativeFinite(context.contentWidth, 'contentWidth')
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
    preferredSplitOffsets: entry.preferredSplitOffsets ? [...entry.preferredSplitOffsets] : undefined,
    tableRows: cloneRows(entry.tableRows),
    tableCellFlowPlan: entry.tableCellFlowPlan
      ? cloneTableCellFlowPlan(entry.tableCellFlowPlan)
      : undefined,
  }
}

function arraysEqual(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function rowsEqual(left: readonly TableRowGeom[] | undefined, right: readonly TableRowGeom[] | undefined): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((row, index) => {
    const other = right[index]!
    return row.id === other.id
      && row.top === other.top
      && row.bottom === other.bottom
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
    left.paginationHeight !== right.paginationHeight
    || !arraysEqual(left.splitOffsets, right.splitOffsets)
    || left.segments.length !== right.segments.length
  ) return false

  return left.segments.every((segment, index) => {
    const other = right.segments[index]
    if (
      !other
      || segment.fromOffset !== other.fromOffset
      || segment.toOffset !== other.toOffset
      || segment.height !== other.height
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
          && continuation.pageOffset === otherContinuation.pageOffset
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
    && left.naturalHeight === right.naturalHeight
    && left.effectiveHeight === right.effectiveHeight
    && left.trailingSpacing === right.trailingSpacing
    && left.lockHeight === right.lockHeight
    && left.fitScale === right.fitScale
    && left.repeatHeaderHeight === right.repeatHeaderHeight
    && arraysEqual(left.splitOffsets, right.splitOffsets)
    && arraysEqual(left.preferredSplitOffsets, right.preferredSplitOffsets)
    && rowsEqual(left.tableRows, right.tableRows)
    && plansEqual(left.tableCellFlowPlan, right.tableCellFlowPlan)
}

function contextsEqual(left: PaginationMeasureContext | null, right: PaginationMeasureContext): boolean {
  return left?.contentWidth === right.contentWidth
    && left.theme === right.theme
    && left.fontEpoch === right.fontEpoch
    && left.rendererRevision === right.rendererRevision
}

export class PaginationGeometryIndex {
  private readonly entries = new Map<string, PaginationGeometryEntry>()
  private readonly measuredGeometryIds = new Set<string>()
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
    const seedIds = new Set<string>()
    for (const seed of seeds) {
      validateSeed(seed)
      if (seedIds.has(seed.blockId)) {
        throw new Error(`Duplicate pagination root id: ${seed.blockId}`)
      }
      seedIds.add(seed.blockId)
    }

    let changed = false
    for (const blockId of this.entries.keys()) {
      if (!seedIds.has(blockId)) {
        this.entries.delete(blockId)
        this.measuredGeometryIds.delete(blockId)
        changed = true
      }
    }

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
          source: 'estimated',
          naturalHeight: seed.estimatedHeight,
          effectiveHeight: seed.estimatedHeight,
        })
        this.measuredGeometryIds.delete(seed.blockId)
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
          source: 'estimated',
          naturalHeight: seed.estimatedHeight,
          effectiveHeight: seed.estimatedHeight,
        })
        this.measuredGeometryIds.delete(seed.blockId)
        changed = true
        continue
      }

      if (current.source === 'estimated'
        && !this.measuredGeometryIds.has(seed.blockId)
        && current.naturalHeight !== seed.estimatedHeight) {
        this.entries.set(seed.blockId, {
          ...current,
          naturalHeight: seed.estimatedHeight,
          effectiveHeight: seed.estimatedHeight,
        })
        changed = true
      }
    }

    if (changed) this.revisionValue++
    return changed
  }

  markContentDirty(rootIds: readonly string[]): boolean {
    let changed = false
    for (const blockId of new Set(rootIds)) {
      const entry = this.entries.get(blockId)
      if (!entry) continue
      this.entries.set(blockId, {
        ...entry,
        contentRevision: entry.contentRevision + 1,
        source: 'estimated',
      })
      changed = true
    }

    if (changed) this.revisionValue++
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
      this.measuredGeometryIds.delete(estimate.blockId)
      if (
        current.source === 'estimated' &&
        current.naturalHeight === estimate.height
      ) {
        continue
      }
      this.entries.set(estimate.blockId, {
        ...current,
        source: 'estimated',
        naturalHeight: estimate.height,
        effectiveHeight: estimate.height,
      })
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

  applyMeasured(measurements: readonly PaginationGeometryMeasurement[]): boolean {
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
        source: 'measured',
        naturalHeight: measurement.naturalHeight,
        effectiveHeight: measurement.height,
        ...(measurement.trailingSpacing != null
          ? {trailingSpacing: measurement.trailingSpacing}
          : {}),
        splitOffsets: measurement.splitOffsets ? [...measurement.splitOffsets] : undefined,
        preferredSplitOffsets: measurement.preferredSplitOffsets ? [...measurement.preferredSplitOffsets] : undefined,
        tableRows: cloneRows(measurement.tableRows),
        lockHeight: measurement.lockHeight,
        fitScale: measurement.fitScale,
        repeatHeaderHeight: measurement.repeatHeaderHeight,
        tableCellFlowPlan: tableCellFlowPlan
          ? cloneTableCellFlowPlan(tableCellFlowPlan)
          : undefined,
      }
      if (!entriesEqual(current, next)) updates.set(blockId, next)
    }

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

  clear(): void {
    if (!this.entries.size) return
    this.entries.clear()
    this.measuredGeometryIds.clear()
    this.revisionValue++
  }
}
