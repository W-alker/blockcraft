export type HeightMeasurement = readonly [blockId: string, height: number]
export type ResizeObserverFactory = (callback: ResizeObserverCallback) => ResizeObserver

const HEIGHT_MEASUREMENT_EPSILON = 0.5

export class HeightObserver {
  private readonly observer: ResizeObserver | null
  private readonly elementsById = new Map<string, Element>()
  private readonly idsByElement = new Map<Element, string>()
  // Keep the last reported stride with the Element rather than its transient
  // observed state. A retained host can therefore be unobserved and observed
  // again without replaying the same subpixel geometry.
  private readonly lastLayoutStrideByElement = new WeakMap<Element, number>()

  constructor(
    private readonly onMeasurements: (measurements: HeightMeasurement[]) => void,
    factory: ResizeObserverFactory = (callback) => new ResizeObserver(callback),
    private readonly readVisualScale: () => number = () => 1,
  ) {
    this.observer = typeof ResizeObserver === 'undefined' ? null : factory((entries) => this.handleEntries(entries))
  }

  sync(blockIds: readonly string[], resolveHost: (blockId: string) => Element | undefined): void {
    if (!this.observer) return
    const desired = new Set(blockIds)
    this.elementsById.forEach((element, id) => {
      if (desired.has(id)) return
      this.observer!.unobserve(element)
      this.elementsById.delete(id)
      this.idsByElement.delete(element)
    })

    blockIds.forEach((id) => {
      const element = resolveHost(id)
      if (!element || this.elementsById.get(id) === element) return
      const previous = this.elementsById.get(id)
      if (previous) {
        this.observer!.unobserve(previous)
        this.idsByElement.delete(previous)
      }
      this.elementsById.set(id, element)
      this.idsByElement.set(element, id)
      this.observer!.observe(element)
    })
  }

  disconnect(): void {
    this.observer?.disconnect()
    this.elementsById.clear()
    this.idsByElement.clear()
  }

  private handleEntries(entries: readonly ResizeObserverEntry[]): void {
    const values = new Map<string, number>()
    const rects = new Map<Element, DOMRect>()
    entries.forEach((entry) => {
      const id = this.idsByElement.get(entry.target)
      if (!id) return
      const borderBox = Array.isArray(entry.borderBoxSize)
        ? entry.borderBoxSize[0]
        : (entry.borderBoxSize as unknown as ResizeObserverSize | undefined)
      const layoutStride = this.getLayoutStride(entry.target, rects)
      const height = layoutStride ?? borderBox?.blockSize ?? entry.contentRect?.height ?? 0
      if (layoutStride === undefined) {
        // A fallback box measurement may differ from the previous sibling
        // stride. Do not let an older stride suppress the next valid one.
        this.lastLayoutStrideByElement.delete(entry.target)
      } else {
        const previous = this.lastLayoutStrideByElement.get(entry.target)
        if (
          previous !== undefined &&
          Math.abs(previous - layoutStride) <= HEIGHT_MEASUREMENT_EPSILON
        ) {
          return
        }
        this.lastLayoutStrideByElement.set(entry.target, layoutStride)
      }
      if (Number.isFinite(height) && height > 0) values.set(id, height)
    })
    if (values.size) this.onMeasurements([...values])
  }

  private getLayoutStride(target: Element, rects: Map<Element, DOMRect>): number | undefined {
    const next = target.nextElementSibling
    if (!next || (!this.idsByElement.has(next) && !next.classList.contains('bc-virtual-spacer'))) {
      return undefined
    }

    const readRect = (element: Element): DOMRect => {
      let rect = rects.get(element)
      if (!rect) {
        rect = element.getBoundingClientRect()
        rects.set(element, rect)
      }
      return rect
    }
    const stride = readRect(next).top - readRect(target).top
    const visualScale = this.readVisualScale()
    const layoutStride = stride / (
      Number.isFinite(visualScale) && visualScale > 0 ? visualScale : 1
    )
    return Number.isFinite(layoutStride) && layoutStride > 0
      ? layoutStride
      : undefined
  }
}
