import {DocumentLayoutMetricsManager} from './document-layout-metrics.manager'

describe('DocumentLayoutMetricsManager', () => {
  let element: HTMLElement

  beforeEach(() => {
    element = document.createElement('div')
    element.style.fontSize = '20px'
    element.style.lineHeight = '30px'
    document.body.appendChild(element)
  })

  afterEach(() => element.remove())

  it('reads computed font size and line height once during init', () => {
    const manager = new DocumentLayoutMetricsManager()
    manager.init(element)

    expect(manager.value).toEqual({baseFontSize: 20, lineHeight: 30})
    manager.destroy()
  })

  it('uses configured metrics and writes matching root CSS variables', () => {
    const manager = new DocumentLayoutMetricsManager({
      baseFontSize: 24,
      lineHeight: 36,
    })
    manager.init(element)

    expect(manager.value).toEqual({baseFontSize: 24, lineHeight: 36})
    expect(element.style.getPropertyValue('--bc-fs')).toBe('24px')
    expect(element.style.getPropertyValue('--bc-lh')).toBe('1.5')
    manager.destroy()
  })

  it('publishes explicit runtime updates and can refresh external CSS', () => {
    const manager = new DocumentLayoutMetricsManager()
    const changes = jasmine.createSpy('changes')
    manager.change$.subscribe(changes)
    manager.init(element)
    changes.calls.reset()

    manager.update({baseFontSize: 32, lineHeight: 40})
    expect(manager.value).toEqual({baseFontSize: 32, lineHeight: 40})
    expect(changes).toHaveBeenCalledOnceWith({
      baseFontSize: 32,
      lineHeight: 40,
    })

    element.style.removeProperty('--bc-fs')
    element.style.removeProperty('--bc-lh')
    element.style.fontSize = '18px'
    element.style.lineHeight = '27px'
    manager.refresh()
    expect(manager.value).toEqual({baseFontSize: 18, lineHeight: 27})
    expect(changes).toHaveBeenCalledTimes(2)
    manager.destroy()
  })

  it('rejects invalid explicit metrics', () => {
    const manager = new DocumentLayoutMetricsManager()
    manager.init(element)

    expect(() => manager.update({baseFontSize: 0})).toThrowError(RangeError)
    expect(() => manager.update({lineHeight: Number.NaN})).toThrowError(RangeError)
    manager.destroy()
  })
})
