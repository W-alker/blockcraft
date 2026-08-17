import {
  formatOrderedMarker,
  getNumberPrefix,
  isOrderedMarkerStyleId,
  ORDERED_MARKER_STYLES,
  resolveOrderedMarker,
  resolveOrderedMarkerDigitScale,
} from './get-number-prefix'

describe('ordered marker formatting', () => {
  it('preserves the historical depth cycle when no style is stored', () => {
    expect(getNumberPrefix(0, 0)).toBe('1')
    expect(getNumberPrefix(1, 1)).toBe('b')
    expect(getNumberPrefix(2, 2)).toBe('III')
    expect(resolveOrderedMarker(2, 2, null)).toEqual({text: 'III.', enclosure: null})
    expect(resolveOrderedMarker(1, 1, 'unknown' as any)).toEqual({text: 'b.', enclosure: null})
  })

  it('exposes twelve stable, unique presets', () => {
    const ids = ORDERED_MARKER_STYLES.map(style => style.id)
    expect(ids).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'a1', 'a2', 'r1', 'r2', 'c1', 'c2', 'o1'])
    expect(new Set(ids).size).toBe(12)
    ids.forEach(id => expect(id.length).toBe(2))
    ORDERED_MARKER_STYLES.forEach(style => expect(isOrderedMarkerStyleId(style.id)).toBeTrue())
  })

  it('formats Arabic punctuation and leading-zero presets', () => {
    expect(formatOrderedMarker(0, 'n1')).toBe('1.')
    expect(formatOrderedMarker(9, 'n2')).toBe('10)')
    expect(formatOrderedMarker(19, 'n3')).toBe('(20)')
    expect(formatOrderedMarker(20, 'n4')).toBe('21、')
    expect(formatOrderedMarker(0, 'n5')).toBe('01.')
    expect(formatOrderedMarker(99, 'n5')).toBe('100.')
  })

  it('formats alphabetic, Roman, and Chinese presets', () => {
    expect(formatOrderedMarker(26, 'a1')).toBe('aa.')
    expect(formatOrderedMarker(27, 'a2')).toBe('AB.')
    expect(formatOrderedMarker(8, 'r1')).toBe('ix.')
    expect(formatOrderedMarker(19, 'r2')).toBe('XX.')
    expect(formatOrderedMarker(9, 'c1')).toBe('十、')
    expect(formatOrderedMarker(20, 'c1')).toBe('二十一、')
    expect(formatOrderedMarker(100, 'c1')).toBe('一百零一、')
    expect(formatOrderedMarker(19, 'c2')).toBe('贰拾、')
  })

  it('uses a compact CSS enclosure and scales every circled number', () => {
    expect(resolveOrderedMarker(9, 0, 'o1')).toEqual({
      text: '10',
      enclosure: 'circle',
    })
    expect(resolveOrderedMarkerDigitScale('1', 'circle')).toBe('0.72em')
    expect(resolveOrderedMarkerDigitScale('10', 'circle')).toBe('0.62em')
    expect(resolveOrderedMarkerDigitScale('100', 'circle')).toBe('0.5em')
    expect(resolveOrderedMarkerDigitScale('100', null)).toBeNull()
  })
})
