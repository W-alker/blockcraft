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
})
