import {parseBlockPosition} from '../object/block-placement/state'
import {estimateModelBlockHeight} from './model-height-estimator'

const PLACEMENT_LAYOUT_FLAVOUR = 'placement-layout'
const DEFAULT_ABSOLUTE_HEIGHT = 48

interface VerticalBand {
  top: number
  bottom: number
}

interface LayoutBands {
  layoutId: string
  bands: readonly VerticalBand[]
}

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

/**
 * Pure-model visibility projection for root-level absolute objects.
 *
 * `position.y` and every returned band use the root children container's
 * content coordinate system. Reconciliation can therefore compare the bands
 * directly with the root-relative viewport without mounting or measuring a
 * placement child first.
 */
export class AbsolutePlacementVisibilityIndex {
  private layouts: readonly LayoutBands[] = []
  private rootIds: readonly string[] = []
  private surfaceRevision = 0

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly estimatedHeights:
      Readonly<Partial<Record<string, number>>> = {},
  ) {}

  rebuild(rootIds: readonly string[]): void {
    this.rootIds = rootIds.filter(id =>
      this.doc.model.getFlavour(id) === PLACEMENT_LAYOUT_FLAVOUR)
    this.layouts = this.rootIds
      .map(layoutId => ({
        layoutId,
        bands: this.buildLayoutBands(layoutId),
      }))
      .filter(layout => layout.bands.length > 0)
    this.surfaceRevision = this.doc.placement?.surface?.revision ?? 0
  }

  get bottom(): number {
    return this.layouts.reduce((bottom, layout) =>
      Math.max(bottom, layout.bands[layout.bands.length - 1]?.bottom ?? 0), 0)
  }

  /**
   * Return only root layout ids whose absolute descendants intersect the
   * root-relative viewport plus a pixel overscan.
   */
  visibleLayoutIds(
    viewportTop: number,
    viewportHeight: number,
    overscanPx: number,
  ): string[] {
    // A mounted caption measurement/page projection can change an object's
    // band without a model edit. Refresh once per surface revision, never scan
    // the document on an unchanged scroll frame.
    if (this.surfaceRevision !== (this.doc.placement?.surface?.revision ?? 0)) {
      this.rebuild(this.rootIds)
    }
    const height = Math.max(0, finiteNumber(viewportHeight))
    const overscan = Math.max(0, finiteNumber(overscanPx))
    const top = finiteNumber(viewportTop)
    const rangeTop = top - overscan
    const rangeBottom = top + height + overscan

    return this.layouts
      .filter(layout => intersects(layout.bands, rangeTop, rangeBottom))
      .map(layout => layout.layoutId)
  }

  private buildLayoutBands(layoutId: string): readonly VerticalBand[] {
    const bands = this.doc.model
      .getChildrenIds(layoutId)
      .map(id => this.resolveBlockBand(id))
      .filter((band): band is VerticalBand => band !== null)
      .sort((left, right) => left.top - right.top || left.bottom - right.bottom)
    if (!bands.length) return []

    const merged: VerticalBand[] = []
    for (const band of bands) {
      const previous = merged[merged.length - 1]
      if (!previous || band.top > previous.bottom) {
        merged.push({...band})
        continue
      }
      previous.bottom = Math.max(previous.bottom, band.bottom)
    }
    return merged
  }

  private resolveBlockBand(blockId: string): VerticalBand | null {
    if (this.doc.revisions?.getBlockPresentation(blockId).hidden) return null
    const props = this.doc.model.getProps(blockId) ?? {}
    const position = parseBlockPosition(props['position'])
    if (!position) return null
    const y = position.y

    const flavour = this.doc.model.getFlavour(blockId)
    const dimensions = flavour
      ? this.doc.objectSizing?.resolve(flavour, props)
      : null
    const explicitHeight =
      positiveNumber(dimensions?.height) ??
      positiveNumber(props['height'])
    const estimatedHeight = positiveNumber(estimateModelBlockHeight(
      this.doc,
      blockId,
      {
        estimatedHeights: this.estimatedHeights,
        defaultHeight: DEFAULT_ABSOLUTE_HEIGHT,
      },
    ))
    const height = Math.max(
      1,
      explicitHeight ?? 0,
      this.doc.placement?.surface?.measuredHeight(blockId) ?? estimatedHeight ?? DEFAULT_ABSOLUTE_HEIGHT,
    )

    const width =
      positiveNumber(this.doc.placement?.surface?.measuredWidth(blockId)) ??
      positiveNumber(dimensions?.width) ??
      positiveNumber(props['width'])
    const rotation = finiteNumber(props['rotation'])
    if (width === null || rotation % 180 === 0) {
      return {top: y, bottom: y + height}
    }

    const radians = rotation * Math.PI / 180
    const rotatedHeight =
      Math.abs(height * Math.cos(radians)) +
      Math.abs(width * Math.sin(radians))
    const visualOverflow = Math.max(0, rotatedHeight - height) / 2
    return {
      top: y - visualOverflow,
      bottom: y + height + visualOverflow,
    }
  }
}

function intersects(
  bands: readonly VerticalBand[],
  rangeTop: number,
  rangeBottom: number,
): boolean {
  let low = 0
  let high = bands.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (bands[middle].bottom < rangeTop) low = middle + 1
    else high = middle
  }
  return low < bands.length && bands[low].top <= rangeBottom
}
