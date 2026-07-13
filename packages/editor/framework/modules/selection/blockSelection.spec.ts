import {BlockSelection} from './blockSelection';
import {IBoundarySelectionPoint, IGapSelectionPoint, ISelectionPoint, ITableCellSelectionPoint} from './types';

function gap(blockId: string, side: 'before' | 'after'): IGapSelectionPoint {
  return {blockId, type: 'gap', side, block: {} as any}
}

function text(blockId: string, offset: number): ISelectionPoint {
  return {blockId, type: 'text', offset, block: {} as any} as any
}

function selected(blockId: string): ISelectionPoint {
  return {blockId, type: 'selected', block: {} as any} as any
}

function boundary(blockId: string, index: number, block: any): IBoundarySelectionPoint {
  return {blockId, type: 'boundary', index, block} as any
}

function tableCell(blockId: string, tableId = 'table-1'): ITableCellSelectionPoint {
  return {blockId, type: 'table-cell', tableId, block: {} as any}
}

function makeSelection(anchor: ISelectionPoint, head: ISelectionPoint, commonParent = anchor.blockId) {
  return new BlockSelection(
    anchor,
    head,
    commonParent,
    () => ({} as any),
    () => 0,
  )
}

describe('BlockSelection - gap', () => {
  it('collapsed is true for two gap points with same blockId and side', () => {
    const g = gap('void-1', 'before')
    expect(makeSelection(g, g).collapsed).toBe(true)
  })

  it('collapsed is false for two gap points with different sides', () => {
    const sel = makeSelection(gap('void-1', 'before'), gap('void-1', 'after'))
    expect(sel.collapsed).toBe(false)
  })

  it('isStartOfBlock is true for gap-before', () => {
    const g = gap('void-1', 'before')
    expect(makeSelection(g, g).isStartOfBlock).toBe(true)
  })

  it('isStartOfBlock is false for gap-after', () => {
    const g = gap('void-1', 'after')
    expect(makeSelection(g, g).isStartOfBlock).toBe(false)
  })

  it('isEndOfBlock is true for gap-after', () => {
    const g = gap('void-1', 'after')
    expect(makeSelection(g, g).isEndOfBlock).toBe(true)
  })

  it('isEndOfBlock is false for gap-before', () => {
    const g = gap('void-1', 'before')
    expect(makeSelection(g, g).isEndOfBlock).toBe(false)
  })

  it('contains returns true for the gap selection block, false otherwise', () => {
    const g = gap('void-1', 'before')
    const sel = makeSelection(g, g)
    expect(sel.contains('void-1')).toBe(true)
    expect(sel.contains('void-2')).toBe(false)
  })

  it('contains treats a gap selection as whole-block: any offset is contained', () => {
    const g = gap('void-1', 'before')
    const sel = makeSelection(g, g)
    // gap has no meaningful offset → the whole block is "contained"
    expect(sel.contains('void-1', 5)).toBe(true)
    expect(sel.contains('void-1', 0)).toBe(true)
    expect(sel.contains('other-id', 5)).toBe(false)
  })

  it('toSelectionJSON serializes a gap point with side and no offset', () => {
    const g = gap('void-1', 'before')
    const json = makeSelection(g, g).toSelectionJSON()
    expect(json.anchor.blockId).toBe('void-1')
    expect(json.anchor.type).toBe('gap')
    expect(json.anchor.side).toBe('before')
    expect(json.anchor.offset).toBeUndefined()
  })

  it('toLegacyJSON converts gap to a collapsed selected fallback', () => {
    const g = gap('void-1', 'before')
    const legacy = makeSelection(g, g).toLegacyJSON()
    expect(legacy.from.type).toBe('selected')
    expect(legacy.from.blockId).toBe('void-1')
    expect(legacy.to).toBeNull()
    expect(legacy.collapsed).toBe(true)
  })
})

