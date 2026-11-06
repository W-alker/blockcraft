import {caretRangeFromPoint} from './caret-from-point'

/**
 * The helper feature-detects two browser APIs on the global `document`:
 *   - `caretRangeFromPoint` (Chrome / Safari)  → returns a Range directly
 *   - `caretPositionFromPoint` (Firefox)       → returns a CaretPosition we adapt
 * Karma runs in ChromeHeadless, where `caretRangeFromPoint` exists. To exercise
 * each branch deterministically we override the own-properties on `document`
 * for the duration of a test and restore them afterwards.
 */
describe('caretRangeFromPoint (feature detection)', () => {
  const docAny = document as any
  let savedRange: PropertyDescriptor | undefined
  let savedPosition: PropertyDescriptor | undefined

  beforeEach(() => {
    savedRange = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint')
    savedPosition = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint')
  })

  afterEach(() => {
    // Restore original own-property descriptors (or remove the override so the
    // real prototype method shows through again).
    if (savedRange) Object.defineProperty(document, 'caretRangeFromPoint', savedRange)
    else delete docAny.caretRangeFromPoint
    if (savedPosition) Object.defineProperty(document, 'caretPositionFromPoint', savedPosition)
    else delete docAny.caretPositionFromPoint
  })

  // In ChromeHeadless the real methods live on Document.prototype, so a plain
  // `delete` won't hide them. Define an own-property `value: undefined` to shadow
  // the prototype and make feature detection (`typeof === 'function'`) see it as
  // absent. A real function is defined directly to exercise the success path.
  function stub(name: string, fn: ((x: number, y: number) => any) | undefined) {
    Object.defineProperty(document, name, {value: fn, configurable: true, writable: true})
  }

  it('uses caretRangeFromPoint when available (Chrome/Safari path)', () => {
    const fakeRange = document.createRange()
    const spy = jasmine.createSpy('caretRangeFromPoint').and.returnValue(fakeRange)
    stub('caretRangeFromPoint', spy)
    stub('caretPositionFromPoint', undefined)

    const result = caretRangeFromPoint(42, 7)

    expect(spy).toHaveBeenCalledWith(42, 7)
    expect(result).toBe(fakeRange)
  })

  it('returns null (not throwing) when caretRangeFromPoint throws', () => {
    stub('caretRangeFromPoint', () => {
      throw new Error('boom')
    })
    stub('caretPositionFromPoint', undefined)

    expect(caretRangeFromPoint(1, 1)).toBeNull()
  })

  it('falls back to caretPositionFromPoint (Firefox path) and adapts to a collapsed Range', () => {
    const host = document.createElement('div')
    const textNode = document.createTextNode('hello world')
    host.appendChild(textNode)
    document.body.appendChild(host)

    stub('caretRangeFromPoint', undefined) // simulate Firefox: no caretRangeFromPoint
    stub('caretPositionFromPoint', () => ({offsetNode: textNode, offset: 5}))

    const result = caretRangeFromPoint(10, 10)

    expect(result).not.toBeNull()
    expect(result!.collapsed).toBe(true)
    expect(result!.startContainer).toBe(textNode)
    expect(result!.startOffset).toBe(5)

    document.body.removeChild(host)
  })

  it('returns null from the Firefox fallback when the position has no offsetNode', () => {
    stub('caretRangeFromPoint', undefined)
    stub('caretPositionFromPoint', () => null)

    expect(caretRangeFromPoint(10, 10)).toBeNull()
  })

  it('returns null when neither API is available', () => {
    stub('caretRangeFromPoint', undefined)
    stub('caretPositionFromPoint', undefined)

    expect(caretRangeFromPoint(10, 10)).toBeNull()
  })
})
