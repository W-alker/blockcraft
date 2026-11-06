import * as Y from 'yjs'
import {parseBlockPosition, resolveBlockPosition, storeBlockPosition} from './state'

describe('compact block position', () => {
  it('keeps negative/subpixel coordinates, removes tails and normalizes negative zero', () => {
    expect(storeBlockPosition({x: 123.456789, y: -78.90123})).toBe('123.46 -78.9')
    expect(storeBlockPosition({x: -0.0001, y: 2.4000000000000004})).toBe('0 2.4')
    expect(resolveBlockPosition(' -12.34  56.7 ')).toEqual({x: -12.34, y: 56.7})
    expect(storeBlockPosition(resolveBlockPosition('123.46 -78.9'))).toBe('123.46 -78.9')
  })

  it('fails closed for malformed and retired object values', () => {
    for (const value of [null, {}, {x: 12, y: 34}, ['12', '34'], '12', '12 34 56',
      '12px 34px', 'NaN 1', 'Infinity 1', '1e999 0', '0x10 0', ' '.repeat(129)]) {
      expect(parseBlockPosition(value)).withContext(JSON.stringify(value)).toBeNull()
      expect(resolveBlockPosition(value)).toEqual({x: 0, y: 0})
    }
  })

  it('merges concurrent coordinates atomically and restores the pair on undo/redo', () => {
    const first = new Y.Doc(), second = new Y.Doc()
    const a = first.getMap('props'), b = second.getMap('props')
    a.set('position', '0 0')
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
    const undo = new Y.UndoManager(a)
    first.transact(() => a.set('position', storeBlockPosition({x: 10.126, y: 20.344})))
    second.transact(() => b.set('position', storeBlockPosition({x: -30.126, y: -40.344})))
    const one = Y.encodeStateAsUpdate(first), two = Y.encodeStateAsUpdate(second)
    Y.applyUpdate(first, two)
    Y.applyUpdate(second, one)
    expect(a.get('position')).toBe(b.get('position'))
    expect(['10.13 20.34', '-30.13 -40.34']).toContain(a.get('position') as string)
    undo.stopCapturing()
    const before = a.get('position')
    a.set('position', '1.25 2.5')
    undo.undo()
    expect(a.get('position')).toBe(before)
    undo.redo()
    expect(a.get('position')).toBe('1.25 2.5')
    undo.destroy(); first.destroy(); second.destroy()
  })
})
