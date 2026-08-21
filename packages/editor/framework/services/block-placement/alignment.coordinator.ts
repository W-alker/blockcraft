import type {
  BlockObjectAlignment,
  BlockObjectPlaneAlignment,
} from './types'
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

interface PositionPatch {
  id: string
  position: {x: number; y: number}
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
const PLANE_ALIGNMENTS = new Set<BlockObjectPlaneAlignment>([
  'left',
  'horizontal-center',
  'right',
])

const sameGeometryNumber = (current: number, next: number): boolean =>
  Math.abs(current - next) < 0.0001

/**
 * Model-only alignment inside one root placement plane: multi-object mutual
 * alignment/distribution, plus plane-relative (page) horizontal alignment.
 */
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
    return this.commitPositions(patches)
  }

  canAlignObjectsToPlane(
    blockIds: readonly string[],
    alignment?: BlockObjectPlaneAlignment,
  ): boolean {
    return this.resolvePlaneCandidate(blockIds, alignment) !== null
  }

  /**
   * Align each object horizontally against the plane itself. Every selected
   * object snaps independently — the reference is the plane edge/center, not
   * the other objects — so a single object is a valid target.
   */
  alignObjectsToPlane(
    blockIds: readonly string[],
    alignment: BlockObjectPlaneAlignment,
  ): boolean {
    const candidate = this.resolvePlaneCandidate(blockIds, alignment)
    if (!candidate) return false
    const planeWidth = this.doc.objectSizing.rootContentWidth
    const patches = candidate.objects.flatMap(object => {
      const bounds = resolvePlacementObjectVisualBounds(object)
      const offset = alignment === 'left'
        ? -bounds.left
        : alignment === 'horizontal-center'
          ? planeWidth / 2 - bounds.centerX
          : planeWidth - bounds.right
      const x = roundPlacementGeometry(object.x + offset)
      if (sameGeometryNumber(object.x, x)) return []
      return [{id: object.id, position: {x, y: object.y}}]
    })
    return this.commitPositions(patches)
  }

  private commitPositions(patches: readonly PositionPatch[]): boolean {
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
    const minimum = alignment && DISTRIBUTION_ALIGNMENTS.has(alignment) ? 3 : 2
    return this.resolveObjects(blockIds, minimum)
  }

  private resolvePlaneCandidate(
    blockIds: readonly string[],
    alignment?: BlockObjectPlaneAlignment,
  ): AlignmentCandidate | null {
    if (alignment !== undefined && !PLANE_ALIGNMENTS.has(alignment)) return null
    // An unmeasured plane (width 0) has no meaningful edges or center.
    if (!(this.doc.objectSizing.rootContentWidth > 0)) return null
    return this.resolveObjects(blockIds, 1)
  }

  private resolveObjects(
    blockIds: readonly string[],
    minimum: number,
  ): AlignmentCandidate | null {
    const uniqueIds = [...new Set(blockIds)]
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
