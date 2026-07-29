import {BlockNodeType} from '../../../block-std/types/block.type'
import {
  PaginationGeometryIndex,
  PaginationGeometryMeasurement,
  PaginationGeometrySeed,
  PaginationMeasureContext,
} from './pagination-geometry-index'

function seed(
  blockId: string,
  estimatedHeight = 48,
  overrides: Partial<PaginationGeometrySeed> = {},
): PaginationGeometrySeed {
  return {
    blockId,
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    isHeading: false,
    estimatedHeight,
    ...overrides,
  }
}

function measurement(
  id: string,
  naturalHeight: number,
  overrides: Partial<PaginationGeometryMeasurement> = {},
): PaginationGeometryMeasurement {
  return {
    id,
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    isHeading: false,
    naturalHeight,
    height: naturalHeight,
    ...overrides,
  }
}

function context(overrides: Partial<PaginationMeasureContext> = {}): PaginationMeasureContext {
  return {
    contentWidth: 720,
    theme: 'light',
    fontEpoch: 0,
    rendererRevision: 0,
    ...overrides,
  }
}

describe('PaginationGeometryIndex', () => {
  it('reuses measured geometry across root reordering', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b')])
    index.applyMeasured([measurement('a', 120), measurement('b', 80)])
    const revision = index.revision

    expect(index.syncRootOrder([seed('a'), seed('b')])).toBeFalse()
    expect(index.syncRootOrder([seed('b'), seed('a')])).toBeFalse()

    expect(index.entriesFor(['b', 'a']).map(entry => [entry.blockId, entry.naturalHeight]))
      .toEqual([['b', 80], ['a', 120]])
    expect(index.entriesFor(['b', 'a']).every(entry => entry.source === 'measured')).toBeTrue()
    expect(index.revision).toBe(revision)
  })

  it('invalidates stale geometry when a stable id changes pagination semantics', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('block')])
    index.applyMeasured([measurement('block', 180, {
      splitOffsets: [60, 120],
      preferredSplitOffsets: [60],
      tableRows: [{id: 'old-row', top: 0, bottom: 60, coveredFromAbove: false}],
      lockHeight: 160,
      repeatHeaderHeight: 24,
    })])
    index.markContentDirty(['block'])
    const revision = index.revision

    const tableSeed = seed('block', 72, {
      flavour: 'table',
      nodeType: BlockNodeType.block,
    })
    expect(index.syncRootOrder([tableSeed])).toBeTrue()

    expect(index.get('block')).toEqual(jasmine.objectContaining({
      blockId: 'block',
      flavour: 'table',
      nodeType: BlockNodeType.block,
      isHeading: false,
      contentRevision: 1,
      measureContextRevision: index.measureContextRevision,
      source: 'estimated',
      naturalHeight: 72,
    }))
    expect(index.get('block')?.splitOffsets).toBeUndefined()
    expect(index.get('block')?.preferredSplitOffsets).toBeUndefined()
    expect(index.get('block')?.tableRows).toBeUndefined()
    expect(index.get('block')?.lockHeight).toBeUndefined()
    expect(index.get('block')?.repeatHeaderHeight).toBeUndefined()
    expect(index.revision).toBe(revision + 1)

    expect(index.syncRootOrder([tableSeed])).toBeFalse()
    expect(index.revision).toBe(revision + 1)
  })

  it('treats each semantic seed field as an invalidation boundary', () => {
    const changedSeeds = [
      seed('block', 64, {flavour: 'callout'}),
      seed('block', 64, {nodeType: BlockNodeType.void}),
      seed('block', 64, {isHeading: true}),
    ]

    for (const changedSeed of changedSeeds) {
      const index = new PaginationGeometryIndex()
      index.syncRootOrder([seed('block')])
      index.applyMeasured([measurement('block', 120, {splitOffsets: [60]})])

      expect(index.syncRootOrder([changedSeed])).toBeTrue()
      expect(index.get('block')).toEqual(jasmine.objectContaining({
        flavour: changedSeed.flavour,
        nodeType: changedSeed.nodeType,
        isHeading: changedSeed.isHeading,
        naturalHeight: 64,
        source: 'estimated',
      }))
      expect(index.get('block')?.splitOffsets).toBeUndefined()
    }
  })

  it('updates seed-owned estimates but never overwrites retained measured geometry', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('block', 48)])
    const revision = index.revision

    expect(index.syncRootOrder([seed('block', 64)])).toBeTrue()
    expect(index.get('block')?.naturalHeight).toBe(64)
    expect(index.revision).toBe(revision + 1)

    expect(index.syncRootOrder([seed('block', 64)])).toBeFalse()
    index.applyMeasured([measurement('block', 120)])
    expect(index.syncRootOrder([seed('block', 96)])).toBeFalse()
    expect(index.get('block')).toEqual(jasmine.objectContaining({
      naturalHeight: 120,
      source: 'measured',
    }))

    index.markContentDirty(['block'])
    const dirtyRevision = index.revision
    expect(index.syncRootOrder([seed('block', 96)])).toBeFalse()
    expect(index.get('block')).toEqual(jasmine.objectContaining({
      naturalHeight: 120,
      source: 'estimated',
    }))
    expect(index.revision).toBe(dirtyRevision)
  })

  it('marks one root dirty once for a coalesced content batch', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b')])
    index.applyMeasured([measurement('a', 120), measurement('b', 80)])
    const revision = index.revision

    expect(index.markContentDirty(['a', 'a', 'missing'])).toBeTrue()

    expect(index.get('a')).toEqual(jasmine.objectContaining({
      contentRevision: 1,
      naturalHeight: 120,
      source: 'estimated',
    }))
    expect(index.get('b')).toEqual(jasmine.objectContaining({
      contentRevision: 0,
      source: 'measured',
    }))
    expect(index.revision).toBe(revision + 1)
  })

  it('invalidates every record only when all four measure-context fields change', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a')])
    index.applyMeasured([measurement('a', 120, {splitOffsets: [40, 80]})])

    const beforeFirstContext = index.revision
    expect(index.setMeasureContext(context())).toBeTrue()
    expect(index.measureContextRevision).toBe(1)
    expect(index.revision).toBe(beforeFirstContext + 1)
    expect(index.get('a')).toEqual(jasmine.objectContaining({
      naturalHeight: 120,
      measureContextRevision: 1,
      source: 'estimated',
      splitOffsets: [40, 80],
    }))

    const stableRevision = index.revision
    expect(index.setMeasureContext(context())).toBeFalse()
    expect(index.measureContextRevision).toBe(1)
    expect(index.revision).toBe(stableRevision)

    for (const next of [
      context({contentWidth: 640}),
      context({contentWidth: 640, theme: 'dark'}),
      context({contentWidth: 640, theme: 'dark', fontEpoch: 1}),
      context({contentWidth: 640, theme: 'dark', fontEpoch: 1, rendererRevision: 1}),
    ]) {
      const previousContextRevision = index.measureContextRevision
      const previousRevision = index.revision
      expect(index.setMeasureContext(next)).toBeTrue()
      expect(index.measureContextRevision).toBe(previousContextRevision + 1)
      expect(index.revision).toBe(previousRevision + 1)
      expect(index.get('a')?.measureContextRevision).toBe(index.measureContextRevision)
      expect(index.get('a')?.source).toBe('estimated')
    }
  })

  it('removes deleted roots and seeds newly reachable roots without disturbing survivors', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b')])
    index.applyMeasured([measurement('a', 120), measurement('b', 80)])
    const revision = index.revision

    expect(index.syncRootOrder([seed('b'), seed('c', 64)])).toBeTrue()

    expect(index.get('a')).toBeUndefined()
    expect(index.get('b')).toEqual(jasmine.objectContaining({naturalHeight: 80, source: 'measured'}))
    expect(index.get('c')).toEqual(jasmine.objectContaining({
      naturalHeight: 64,
      contentRevision: 0,
      source: 'estimated',
    }))
    expect(index.revision).toBe(revision + 1)
  })

  it('uses entriesFor input as document order and skips unknown ids', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b'), seed('c')])

    expect(index.entriesFor(['c', 'missing', 'a', 'c']).map(entry => entry.blockId))
      .toEqual(['c', 'a', 'c'])
  })

  it('deep-copies split arrays and table rows on writes and reads', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('table', 60, {flavour: 'table', nodeType: BlockNodeType.block})])
    const splitOffsets = [30, 60]
    const preferredSplitOffsets = [30]
    const tableRows = [{id: 'row-1', top: 0, bottom: 30, coveredFromAbove: false}]

    index.applyMeasured([measurement('table', 60, {
      flavour: 'table',
      nodeType: BlockNodeType.block,
      splitOffsets,
      preferredSplitOffsets,
      tableRows,
      repeatHeaderHeight: 20,
    })])
    splitOffsets.push(90)
    preferredSplitOffsets[0] = 999
    tableRows[0]!.bottom = 999

    const first = index.get('table')!
    expect(first.splitOffsets).toEqual([30, 60])
    expect(first.preferredSplitOffsets).toEqual([30])
    expect(first.tableRows).toEqual([{id: 'row-1', top: 0, bottom: 30, coveredFromAbove: false}])

    ;(first.splitOffsets as number[]).push(120)
    ;(first.preferredSplitOffsets as number[])[0] = 888
    ;(first.tableRows as unknown as Array<{bottom: number}>)[0]!.bottom = 777

    expect(index.get('table')).toEqual(jasmine.objectContaining({
      splitOffsets: [30, 60],
      preferredSplitOffsets: [30],
      tableRows: [{id: 'row-1', top: 0, bottom: 30, coveredFromAbove: false}],
    }))
  })

  it('rejects invalid seed geometry before mutating the index', () => {
    const index = new PaginationGeometryIndex()

    expect(() => index.syncRootOrder([seed('a', -1)])).toThrowError(RangeError)
    expect(index.revision).toBe(0)
    expect(index.get('a')).toBeUndefined()
  })

  it('rejects invalid measured geometry atomically', () => {
    const invalidMeasurements: PaginationGeometryMeasurement[] = [
      measurement('b', Number.NaN),
      measurement('b', 20, {height: -1}),
      measurement('b', 20, {lockHeight: Number.POSITIVE_INFINITY}),
      measurement('b', 20, {repeatHeaderHeight: -1}),
      measurement('b', 20, {splitOffsets: [10, -1]}),
      measurement('b', 20, {preferredSplitOffsets: [Number.NaN]}),
      measurement('b', 20, {tableRows: [{id: 'row', top: -1, bottom: 20, coveredFromAbove: false}]}),
      measurement('b', 20, {tableRows: [{id: 'row', top: 20, bottom: 10, coveredFromAbove: false}]}),
    ]

    for (const invalid of invalidMeasurements) {
      const index = new PaginationGeometryIndex()
      index.syncRootOrder([seed('a'), seed('b')])
      index.applyMeasured([measurement('a', 40)])
      const before = index.get('a')
      const revision = index.revision

      expect(() => index.applyMeasured([measurement('a', 80), invalid])).toThrowError(RangeError)
      expect(index.get('a')).toEqual(before)
      expect(index.get('b')?.source).toBe('estimated')
      expect(index.revision).toBe(revision)
    }
  })

  it('treats an identical measured batch as an idempotent no-op', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a')])
    const measured = measurement('a', 120, {
      splitOffsets: [40, 80],
      tableRows: [{id: 'row', top: 0, bottom: 40, coveredFromAbove: false}],
    })

    expect(index.applyMeasured([measured])).toBeTrue()
    const revision = index.revision
    expect(index.applyMeasured([measured])).toBeFalse()
    expect(index.revision).toBe(revision)
  })

  it('rejects duplicate measurement ids atomically', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b')])
    index.applyMeasured([measurement('a', 40)])
    const beforeA = index.get('a')
    const beforeB = index.get('b')
    const revision = index.revision

    expect(() => index.applyMeasured([
      measurement('b', 60),
      measurement('b', 80),
    ])).toThrowError(Error)

    expect(index.get('a')).toEqual(beforeA)
    expect(index.get('b')).toEqual(beforeB)
    expect(index.revision).toBe(revision)
  })

  it('ignores unknown measurements without changing data or revision', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a')])
    const before = index.get('a')
    const revision = index.revision

    expect(index.applyMeasured([measurement('missing', 120)])).toBeFalse()

    expect(index.get('a')).toEqual(before)
    expect(index.get('missing')).toBeUndefined()
    expect(index.revision).toBe(revision)
  })

  it('rejects a stale pre-transform measurement without restoring old semantics', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('block')])
    index.syncRootOrder([seed('block', 72, {
      flavour: 'table',
      nodeType: BlockNodeType.block,
    })])
    const before = index.get('block')
    const revision = index.revision

    expect(() => index.applyMeasured([
      measurement('block', 180, {
        splitOffsets: [60, 120],
        tableRows: [{id: 'old-row', top: 0, bottom: 60, coveredFromAbove: false}],
      }),
    ])).toThrowError(Error)

    expect(index.get('block')).toEqual(before)
    expect(index.revision).toBe(revision)
  })

  it('rejects a semantic mismatch before applying any earlier measurement in the batch', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b')])
    const beforeA = index.get('a')
    const beforeB = index.get('b')
    const revision = index.revision

    expect(() => index.applyMeasured([
      measurement('a', 80),
      measurement('b', 90, {isHeading: true}),
    ])).toThrowError(Error)

    expect(index.get('a')).toEqual(beforeA)
    expect(index.get('b')).toEqual(beforeB)
    expect(index.revision).toBe(revision)
  })

  it('increments the index revision at most once per mutating API batch', () => {
    const index = new PaginationGeometryIndex()

    expect(index.syncRootOrder([seed('a'), seed('b'), seed('c')])).toBeTrue()
    expect(index.revision).toBe(1)

    expect(index.applyMeasured([
      measurement('a', 60),
      measurement('b', 70),
      measurement('c', 80),
    ])).toBeTrue()
    expect(index.revision).toBe(2)

    expect(index.markContentDirty(['a', 'b', 'c'])).toBeTrue()
    expect(index.revision).toBe(3)

    expect(index.clear()).toBeUndefined()
    expect(index.revision).toBe(4)
    expect(index.entriesFor(['a', 'b', 'c'])).toEqual([])

    index.clear()
    expect(index.revision).toBe(4)
  })
})
