import {Observable, Subscription} from 'rxjs'
import type {
  BlockPlacementLayer,
  BlockPlacementMode,
  IBlockProps,
  IBlockSnapshot,
  ResolvedBlockPosition,
} from '../block-std/types'
import {BlockPlacementFlowCoordinator} from './block-placement/flow.coordinator'
import {
  BlockPlacementAlignmentCoordinator,
} from './block-placement/alignment.coordinator'
import {BlockPlacementGroupCoordinator} from './block-placement/group.coordinator'
import {
  BlockPlacementInteractionController,
} from './block-placement/interaction.controller'
import {
  RootPlacementLayoutCoordinator,
} from './block-placement/root-layout.coordinator'
import {BlockPlacementRuntime} from './block-placement/runtime'
import {BlockPlacementStackCoordinator} from './block-placement/stack.coordinator'
import {
  type AbsoluteBlockInsertOptions,
  type BlockObjectAlignment,
  type BlockObjectBlockLayout,
  type BlockObjectLayout,
  type BlockObjectLayoutAdapter,
  type BlockObjectPlaneAlignment,
  type BlockPlacementDragState,
  type BlockPlacementFlowAnchor,
} from './block-placement/types'

export {
  measureBlockPlacement,
  measureObjectPlacement,
  resolvePlacementBox,
  resolvePlacementPlaneBounds,
} from './block-placement/geometry'
export {
  resolveBlockPosition,
  resolvePlacementLayer,
} from './block-placement/state'
export {
  BLOCK_OBJECT_GROUP_PADDING,
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BLOCK_OBJECT_GROUP_FLAVOUR,
  BLOCK_OBJECT_PLANE_ALIGNMENT_OPTIONS,
  BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
  normalizeBlockObjectGroupProps,
} from './block-placement/types'
export type {
  AbsoluteBlockInsertOptions,
  BlockObjectBlockLayout,
  BlockObjectAlignment,
  BlockObjectLayout,
  BlockObjectLayoutAdapter,
  BlockObjectLayoutAdapterContext,
  BlockObjectLayoutOption,
  BlockObjectGroupProps,
  BlockObjectPlaneAlignment,
  BlockObjectPlaneAlignmentOption,
  BlockPlacementConfig,
  BlockPlacementDragState,
  BlockPlacementFlowAnchor,
  BlockPlacementTransitionContext,
  PlacementBox,
} from './block-placement/types'

/**
 * Public document-level facade for relative/absolute object placement.
 *
 * Internal collaborators own model queries, root layout repair, flow
 * conversion, stacking and interaction lifecycles. The facade preserves one
 * coherent public command surface while every persistent mutation continues
 * through DocCRUD or BlockComponent.updateProps().
 */
export class BlockPlacementManager {
  private readonly runtime = new BlockPlacementRuntime(this.doc)
  private readonly alignment = new BlockPlacementAlignmentCoordinator(
    this.doc,
    this.runtime,
  )
  private readonly rootLayout = new RootPlacementLayoutCoordinator(
    this.doc,
    this.runtime,
  )
  private readonly flow = new BlockPlacementFlowCoordinator(
    this.doc,
    this.runtime,
    this.rootLayout,
  )
  private readonly stack = new BlockPlacementStackCoordinator(
    this.doc,
    this.runtime,
  )
  private readonly groupCoordinator = new BlockPlacementGroupCoordinator(
    this.doc,
    this.runtime,
  )
  private readonly interaction = new BlockPlacementInteractionController(
    this.doc,
    this.runtime,
    (block, patch) => this.groupCoordinator.updateObjectGeometry(block, patch),
  )
  private readonly _subscriptions = new Subscription()
  private readonly _objectLayoutAdapters =
    new Map<string, BlockObjectLayoutAdapter>()

  constructor(private readonly doc: BlockCraft.Doc) {
    this._subscriptions.add(this.doc.onDestroy$.subscribe(() => this.destroy()))
  }

  get state$(): Observable<BlockPlacementDragState> {
    return this.interaction.state$
  }

  get state(): BlockPlacementDragState {
    return this.interaction.state
  }

  get isDragging(): boolean {
    return this.interaction.isDragging
  }

  /**
   * Register a materialized placement-capable block for cold-path underlay
   * picking. BaseBlockComponent owns the returned lifecycle disposer.
   */
  registerBlockView(block: BlockCraft.BlockComponent): () => void {
    return this.interaction.registerBlockView(block)
  }

  getState(blockOrId: string | BlockCraft.BlockComponent): ResolvedBlockPosition {
    return this.runtime.getState(blockOrId)
  }

  supports(
    blockOrId: string | BlockCraft.BlockComponent,
    mode: BlockPlacementMode,
  ): boolean {
    return this.runtime.supports(blockOrId, mode)
  }

  /**
   * Gap cursors are a normal-flow editing affordance. Infrastructure layout
   * nodes and absolute objects never expose one.
   */
  allowsGapCursor(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    return this.runtime.allowsGapCursor(blockOrId)
  }

