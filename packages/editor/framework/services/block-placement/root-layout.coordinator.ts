import {Subscription} from 'rxjs'
import type {
  BlockPlacementLayer,
  IBlockSnapshot,
  ResolvedBlockPosition,
} from '../../block-std/types'
import {ORIGIN_NO_RECORD} from '../../doc/origins'
import {
  resolvePlacementContainerBox,
  resolvePlacementPlaneBounds,
} from './geometry'
import {BlockPlacementRuntime} from './runtime'
import {finitePlacementNumber} from './state'
import {
  BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
  type AbsoluteBlockInsertOptions,
} from './types'

/**
 * Owns the single root placement-layout and repairs its structural invariants.
 */
export class RootPlacementLayoutCoordinator {
  private readonly subscriptions = new Subscription()
  private normalizationQueued = false
  private normalizing = false
  private destroyed = false

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly runtime: BlockPlacementRuntime,
  ) {
    this.doc.afterInit?.(() => this.queueNormalization())
    this.subscriptions.add(this.doc.onChildrenUpdate$?.subscribe(event => {
      if (
        event.transactions.some(({block}) =>
          block.id === this.runtime.rootId ||
          this.runtime.isPlacementLayout(block),
        )
      ) {
        this.queueNormalization()
      }
    }))
    this.subscriptions.add(this.doc.onPropsUpdate$?.subscribe(event => {
      if (
        event.transactions.some(({block, changes}) =>
          block.parentId === this.runtime.rootId && changes.has('position'),
        )
      ) {
        this.queueNormalization()
      }
    }))
  }

  findLayoutId(): string | null {
    return (this.doc.model?.getChildrenIds?.(this.runtime.rootId) ?? [])
      .find(id => this.runtime.isPlacementLayout(id)) ?? null
  }

  ensureLayoutId(): string {
    const existing = this.findLayoutId()
    if (existing) return existing
    const snapshot = this.doc.schemas.createSnapshot(
      BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
      [],
    )
    const insert = () => this.doc.crud.insertBlockSnapshots(
      this.runtime.rootId,
      this.doc.model.getChildrenIds(this.runtime.rootId).length,
      [snapshot],
    )
    // placement-layout is editor infrastructure, never authored content. It
    // must not become the visible target of a whole-block revision.
    const ids = this.doc.revisions
      ? this.doc.revisions.runWithoutTracking(insert)
      : insert()
    if (!ids[0]) throw new Error('Failed to create placement layout')
    return ids[0]
  }

  /**
   * Insert a new object directly below the root placement layout.
   *
   * The layout creation and object insertion are one nested Yjs transaction;
   * no temporary normal-flow block is rendered or later migrated.
   */
  insertAbsoluteSnapshot(
    snapshot: IBlockSnapshot,
    options: AbsoluteBlockInsertOptions = {},
  ): string | null {
    const capability =
      this.doc.schemas?.get?.(snapshot.flavour, false)?.metadata.placement
    if (
      this.doc.isReadonly ||
      !capability?.modes.includes('absolute') ||
      !this.doc.root?.hostElement ||
      this.doc.readonlyManager?.isReadonly?.(this.doc.root)
    ) {
      return null
    }

    const layer = options.layer === 'under' ? 'under' : 'over'
    const anchorRect = options.anchorRect === undefined
      ? this.doc.selection?.getSelectionRect?.() ?? null
      : options.anchorRect
    const placement = this.measureInsertionPlacement(
      snapshot,
      anchorRect,
      layer,
    )
    const positionedSnapshot: IBlockSnapshot = {
      ...snapshot,
      props: {
        ...snapshot.props,
        position: {
          x: placement.x,
          y: placement.y,
        },
        ...(layer === 'under' ? {placementLayer: layer} : {}),
      },
    }

    let insertedId: string | null = null
    try {
      this.doc.crud.transact(() => {
        const layoutId = this.findLayoutId()
        if (layoutId) {
          const targetIndex = this.doc.crud.getYBlock(layoutId)
            ?.get('children')
            ?.length ?? 0
          insertedId = this.doc.crud.insertBlockSnapshots(
            layoutId,
            targetIndex,
            [positionedSnapshot],
          )[0] ?? null
          return
        }

        // A parent inserted earlier in the same Yjs transaction is not yet
        // addressable through DocModel#getYBlock. Create the first layout and
        // object as one nested snapshot.
        const layoutSnapshot = this.doc.schemas.createSnapshot(
          BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
          [[positionedSnapshot]],
        )
        const insert = () => this.doc.crud.insertBlockSnapshots(
          this.runtime.rootId,
          this.doc.model.getChildrenIds(this.runtime.rootId).length,
          [layoutSnapshot],
        )
        const layoutIds = this.doc.revisions
          ? this.doc.revisions.runWithoutTracking(insert)
          : insert()
        insertedId = layoutIds[0] ? positionedSnapshot.id : null
        if (insertedId && this.doc.revisions?.isTracking) {
          this.doc.revisions.recordBlockInsertion([insertedId], layoutIds[0])
        }
      })
    } catch (error) {
      this.doc.logger.warn('insertAbsoluteSnapshotError: ', error)
      return null
    }
    if (insertedId) this.queueNormalization()
    return insertedId
  }

  queueNormalization(): void {
    if (this.normalizationQueued || this.destroyed) return
    this.normalizationQueued = true
    queueMicrotask(() => {
      this.normalizationQueued = false
      this.normalize()
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.subscriptions.unsubscribe()
  }

  private measureInsertionPlacement(
    snapshot: IBlockSnapshot,
    anchorRect: DOMRect | null,
    layer: BlockPlacementLayer,
  ): ResolvedBlockPosition {
    const rootContent =
      this.doc.root.childrenRenderRef?.containerElement ??
      this.doc.root.hostElement
    const box = resolvePlacementContainerBox(rootContent)
    const bounds = resolvePlacementPlaneBounds(box)
    const hasAnchor =
      !!anchorRect &&
      Number.isFinite(anchorRect.left) &&
      Number.isFinite(anchorRect.top)
    // Selection rects are visual viewport pixels while placement is persisted
    // in layout coordinates.  CSS zoom / a transformed document surface makes
    // these spaces diverge, so normalise both axes through the measured plane
    // scale before writing model data.
    const localX = hasAnchor
      ? (anchorRect!.left - box.originX) / box.visualScale
      : 0
    // 落点只受「编辑器本身」约束：可放置区是容器的 padding box，对象允许压在
    // 内边距（分页下即页边距）上，因此下界为负而不是内容盒的 0。
    const objectWidth = finitePlacementNumber(snapshot.props?.['width'])
    const maxX = objectWidth > 0
      ? Math.max(bounds.minX, bounds.maxX - objectWidth)
      : bounds.maxX
    return {
      mode: 'absolute',
      x: Math.round(Math.min(maxX, Math.max(bounds.minX, localX))),
      y: Math.round(Math.max(
        bounds.minY,
        hasAnchor ? (anchorRect!.top - box.originY) / box.visualScale : 0,
      )),
      layer,
    }
  }

  private removeEmptyLayouts(keepId: string | null = null): void {
    if (this.doc.isReadonly || !this.doc.model?.getChildrenIds) return
    const layoutIds = [...this.doc.model.getChildrenIds(this.runtime.rootId)]
      .filter(id => this.runtime.isPlacementLayout(id))
    for (const layoutId of layoutIds) {
      if (
        layoutId === keepId ||
        this.doc.model.getChildrenIds(layoutId).length
      ) {
        continue
      }
      try {
        const remove = () => this.doc.crud.deleteBlockById(layoutId)
        if (this.doc.revisions) {
          this.doc.revisions.runWithoutTracking(remove)
        } else {
          remove()
        }
      } catch (error) {
        this.doc.logger.warn('removeEmptyPlacementLayoutError: ', error)
      }
    }
  }

  private normalize(): void {
    if (
      this.destroyed ||
      this.normalizing ||
      this.doc.isReadonly ||
      !this.doc.isInitialized ||
      !this.doc.model?.getChildrenIds
    ) return
    const rootIds = [...this.doc.model.getChildrenIds(this.runtime.rootId)]
    const layoutIds = rootIds.filter(id =>
      this.runtime.isPlacementLayout(id),
    )
    const absoluteRootIds = rootIds.filter(id =>
      !this.runtime.isPlacementLayout(id) &&
      this.runtime.hasAbsolutePositionIntent(id),
    )
    const hasLayoutChildren = layoutIds.some(
      id => this.doc.model.getChildrenIds(id).length > 0,
    )
    if (!absoluteRootIds.length && !hasLayoutChildren) {
      this.removeEmptyLayouts()
      return
    }

    this.normalizing = true
    try {
      let canonicalLayoutId: string | null = layoutIds[0] ?? null
      this.doc.crud.transact(() => {
        canonicalLayoutId ??= this.ensureLayoutId()

        // Merge duplicate infrastructure surfaces. Placement-capable children
        // stay absolute by structure; unsupported children return to flow.
        for (const layoutId of layoutIds) {
          const childIds = this.runtime.getLiveChildrenIds(layoutId)
          for (const id of childIds) {
            const sourceIds = this.runtime.getLiveChildrenIds(layoutId)
            const sourceIndex = sourceIds.indexOf(id)
            if (sourceIndex < 0) continue
            if (this.runtime.hasValidAbsolutePlacement(id)) {
              if (layoutId === canonicalLayoutId) continue
              this.doc.crud.moveBlocks(
                layoutId,
                sourceIndex,
                1,
                canonicalLayoutId,
                this.runtime.getLiveChildrenIds(canonicalLayoutId).length,
              )
              continue
            }

            const liveRootIds =
              this.runtime.getLiveChildrenIds(this.runtime.rootId)
            const canonicalIndex = liveRootIds.indexOf(canonicalLayoutId)
            this.doc.crud.moveBlocks(
              layoutId,
              sourceIndex,
              1,
              this.runtime.rootId,
              canonicalIndex >= 0 ? canonicalIndex : liveRootIds.length,
            )
            this.doc.crud.updateBlockProps(id, {
              position: null,
              placementLayer: null,
            } as any)
          }
        }

        // Import/conversion pipelines may first materialize an object as a
        // root sibling with an atomic position. Normalize that transient state
        // into the structural absolute-layout invariant in the same repair.
        for (const id of absoluteRootIds) {
          const liveRootIds =
            this.runtime.getLiveChildrenIds(this.runtime.rootId)
          const sourceIndex = liveRootIds.indexOf(id)
          if (sourceIndex < 0) continue
          this.doc.crud.moveBlocks(
            this.runtime.rootId,
            sourceIndex,
            1,
            canonicalLayoutId,
            this.runtime.getLiveChildrenIds(canonicalLayoutId).length,
          )
        }

        // Keep the infrastructure node at the root tail so ordinary ranges
        // end before it while an explicit full-root boundary can include it.
        const liveRootIds =
          this.runtime.getLiveChildrenIds(this.runtime.rootId)
        const canonicalIndex = liveRootIds.indexOf(canonicalLayoutId)
        if (canonicalIndex >= 0 && canonicalIndex !== liveRootIds.length - 1) {
          this.doc.crud.moveBlocks(
            this.runtime.rootId,
            canonicalIndex,
            1,
            this.runtime.rootId,
            liveRootIds.length - 1,
          )
        }
      }, ORIGIN_NO_RECORD)
      const keepId = canonicalLayoutId
      queueMicrotask(() => {
        if (this.destroyed) return
        this.removeEmptyLayouts(keepId)
        if (keepId && !this.doc.model.getChildrenIds(keepId).length) {
          this.removeEmptyLayouts()
        }
      })
    } catch (error) {
      this.doc.logger.warn('normalizeRootPlacementLayoutError: ', error)
    } finally {
      this.normalizing = false
    }
  }
}
