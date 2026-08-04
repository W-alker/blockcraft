import {BlockNodeType} from '../../../block-std/types/block.type'
import type {PaginationGeometryMeasurement} from '../layout/pagination-geometry-index'
import {buildPaginationItems} from './item-builder'
import type {TableRowGeom} from './item-builder'
import {LiveHeightSource} from './live-height-source'
import {planTableCellFlow, TableCellFlowPlan} from '../engine/table-cell-flow'
import {getTableCellFlowPlan} from '../engine/table-cell-flow-metadata'
import {registerTablePaginationAccess} from './table-pagination-access'

describe('LiveHeightSource atomic block measurement', () => {
  let source: LiveHeightSource
  let host: HTMLElement
  let releaseTableAccess: (() => void) | undefined

  function createSource(
    offsetHeight: number,
    scrollHeight: number,
    flavour = 'figma-embed',
    nodeType = BlockNodeType.void,
    tableGeometry?: {
      naturalHeight: number
      headerHeight: number
      rows: TableRowGeom[]
      cellFlowPlan?: TableCellFlowPlan
    },
  ): LiveHeightSource {
    host = document.createElement('div')
    host.style.marginBottom = '8px'
    document.body.appendChild(host)
    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: offsetHeight})
    Object.defineProperty(host, 'scrollHeight', {configurable: true, value: scrollHeight})
    const block = {
      hostElement: host,
      nodeType,
      flavour,
    }
    if (tableGeometry) {
      releaseTableAccess = registerTablePaginationAccess(block, {
        measure: () => tableGeometry,
        apply: () => undefined,
        clear: () => undefined,
      })
    }
    const doc = {
      root: {childrenIds: ['embed-1']},
      getBlockById: (id: string) => id === 'embed-1' ? block : null,
    } as unknown as BlockCraft.Doc
    return new LiveHeightSource(doc)
  }

  afterEach(() => {
    source?.destroy()
    releaseTableAccess?.()
    releaseTableAccess = undefined
    host?.remove()
  })

  it('uses visible overflow height for an atomic block below one page', () => {
    source = createSource(55, 464)

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(472)
    expect(meta?.naturalHeight).toBe(472)
    expect(meta?.lockHeight).toBeUndefined()
  })

  it('reports the natural stride when measure options are omitted', () => {
    source = createSource(55, 464)

    const [meta] = source.measure()

    expect(meta?.height).toBe(472)
    expect(meta?.naturalHeight).toBe(472)
  })

  it('keeps the existing full-page height lock for an oversized atomic block', () => {
    source = createSource(55, 1200)

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(900)
    expect(meta?.naturalHeight).toBe(1208)
    expect(meta?.lockHeight).toBe(900)
  })

  it('locks an oversized image even though its caption makes it a container block', () => {
    source = createSource(55, 1200, 'image', BlockNodeType.block)

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(900)
    expect(meta?.naturalHeight).toBe(1208)
    expect(meta?.lockHeight).toBe(900)
  })

  it('uses the table natural geometry as its full stride', () => {
    const rows: TableRowGeom[] = [
      {id: 'row-1', top: 40, bottom: 220, coveredFromAbove: false},
      {id: 'row-2', top: 220, bottom: 420, coveredFromAbove: false},
    ]
    source = createSource(55, 55, 'table', BlockNodeType.block, {
      naturalHeight: 420,
      headerHeight: 40,
      rows,
    })

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(428)
    expect(meta?.naturalHeight).toBe(428)
    expect(meta?.tableRows).toEqual(rows)
  })

  it('uses table natural geometry without measure options instead of the paginated host height', () => {
    const rows: TableRowGeom[] = [
      {id: 'row-1', top: 40, bottom: 220, coveredFromAbove: false},
      {id: 'row-2', top: 220, bottom: 420, coveredFromAbove: false},
    ]
    source = createSource(1200, 1200, 'table', BlockNodeType.block, {
      naturalHeight: 420,
      headerHeight: 40,
      rows,
    })

    const [meta] = source.measure()

    expect(meta?.height).toBe(428)
    expect(meta?.naturalHeight).toBe(428)
    expect(meta?.splitOffsets).toBeUndefined()
    expect(meta?.preferredSplitOffsets).toBeUndefined()
  })

  it('uses an oversized-cell flow plan as the table virtual layout height', () => {
    const flowPlan = planTableCellFlow([{
      kind: 'cell-flow',
      rowId: 'row-1',
      cells: [{
        cellId: 'cell-1',
        points: [
          {offset: 80, anchor: {kind: 'text', blockId: 'p1', offset: 4}},
          {offset: 160, anchor: {kind: 'text', blockId: 'p1', offset: 8}},
          {offset: 240, anchor: {kind: 'cell-end'}},
        ],
      }],
    }], 100)
    source = createSource(500, 500, 'table', BlockNodeType.block, {
      naturalHeight: 240,
      headerHeight: 0,
      rows: [{id: 'row-1', top: 0, bottom: 240, coveredFromAbove: false}],
      cellFlowPlan: flowPlan,
    })

    const [meta] = source.measure({contentHeight: 100, widowOrphanLines: 2})

    expect(meta.height).toBe(248)
    expect(meta.naturalHeight).toBe(248)
    expect(meta.splitOffsets).toEqual([80, 160])
    expect(getTableCellFlowPlan(meta)?.paginationHeight).toBe(248)
    expect(getTableCellFlowPlan(buildPaginationItems([meta])[0])?.paginationHeight).toBe(248)
  })

  it('remains structurally compatible with pagination consumers', () => {
    source = createSource(55, 464)

    const measurements = source.measure({
      contentHeight: 900,
      widowOrphanLines: 2,
    })
    const geometryMeasurements: readonly PaginationGeometryMeasurement[] = measurements

    expect(buildPaginationItems(measurements)[0]?.height).toBe(472)
    expect(geometryMeasurements[0]?.naturalHeight).toBe(472)
  })

  it('keeps a code block locked when the lock layout collapses its measured scroll height', () => {
    source = createSource(1013, 1011, 'code', BlockNodeType.editable)

    const [beforeLock] = source.measure({contentHeight: 900, widowOrphanLines: 2})
    expect(beforeLock?.lockHeight).toBe(900)

    host.classList.add('bc-page-height-locked')
    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: 900})
    Object.defineProperty(host, 'scrollHeight', {configurable: true, value: 898})

    const [whileLocked] = source.measure({contentHeight: 900, widowOrphanLines: 2})
    expect(whileLocked?.height).toBe(900)
    expect(whileLocked?.lockHeight).toBe(900)

    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: 534})
    Object.defineProperty(host, 'scrollHeight', {configurable: true, value: 532})

    const [afterRealShrink] = source.measure({contentHeight: 900, widowOrphanLines: 2})
    expect(afterRealShrink?.height).toBe(542)
    expect(afterRealShrink?.lockHeight).toBeUndefined()
  })

  it('filters the ResizeObserver echo of a pagination-owned table projection', () => {
    source = createSource(500, 500, 'table', BlockNodeType.block, {
      naturalHeight: 500,
      headerHeight: 0,
      rows: [{id: 'row-1', top: 0, bottom: 500, coveredFromAbove: false}],
    })
    source.syncObserved()
    spyOn(host, 'getBoundingClientRect').and.returnValue({height: 640} as DOMRect)
    const resize = jasmine.createSpy('resize')
    source.resize$.subscribe(resize)

    source.captureLayoutOwnedResize(['embed-1'])
    ;(source as unknown as {
      _handleResize(entries: readonly ResizeObserverEntry[]): void
    })._handleResize([{
      target: host,
      borderBoxSize: [{blockSize: 640}],
    } as unknown as ResizeObserverEntry])

    expect(resize).not.toHaveBeenCalled()
  })

  it('still emits when content changes a block beyond the pagination-owned size', () => {
    source = createSource(500, 500, 'table', BlockNodeType.block, {
      naturalHeight: 500,
      headerHeight: 0,
      rows: [{id: 'row-1', top: 0, bottom: 500, coveredFromAbove: false}],
    })
    source.syncObserved()
    spyOn(host, 'getBoundingClientRect').and.returnValue({height: 640} as DOMRect)
    const resize = jasmine.createSpy('resize')
    source.resize$.subscribe(resize)

    source.captureLayoutOwnedResize(['embed-1'])
    ;(source as unknown as {
      _handleResize(entries: readonly ResizeObserverEntry[]): void
    })._handleResize([{
      target: host,
      borderBoxSize: [{blockSize: 612}],
    } as unknown as ResizeObserverEntry])

    expect(resize).toHaveBeenCalledTimes(1)
  })

  it('clears an unconsumed projection size when the model changes', () => {
    source = createSource(500, 500, 'table', BlockNodeType.block, {
      naturalHeight: 500,
      headerHeight: 0,
      rows: [{id: 'row-1', top: 0, bottom: 500, coveredFromAbove: false}],
    })
    source.syncObserved()
    spyOn(host, 'getBoundingClientRect').and.returnValue({height: 640} as DOMRect)
    const resize = jasmine.createSpy('resize')
    source.resize$.subscribe(resize)

    source.captureLayoutOwnedResize(['embed-1'])
    source.clearLayoutOwnedResize()
    ;(source as unknown as {
      _handleResize(entries: readonly ResizeObserverEntry[]): void
    })._handleResize([{
      target: host,
      borderBoxSize: [{blockSize: 640}],
    } as unknown as ResizeObserverEntry])

    expect(resize).toHaveBeenCalledTimes(1)
  })

  it('measures only mounted IDs without querying an offscreen block', () => {
    const mountedHost = document.createElement('div')
    document.body.appendChild(mountedHost)
    Object.defineProperty(mountedHost, 'offsetHeight', {value: 40})
    Object.defineProperty(mountedHost, 'scrollHeight', {value: 40})
    const getBlockById = jasmine.createSpy('getBlockById').and.callFake(
      (id: string) => {
        if (id === 'mounted') {
          return {
            hostElement: mountedHost,
            nodeType: BlockNodeType.editable,
            flavour: 'paragraph',
          }
        }
        throw new Error(`Block not found: ${id}`)
      },
    )
    const sparseSource = new LiveHeightSource({
      root: {childrenIds: ['mounted', 'offscreen']},
      getBlockById,
    } as unknown as BlockCraft.Doc)

    try {
      sparseSource.syncObserved(['mounted'])
      const measurements = sparseSource.measure(undefined, ['mounted'])

      expect(measurements.map(value => value.id)).toEqual(['mounted'])
      expect(getBlockById).not.toHaveBeenCalledWith('offscreen', jasmine.anything())
    } finally {
      sparseSource.destroy()
      mountedHost.remove()
    }
  })
})
