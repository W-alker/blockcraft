import {BlockNodeType} from '../../../block-std/types/block.type'
import {TableRowGeom} from '../view/item-builder'

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

export interface PaginationGeometryEntry {
  readonly blockId: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly isHeading: boolean
  readonly contentRevision: number
  readonly measureContextRevision: number
  readonly source: 'estimated' | 'measured'
  readonly naturalHeight: number
  readonly splitOffsets?: readonly number[]
  readonly preferredSplitOffsets?: readonly number[]
  readonly tableRows?: readonly TableRowGeom[]
  readonly lockHeight?: number
  readonly repeatHeaderHeight?: number
}

export interface PaginationGeometryMeasurement {
  readonly id: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly isHeading: boolean
  readonly naturalHeight: number
  readonly height: number
  readonly splitOffsets?: readonly number[]
  readonly preferredSplitOffsets?: readonly number[]
  readonly tableRows?: readonly TableRowGeom[]
  readonly lockHeight?: number
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
  if (measurement.repeatHeaderHeight != null) {
    assertNonNegativeFinite(measurement.repeatHeaderHeight, `repeatHeaderHeight for ${measurement.id}`)
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

function entriesEqual(left: PaginationGeometryEntry, right: PaginationGeometryEntry): boolean {
  return left.blockId === right.blockId
    && left.flavour === right.flavour
    && left.nodeType === right.nodeType
    && left.isHeading === right.isHeading
    && left.contentRevision === right.contentRevision
    && left.measureContextRevision === right.measureContextRevision
    && left.source === right.source
    && left.naturalHeight === right.naturalHeight
    && left.lockHeight === right.lockHeight
    && left.repeatHeaderHeight === right.repeatHeaderHeight
    && arraysEqual(left.splitOffsets, right.splitOffsets)
    && arraysEqual(left.preferredSplitOffsets, right.preferredSplitOffsets)
    && rowsEqual(left.tableRows, right.tableRows)
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
      const next: PaginationGeometryEntry = {
        blockId,
        flavour: current.flavour,
        nodeType: current.nodeType,
        isHeading: current.isHeading,
        contentRevision: current.contentRevision,
        measureContextRevision: this.measureContextRevisionValue,
        source: 'measured',
        naturalHeight: measurement.naturalHeight,
        splitOffsets: measurement.splitOffsets ? [...measurement.splitOffsets] : undefined,
        preferredSplitOffsets: measurement.preferredSplitOffsets ? [...measurement.preferredSplitOffsets] : undefined,
        tableRows: cloneRows(measurement.tableRows),
        lockHeight: measurement.lockHeight,
        repeatHeaderHeight: measurement.repeatHeaderHeight,
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
