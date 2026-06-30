import {BlockSelection} from './blockSelection';
import {IGapSelectionPoint, ISelectionPoint} from './types';

function gap(blockId: string, side: 'before' | 'after'): IGapSelectionPoint {
  return {blockId, type: 'gap', side, block: {} as any}
}

function text(blockId: string, offset: number): ISelectionPoint {
  return {blockId, type: 'text', offset, block: {} as any} as any
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