  /**
   * Object-level selection is isolated from ordinary document input while
   * object commands (drag/resize/style/delete) remain writable.
   */
  isAbsoluteObjectSelection(
    selection: BlockCraft.Selection | null | undefined,
  ): boolean {
    return this.runtime.isAbsoluteObjectSelection(selection)
  }

  isPlacementLayout(blockOrId: string | BlockCraft.BlockComponent): boolean {
    return this.runtime.isPlacementLayout(blockOrId)
  }

  isObjectGroup(blockOrId: string | BlockCraft.BlockComponent): boolean {
    return this.runtime.isObjectGroup(blockOrId)
  }

  isInObjectGroup(blockOrId: string | BlockCraft.BlockComponent): boolean {
    return this.runtime.isInObjectGroup(blockOrId)
  }

  isInAbsoluteLayout(blockOrId: string | BlockCraft.BlockComponent): boolean {
    return this.runtime.isInAbsoluteLayout(blockOrId)
  }

  getRootFlowChildIds(fallbackIds: readonly string[] = []): string[] {
    return this.runtime.getRootFlowChildIds(fallbackIds)
  }

  getAbsoluteBlockIds(): string[] {
    return this.runtime.getAbsoluteBlockIds()
  }

  /**
   * Test whether two or more root absolute objects can share one alignment
   * command. Distribution additionally requires at least three objects.
   */
  canAlignObjects(
    blockIds: readonly string[],
    alignment?: BlockObjectAlignment,
  ): boolean {
    return this.alignment.canAlignObjects(blockIds, alignment)
  }

  /**
   * Apply a one-shot rotation-aware alignment without changing object sizes,
   * responsive sizing fields or placement layers.
   */
  alignObjects(
    blockIds: readonly string[],
    alignment: BlockObjectAlignment,
  ): boolean {
    return this.alignment.alignObjects(blockIds, alignment)
  }

  /**
   * Test whether one or more root absolute objects can align against the
   * placement plane itself (page left/center/right). Requires a measured
   * plane width; group members are excluded like every alignment command.
   */
  canAlignObjectsToPlane(
    blockIds: readonly string[],
    alignment?: BlockObjectPlaneAlignment,
  ): boolean {
    return this.alignment.canAlignObjectsToPlane(blockIds, alignment)
  }

  /**
   * Snap each object's rotation-aware visual bounds to the plane edge/center
   * in one transaction. Only `position.x` changes; `y`, sizes and layers are
   * preserved.
   */
  alignObjectsToPlane(
    blockIds: readonly string[],
    alignment: BlockObjectPlaneAlignment,
  ): boolean {
    return this.alignment.alignObjectsToPlane(blockIds, alignment)
  }

  canGroup(blockIds: readonly string[]): boolean {
    return this.groupCoordinator.canGroup(blockIds)
  }

  group(blockIds: readonly string[]): string | null {
    return this.groupCoordinator.group(blockIds)
  }

  canUngroup(groupId: string): boolean {
    return this.groupCoordinator.canUngroup(groupId)
  }

  ungroup(groupId: string): string[] {
    return this.groupCoordinator.ungroup(groupId)
  }

  /**
   * Persist object geometry and keep a containing object-group tightly fitted.
   * Built-in object blocks use this instead of writing size/rotation directly.
   */
  updateObjectGeometry(
    blockOrId: string | BlockCraft.BlockComponent,
    patch: Partial<IBlockProps>,
  ): boolean {
    const block = this.resolveBlock(blockOrId)
    if (!block) return false
    return this.groupCoordinator.updateObjectGeometry(block, patch)
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
    return this.rootLayout.insertAbsoluteSnapshot(snapshot, options)
  }

  registerObjectLayoutAdapter(
    flavour: string,
    adapter: BlockObjectLayoutAdapter,
  ): () => void {
    this._objectLayoutAdapters.set(flavour, adapter)
    let released = false
    return () => {
      if (released) return
      released = true
      if (this._objectLayoutAdapters.get(flavour) === adapter) {
        this._objectLayoutAdapters.delete(flavour)
      }
    }
  }

  getObjectLayout(
    blockOrId: string | BlockCraft.BlockComponent,
  ): BlockObjectBlockLayout {
    const placement = this.getState(blockOrId)
    if (placement.mode === 'relative') return 'top-bottom'
    return placement.layer
  }

  supportsObjectLayout(
    blockOrId: string | BlockCraft.BlockComponent,
    layout: BlockObjectLayout,
  ): boolean {
    const block = this.resolveBlock(blockOrId)
    if (!block) return false
    // Group members stay inside their fixed local plane until ungrouped. Their
    // flavour toolbar may remain visible for style/resize, but representation
    // or flow/layer transitions would break the group boundary.
    if (this.runtime.isInObjectGroup(block)) return false
    if (layout === 'inline') {
      return this._objectLayoutAdapters.has(block.flavour)
    }
    if (layout === 'top-bottom') return this.supports(block, 'relative')
    return this.supports(block, 'absolute')
  }

