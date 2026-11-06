/** Internal DOM geometry for revealing a selection through nested editing viewports. */
export function selectionScrollViewports(head: HTMLElement | undefined, boundary: HTMLElement): HTMLElement[] {
  if (!head || !boundary.contains(head)) return []
  const viewports: HTMLElement[] = []
  for (let element: HTMLElement | null = head; element && element !== boundary; element = element.parentElement) {
    const owner = element.ownerDocument.defaultView
    if (!owner || !(element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)) continue
    const style = owner.getComputedStyle(element)
    // A decorative hidden/clip wrapper is not an editing viewport. Hidden
    // contenteditable hosts, however, retain programmatic caret scrolling.
    const editable = element.getAttribute('contenteditable') === 'true'
    if (canScroll(style.overflowX, editable) || canScroll(style.overflowY, editable)) viewports.push(element)
  }
  return viewports
}

function canScroll(overflow: string, editable: boolean): boolean {
  return overflow === 'auto' || overflow === 'scroll' || (editable && overflow === 'hidden')
}

interface ViewportGeometry {
  element: HTMLElement
  matrix: DOMMatrix
  origin: DOMPoint
  left: number
  top: number
  right: number
  bottom: number
  x: boolean
  y: boolean
}

function readViewport(element: HTMLElement): ViewportGeometry | null {
  const owner = element.ownerDocument.defaultView
  if (!owner || !element.offsetWidth || !element.offsetHeight) return null
  // Scroll offsets are layout pixels; caret rectangles are visual pixels.
  // Include the frame rotation and document CSS zoom before converting axes.
  let matrix = new DOMMatrix()
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = owner.getComputedStyle(ancestor)
    const transform = new DOMMatrix(style.transform === 'none' ? undefined : style.transform)
    const zoom = Number.parseFloat(style.zoom) || 1
    matrix = transform.scale(zoom).multiply(matrix)
  }
  if (!matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 0.00001) return null
  matrix.e = matrix.f = 0
  const rect = element.getBoundingClientRect()
  const xs = [0, matrix.a * element.offsetWidth, matrix.c * element.offsetHeight]
  const ys = [0, matrix.b * element.offsetWidth, matrix.d * element.offsetHeight]
  xs.push(xs[1] + xs[2])
  ys.push(ys[1] + ys[2])
  const style = owner.getComputedStyle(element)
  const editable = element.getAttribute('contenteditable') === 'true'
  return {
    element, matrix,
    origin: new DOMPoint(rect.left - Math.min(...xs), rect.top - Math.min(...ys)),
    left: element.clientLeft, top: element.clientTop,
    right: element.clientLeft + element.clientWidth,
    bottom: element.clientTop + element.clientHeight,
    x: canScroll(style.overflowX, editable), y: canScroll(style.overflowY, editable),
  }
}

function localRect(rect: DOMRect, viewport: ViewportGeometry): DOMRect {
  const inverse = viewport.matrix.inverse()
  const points = [[rect.left, rect.top], [rect.right, rect.top],
    [rect.left, rect.bottom], [rect.right, rect.bottom]]
    .map(([x, y]) => new DOMPoint(x - viewport.origin.x, y - viewport.origin.y).matrixTransform(inverse))
  const left = Math.min(...points.map(point => point.x))
  const top = Math.min(...points.map(point => point.y))
  return new DOMRect(left, top, Math.max(...points.map(point => point.x)) - left,
    Math.max(...points.map(point => point.y)) - top)
}

function nearestDelta(start: number, end: number, low: number, high: number): number {
  // An oversized selection that already spans the viewport cannot fit better.
  if (start < low && end > high) return 0
  if (start < low - 0.5) return start - low
  if (end > high + 0.5) return end - high
  return 0
}

export function revealInSelectionViewports(rect: DOMRect, elements: HTMLElement[]): DOMRect {
  // Read geometry first; scrolling an inner viewport moves the caret in all
  // outer ones by its actual (browser-clamped) displacement. No focus/Range
  // writes, DOM markers, animation or selectionchange feedback are needed.
  const viewports = elements.map(readViewport).filter((value): value is ViewportGeometry => !!value)
  let current = rect
  for (const viewport of viewports) {
    const local = localRect(current, viewport)
    const dx = viewport.x ? nearestDelta(local.left, local.right, viewport.left, viewport.right) : 0
    const dy = viewport.y ? nearestDelta(local.top, local.bottom, viewport.top, viewport.bottom) : 0
    if (!dx && !dy) continue
    const element = viewport.element
    const left = element.scrollLeft
    const top = element.scrollTop
    if (dx) element.scrollLeft += dx
    if (dy) element.scrollTop += dy
    const moved = new DOMPoint(element.scrollLeft - left, element.scrollTop - top).matrixTransform(viewport.matrix)
    current = new DOMRect(current.x - moved.x, current.y - moved.y, current.width, current.height)
  }
  return current
}

export function isVisibleInSelectionViewports(rect: DOMRect, elements: HTMLElement[]): boolean {
  return elements.every(element => {
    const viewport = readViewport(element)
    if (!viewport) return true
    const local = localRect(rect, viewport)
    return (!viewport.x || (!nearestDelta(local.left, local.right, viewport.left, viewport.right))) &&
      (!viewport.y || (!nearestDelta(local.top, local.bottom, viewport.top, viewport.bottom)))
  })
}
