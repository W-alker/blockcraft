import {isVisibleInSelectionViewports, revealInSelectionViewports, selectionScrollViewports} from './scroll-viewport'

describe('nested selection scroll viewports', () => {
  let boundary: HTMLElement
  let viewport: HTMLElement
  let caret: HTMLElement

  beforeEach(() => {
    boundary = document.createElement('div')
    boundary.style.cssText = 'position:fixed;left:80px;top:80px;width:500px;height:400px;overflow:auto'
    viewport = document.createElement('div')
    viewport.contentEditable = 'true'
    viewport.style.cssText = 'position:relative;width:160px;height:100px;overflow:hidden'
    const spacer = document.createElement('div')
    spacer.style.height = '300px'
    caret = document.createElement('div')
    caret.style.cssText = 'width:1px;height:20px'
    viewport.append(spacer, caret)
    boundary.append(viewport)
    document.body.append(boundary)
  })

  afterEach(() => boundary.remove())

  for (const zoom of [0.75, 1, 1.5]) {
    it(`reveals an overflowing caret at ${zoom} zoom without scrolling its document`, () => {
      boundary.style.zoom = String(zoom)
      const ports = selectionScrollViewports(caret, boundary)
      expect(ports).toEqual([viewport])
      expect(isVisibleInSelectionViewports(caret.getBoundingClientRect(), ports)).toBeFalse()
      const projected = revealInSelectionViewports(caret.getBoundingClientRect(), ports)

      expect(viewport.scrollTop).toBeCloseTo(220, 0)
      expect(boundary.scrollTop).toBe(0)
      expect(caret.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.getBoundingClientRect().bottom + 1)
      expect(projected.bottom).toBeCloseTo(caret.getBoundingClientRect().bottom, 0)
      expect(isVisibleInSelectionViewports(caret.getBoundingClientRect(), ports)).toBeTrue()
      revealInSelectionViewports(caret.getBoundingClientRect(), ports)
      expect(viewport.scrollTop).toBeCloseTo(220, 0)
    })
  }

  it('reveals upward and follows only the active caret rectangle', () => {
    viewport.scrollTop = 220
    const firstLine = viewport.firstElementChild as HTMLElement
    const caretAtStart = new DOMRect(firstLine.getBoundingClientRect().left, firstLine.getBoundingClientRect().top, 1, 20)
    revealInSelectionViewports(caretAtStart, [viewport])
    expect(viewport.scrollTop).toBe(0)
  })

  it('does not turn decorative hidden or clip layers into editing viewports', () => {
    viewport.contentEditable = 'false'
    expect(selectionScrollViewports(caret, boundary)).toEqual([])
    viewport.contentEditable = 'true'
    viewport.style.overflow = 'clip'
    expect(selectionScrollViewports(caret, boundary)).toEqual([])
    viewport.contentEditable = 'false'
    viewport.style.overflow = 'auto'
    expect(selectionScrollViewports(caret, boundary)).toEqual([viewport])
  })

  it('resolves inner scrolling before testing the enclosing viewport', () => {
    const outer = document.createElement('div')
    outer.style.cssText = 'height:150px;overflow:auto'
    viewport.replaceWith(outer)
    outer.append(viewport)
    const padding = document.createElement('div')
    padding.style.height = '300px'
    outer.append(padding)
    const ports = selectionScrollViewports(caret, boundary)
    expect(ports).toEqual([viewport, outer])
    revealInSelectionViewports(caret.getBoundingClientRect(), ports)
    expect(viewport.scrollTop).toBe(220)
    expect(outer.scrollTop).toBe(0)
  })

  it('converts a rotated editing viewport into its local scroll axes', () => {
    viewport.style.transform = 'rotate(90deg)'
    const projected = revealInSelectionViewports(caret.getBoundingClientRect(), [viewport])
    expect(viewport.scrollTop).toBe(220)
    expect(viewport.scrollLeft).toBe(0)
    expect(projected.left).toBeCloseTo(caret.getBoundingClientRect().left, 0)
    expect(isVisibleInSelectionViewports(caret.getBoundingClientRect(), [viewport])).toBeTrue()
  })

  it('reveals a vertical-rl caret using the negative horizontal scroll range', () => {
    viewport.style.writingMode = 'vertical-rl'
    ;(viewport.firstElementChild as HTMLElement).style.cssText = 'width:300px;height:20px'
    caret.style.cssText = 'width:20px;height:1px'
    const ports = selectionScrollViewports(caret, boundary)
    revealInSelectionViewports(caret.getBoundingClientRect(), ports)
    expect(viewport.scrollLeft).toBe(-160)
    expect(viewport.scrollTop).toBe(0)
    expect(caret.getBoundingClientRect().left).toBeGreaterThanOrEqual(viewport.getBoundingClientRect().left)
    expect(isVisibleInSelectionViewports(caret.getBoundingClientRect(), ports)).toBeTrue()
  })
})
