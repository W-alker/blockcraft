import {DOMSelectionSurfaceAdapter} from './surface-adapter'

describe('DOMSelectionSurfaceAdapter', () => {
  let root: HTMLElement
  let blockHost: HTMLElement
  let doc: any
  let surface: DOMSelectionSurfaceAdapter

  beforeEach(() => {
    root = document.createElement('div')
    root.contentEditable = 'true'
    root.tabIndex = 0
    blockHost = document.createElement('p')
    blockHost.textContent = 'selection surface'
    root.appendChild(blockHost)
    document.body.appendChild(root)
    doc = {
      root: {hostElement: root},
      getBlockById: (id: string) => {
        if (id !== 'paragraph') throw new Error(`Block not found: ${id}`)
        return {id, hostElement: blockHost}
      },
    }
    surface = new DOMSelectionSurfaceAdapter(doc)
  })

  afterEach(() => {
    surface.clearNativeSelection()
    root.remove()
  })

  it('reads and clears the native selection owned by the editor document', () => {
    const range = surface.createRange()
    range.selectNodeContents(blockHost)
    const selection = surface.getNativeSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(surface.ownsNativeSelection()).toBeTrue()

    surface.clearNativeSelection()
    expect(selection.rangeCount).toBe(0)
  })

  it('rejects a native selection whose endpoints are outside the editor root', () => {
    const outside = document.createElement('div')
    outside.textContent = 'outside'
    document.body.appendChild(outside)
    const range = surface.createRange()
    range.selectNodeContents(outside)
    const selection = surface.getNativeSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(surface.ownsNativeSelection()).toBeFalse()
    outside.remove()
  })

  it('focuses the nearest editing host for a restored block', () => {
    const nestedHost = document.createElement('div')
    nestedHost.contentEditable = 'true'
    nestedHost.tabIndex = 0
    root.replaceChildren(nestedHost)
    nestedHost.appendChild(blockHost)

    surface.focusEditingHost('paragraph')

    expect(document.activeElement).toBe(nestedHost)
    expect(surface.hasEditorFocus()).toBeTrue()
  })

  it('falls back to the root while a restored block is not mounted', () => {
    surface.focusEditingHost('missing')

    expect(document.activeElement).toBe(root)
  })

  it('preserves nested scroll positions when native focus ignores preventScroll', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    outer.style.cssText = 'position:fixed;top:0;left:0;width:100px;height:100px;overflow:auto'
    inner.style.cssText = 'width:300px;height:300px;overflow:auto'
    root.style.cssText = 'width:900px;height:900px'
    document.body.appendChild(outer)
    outer.appendChild(inner)
    inner.appendChild(root)
    outer.scrollTop = 30
    outer.scrollLeft = 20
    inner.scrollTop = 60
    inner.scrollLeft = 40
    const range = surface.createRange()
    range.selectNodeContents(blockHost)
    surface.getNativeSelection()!.addRange(range)
    root.blur()
    const focus = spyOn(root, 'focus').and.callFake(() => {
      outer.scrollTop = 190
      outer.scrollLeft = 180
      inner.scrollTop = 580
      inner.scrollLeft = 570
    })

    try {
      surface.focusRoot()

      expect(focus).toHaveBeenCalledOnceWith({preventScroll: true})
      expect([outer.scrollLeft, outer.scrollTop, inner.scrollLeft, inner.scrollTop])
        .toEqual([20, 30, 40, 60])
      expect(surface.getNativeSelection()!.getRangeAt(0)).toBe(range)
    } finally {
      outer.remove()
    }
  })

  it('does not write scroll positions when native focus already preserves them', () => {
    root.blur()
    const top = spyOnProperty(root, 'scrollTop', 'set').and.callThrough()
    const left = spyOnProperty(root, 'scrollLeft', 'set').and.callThrough()
    spyOn(root, 'focus')

    surface.focusRoot()

    expect(top).not.toHaveBeenCalled()
    expect(left).not.toHaveBeenCalled()
  })

  it('does not refocus or measure ancestors while the root already has focus', () => {
    root.focus({preventScroll: true})
    const focus = spyOn(root, 'focus')
    const scroll = spyOnProperty(root, 'scrollTop', 'get').and.callThrough()

    surface.focusRoot()

    expect(focus).not.toHaveBeenCalled()
    expect(scroll).not.toHaveBeenCalled()
  })
})
