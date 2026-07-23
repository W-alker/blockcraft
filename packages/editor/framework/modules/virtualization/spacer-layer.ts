import {HeightMap} from './height-map'
import {RenderedSegment} from './types'

export class SpacerLayer {
  private readonly spacers = new Map<string, HTMLElement>()

  constructor(private readonly container: HTMLElement) {}

  sync(
    blockIds: readonly string[],
    segments: readonly RenderedSegment[],
    heights: HeightMap,
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
          heights,
          desired,
          resolveHost(blockIds[segment[0]]),
        )
      }
      gapStart = segment[1] + 1
    }
    if (gapStart < blockIds.length) {
      this.syncSpacer(gapStart, blockIds.length - 1, heights, desired)
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
    heights: HeightMap,
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

    const height = `${heights.getRangeHeight(start, end)}px`
    if (spacer.style.height !== height) spacer.style.height = height
    if (before) {
      if (spacer.nextSibling !== before) this.container.insertBefore(spacer, before)
    } else if (this.container.lastElementChild !== spacer) {
      this.container.append(spacer)
    }
  }
}
