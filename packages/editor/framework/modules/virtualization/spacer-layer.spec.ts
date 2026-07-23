import {HeightMap} from './height-map'
import {SpacerLayer} from './spacer-layer'

describe('SpacerLayer', () => {
  it('renders one inert spacer for every unmounted root-child interval', () => {
    const container = document.createElement('div')
    const hosts = new Map<string, HTMLElement>()
    ;['b', 'c', 'e'].forEach(id => {
      const host = document.createElement('div')
      host.dataset['blockId'] = id
      hosts.set(id, host)
      container.append(host)
    })
    const heights = new HeightMap()
    heights.bulkInit([10, 20, 30, 40, 50])
    const layer = new SpacerLayer(container)

    layer.sync(['a', 'b', 'c', 'd', 'e'], [[1, 2], [4, 4]], heights, (id: string) => hosts.get(id))

    expect(Array.from(container.children).map(element =>
      element.getAttribute('data-block-id') || element.getAttribute('data-bc-virtual-spacer')))
      .toEqual(['0:0', 'b', 'c', '3:3', 'e'])
    const spacers = container.querySelectorAll<HTMLElement>('[data-bc-virtual-spacer]')
    expect(Array.from(spacers).map(spacer => spacer.style.height)).toEqual(['10px', '40px'])
    expect(Array.from(spacers).every(spacer => spacer.contentEditable === 'false')).toBeTrue()
  })

  it('reuses stable spacers instead of mutating DOM on every scroll frame', () => {
    const container = document.createElement('div')
    const host = document.createElement('div')
    host.dataset['blockId'] = 'c'
    container.append(host)
    const heights = new HeightMap()
    heights.bulkInit([10, 20, 30])
    const layer = new SpacerLayer(container)

    layer.sync(['a', 'b', 'c'], [[2, 2]], heights, () => host)
    const firstSpacer = container.firstElementChild
    layer.sync(['a', 'b', 'c'], [[2, 2]], heights, () => host)

    expect(container.querySelectorAll('[data-bc-virtual-spacer]').length).toBe(1)
    expect(container.firstElementChild).toBe(firstSpacer)
    expect((container.firstElementChild as HTMLElement).style.height).toBe('30px')
  })

  it('updates a reused spacer height and removes intervals that left the window', () => {
    const container = document.createElement('div')
    const host = document.createElement('div')
    host.dataset['blockId'] = 'c'
    container.append(host)
    const heights = new HeightMap()
    heights.bulkInit([10, 20, 30])
    const layer = new SpacerLayer(container)

    layer.sync(['a', 'b', 'c'], [[2, 2]], heights, () => host)
    const spacer = container.firstElementChild as HTMLElement
    heights.update(0, 15)
    layer.sync(['a', 'b', 'c'], [[2, 2]], heights, () => host)

    expect(container.firstElementChild).toBe(spacer)
    expect(spacer.style.height).toBe('35px')

    layer.sync(['a', 'b', 'c'], [[0, 2]], heights, () => host)
    expect(container.querySelectorAll('[data-bc-virtual-spacer]').length).toBe(0)
  })

  it('creates spacers in the container owner document', () => {
    const ownerDocument = document.implementation.createHTMLDocument('virtualized editor')
    const container = ownerDocument.createElement('div')
    const createElement = spyOn(ownerDocument, 'createElement').and.callThrough()
    const heights = new HeightMap()
    heights.bulkInit([20, 20])
    const layer = new SpacerLayer(container)

    layer.sync(['a', 'b'], [], heights, () => undefined)

    expect(createElement).toHaveBeenCalledWith('div')
    expect(container.firstElementChild?.ownerDocument).toBe(ownerDocument)
  })
})
