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
  let mediaSurface: HTMLElement | undefined
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
    mediaSurface = undefined
    if (flavour === 'image' || flavour === 'video') {
      mediaSurface = document.createElement('div')
      mediaSurface.className = flavour === 'image' ? 'img-wrapper' : 'video-block__wrapper'
      host.appendChild(mediaSurface)
      Object.defineProperties(mediaSurface, {
        offsetWidth: {
          configurable: true,
          get: () => Math.max(host.offsetWidth, host.scrollWidth),
        },
        scrollWidth: {
          configurable: true,
          get: () => Math.max(host.offsetWidth, host.scrollWidth),
        },
        offsetHeight: {
          configurable: true,
          get: () => Math.max(host.offsetHeight, host.scrollHeight),
        },
        scrollHeight: {
          configurable: true,
          get: () => Math.max(host.offsetHeight, host.scrollHeight),
        },
      })
    }
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

  it('does not count clipped atomic overflow as page stride', () => {
    source = createSource(176, 180)
    host.style.overflow = 'hidden'

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(184)
    expect(meta?.naturalHeight).toBe(184)
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
    expect(meta?.lockHeight).toBeUndefined()
    expect(meta?.fitScale).toBeCloseTo(892 / 1200, 6)
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

  it('fits an oversized image into one page instead of dropping its tail', () => {
    source = createSource(1200, 1200, 'image', BlockNodeType.block)

    const [image] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(image?.height).toBe(900)
    expect(image?.lockHeight).toBeUndefined()
    expect(image?.fitScale).toBeCloseTo(892 / 1200, 6)
    expect(buildPaginationItems([image!])[0]?.fitScale).toBe(image?.fitScale)
  })

  it('uses the smaller visual height when an oversized image is constrained more by width', () => {
    source = createSource(1200, 1200, 'image', BlockNodeType.block)
    Object.defineProperty(host, 'offsetWidth', {configurable: true, value: 1300})
    Object.defineProperty(host, 'scrollWidth', {configurable: true, value: 1300})

    const [image] = source.measure({
      contentHeight: 900,
      contentWidth: 650,
      widowOrphanLines: 2,
    })

    expect(image?.naturalHeight).toBe(1208)
    expect(image?.lockHeight).toBeUndefined()
    expect(image?.fitScale).toBe(0.5)
    expect(image?.height).toBe(608)
    expect(buildPaginationItems([image!])[0]?.height).toBe(608)
  })

  it('uses responsive wr/ar geometry as the image body height', () => {
    source = createSource(1200, 1200, 'image', BlockNodeType.block)
    ;(source as any).doc.objectSizing = {
      resolve: () => ({
        width: 600,
        height: 400,
        wr: 75,
        ar: 1.5,
        source: 'ratio',
        exact: true,
      }),
    }

    const [image] = source.measure({
      contentHeight: 900,
      contentWidth: 800,
      widowOrphanLines: 2,
    })

    expect(image?.naturalHeight).toBe(408)
    expect(image?.height).toBe(408)
    expect(image?.fitScale).toBeUndefined()
  })

  it('does not feed a fitted auto-width host back into the next image fit', () => {
    source = createSource(1200, 1200, 'image', BlockNodeType.block)
    Object.defineProperty(host, 'offsetWidth', {configurable: true, value: 650})
    Object.defineProperty(host, 'scrollWidth', {configurable: true, value: 650})

    const [initial] = source.measure({
      contentHeight: 900,
      contentWidth: 650,
      widowOrphanLines: 2,
    })
    mediaSurface!.setAttribute('data-bc-page-media-fitted', '')
    mediaSurface!.style.maxWidth = '483.1666666667px'
    mediaSurface!.style.maxHeight = '892px'

    const [next] = source.measure({
      contentHeight: 900,
      contentWidth: 650,
      widowOrphanLines: 2,
    })

    expect(next?.fitScale).toBeCloseTo(initial!.fitScale!, 6)
  })

  it('ignores the trailing block-gap caret when deciding whether a void block is too wide', () => {
    source = createSource(185, 185, 'kr-list', BlockNodeType.void)
    host.style.marginBottom = '10px'
    const trailingGap = document.createElement('span')
    trailingGap.setAttribute('data-block-zero-space', 'true')
    trailingGap.setAttribute('data-block-gap-side', 'after')
    host.appendChild(trailingGap)
    Object.defineProperty(host, 'offsetWidth', {configurable: true, value: 650})
    Object.defineProperty(host, 'scrollWidth', {
      configurable: true,
      get: () => trailingGap.style.display === 'none' ? 650 : 652,
    })

    const [measurement] = source.measure({
      contentHeight: 900,
      contentWidth: 649.7007874015749,
      widowOrphanLines: 2,
    })

    expect(measurement?.naturalHeight).toBe(195)
    expect(measurement?.height).toBe(195)
    expect(measurement?.fitScale).toBeUndefined()
    expect(trailingGap.style.display).toBe('')
  })

  it('does not fit a wide non-media atomic block', () => {
    source = createSource(185, 185, 'wide-embed', BlockNodeType.void)
    host.style.marginBottom = '10px'
    Object.defineProperty(host, 'offsetWidth', {configurable: true, value: 652})
    Object.defineProperty(host, 'scrollWidth', {configurable: true, value: 652})
    const options = {
      contentHeight: 900,
      contentWidth: 649.7007874015749,
      widowOrphanLines: 2,
    }

    const [initial] = source.measure(options)
    const [next] = source.measure(options)

    expect(initial?.naturalHeight).toBe(195)
    expect(next?.naturalHeight).toBe(195)
    expect(initial?.fitScale).toBeUndefined()
    expect(next?.fitScale).toBeUndefined()
    expect(initial?.height).toBe(195)
    expect(next?.height).toBe(195)
  })

  it('measures the natural width when a virtualized image reattaches already fitted', () => {
    source = createSource(1200, 1200, 'image', BlockNodeType.block)
    mediaSurface!.setAttribute('data-bc-page-media-fitted', '')
    mediaSurface!.style.maxWidth = '650px'
    mediaSurface!.style.maxHeight = '892px'
    Object.defineProperty(mediaSurface!, 'offsetWidth', {
      configurable: true,
      get: () => mediaSurface!.hasAttribute('data-bc-page-media-fitted') ? 650 : 900,
    })
    Object.defineProperty(mediaSurface!, 'scrollWidth', {
      configurable: true,
      get: () => mediaSurface!.hasAttribute('data-bc-page-media-fitted') ? 650 : 900,
    })

    const [measurement] = source.measure({
      contentHeight: 900,
      contentWidth: 650,
      widowOrphanLines: 2,
    })

    expect(measurement?.fitScale).toBeCloseTo(650 / 900, 6)
    expect(mediaSurface!.hasAttribute('data-bc-page-media-fitted')).toBeTrue()
  })

  it('never fits an absolute image, shape, or placement plane', () => {
    source = createSource(1200, 1200, 'image', BlockNodeType.block)
    host.setAttribute('data-bc-placement', 'absolute')

    const [absoluteImage] = source.measure({
      contentHeight: 900,
      contentWidth: 650,
      widowOrphanLines: 2,
    })
    expect(absoluteImage?.fitScale).toBeUndefined()
    expect(absoluteImage?.lockHeight).toBe(900)

    source.destroy()
    host.remove()
    source = createSource(300, 300, 'shape', BlockNodeType.void)
    Object.defineProperty(host, 'offsetWidth', {configurable: true, value: 900})
    Object.defineProperty(host, 'scrollWidth', {configurable: true, value: 900})
    const [shape] = source.measure({
      contentHeight: 900,
      contentWidth: 650,
      widowOrphanLines: 2,
    })
    expect(shape?.fitScale).toBeUndefined()
    expect(shape?.height).toBe(308)

    source.destroy()
    host.remove()
    source = createSource(0, 0, 'placement-layout', BlockNodeType.block)
    Object.defineProperty(host, 'offsetWidth', {configurable: true, value: 794})
    Object.defineProperty(host, 'scrollWidth', {configurable: true, value: 794})
    const [placement] = source.measure({
      contentHeight: 900,
      contentWidth: 650,
      widowOrphanLines: 2,
    })
    expect(placement?.fitScale).toBeUndefined()
    expect(placement?.height).toBe(8)
  })

  it('filters the ResizeObserver echo of a pagination-owned table projection', () => {
    source = createSource(500, 500, 'table', BlockNodeType.block, {
      naturalHeight: 500,
      headerHeight: 0,
      rows: [{id: 'row-1', top: 0, bottom: 500, coveredFromAbove: false}],
    })
    source.syncObserved()
    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: 640})
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
    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: 640})
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
    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: 640})
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
