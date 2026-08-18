import {Subscription} from 'rxjs'
import type {IBlockProps, IBlockSnapshot} from '../../block-std/types'
import {deriveObjectSizeFromPixels} from '../block-object-sizing.manager'
import {resolveBlockPosition, resolvePlacementLayer} from './state'
import {
  BLOCK_OBJECT_GROUP_FLAVOUR,
  BLOCK_OBJECT_GROUP_PADDING,
  type BlockObjectGroupProps,
} from './types'
import {BlockPlacementRuntime} from './runtime'
import {
  type PlacementObjectGeometry,
  resolvePlacementObjectGeometry,
  resolvePlacementObjectsVisualBounds,
  roundPlacementGeometry,
} from './object-geometry'

interface GroupCandidate {
  parentId: string
  startIndex: number
  layer: 'under' | 'over'
  objects: PlacementObjectGeometry[]
}

type ObjectGroupReflowReason =
  | 'geometry-commit'
  | 'model-change'
  | 'structure-change'
  | 'initial-repair'

interface ObjectGroupReflowResult {
  groupId: string
  members: number
  writes: number
  changed: boolean
}

const OBJECT_GROUP_REFLOW_ORIGIN = Symbol('object-group-reflow')
const OBJECT_GROUP_GEOMETRY_KEYS = new Set([
  'position',
  'width',
  'height',
  'rotation',
  'wr',
  'ar',
])

const performanceNow = (): number =>
  globalThis.performance?.now?.() ?? Date.now()

const finitePositive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

const sameGeometryNumber = (current: unknown, next: number): boolean =>
  typeof current === 'number' &&
  Number.isFinite(current) &&
  Math.abs(current - next) < 0.0001

const samePosition = (
  current: unknown,
  next: {x: number; y: number},
): boolean => {
  const resolved = resolveBlockPosition(current)
  return sameGeometryNumber(resolved.x, next.x) &&
    sameGeometryNumber(resolved.y, next.y)
}

/**
 * Model-only group/ungroup commands for the placement bounded context.
 *
 * A group is a fixed-pixel local placement plane. Children keep their native
 * size model; ratio-sized objects merely change reference width when crossing
 * the plane boundary. No DOM measurement or observer participates here.
 */
