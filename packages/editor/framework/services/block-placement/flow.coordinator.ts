import type {BlockPlacementLayer} from '../../block-std/types'
import {measureBlockPlacement} from './geometry'
import {RootPlacementLayoutCoordinator} from './root-layout.coordinator'
import {BlockPlacementRuntime} from './runtime'
import type {BlockPlacementFlowAnchor} from './types'

/**
 * Converts root objects between normal flow and the absolute placement layout.
 */
export class BlockPlacementFlowCoordinator {
  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly runtime: BlockPlacementRuntime,
    private readonly rootLayout: RootPlacementLayoutCoordinator,
  ) {}

  resolveFlowAnchor(
    blockOrId: string | BlockCraft.BlockComponent,
  ): BlockPlacementFlowAnchor | null {
    const block = this.runtime.resolveBlock(blockOrId)
    if (
      !block ||
      this.runtime.getState(block).mode !== 'absolute' ||
      !block.hostElement.isConnected
    ) {
      return null
    }

    const sourceRect = block.hostElement.getBoundingClientRect()
    const sourceCenterY = sourceRect.top + sourceRect.height / 2
    if (!Number.isFinite(sourceCenterY)) return null

    let best: {
      block: BlockCraft.BlockComponent
      rect: DOMRect
      edgeDistance: number
      centerDistance: number
    } | null = null

    const legacyRootIds =
      block.parentId === this.runtime.rootId
        ? block.parentBlock?.childrenIds ?? []
        : []
    for (const id of this.runtime.getRootFlowChildIds(legacyRootIds)) {
      if (id === block.id) continue
      const candidate = this.runtime.resolveBlock(id)
      if (
        !candidate ||
        (
          this.runtime.supports(candidate, 'absolute') &&
          this.runtime.getState(candidate).mode === 'absolute'
        ) ||
        !candidate.hostElement.isConnected ||
        candidate.hostElement.hasAttribute('data-bc-placement-layer-bridge')
      ) {
        continue
      }
      const rect = candidate.hostElement.getBoundingClientRect()
      if (
        !Number.isFinite(rect.top) ||
        !Number.isFinite(rect.bottom) ||
        rect.bottom < rect.top
      ) {
        continue
      }
      const edgeDistance =
        sourceCenterY < rect.top
          ? rect.top - sourceCenterY
          : sourceCenterY > rect.bottom
            ? sourceCenterY - rect.bottom
            : 0
      const centerDistance =
        Math.abs(sourceCenterY - (rect.top + rect.height / 2))
      if (
        !best ||
        edgeDistance < best.edgeDistance ||
        (
          edgeDistance === best.edgeDistance &&
          centerDistance < best.centerDistance
        )
      ) {
        best = {block: candidate, rect, edgeDistance, centerDistance}
      }
    }
    if (!best) return null

    return {
      parentId: this.runtime.rootId,
      anchorBlockId: best.block.id,
      side: sourceCenterY < best.rect.top + best.rect.height / 2
        ? 'before'
        : 'after',
    }
  }

  reanchorToFlow(
    blockOrId: string | BlockCraft.BlockComponent,
    anchor: BlockPlacementFlowAnchor | null =
      this.resolveFlowAnchor(blockOrId),
  ): boolean {
    const block = this.runtime.resolveBlock(blockOrId)
    if (
      !block ||
      this.runtime.isReadonly(block) ||
      !block.parentId ||
      (
        block.parentId !== this.runtime.rootId &&
        !this.runtime.isInAbsoluteLayout(block)
      ) ||
      (
        anchor !== null &&
        (
          anchor.parentId !== this.runtime.rootId ||
          (anchor.side !== 'before' && anchor.side !== 'after')
        )
      )
    ) {
      return false
    }
    const sourceParentId = block.parentId
    const sourceIds = this.doc.model?.getChildrenIds?.(sourceParentId) ??
      block.parentBlock?.childrenIds ??
      []
    const sourceIndex = sourceIds.indexOf(block.id)
    if (sourceIndex < 0) return false

    const rootIds = this.doc.model?.getChildrenIds?.(this.runtime.rootId) ??
      this.doc.root?.childrenIds ??
      (
        sourceParentId === this.runtime.rootId
          ? block.parentBlock?.childrenIds ?? []
          : []
      )
    const layoutIndex = rootIds.findIndex(id =>
      this.runtime.isPlacementLayout(id),
    )
    let targetIndex = layoutIndex >= 0 ? layoutIndex : rootIds.length
    if (anchor) {
      const anchorIndex = rootIds.indexOf(anchor.anchorBlockId)
      if (anchorIndex < 0) return false
      targetIndex = anchorIndex + (anchor.side === 'after' ? 1 : 0)
    }
    if (
      sourceParentId === this.runtime.rootId &&
      sourceIndex < targetIndex
    ) {
      targetIndex--
    }

    this.doc.crud.moveBlocks(
      sourceParentId,
      sourceIndex,
      1,
      this.runtime.rootId,
      targetIndex,
    )
    if (this.runtime.isPlacementLayout(sourceParentId)) {
      this.rootLayout.queueNormalization()
    }
    return true
  }

  liftToAbsolute(
    block: BlockCraft.BlockComponent,
    layer: BlockPlacementLayer,
  ): boolean {
    if (
      !this.runtime.supports(block, 'absolute') ||
      this.runtime.isReadonly(block) ||
      block.parentId !== this.runtime.rootId ||
      !block.hostElement.isConnected
    ) {
      return false
    }

    const measured = measureBlockPlacement(block.hostElement)
    // Lightweight hosts/tests that do not expose the model layer keep the
    // previous props-only behavior; production documents take the layout path.
    if (
      !this.doc.model?.getChildrenIds ||
      !this.doc.crud?.insertBlockSnapshots ||
      !this.doc.crud?.getYBlock
    ) {
      this.doc.crud.transact(() => {
        block.updateProps({
          placement: {
            mode: 'absolute',
            x: measured.x,
            y: measured.y,
            ...(layer === 'under' ? {layer} : {}),
          },
        } as any)
      })
      block.changeDetectorRef.markForCheck()
      return true
    }

    const sourceIndex =
      this.doc.model.getChildrenIds(this.runtime.rootId).indexOf(block.id)
    if (sourceIndex < 0) return false

    this.doc.crud.transact(() => {
      const layoutId = this.rootLayout.ensureLayoutId()
      const targetIndex = this.doc.crud.getYBlock(layoutId)
        ?.get('children')
        ?.length ?? 0
      this.doc.crud.moveBlocks(
        this.runtime.rootId,
        sourceIndex,
        1,
        layoutId,
        targetIndex,
      )
      block.updateProps({
        placement: {
          mode: 'absolute',
          x: measured.x,
          y: measured.y,
          ...(layer === 'under' ? {layer} : {}),
        },
      } as any)
    })
    this.rootLayout.queueNormalization()
    block.changeDetectorRef.markForCheck()
    return true
  }
}
