import {HeightMap} from './height-map'
import {VerticalLayoutProjection} from './layout-projection'
import {RenderedSegment} from './types'

export class SpacerLayer {
  readonly #core: SpacerLayerCore<HeightMap>

  constructor(container: HTMLElement) {
    this.#core = new SpacerLayerCore(container, readHeightMapRange)
  }

  sync(
    blockIds: readonly string[],
    segments: readonly RenderedSegment[],
    heights: HeightMap,
    resolveHost: (blockId: string) => HTMLElement | undefined,
  ): void {
    this.#core.sync(blockIds, segments, heights, resolveHost)
  }

  clear(): void {
    this.#core.clear()
  }
}

/** @internal Projection-backed spacer layer for virtualization internals. */
export class ProjectionSpacerLayer {
  readonly #core: SpacerLayerCore<VerticalLayoutProjection>

  constructor(container: HTMLElement) {
    this.#core = new SpacerLayerCore(container, readProjectionRange)
  }

  sync(
    blockIds: readonly string[],
    segments: readonly RenderedSegment[],
    projection: VerticalLayoutProjection,
    resolveHost: (blockId: string) => HTMLElement | undefined,
  ): void {
    this.#core.sync(blockIds, segments, projection, resolveHost)
  }

  clear(): void {
    this.#core.clear()
  }
}

type RangeHeightReader<TLayout> = (
  layout: TLayout,
  start: number,
  end: number,
) => number

function readHeightMapRange(
  heights: HeightMap,
  start: number,
  end: number,
): number {
  return heights.getRangeHeight(start, end)
}

function readProjectionRange(
  projection: VerticalLayoutProjection,
  start: number,
  end: number,
): number {
  return projection.rangeHeight(start, end)
}

class SpacerLayerCore<TLayout> {
  private readonly spacers = new Map<string, HTMLElement>()

  constructor(
    private readonly container: HTMLElement,
    private readonly readRangeHeight: RangeHeightReader<TLayout>,
  ) {}

  sync(
    blockIds: readonly string[],
    segments: readonly RenderedSegment[],
    layout: TLayout,
    resolveHost: (blockId: string) => HTMLElement | undefined,
  ): void {
    if (!blockIds.length) {
      this.clear()
      return
    }

    const desired = new Set<string>()
    let gapStart = 0
    for (const segment of segments) {
      if (gapStart < segment[0]) {
        this.syncSpacer(
          gapStart,
          segment[0] - 1,
          layout,
          desired,
          resolveHost(blockIds[segment[0]]),
        )
      }
      gapStart = segment[1] + 1
    }
    if (gapStart < blockIds.length) {
      this.syncSpacer(gapStart, blockIds.length - 1, layout, desired)
    }

    this.spacers.forEach((spacer, key) => {
      if (desired.has(key)) return
      spacer.remove()
      this.spacers.delete(key)
    })
  }

  clear(): void {
    this.spacers.forEach(spacer => spacer.remove())
    this.spacers.clear()
  }

  private syncSpacer(
    start: number,
    end: number,
    layout: TLayout,
    desired: Set<string>,
    before?: HTMLElement,
  ): void {
    const key = `${start}:${end}`
    desired.add(key)
    let spacer = this.spacers.get(key)
    if (!spacer) {
      spacer = this.container.ownerDocument.createElement('div')
      spacer.className = 'bc-virtual-spacer'
      spacer.dataset['bcVirtualSpacer'] = key
      spacer.contentEditable = 'false'
      spacer.setAttribute('aria-hidden', 'true')
      spacer.style.pointerEvents = 'none'
      spacer.style.width = '100%'
      this.spacers.set(key, spacer)
    }

    const height = `${this.readRangeHeight(layout, start, end)}px`
    if (spacer.style.height !== height) spacer.style.height = height
    if (before) {
      if (spacer.nextSibling !== before) this.container.insertBefore(spacer, before)
    } else if (this.container.lastElementChild !== spacer) {
      this.container.append(spacer)
    }
  }
}