  /**
   * Apply a Word-like object layout state.
   *
   * Moving above/below text implicitly lifts the block into absolute
   * placement. Returning to top/bottom implicitly restores normal flow.
   */
  setObjectLayout(
    blockOrId: string | BlockCraft.BlockComponent,
    layout: BlockObjectLayout,
  ): boolean {
    const block = this.resolveBlock(blockOrId)
    if (
      !block ||
      !this.supportsObjectLayout(block, layout) ||
      this.isReadonly(block)
    ) {
      return false
    }
    if (layout === 'inline') {
      return this._objectLayoutAdapters.get(block.flavour)!.toInline({
        doc: this.doc,
        block,
      })
    }
    if (layout === 'top-bottom') {
      return this.setMode(block, 'relative')
    }

    const current = this.getState(block)
    if (current.mode === 'absolute') {
      return this.setLayer(block, layout)
    }
    return this.flow.liftToAbsolute(block, layout)
  }

  /**
   * Resolve where an absolute block should return to normal flow.
   *
   * This is a conversion cold path. It reads mounted sibling geometry once,
   * chooses the nearest ordinary flow block by vertical distance, then uses
   * that block's midpoint to decide before/after.
   */
  resolveFlowAnchor(
    blockOrId: string | BlockCraft.BlockComponent,
  ): BlockPlacementFlowAnchor | null {
    return this.flow.resolveFlowAnchor(blockOrId)
  }

  /**
   * Move a block to a previously resolved visual anchor without changing its
   * position props. Callers can compose this inside their own transaction
   * with clearing position or replacing the block snapshot.
   */
  reanchorToFlow(
    blockOrId: string | BlockCraft.BlockComponent,
    anchor: BlockPlacementFlowAnchor | null = this.resolveFlowAnchor(blockOrId),
  ): boolean {
    return this.flow.reanchorToFlow(blockOrId, anchor)
  }

  setMode(
    blockOrId: string | BlockCraft.BlockComponent,
    mode: BlockPlacementMode,
  ): boolean {
    const block = this.resolveBlock(blockOrId)
    if (!block || !this.supports(block, mode) || this.isReadonly(block)) return false
    const current = this.getState(block)
    let defaultApplied = false
    const applyDefault = (): boolean => {
      if (defaultApplied) return true
      defaultApplied = true
      if (current.mode === mode) return true
      if (mode === 'relative') {
        const anchor = this.resolveFlowAnchor(block)
        this.doc.crud.transact(() => {
          if (!this.reanchorToFlow(block, anchor)) return
          block.updateProps({position: null, placementLayer: null} as any)
        })
        this.rootLayout.queueNormalization()
      } else {
        return this.flow.liftToAbsolute(block, current.layer)
      }
      return true
    }

    const handled = this.doc.config?.placement?.transitionMode?.({
      doc: this.doc,
      block,
      from: current.mode,
      to: mode,
      applyDefault,
    })
    if (handled !== true) applyDefault()
    block.changeDetectorRef.markForCheck()
    return true
  }

  setLayer(
    blockOrId: string | BlockCraft.BlockComponent,
    layer: BlockPlacementLayer,
  ): boolean {
    return this.stack.setLayer(blockOrId, layer)
  }

  /**
   * Whether an absolute object can move one paint step toward the foreground.
   *
   * Flow content is a virtual boundary between the ordered under/over groups.
   * Every under object can therefore move forward across content, while only
   * the highest over object is already at the total-stack boundary.
   */
  canMoveForward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    return this.stack.canMoveForward(blockOrId)
  }

  /**
   * Whether an absolute object can move one paint step toward the background.
   */
  canMoveBackward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    return this.stack.canMoveBackward(blockOrId)
  }

  moveForward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    return this.stack.moveForward(blockOrId)
  }

  moveBackward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    return this.stack.moveBackward(blockOrId)
  }

  updateAbsolute(
    blockOrId: string | BlockCraft.BlockComponent,
    patch: {x?: number; y?: number},
  ): boolean {
    return this.interaction.updateAbsolute(blockOrId, patch)
  }

  startDrag(
    event: PointerEvent,
    blockOrId: string | BlockCraft.BlockComponent,
    options: {movementThreshold?: number} = {},
  ): boolean {
    return this.interaction.startDrag(event, blockOrId, options)
  }

  cancelDrag(): void {
    this.interaction.cancelDrag()
  }

  destroy(): void {
    this.interaction.destroy()
    this.groupCoordinator.destroy()
    this.rootLayout.destroy()
    this._objectLayoutAdapters.clear()
    this._subscriptions.unsubscribe()
  }

  private resolveBlock(
    blockOrId: string | BlockCraft.BlockComponent,
  ): BlockCraft.BlockComponent | null {
    return this.runtime.resolveBlock(blockOrId)
  }

  private isReadonly(block: BlockCraft.BlockComponent): boolean {
    return this.runtime.isReadonly(block)
  }
}
