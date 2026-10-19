import {getShapeDefinition} from './shape-definitions'
import {normalizeShapeProps, type ShapeKind} from './shape.types'
import {resolveShapeRenderGeometry} from './shape-geometry'

describe('Template decoration shapes', () => {
  let svg: SVGSVGElement
  beforeEach(() => {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
  })
  afterEach(() => svg.remove())
  const kinds: ShapeKind[] = [
    'ribbon-notched', 'ribbon-notched-left', 'ribbon-notched-right',
    'bookmark', 'ticket', 'arch', 'flower-6', 'scalloped-seal',
  ]

  const contains = (path: SVGPathElement, x: number, y: number) =>
    path.isPointInFill(new DOMPoint(x, y))

  it('keeps closed editable contours and text rectangles inside the fill', () => {
    for (const kind of kinds) {
      const definition = getShapeDefinition(kind)
      expect(normalizeShapeProps({shape: kind}).shapeType).toBe(kind)
      const rendered = resolveShapeRenderGeometry(kind, definition)
      const path = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement
      path.setAttribute('d', rendered.paths[0].d)
      svg.appendChild(path)
      const bounds = path.getBBox()
      expect(bounds.x).withContext(kind).toBeGreaterThanOrEqual(-0.01)
      expect(bounds.y).withContext(kind).toBeGreaterThanOrEqual(-0.01)
      expect(bounds.x + bounds.width).withContext(kind).toBeLessThanOrEqual(1000.01)
      expect(bounds.y + bounds.height).withContext(kind).toBeLessThanOrEqual(1000.01)
      expect(contains(path, 500, 500)).withContext(kind).toBeTrue()
      const {top, right, bottom, left} = definition.textInsets
      for (const x of [left * 1000, (1 - right) * 1000]) {
        for (const y of [top * 1000, (1 - bottom) * 1000]) {
          expect(contains(path, x, y)).withContext(`${kind}:text:${x},${y}`).toBeTrue()
        }
      }
    }
  })

  it('cuts inward at ribbon ends without folding the straight top and bottom edges', () => {
    for (const kind of kinds.filter(kind => kind.startsWith('ribbon-notched'))) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      svg.appendChild(path)
      path.setAttribute('d', getShapeDefinition(kind).path)
      expect(contains(path, 500, 1)).withContext(kind).toBeTrue()
      expect(contains(path, 500, 999)).withContext(kind).toBeTrue()
      expect(contains(path, 50, 500)).withContext(kind).toBe(kind === 'ribbon-notched-right')
      expect(contains(path, 950, 500)).withContext(kind).toBe(kind === 'ribbon-notched-left')
    }
  })

  it('keeps ticket and bookmark cutouts empty', () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    svg.appendChild(path)
    path.setAttribute('d', getShapeDefinition('ticket').path)
    expect(contains(path, 50, 500)).toBeFalse()
    expect(contains(path, 950, 500)).toBeFalse()
    expect(contains(path, 50, 100)).toBeTrue()
    path.setAttribute('d', getShapeDefinition('bookmark').path)
    expect(contains(path, 500, 900)).toBeFalse()
    expect(contains(path, 100, 900)).toBeTrue()
  })
})
