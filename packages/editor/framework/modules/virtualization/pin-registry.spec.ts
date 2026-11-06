import {PinRegistry} from './pin-registry'

describe('PinRegistry', () => {
  let pins: PinRegistry

  beforeEach(() => {
    pins = new PinRegistry()
  })

  it('replaces one source without changing other source ownership', () => {
    pins.pin('selection', [1, 2])
    pins.pin('iframe', [2, 8])
    pins.pin('selection', [3])

    expect([...pins.snapshot()]).toEqual([2, 3, 8])
    expect(pins.has(1)).toBeFalse()
    expect(pins.has(2)).toBeTrue()
  })

  it('keeps an overlapping index until its final source releases it', () => {
    pins.pin('selection', [5])
    pins.pin('composition', [5])
    pins.unpin('selection')

    expect(pins.has(5)).toBeTrue()

    pins.unpin('composition')
    expect(pins.has(5)).toBeFalse()
  })

  it('treats an empty pin set as releasing that source', () => {
    pins.pin('selection', [1, 2])
    pins.pin('selection', [])

    expect(pins.size).toBe(0)
  })

  it('normalizes duplicate indices and rejects invalid ones', () => {
    pins.pin('selection', [3, 3, 1])

    expect([...pins.snapshot()]).toEqual([1, 3])
    expect(() => pins.pin('bad', [-1])).toThrowError(RangeError)
    expect(() => pins.pin('bad', [1.5])).toThrowError(RangeError)
  })

  it('returns snapshots that do not change with the registry', () => {
    pins.pin('selection', [1])
    const snapshot = pins.snapshot()

    pins.pin('selection', [2])

    expect([...snapshot]).toEqual([1])
  })

  it('notifies only when the flattened mount set changes', () => {
    let changes = 0
    const unsubscribe = pins.subscribe(() => changes++)

    pins.pin('selection', [1, 2])
    pins.pin('selection', [2, 1])
    pins.pin('iframe', [2])
    pins.unpin('selection')
    pins.unpin('iframe')
    pins.unpin('missing')
    unsubscribe()
    pins.pin('selection', [9])

    expect(changes).toBe(3)
  })

  it('clear releases all sources with one notification', () => {
    pins.pin('selection', [1])
    pins.pin('iframe', [8])
    let changes = 0
    pins.subscribe(() => changes++)

    pins.clear()
    pins.clear()

    expect(pins.size).toBe(0)
    expect(changes).toBe(1)
  })
})
