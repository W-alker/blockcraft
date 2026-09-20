import {DocumentViewScaleManager} from './document-view-scale.manager'

describe('DocumentViewScaleManager', () => {
  it('owns and restores the attached surface zoom without touching document data', () => {
    const surface = document.createElement('section')
    surface.style.setProperty('zoom', '0.9')
    surface.setAttribute('data-bc-view-scale', 'legacy')
    Object.defineProperty(surface, 'offsetWidth', {value: 400})
    spyOn(surface, 'getBoundingClientRect').and.callFake(() => ({
      width: 400 * Number(surface.style.getPropertyValue('zoom')),
      height: 200,
    } as DOMRect))
    const manager = new DocumentViewScaleManager()

    const detach = manager.attach(surface)
    manager.setScale(1.5)

    expect(surface.style.getPropertyValue('zoom')).toBe('1.5')
    expect(surface.getAttribute('data-bc-view-scale')).toBe('1.5')
    expect(manager.geometryScale).toBe(1.5)
    expect(manager.visualToLayout(150)).toBe(100)

    detach()
    expect(surface.style.getPropertyValue('zoom')).toBe('0.9')
    expect(surface.getAttribute('data-bc-view-scale')).toBe('legacy')
    manager.destroy()
  })

  it('handles Ctrl/Cmd + wheel only inside an explicitly enabled surface', () => {
    const surface = document.createElement('section')
    const manager = new DocumentViewScaleManager()
    manager.attach(surface, {wheel: true})

    const wheel = new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -10,
      cancelable: true,
    })
    surface.dispatchEvent(wheel)

    expect(wheel.defaultPrevented).toBeTrue()
    expect(manager.value).toBe(1.1)
    expect(manager.change$.value).toEqual({scale: 1.1, source: 'wheel'})

    const ordinaryWheel = new WheelEvent('wheel', {deltaY: 10, cancelable: true})
    surface.dispatchEvent(ordinaryWheel)
    expect(ordinaryWheel.defaultPrevented).toBeFalse()
    expect(manager.value).toBe(1.1)
    manager.destroy()
  })

  it('clamps all public writes to the supported 50%–200% range', () => {
    const manager = new DocumentViewScaleManager()
    expect(manager.setScale(99)).toBe(2)
    expect(manager.setScale(-1)).toBe(0.5)
    expect(manager.setScale(Number.NaN)).toBe(1)
    manager.destroy()
  })
})