describe('BlockSelection - selected', () => {
  it('serializes selected points without text-only offset fields', () => {
    const json = makeSelection(selected('callout-1'), selected('callout-1')).toSelectionJSON()

    expect(json.anchor).toEqual({blockId: 'callout-1', type: 'selected'})
    expect(json.head).toEqual({blockId: 'callout-1', type: 'selected'})
    expect(json.anchor.offset).toBeUndefined()
    expect(json.head.offset).toBeUndefined()
  })

  it('treats selected endpoints as a whole-block selection', () => {
    const sel = makeSelection(selected('callout-1'), selected('callout-1'))

    expect(sel.isAllSelected).toBeTrue()
    expect(sel.isStartOfBlock).toBeTrue()
    expect(sel.isEndOfBlock).toBeTrue()
    expect(sel.contains('callout-1', 8)).toBeTrue()
  })
})

describe('BlockSelection - table-cell', () => {
  it('collapsed is true only for the same table cell', () => {
    const cell = tableCell('cell-1')
    expect(makeSelection(cell, cell, 'table-1').collapsed).toBeTrue()
    expect(makeSelection(tableCell('cell-1'), tableCell('cell-2'), 'table-1').collapsed).toBeFalse()
  })

  it('does not treat a multi-cell rectangle as same block', () => {
    const sel = makeSelection(tableCell('cell-1'), tableCell('cell-2'), 'table-1')

    expect(sel.isInSameBlock).toBeFalse()
    expect(sel.isStartOfBlock).toBeTrue()
    expect(sel.isEndOfBlock).toBeTrue()
  })

  it('exposes table id and anchor/head cell ids', () => {
    const sel = makeSelection(tableCell('cell-1'), tableCell('cell-4'), 'table-1')

    expect(sel.getTableCellSelection()).toEqual({
      tableId: 'table-1',
      anchorCellId: 'cell-1',
      headCellId: 'cell-4',
    })
  })

  it('serializes table-cell points with tableId', () => {
    const json = makeSelection(tableCell('cell-1'), tableCell('cell-4'), 'table-1').toSelectionJSON()

    expect(json.anchor).toEqual({blockId: 'cell-1', type: 'table-cell', tableId: 'table-1'})
    expect(json.head).toEqual({blockId: 'cell-4', type: 'table-cell', tableId: 'table-1'})
  })

  it('degrades table-cell selection to selected endpoints in legacy JSON', () => {
    const legacy = makeSelection(tableCell('cell-1'), tableCell('cell-4'), 'table-1').toLegacyJSON()

    expect(legacy.collapsed).toBeFalse()
    expect(legacy.from).toEqual({blockId: 'cell-1', type: 'selected'})
    expect(legacy.to).toEqual({blockId: 'cell-4', type: 'selected'})
  })
})