export class BlockPlacementGroupCoordinator {
  private readonly subscriptions = new Subscription()
  private readonly queuedReflows = new Map<string, ObjectGroupReflowReason>()
  private reflowQueued = false
  private mutating = false
  private destroyed = false

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly runtime: BlockPlacementRuntime,
  ) {
    this.doc.afterInit?.(() => {
      const rootChildren = this.doc.model?.getChildrenIds?.(this.runtime.rootId) ?? []
      rootChildren
        .filter(id => this.runtime.isPlacementLayout(id))
        .flatMap(id => this.doc.model?.getChildrenIds?.(id) ?? [])
        .filter(id => this.runtime.isObjectGroup(id))
        .forEach(id => this.queueReflow(id, 'initial-repair'))
    })
    this.subscriptions.add(this.doc.onPropsUpdate$?.subscribe(event => {
      if (this.mutating || event.origin === OBJECT_GROUP_REFLOW_ORIGIN) return
      event.transactions.forEach(({block, changes}) => {
        if (![...changes.keys()].some(key => OBJECT_GROUP_GEOMETRY_KEYS.has(key))) {
          return
        }
        const groupId = this.resolveOwningGroupId(block.id)
        if (groupId) this.queueReflow(groupId, 'model-change')
      })
    }))
    this.subscriptions.add(this.doc.model?.contentChange$?.subscribe(change => {
      if (
        this.mutating ||
        change.origin === OBJECT_GROUP_REFLOW_ORIGIN ||
        !change.kinds.includes('props') ||
        (change.local && !change.isUndoRedo)
      ) return
      change.blockIds.forEach(id => {
        const groupId = this.resolveOwningGroupId(id)
        if (groupId) this.queueReflow(groupId, 'model-change')
      })
    }))
    this.subscriptions.add(this.doc.model?.structureChange$?.subscribe(change => {
      if (this.mutating) return
      change.affectedParentIds
        .filter(id => this.runtime.isObjectGroup(id))
        .forEach(id => this.queueReflow(id, 'structure-change'))
    }))
  }

  destroy(): void {
    this.destroyed = true
    this.queuedReflows.clear()
    this.subscriptions.unsubscribe()
  }

  canGroup(blockIds: readonly string[]): boolean {
    return this.resolveCandidate(blockIds) !== null
  }

  group(blockIds: readonly string[]): string | null {
    const candidate = this.resolveCandidate(blockIds)
    if (!candidate) return null

    const bounds = resolvePlacementObjectsVisualBounds(candidate.objects)
    if (!bounds) return null
    const contentWidth = roundPlacementGeometry(bounds.right - bounds.left)
    const contentHeight = roundPlacementGeometry(bounds.bottom - bounds.top)
    const groupProps: BlockObjectGroupProps = {
      width: roundPlacementGeometry(
        contentWidth + BLOCK_OBJECT_GROUP_PADDING * 2,
      ),
      height: roundPlacementGeometry(
        contentHeight + BLOCK_OBJECT_GROUP_PADDING * 2,
      ),
    }
    if (groupProps.width <= 0 || groupProps.height <= 0) return null

    const snapshot = this.doc.schemas.createSnapshot(
      BLOCK_OBJECT_GROUP_FLAVOUR,
      [groupProps],
    ) as IBlockSnapshot
    snapshot.props = {
      ...snapshot.props,
      position: {
        x: roundPlacementGeometry(bounds.left - BLOCK_OBJECT_GROUP_PADDING),
        y: roundPlacementGeometry(bounds.top - BLOCK_OBJECT_GROUP_PADDING),
      },
      ...(candidate.layer === 'under' ? {placementLayer: 'under'} : {}),
    }

    let completed = false
    this.doc.crud.transact(() => {
      const inserted = this.doc.crud.insertBlockSnapshots(
        candidate.parentId,
        candidate.startIndex,
        [snapshot],
      )
      if (inserted[0] !== snapshot.id) return

      candidate.objects.forEach(object => {
        const patch: Record<string, any> = {
          position: {
            x: roundPlacementGeometry(object.x - bounds.left),
            y: roundPlacementGeometry(object.y - bounds.top),
          },
          placementLayer: null,
        }
        if (this.doc.objectSizing.getCapability(object.flavour)) {
          const derived = deriveObjectSizeFromPixels(
            object.width,
            object.height,
            contentWidth,
          )
          if (derived) {
            patch['wr'] = derived.wr
            patch['ar'] = derived.ar
            patch['width'] = null
            patch['height'] = null
          }
        }
        this.doc.crud.updateBlockProps(object.id, patch)
      })

      // The new group occupies startIndex, so the original contiguous range
      // begins immediately after it until the move completes.
      this.doc.crud.moveBlocks(
        candidate.parentId,
        candidate.startIndex + 1,
        candidate.objects.length,
        snapshot.id,
        0,
      )
      completed = true
    })
    return completed ? snapshot.id : null
  }

  canUngroup(groupId: string): boolean {
    return this.resolveUngroup(groupId) !== null
  }

  ungroup(groupId: string): string[] {
    const source = this.resolveUngroup(groupId)
    if (!source) return []

    const rootWidth = this.doc.objectSizing.rootContentWidth
    const childPatches = source.childIds.map(id => {
      const flavour = this.doc.model.getFlavour(id)
      const props = this.doc.model.getProps(id) as Record<string, unknown>
      const local = resolveBlockPosition(props['position'])
      const patch: Record<string, any> = {
        position: {
          x: roundPlacementGeometry(
            source.position.x + BLOCK_OBJECT_GROUP_PADDING + local.x,
          ),
          y: roundPlacementGeometry(
            source.position.y + BLOCK_OBJECT_GROUP_PADDING + local.y,
          ),
        },
        placementLayer: source.layer === 'under' ? 'under' : null,
      }
      if (flavour && this.doc.objectSizing.getCapability(flavour)) {
        const dimensions = this.doc.objectSizing.resolveForBlock(
          id,
          flavour,
          props,
        )
        if (!dimensions) return null
        const derived = deriveObjectSizeFromPixels(
          dimensions.width,
          dimensions.height,
          rootWidth,
        )
        if (!derived) return null
        patch['wr'] = derived.wr
        patch['ar'] = derived.ar
        patch['width'] = null
        patch['height'] = null
      }
      return {id, patch}
    })
    if (childPatches.some(item => item === null)) return []

    this.doc.crud.transact(() => {
      childPatches.forEach(item => {
        if (item) this.doc.crud.updateBlockProps(item.id, item.patch)
      })
      this.doc.crud.moveBlocks(
        groupId,
        0,
        source.childIds.length,
        source.parentId,
        source.index,
      )
      // Moving children before deleting preserves their Y.Map subtrees.
      this.doc.crud.deleteBlocks(
        source.parentId,
        source.index + source.childIds.length,
        1,
        true,
      )
    })
    return source.childIds
  }

  /**
   * Apply one member geometry mutation and tighten its owning group in the
   * same Yjs transaction. Non-group objects keep the ordinary update path.
   */
  updateObjectGeometry(
    block: BlockCraft.BlockComponent,
    patch: Partial<IBlockProps>,
  ): boolean {
    if (this.runtime.isReadonly(block)) return false
    const groupId = this.resolveOwningGroupId(block.id)
    if (!groupId) {
      block.updateProps(patch as any)
      block.changeDetectorRef.markForCheck()
      return true
    }
    if (this.runtime.isReadonly(groupId)) return false

    let result: ObjectGroupReflowResult | null = null
    const startedAt = performanceNow()
    this.mutating = true
    try {
      this.doc.crud.transact(() => {
        block.updateProps(patch as any)
        result = this.reflowInTransaction(groupId)
      }, OBJECT_GROUP_REFLOW_ORIGIN)
    } finally {
      this.mutating = false
    }
    block.changeDetectorRef.markForCheck()
    if (result) {
      this.printPerformance(
        result,
        'geometry-commit',
        performanceNow() - startedAt,
      )
    }
    return result !== null
  }

  private resolveCandidate(blockIds: readonly string[]): GroupCandidate | null {
    const uniqueIds = [...new Set(blockIds)]
    if (uniqueIds.length < 2 || this.doc.isReadonly) return null
    if (uniqueIds.some(id => this.runtime.isReadonly(id))) return null

    const parentId = this.doc.model.getParentId(uniqueIds[0]!)
    if (!parentId || !this.runtime.isPlacementLayout(parentId)) return null
    if (uniqueIds.some(id => this.doc.model.getParentId(id) !== parentId)) {
      return null
    }

    const siblings = this.runtime.getLiveChildrenIds(parentId)
    const indexed = uniqueIds
      .map(id => ({id, index: siblings.indexOf(id)}))
      .sort((a, b) => a.index - b.index)
    if (indexed.some(item => item.index < 0)) return null
    const startIndex = indexed[0]!.index
    if (indexed.some((item, offset) => item.index !== startIndex + offset)) {
      return null
    }
    if (indexed.some(({id}) => this.runtime.isObjectGroup(id))) return null

    const objects = indexed
      .map(({id}) => this.resolveGeometry(id))
    if (objects.some(object => object === null)) return null
    const resolvedObjects = objects as PlacementObjectGeometry[]
    const layers = new Set(resolvedObjects.map(object =>
      resolvePlacementLayer(object.props['placementLayer']),
    ))
    if (layers.size !== 1) return null

    return {
      parentId,
      startIndex,
      layer: [...layers][0]!,
      objects: resolvedObjects,
    }
  }

  private resolveGeometry(
    blockId: string,
    propsOverride?: Record<string, unknown>,
    referenceWidth = this.doc.objectSizing.rootContentWidth,
  ): PlacementObjectGeometry | null {
    if (this.runtime.isObjectGroup(blockId)) return null
    return resolvePlacementObjectGeometry(this.doc, blockId, {
      props: propsOverride,
      referenceWidth,
    })
  }

  private reflowGroup(
    groupId: string,
    reason: ObjectGroupReflowReason,
  ): boolean {
    if (
      this.destroyed ||
      !this.runtime.isObjectGroup(groupId) ||
      this.runtime.isReadonly(groupId)
    ) return false

    let result: ObjectGroupReflowResult | null = null
    const startedAt = performanceNow()
    this.mutating = true
    try {
      this.doc.crud.transact(() => {
        result = this.reflowInTransaction(groupId)
      }, OBJECT_GROUP_REFLOW_ORIGIN)
    } finally {
      this.mutating = false
    }
    if (result) {
      this.printPerformance(result, reason, performanceNow() - startedAt)
    }
    return result !== null
  }

  private reflowInTransaction(groupId: string): ObjectGroupReflowResult | null {
    if (!this.runtime.isObjectGroup(groupId)) return null
    const groupProps = this.getLiveProps(groupId)
    if (!groupProps) return null
    const oldGroupWidth = finitePositive(groupProps['width'])
    if (oldGroupWidth === null) return null
    const oldContentWidth = oldGroupWidth - BLOCK_OBJECT_GROUP_PADDING * 2
    if (oldContentWidth <= 0) return null

    const childIds = this.runtime.getLiveChildrenIds(groupId)
    if (!childIds.length) {
      return {groupId, members: 0, writes: 0, changed: false}
    }
    const objects = childIds.map(id => {
      const props = this.getLiveProps(id)
      return props
        ? this.resolveGeometry(id, props, oldContentWidth)
        : null
    })
    if (objects.some(object => object === null)) return null
    const resolvedObjects = objects as PlacementObjectGeometry[]
    const bounds = resolvePlacementObjectsVisualBounds(resolvedObjects)
    if (!bounds) return null

    const contentWidth = roundPlacementGeometry(bounds.right - bounds.left)
    const contentHeight = roundPlacementGeometry(bounds.bottom - bounds.top)
    if (contentWidth <= 0 || contentHeight <= 0) return null
    const width = roundPlacementGeometry(
      contentWidth + BLOCK_OBJECT_GROUP_PADDING * 2,
    )
    const height = roundPlacementGeometry(
      contentHeight + BLOCK_OBJECT_GROUP_PADDING * 2,
    )
    const groupPosition = resolveBlockPosition(groupProps['position'])
    const groupIsAbsolute =
      this.runtime.getPersistedState(groupId).mode === 'absolute'
    const nextGroupPosition = {
      x: roundPlacementGeometry(groupPosition.x + bounds.left),
      y: roundPlacementGeometry(groupPosition.y + bounds.top),
    }
    let writes = 0

    const groupPatch: Record<string, any> = {}
    if (!sameGeometryNumber(groupProps['width'], width)) groupPatch['width'] = width
    if (!sameGeometryNumber(groupProps['height'], height)) groupPatch['height'] = height
    if (
      groupIsAbsolute &&
      !samePosition(groupProps['position'], nextGroupPosition)
    ) {
      groupPatch['position'] = nextGroupPosition
    }
    if (Object.keys(groupPatch).length) {
      this.doc.crud.updateBlockProps(groupId, groupPatch)
      writes++
    }

    resolvedObjects.forEach(object => {
      const patch: Record<string, any> = {}
      const position = {
        x: roundPlacementGeometry(object.x - bounds.left),
        y: roundPlacementGeometry(object.y - bounds.top),
      }
      if (!samePosition(object.props['position'], position)) {
        patch['position'] = position
      }
      if (this.doc.objectSizing.getCapability(object.flavour)) {
        const derived = deriveObjectSizeFromPixels(
          object.width,
          object.height,
          contentWidth,
        )
        if (derived) {
          if (!sameGeometryNumber(object.props['wr'], derived.wr)) {
            patch['wr'] = derived.wr
          }
          if (!sameGeometryNumber(object.props['ar'], derived.ar)) {
            patch['ar'] = derived.ar
          }
          if (object.props['width'] != null) patch['width'] = null
          if (object.props['height'] != null) patch['height'] = null
        }
      }
      if (Object.keys(patch).length) {
        this.doc.crud.updateBlockProps(object.id, patch)
        writes++
      }
    })

    return {
      groupId,
      members: resolvedObjects.length,
      writes,
      changed: writes > 0,
    }
  }

  private queueReflow(
    groupId: string,
    reason: ObjectGroupReflowReason,
  ): void {
    if (this.destroyed) return
    this.queuedReflows.set(groupId, reason)
    if (this.reflowQueued) return
    this.reflowQueued = true
    queueMicrotask(() => {
      this.reflowQueued = false
      if (this.destroyed) return
      const queued = [...this.queuedReflows]
      this.queuedReflows.clear()
      queued.forEach(([id, queuedReason]) => {
        try {
          this.reflowGroup(id, queuedReason)
        } catch (error) {
          this.doc.logger?.warn?.('objectGroupReflowError: ', error)
        }
      })
    })
  }

  private resolveOwningGroupId(blockId: string): string | null {
    const parentId = this.doc.model?.getParentId?.(blockId)
    return parentId && this.runtime.isObjectGroup(parentId) ? parentId : null
  }

  private getLiveProps(blockId: string): Record<string, unknown> | null {
    const props = this.doc.crud?.getYBlock?.(blockId)?.get('props')
    if (typeof props?.toJSON === 'function') {
      return props.toJSON() as Record<string, unknown>
    }
    const fallback = this.doc.model?.getProps?.(blockId)
    return fallback ? fallback as Record<string, unknown> : null
  }

  private printPerformance(
    result: ObjectGroupReflowResult,
    reason: ObjectGroupReflowReason,
    duration: number,
  ): void {
    this.doc.logger?.info?.(
      `[ObjectGroup][performance] reflow ${duration.toFixed(3)}ms`,
      {
        groupId: result.groupId,
        reason,
        members: result.members,
        writes: result.writes,
        changed: result.changed,
      },
    )
  }

  private resolveUngroup(groupId: string): {
    parentId: string
    index: number
    childIds: string[]
    position: {x: number; y: number}
    layer: 'under' | 'over'
  } | null {
    if (
      this.doc.isReadonly ||
      !this.runtime.isObjectGroup(groupId) ||
      this.runtime.isReadonly(groupId)
    ) return null
    const parentId = this.doc.model.getParentId(groupId)
    if (!parentId || !this.runtime.isPlacementLayout(parentId)) return null
    const siblings = this.runtime.getLiveChildrenIds(parentId)
    const index = siblings.indexOf(groupId)
    if (index < 0) return null
    const childIds = this.runtime.getLiveChildrenIds(groupId)
    if (!childIds.length) return null
    const props = this.doc.model.getProps(groupId) as Record<string, unknown>
    return {
      parentId,
      index,
      childIds,
      position: resolveBlockPosition(props['position']),
      layer: resolvePlacementLayer(props['placementLayer']),
    }
  }
}
