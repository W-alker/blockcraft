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
    modelDriven: false,
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
    contentHeight: 900,
    widowOrphanLines: 2,
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

  it('refreshes selected root semantics without pruning unrelated geometry', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b')])
    index.applyMeasured([
      measurement('a', 120, {splitOffsets: [60]}),
      measurement('b', 80),
    ])
    index.markContentDirty(['a'])
    const revision = index.revision

    expect(index.syncRootSemantics([{
      blockId: 'a',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      isHeading: true,
    }])).toBeTrue()

    expect(index.get('a')).toEqual(jasmine.objectContaining({
      isHeading: true,
      contentRevision: 1,
      naturalHeight: 120,
      source: 'estimated',
    }))
    expect(index.get('a')?.splitOffsets).toBeUndefined()
    expect(index.get('b')).toEqual(jasmine.objectContaining({
      isHeading: false,
      naturalHeight: 80,
      source: 'measured',
    }))
    expect(index.revision).toBe(revision + 1)
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

  it('preserves a fresh measured height across routine model-driven seed sync', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('block', 120, {modelDriven: true})])
    index.applyMeasured([measurement('block', 160)])
    const measuredRevision = index.revision

    expect(index.syncRootOrder([
      seed('block', 120, {modelDriven: true}),
    ])).toBeFalse()
    expect(index.get('block')).toEqual(jasmine.objectContaining({
      naturalHeight: 160,
      effectiveHeight: 160,
      source: 'measured',
    }))
    expect(index.revision).toBe(measuredRevision)
  })

  it('applies a model-to-fallback transition over stale measured geometry', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('block', 240, {modelDriven: true})])
    index.applyMeasured([measurement('block', 260, {
      splitOffsets: [120],
      lockHeight: 200,
      fitScale: 0.5,
    })])
    index.markContentDirty(['block'])

    expect(index.applyEstimatedHeights([{
      blockId: 'block',
      height: 48,
      modelDriven: false,
    }])).toBeTrue()
    expect(index.get('block')).toEqual(jasmine.objectContaining({
      naturalHeight: 48,
      effectiveHeight: 48,
      source: 'estimated',
    }))
    expect(index.get('block')?.splitOffsets).toBeUndefined()
    expect(index.get('block')?.lockHeight).toBeUndefined()
    expect(index.get('block')?.fitScale).toBeUndefined()
  })

  it('retains stale measured height for fallback-to-fallback content changes', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('block', 48)])
    index.applyMeasured([measurement('block', 120)])
    index.markContentDirty(['block'])
    const revision = index.revision

    expect(index.applyEstimatedHeights([{
      blockId: 'block',
      height: 48,
      modelDriven: false,
    }])).toBeFalse()
    expect(index.get('block')).toEqual(jasmine.objectContaining({
      naturalHeight: 120,
      source: 'estimated',
    }))
    expect(index.revision).toBe(revision)
  })

  it('lets an equal model estimate hand off to fallback without a geometry revision', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('block', 120, {modelDriven: true})])
    index.applyMeasured([measurement('block', 120)])
    index.markContentDirty(['block'])
    const dirtyRevision = index.revision

    expect(index.applyEstimatedHeights([{
      blockId: 'block',
      height: 120,
      modelDriven: true,
    }])).toBeFalse()
    expect(index.get('block')).toEqual(jasmine.objectContaining({
      naturalHeight: 120,
      effectiveHeight: 120,
      measurementEpoch: 0,
      source: 'estimated',
    }))
    expect(index.get('block')?.splitOffsets).toBeUndefined()
    expect(index.revision).toBe(dirtyRevision)

    expect(index.applyEstimatedHeights([{
      blockId: 'block',
      height: 48,
      modelDriven: false,
    }])).toBeTrue()
    expect(index.get('block')).toEqual(jasmine.objectContaining({
      naturalHeight: 48,
      effectiveHeight: 48,
      source: 'estimated',
    }))
    expect(index.revision).toBe(dirtyRevision + 1)
  })

  it('marks one root dirty once for a coalesced content batch', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a'), seed('b')])
    index.applyMeasured([
      measurement('a', 120, {
        splitOffsets: [40, 80],
        preferredSplitOffsets: [40],
        tableRows: [{
          id: 'old-row',
          top: 0,
          bottom: 40,
          coveredFromAbove: false,
        }],
        lockHeight: 100,
        fitScale: 0.5,
        repeatHeaderHeight: 20,
      }),
      measurement('b', 80),
    ])
    const revision = index.revision

    expect(index.markContentDirty(['a', 'a', 'missing'])).toBeTrue()

    expect(index.get('a')).toEqual(jasmine.objectContaining({
      contentRevision: 1,
      naturalHeight: 120,
      source: 'estimated',
    }))
    expect(index.get('a')?.splitOffsets).toBeUndefined()
    expect(index.get('a')?.preferredSplitOffsets).toBeUndefined()
    expect(index.get('a')?.tableRows).toBeUndefined()
    expect(index.get('a')?.lockHeight).toBeUndefined()
    expect(index.get('a')?.fitScale).toBeUndefined()
    expect(index.get('a')?.repeatHeaderHeight).toBeUndefined()
    expect(index.get('b')).toEqual(jasmine.objectContaining({
      contentRevision: 0,
      source: 'measured',
    }))
    expect(index.revision).toBe(revision + 1)
  })

  it('invalidates every record when any measure-context field changes', () => {
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
      context({contentWidth: 640, contentHeight: 800, theme: 'dark', fontEpoch: 1, rendererRevision: 1}),
      context({contentWidth: 640, contentHeight: 800, widowOrphanLines: 3, theme: 'dark', fontEpoch: 1, rendererRevision: 1}),
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

  it('rejects invalid page-height and widow/orphan measurement context', () => {
    const index = new PaginationGeometryIndex()

    expect(() => index.setMeasureContext(context({contentHeight: -1})))
      .toThrowError(RangeError)
    expect(() => index.setMeasureContext(context({contentHeight: Number.NaN})))
      .toThrowError(RangeError)
    expect(() => index.setMeasureContext(context({widowOrphanLines: -1})))
      .toThrowError(RangeError)
    expect(() => index.setMeasureContext(context({widowOrphanLines: Number.NaN})))
      .toThrowError(RangeError)
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

  it('owns immutable inline break plans and treats anchor changes as geometry changes', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('paragraph', 240)])
    const splitOffsets = [80, 160]
    const inlineBreakPlan = {
      points: [
        {layoutOffset: 80, textOffset: 12},
        {layoutOffset: 160, textOffset: 28},
      ],
    }

    expect(index.applyMeasured([measurement('paragraph', 240, {
      splitOffsets,
      inlineBreakPlan,
    })])).toBeTrue()
    splitOffsets[0] = 999
    inlineBreakPlan.points[0]!.layoutOffset = 999
    inlineBreakPlan.points[0]!.textOffset = 999

    const first = index.get('paragraph')!
    expect(first.inlineBreakPlan).toEqual({
      points: [
        {layoutOffset: 80, textOffset: 12},
        {layoutOffset: 160, textOffset: 28},
      ],
    })
    ;(first.inlineBreakPlan!.points as unknown as Array<{layoutOffset: number; textOffset: number}>)[0]!
      .textOffset = 777
    expect(index.get('paragraph')?.inlineBreakPlan?.points[0]?.textOffset).toBe(12)

    const stableRevision = index.revision
    const stableMeasurement = measurement('paragraph', 240, {
      splitOffsets: [80, 160],
      inlineBreakPlan: {
        points: [
          {layoutOffset: 80, textOffset: 12},
          {layoutOffset: 160, textOffset: 28},
        ],
      },
    })
    expect(index.applyMeasured([stableMeasurement])).toBeFalse()
    expect(index.revision).toBe(stableRevision)

    expect(index.applyMeasured([measurement('paragraph', 240, {
      splitOffsets: [80, 160],
      inlineBreakPlan: {
        points: [
          {layoutOffset: 80, textOffset: 13},
          {layoutOffset: 160, textOffset: 28},
        ],
      },
    })])).toBeTrue()
    expect(index.revision).toBe(stableRevision + 1)
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
      measurement('b', 20, {fitScale: 0}),
      measurement('b', 20, {fitScale: Number.NaN}),
      measurement('b', 20, {fitScale: 1.01}),
      measurement('b', 20, {repeatHeaderHeight: -1}),
      measurement('b', 20, {splitOffsets: [10, -1]}),
      measurement('b', 20, {preferredSplitOffsets: [Number.NaN]}),
      measurement('b', 20, {
        splitOffsets: [10],
        inlineBreakPlan: {points: []},
      }),
      measurement('b', 20, {
        splitOffsets: [10],
        inlineBreakPlan: {points: [{layoutOffset: 20, textOffset: 1}]},
      }),
      measurement('b', 20, {
        splitOffsets: [10, 15],
        inlineBreakPlan: {points: [
          {layoutOffset: 10, textOffset: 2},
          {layoutOffset: 15, textOffset: 1},
        ]},
      }),
      measurement('b', 20, {
        splitOffsets: [9],
        inlineBreakPlan: {points: [{layoutOffset: 10, textOffset: 1}]},
      }),
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

    expect(index.applyMeasured([measured], 1)).toBeTrue()
    const revision = index.revision
    expect(index.get('a')?.measurementEpoch).toBe(1)
    expect(index.applyMeasured([measured], 2)).toBeFalse()
    expect(index.revision).toBe(revision)
    expect(index.get('a')?.measurementEpoch).toBe(2)
  })

  it('ignores subpixel DOM drift while keeping model anchors exact', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('a')])
    const measured = measurement('a', 120, {
      trailingSpacing: 8,
      splitOffsets: [40],
      inlineBreakPlan: {points: [{layoutOffset: 40, textOffset: 8}]},
      tableRows: [{id: 'row', top: 0, bottom: 40, coveredFromAbove: false}],
    })
    expect(index.applyMeasured([measured], 1)).toBeTrue()
    const revision = index.revision

    expect(index.applyMeasured([measurement('a', 120.4, {
      height: 120.3,
      trailingSpacing: 8.2,
      splitOffsets: [40.4],
      inlineBreakPlan: {points: [{layoutOffset: 40.4, textOffset: 8}]},
      tableRows: [{id: 'row', top: 0.2, bottom: 40.4, coveredFromAbove: false}],
    })], 2)).toBeFalse()
    expect(index.revision).toBe(revision)
    expect(index.get('a')?.naturalHeight).toBe(120)
    expect(index.get('a')?.measurementEpoch).toBe(2)

    expect(index.applyMeasured([measurement('a', 120.4, {
      height: 120.3,
      trailingSpacing: 8.2,
      splitOffsets: [40.4],
      inlineBreakPlan: {points: [{layoutOffset: 40.4, textOffset: 9}]},
      tableRows: [{id: 'row', top: 0.2, bottom: 40.4, coveredFromAbove: false}],
    })])).toBeTrue()
    expect(index.revision).toBe(revision + 1)
  })

  it('retains width-only fit scale and effective height in measured geometry', () => {
    const index = new PaginationGeometryIndex()
    index.syncRootOrder([seed('wide', 80, {
      flavour: 'bookmark',
      nodeType: BlockNodeType.void,
    })])
    const fitted = measurement('wide', 80, {
      flavour: 'bookmark',
      nodeType: BlockNodeType.void,
      height: 40,
      fitScale: 0.5,
    })

    expect(index.applyMeasured([fitted])).toBeTrue()
    expect(index.get('wide')).toEqual(jasmine.objectContaining({
      naturalHeight: 80,
      effectiveHeight: 40,
      fitScale: 0.5,
      lockHeight: undefined,
      source: 'measured',
    }))

    const revision = index.revision
    expect(index.applyMeasured([fitted])).toBeFalse()
    expect(index.revision).toBe(revision)

    expect(index.applyMeasured([{
      ...fitted,
      fitScale: 0.50005,
    }])).toBeTrue()
    expect(index.revision).toBe(revision + 1)
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