describe('BlockSelection - boundary', () => {
  function makeBoundarySelection(anchorIndex: number, headIndex: number) {
    const p1 = {id: 'p1', parentId: 'callout-1', getIndexOfParent: () => 0} as any
    const p2 = {id: 'p2', parentId: 'callout-1', getIndexOfParent: () => 1} as any
    const callout = {
      id: 'callout-1',
      parentId: 'root',
      childrenLength: 2,
      childrenIds: ['p1', 'p2'],
    } as any
    const blocks: Record<string, any> = {'callout-1': callout, p1, p2}
    const anchor = boundary('callout-1', anchorIndex, callout)
    const head = boundary('callout-1', headIndex, callout)
    return new BlockSelection(
      anchor,
      head,
      'callout-1',
      id => blocks[id],
      () => 0,
    )
  }

  it('collapsed is true only when boundary indexes match', () => {
    expect(makeBoundarySelection(1, 1).collapsed).toBeTrue()
    expect(makeBoundarySelection(0, 2).collapsed).toBeFalse()
  })

  it('same container boundary range is not treated as same block when indexes differ', () => {
    expect(makeBoundarySelection(0, 2).isInSameBlock).toBeFalse()
  })

  it('returns selected child ids between boundary indexes', () => {
    expect(makeBoundarySelection(0, 2).getBoundarySelectedChildIds()).toEqual(['p1', 'p2'])
    expect(makeBoundarySelection(1, 2).getBoundarySelectedChildIds()).toEqual(['p2'])
  })

  it('keeps anchor/head intent while ordering a reversed boundary range', () => {
    const sel = makeBoundarySelection(2, 0)

    expect(sel.direction).toBe('backward')
    expect(sel.anchor.type).toBe('boundary')
    expect(sel.head.type).toBe('boundary')
    if (sel.anchor.type === 'boundary' && sel.head.type === 'boundary') {
      expect(sel.anchor.index).toBe(2)
      expect(sel.head.index).toBe(0)
    }
    expect(sel.start.type).toBe('boundary')
    expect(sel.end.type).toBe('boundary')
    if (sel.start.type === 'boundary' && sel.end.type === 'boundary') {
      expect(sel.start.index).toBe(0)
      expect(sel.end.index).toBe(2)
    }
  })

  it('returns selected child ids between reversed boundary indexes', () => {
    const sel = makeBoundarySelection(2, 0)

    expect(sel.getBoundarySelectedChildIds()).toEqual(['p1', 'p2'])
    expect(sel.contains('p1')).toBeTrue()
    expect(sel.contains('p2')).toBeTrue()
  })

  it('serializes boundary indexes', () => {
    const json = makeBoundarySelection(0, 2).toSelectionJSON()

    expect(json.anchor).toEqual({blockId: 'callout-1', type: 'boundary', index: 0})
    expect(json.head).toEqual({blockId: 'callout-1', type: 'boundary', index: 2})
  })

  it('serializes reversed boundary indexes without normalizing anchor/head', () => {
    const json = makeBoundarySelection(2, 0).toSelectionJSON()

    expect(json.anchor).toEqual({blockId: 'callout-1', type: 'boundary', index: 2})
    expect(json.head).toEqual({blockId: 'callout-1', type: 'boundary', index: 0})
  })

  it('orders mixed text and boundary endpoints by the direct child index', () => {
    const root = {
      id: 'root',
      parentId: null,
      childrenLength: 3,
      childrenIds: ['p0', 'callout-1', 'p1'],
    } as any
    const p0 = {id: 'p0', parentId: 'root', parentBlock: root, getIndexOfParent: () => 0} as any
    const callout = {id: 'callout-1', parentId: 'root', parentBlock: root, getIndexOfParent: () => 1} as any
    const p1 = {id: 'p1', parentId: 'root', parentBlock: root, getIndexOfParent: () => 2} as any
    const blocks: Record<string, any> = {root, p0, 'callout-1': callout, p1}
    const afterCalloutToP1 = new BlockSelection(
      {blockId: 'p1', type: 'text', offset: 3, block: p1} as any,
      boundary('root', 1, root),
      'root',
      id => blocks[id],
      () => 0,
    )
    const p0ToAfterCallout = new BlockSelection(
      {blockId: 'p0', type: 'text', offset: 1, block: p0} as any,
      boundary('root', 2, root),
      'root',
      id => blocks[id],
      () => 0,
    )

    expect(afterCalloutToP1.direction).toBe('backward')
    expect(afterCalloutToP1.start).toBe(afterCalloutToP1.head)
    expect(afterCalloutToP1.end).toBe(afterCalloutToP1.anchor)
    expect(p0ToAfterCallout.direction).toBe('forward')
    expect(p0ToAfterCallout.start).toBe(p0ToAfterCallout.anchor)
    expect(p0ToAfterCallout.end).toBe(p0ToAfterCallout.head)
  })

  it('degrades non-collapsed boundary ranges to selected endpoints in legacy JSON', () => {
    const legacy = makeBoundarySelection(0, 2).toLegacyJSON()

    expect(legacy.collapsed).toBeFalse()
    expect(legacy.from).toEqual({blockId: 'callout-1', type: 'selected'})
    expect(legacy.to).toEqual({blockId: 'callout-1', type: 'selected'})
  })
})
