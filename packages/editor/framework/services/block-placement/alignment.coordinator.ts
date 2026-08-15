import type {BlockObjectAlignment} from './types'
import {BlockPlacementRuntime} from './runtime'
import {
  type PlacementObjectGeometry,
  type PlacementObjectVisualBounds,
  resolvePlacementObjectGeometry,
  resolvePlacementObjectVisualBounds,
  roundPlacementGeometry,
} from './object-geometry'

interface AlignmentCandidate {
  objects: PlacementObjectGeometry[]
}

interface ObjectWithBounds {
  object: PlacementObjectGeometry
  bounds: PlacementObjectVisualBounds
}

const DISTRIBUTION_ALIGNMENTS = new Set<BlockObjectAlignment>([
  'horizontal-distribute',
  'vertical-distribute',
])
const OBJECT_ALIGNMENTS = new Set<BlockObjectAlignment>([
  'left',
  'horizontal-center',
  'right',
  'top',
  'vertical-center',
  'bottom',
  'center',
  ...DISTRIBUTION_ALIGNMENTS,
])

const sameGeometryNumber = (current: number, next: number): boolean =>
  Math.abs(current - next) < 0.0001

/** Model-only multi-object alignment inside one root placement plane. */
export class BlockPlacementAlignmentCoordinator {
  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly runtime: BlockPlacementRuntime,
  ) {}

  canAlignObjects(
    blockIds: readonly string[],
    alignment?: BlockObjectAlignment,
  ): boolean {
    return this.resolveCandidate(blockIds, alignment) !== null
  }

  alignObjects(
    blockIds: readonly string[],
    alignment: BlockObjectAlignment,
  ): boolean {
    const candidate = this.resolveCandidate(blockIds, alignment)
    if (!candidate) return false
    const items = candidate.objects.map(object => ({
      object,
      bounds: resolvePlacementObjectVisualBounds(object),
    }))
    const offsets = this.resolveOffsets(items, alignment)
    const patches = items.flatMap(({object}) => {
      const offset = offsets.get(object.id)
      if (!offset) return []
      const x = roundPlacementGeometry(object.x + offset.x)
      const y = roundPlacementGeometry(object.y + offset.y)
      if (
        sameGeometryNumber(object.x, x) &&
        sameGeometryNumber(object.y, y)
      ) return []
      return [{id: object.id, position: {x, y}}]
    })
    if (!patches.length) return true

    this.doc.crud.transact(() => {
      patches.forEach(({id, position}) => {
        this.doc.crud.updateBlockProps(id, {position})
      })
    })
    return true
  }

  private resolveCandidate(
    blockIds: readonly string[],
    alignment?: BlockObjectAlignment,
  ): AlignmentCandidate | null {
    if (alignment !== undefined && !OBJECT_ALIGNMENTS.has(alignment)) return null
    const uniqueIds = [...new Set(blockIds)]
    const minimum = alignment && DISTRIBUTION_ALIGNMENTS.has(alignment) ? 3 : 2
    if (uniqueIds.length < minimum || this.doc.isReadonly) return null
    if (uniqueIds.some(id => this.runtime.isReadonly(id))) return null

    const parentId = this.doc.model.getParentId(uniqueIds[0]!)
    if (!parentId || !this.runtime.isPlacementLayout(parentId)) return null
    if (uniqueIds.some(id => this.doc.model.getParentId(id) !== parentId)) {
      return null
    }
    const objects = uniqueIds.map(id =>
      resolvePlacementObjectGeometry(this.doc, id),
    )
    if (objects.some(object => object === null)) return null
    return {objects: objects as PlacementObjectGeometry[]}
  }

  private resolveOffsets(
    items: readonly ObjectWithBounds[],
    alignment: BlockObjectAlignment,
  ): Map<string, {x: number; y: number}> {
    const offsets = new Map<string, {x: number; y: number}>()
    const averageCenterX = items.reduce(
      (total, item) => total + item.bounds.centerX,
      0,
    ) / items.length
    const averageCenterY = items.reduce(
      (total, item) => total + item.bounds.centerY,
      0,
    ) / items.length
    const left = items.reduce(
      (value, item) => Math.min(value, item.bounds.left),
      Number.POSITIVE_INFINITY,
    )
    const right = items.reduce(
      (value, item) => Math.max(value, item.bounds.right),
      Number.NEGATIVE_INFINITY,
    )
    const top = items.reduce(
      (value, item) => Math.min(value, item.bounds.top),
      Number.POSITIVE_INFINITY,
    )
    const bottom = items.reduce(
      (value, item) => Math.max(value, item.bounds.bottom),
      Number.NEGATIVE_INFINITY,
    )

    items.forEach(({object, bounds}) => {
      let x = 0
      let y = 0
      if (alignment === 'left') x = left - bounds.left
      else if (alignment === 'horizontal-center') {
        x = averageCenterX - bounds.centerX
      } else if (alignment === 'right') x = right - bounds.right
      else if (alignment === 'top') y = top - bounds.top
      else if (alignment === 'vertical-center') {
        y = averageCenterY - bounds.centerY
      } else if (alignment === 'bottom') y = bottom - bounds.bottom
      else if (alignment === 'center') {
        x = averageCenterX - bounds.centerX
        y = averageCenterY - bounds.centerY
      }
      offsets.set(object.id, {x, y})
    })

    if (alignment === 'horizontal-distribute') {
      this.applyDistribution(items, offsets, 'horizontal')
    } else if (alignment === 'vertical-distribute') {
      this.applyDistribution(items, offsets, 'vertical')
    }
    return offsets
  }

  private applyDistribution(
    items: readonly ObjectWithBounds[],
    offsets: Map<string, {x: number; y: number}>,
    axis: 'horizontal' | 'vertical',
  ): void {
    const key = axis === 'horizontal' ? 'centerX' : 'centerY'
    const sorted = [...items].sort(
      (left, right) => left.bounds[key] - right.bounds[key],
    )
    const first = sorted[0]!.bounds[key]
    const last = sorted[sorted.length - 1]!.bounds[key]
    const step = (last - first) / (sorted.length - 1)
    sorted.forEach(({object, bounds}, index) => {
      const delta = first + step * index - bounds[key]
      offsets.set(object.id, axis === 'horizontal'
        ? {x: delta, y: 0}
        : {x: 0, y: delta})
    })
  }
}
