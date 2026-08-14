import type {
  BlockPlacementLayer,
} from '../../block-std/types'
import {BlockPlacementRuntime} from './runtime'

interface PlacementStackContext {
  block: BlockCraft.BlockComponent
  layoutId: string
  underIds: string[]
  overIds: string[]
  layer: BlockPlacementLayer
}

/**
 * Owns the ordered under/over object stack around the virtual flow boundary.
 */
export class BlockPlacementStackCoordinator {
  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly runtime: BlockPlacementRuntime,
  ) {}

  setLayer(
    blockOrId: string | BlockCraft.BlockComponent,
    layer: BlockPlacementLayer,
  ): boolean {
    const block = this.runtime.resolveBlock(blockOrId)
    if (
      !block ||
      !this.runtime.supports(block, 'absolute') ||
      this.runtime.isReadonly(block) ||
      (layer !== 'under' && layer !== 'over')
    ) {
      return false
    }
    const current = this.runtime.getState(block)
    if (current.mode !== 'absolute') return false
    const persistedLayer = block.props?.placementLayer
    const isCanonical =
      layer === 'under'
        ? persistedLayer === 'under'
        : persistedLayer == null
    if (current.layer === layer && isCanonical) return true

    block.updateProps({
      placementLayer: layer === 'under' ? 'under' : null,
    } as any)
    block.changeDetectorRef.markForCheck()
    return true
  }

  canMoveForward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    const context = this.resolveContext(blockOrId, true)
    if (!context) return false
    if (context.layer === 'under') return true
    return context.overIds.indexOf(context.block.id) <
      context.overIds.length - 1
  }

  canMoveBackward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    const context = this.resolveContext(blockOrId, true)
    if (!context) return false
    if (context.layer === 'over') return true
    return context.underIds.indexOf(context.block.id) > 0
  }

  moveForward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    return this.move(blockOrId, 'forward')
  }

  moveBackward(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    return this.move(blockOrId, 'backward')
  }

  private resolveContext(
    blockOrId: string | BlockCraft.BlockComponent,
    requireWritable: boolean,
  ): PlacementStackContext | null {
    const block = this.runtime.resolveBlock(blockOrId)
    if (
      !block ||
      (requireWritable && this.runtime.isReadonly(block)) ||
      !this.runtime.supports(block, 'absolute')
    ) {
      return null
    }
    const placement = this.runtime.getPersistedState(block.id)
    if (placement.mode !== 'absolute') return null
    const layoutId = this.doc.model?.getParentId?.(block.id) ?? block.parentId
    if (!layoutId || !this.runtime.isPlacementLayout(layoutId)) return null

    const absoluteIds = this.runtime.getLiveChildrenIds(layoutId)
      .filter(id => this.runtime.hasValidAbsolutePlacement(id))
    if (!absoluteIds.includes(block.id)) return null
    const underIds: string[] = []
    const overIds: string[] = []
    for (const id of absoluteIds) {
      const target =
        this.runtime.getPersistedState(id).layer === 'under'
          ? underIds
          : overIds
      target.push(id)
    }
    return {
      block,
      layoutId,
      underIds,
      overIds,
      layer: placement.layer,
    }
  }

  private move(
    blockOrId: string | BlockCraft.BlockComponent,
    direction: 'forward' | 'backward',
  ): boolean {
    const initial = this.resolveContext(blockOrId, true)
    if (!initial) return false
    const canMove = direction === 'forward'
      ? initial.layer === 'under' ||
        initial.overIds.indexOf(initial.block.id) <
          initial.overIds.length - 1
      : initial.layer === 'over' ||
        initial.underIds.indexOf(initial.block.id) > 0
    if (!canMove) return false

    let moved = false
    this.doc.crud.transact(() => {
      const context = this.resolveContext(initial.block, true)
      if (!context) return
      const group = context.layer === 'under'
        ? context.underIds
        : context.overIds
      const index = group.indexOf(context.block.id)
      if (index < 0) return

      if (direction === 'forward') {
        const nextId = group[index + 1]
        if (nextId) {
          moved = this.moveBlock(
            context.layoutId,
            context.block.id,
            nextId,
            'after',
          )
          return
        }
        if (context.layer !== 'under') return
        const firstOverId = context.overIds[0]
        if (firstOverId) {
          this.moveBlock(
            context.layoutId,
            context.block.id,
            firstOverId,
            'before',
          )
        }
        context.block.updateProps({
          placementLayer: null,
        } as any)
        moved = true
        return
      }

      const previousId = group[index - 1]
      if (previousId) {
        moved = this.moveBlock(
          context.layoutId,
          context.block.id,
          previousId,
          'before',
        )
        return
      }
      if (context.layer !== 'over') return
      const lastUnderId = context.underIds.at(-1)
      if (lastUnderId) {
        this.moveBlock(
          context.layoutId,
          context.block.id,
          lastUnderId,
          'after',
        )
      }
      context.block.updateProps({
        placementLayer: 'under',
      })
      moved = true
    })
    if (moved) initial.block.changeDetectorRef.markForCheck()
    return moved
  }

  private moveBlock(
    layoutId: string,
    blockId: string,
    targetId: string,
    side: 'before' | 'after',
  ): boolean {
    const ids = this.runtime.getLiveChildrenIds(layoutId)
    const sourceIndex = ids.indexOf(blockId)
    const targetIndex = ids.indexOf(targetId)
    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex === targetIndex
    ) {
      return false
    }
    const insertIndex = side === 'before'
      ? targetIndex - (sourceIndex < targetIndex ? 1 : 0)
      : targetIndex + (sourceIndex < targetIndex ? 0 : 1)
    this.doc.crud.moveBlocks(
      layoutId,
      sourceIndex,
      1,
      layoutId,
      insertIndex,
    )
    return true
  }
}
