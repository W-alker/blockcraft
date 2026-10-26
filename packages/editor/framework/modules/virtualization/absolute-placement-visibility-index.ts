import {parseBlockPosition} from '../object/block-placement/state'
import {estimateModelBlockHeight} from './model-height-estimator'
import {resolveTextFit} from '../../block-std/block/object-format/text-fit'

const PLACEMENT_LAYOUT_FLAVOUR = 'placement-layout'
const DEFAULT_ABSOLUTE_HEIGHT = 48

interface VerticalBand {
  top: number
  bottom: number
}

interface ObjectBand extends VerticalBand {
  id: string
}

interface BandTree {
  band: ObjectBand
  maxBottom: number
  left: BandTree | null
  right: BandTree | null
}

interface LayoutBands {
  layoutId: string
  tree: BandTree | null
  residentIds: readonly string[]
  bottom: number
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
    this.layouts = this.rootIds.map(layoutId => this.buildLayoutBands(layoutId))
    this.surfaceRevision = this.doc.placement?.surface?.revision ?? 0
  }

  get bottom(): number {
    return this.layouts.reduce((bottom, layout) =>
      Math.max(bottom, layout.bottom), 0)
  }

  /**
   * Return root layouts owning visible objects or resident auto-fit objects.
   */
  visibleLayoutIds(
    viewportTop: number,
    viewportHeight: number,
    overscanPx: number,
  ): string[] {
    return [...this.visibleObjectIds(viewportTop, viewportHeight, overscanPx).keys()]
  }

  /** Direct objects to mount; resident auto-fit objects do not need a known size. */
  visibleObjectIds(viewportTop: number, viewportHeight: number, overscanPx: number): Map<string, Set<string>> {
    if (this.surfaceRevision !== (this.doc.placement?.surface?.revision ?? 0)) {
      this.rebuild(this.rootIds)
    }
    const height = Math.max(0, finiteNumber(viewportHeight))
    const overscan = Math.max(0, finiteNumber(overscanPx))
    const top = finiteNumber(viewportTop)
    const rangeTop = top - overscan
    const rangeBottom = top + height + overscan

    const result = new Map<string, Set<string>>()
    for (const layout of this.layouts) {
      const ids = new Set(layout.residentIds)
      queryBands(layout.tree, rangeTop, rangeBottom, ids)
      if (ids.size) result.set(layout.layoutId, ids)
    }
    return result
  }

  private buildLayoutBands(layoutId: string): LayoutBands {
    const bands: ObjectBand[] = []
    const residentIds: string[] = []
    let bottom = 0
    for (const id of this.doc.model.getChildrenIds(layoutId)) {
      const band = this.resolveBlockBand(id)
      if (!band) continue
      bottom = Math.max(bottom, band.bottom)
      if (this.hasAutoFit(id)) residentIds.push(id)
      else bands.push({...band, id})
    }
    bands.sort((left, right) => left.top - right.top || left.bottom - right.bottom)
    return {layoutId, tree: buildTree(bands, 0, bands.length), residentIds, bottom}
  }

  private hasAutoFit(id: string): boolean {
    if (this.doc.revisions?.getBlockPresentation(id).hidden) return false
    const flavour = this.doc.model.getFlavour(id)
    const props = this.doc.model.getProps(id) ?? {}
    const format = flavour ? this.doc.schemas?.get(flavour, false)?.metadata.objectFormat : undefined
    // Validate the supported mode independently of an existing measured size.
    if (format && resolveTextFit({...props, textFit: 1}, format)) return true
    return flavour === 'object-group' && this.doc.model.getChildrenIds(id).some(childId => this.hasAutoFit(childId))
  }

  private resolveBlockBand(blockId: string): VerticalBand | null {
    if (this.doc.revisions?.getBlockPresentation(blockId).hidden) return null
    const props = this.doc.model.getProps(blockId) ?? {}
    const position = parseBlockPosition(props['position'])
    if (!position) return null
    const y = position.y

    const flavour = this.doc.model.getFlavour(blockId)
    const format = flavour ? this.doc.schemas?.get(flavour, false)?.metadata.objectFormat : undefined
    const fitted = format ? resolveTextFit(props, format) : null
    const dimensions = flavour
      ? this.doc.objectSizing?.resolve(flavour, props)
      : null
    const explicitHeight =
      positiveNumber(dimensions?.height) ??
      positiveNumber(props['height'])
    const estimatedHeight = fitted?.axis === 'height' ? null : positiveNumber(estimateModelBlockHeight(
      this.doc,
      blockId,
      {
        estimatedHeights: this.estimatedHeights,
        defaultHeight: DEFAULT_ABSOLUTE_HEIGHT,
      },
    ))
    const height = fitted?.axis === 'height' ? fitted.size : Math.max(
      1,
      explicitHeight ?? 0,
      this.doc.placement?.surface?.measuredHeight(blockId) ?? estimatedHeight ?? DEFAULT_ABSOLUTE_HEIGHT,
    )

    const width = fitted?.axis === 'width' ? fitted.size :
      positiveNumber(this.doc.placement?.surface?.measuredWidth(blockId)) ??
      positiveNumber(dimensions?.width) ??
      positiveNumber(props['width'])
    const rotation = finiteNumber(props['rotation'])
    const band = (width: number | null, height: number): VerticalBand => {
      if (width === null || rotation % 180 === 0) return {top: y, bottom: y + height}
      const radians = rotation * Math.PI / 180
      const rotatedHeight = Math.abs(height * Math.cos(radians)) + Math.abs(width * Math.sin(radians))
      const overflow = Math.max(0, rotatedHeight - height) / 2
      return {top: y - overflow, bottom: y + height + overflow}
    }
    return band(width, height)
  }
}

function buildTree(bands: readonly ObjectBand[], start: number, end: number): BandTree | null {
  if (start >= end) return null
  const middle = start + Math.floor((end - start) / 2)
  const left = buildTree(bands, start, middle)
  const right = buildTree(bands, middle + 1, end)
  const band = bands[middle]
  return {band, left, right, maxBottom: Math.max(band.bottom, left?.maxBottom ?? -Infinity, right?.maxBottom ?? -Infinity)}
}

function queryBands(tree: BandTree | null, top: number, bottom: number, ids: Set<string>): void {
  if (!tree || tree.maxBottom < top) return
  queryBands(tree.left, top, bottom, ids)
  if (tree.band.top > bottom) return
  if (tree.band.bottom >= top) ids.add(tree.band.id)
  queryBands(tree.right, top, bottom, ids)
}
