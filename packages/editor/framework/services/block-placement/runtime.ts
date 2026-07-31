import type {
  BlockPlacementMode,
  ResolvedBlockPosition,
} from '../../block-std/types'
import {resolveBlockPlacement} from './state'
import {BLOCK_PLACEMENT_LAYOUT_FLAVOUR} from './types'

/**
 * Shared read-only Placement queries.
 *
 * Coordinators use this boundary instead of importing the public Manager.
 * It intentionally owns no mutation or event lifecycle.
 */
export class BlockPlacementRuntime {
  constructor(readonly doc: BlockCraft.Doc) {}

  get rootId(): string {
    return this.doc.rootId ?? this.doc.root?.id ?? 'root'
  }

  resolveBlock(
    blockOrId: string | BlockCraft.BlockComponent,
  ): BlockCraft.BlockComponent | null {
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
    try {
      const block = this.doc.getBlockById(id)
      if (typeof blockOrId !== 'string' && block !== blockOrId) return null
      return block
    } catch {
      return null
    }
  }

  getState(
    blockOrId: string | BlockCraft.BlockComponent,
  ): ResolvedBlockPosition {
    const block = this.resolveBlock(blockOrId)
    return resolveBlockPlacement(block?.props?.placement)
  }

  supports(
    blockOrId: string | BlockCraft.BlockComponent,
    mode: BlockPlacementMode,
  ): boolean {
    const block = this.resolveBlock(blockOrId)
    if (!block) return false
    const capability =
      this.doc.schemas.get(block.flavour, false)?.metadata.placement
    if (!capability?.modes.includes(mode)) return false
    if (mode !== 'absolute') return true
    return block.parentId === this.rootId || this.isInAbsoluteLayout(block)
  }

  isPlacementLayout(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
    return this.doc.model?.getFlavour?.(id) ===
      BLOCK_PLACEMENT_LAYOUT_FLAVOUR ||
      (
        typeof blockOrId !== 'string' &&
        blockOrId.flavour === BLOCK_PLACEMENT_LAYOUT_FLAVOUR
      )
  }

  isInAbsoluteLayout(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
    const parentId = this.doc.model?.getParentId?.(id) ??
      (typeof blockOrId === 'string' ? null : blockOrId.parentId)
    return !!parentId && this.isPlacementLayout(parentId)
  }

  allowsGapCursor(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    if (this.isPlacementLayout(blockOrId)) return false
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
    const flavour = typeof blockOrId === 'string'
      ? this.doc.model?.getFlavour?.(id)
      : blockOrId.flavour
    if (!flavour) return true
    const capability =
      this.doc.schemas?.get?.(flavour, false)?.metadata.placement
    if (!capability?.modes.includes('absolute')) return true
    const persisted = typeof blockOrId === 'string'
      ? this.doc.model?.getProps?.(id)?.['placement']
      : blockOrId.props?.placement
    return resolveBlockPlacement(persisted).mode !== 'absolute'
  }

  isAbsoluteObjectSelection(
    selection: BlockCraft.Selection | null | undefined,
  ): boolean {
    if (
      !selection?.isInSameBlock ||
      selection.anchor.type !== 'selected' ||
      selection.head.type !== 'selected' ||
      selection.anchor.blockId !== selection.head.blockId ||
      this.isPlacementLayout(selection.anchor.blockId)
    ) {
      return false
    }
    return !this.allowsGapCursor(selection.anchor.blockId)
  }

  getRootFlowChildIds(fallbackIds: readonly string[] = []): string[] {
    const ids = this.doc.model?.getChildrenIds?.(this.rootId) ??
      this.doc.root?.childrenIds ??
      fallbackIds
    return [...ids].filter(id => {
      if (this.isPlacementLayout(id)) return false
      const modelPlacement = this.doc.model?.getProps?.(id)?.['placement']
      if (modelPlacement !== undefined) {
        return resolveBlockPlacement(modelPlacement).mode !== 'absolute'
      }
      const block = this.resolveBlock(id)
      return !block || this.getState(block).mode !== 'absolute'
    })
  }

  getAbsoluteBlockIds(): string[] {
    const rootIds = this.doc.model?.getChildrenIds?.(this.rootId) ?? []
    return rootIds
      .filter(id => this.isPlacementLayout(id))
      .flatMap(id => [...(this.doc.model?.getChildrenIds?.(id) ?? [])])
      .filter(id =>
        resolveBlockPlacement(this.doc.model?.getProps?.(id)?.['placement'])
          .mode === 'absolute',
      )
  }

  getLiveChildrenIds(blockId: string): string[] {
    const children = this.doc.crud?.getYBlock?.(blockId)?.get('children')
    return typeof children?.toArray === 'function'
      ? [...children.toArray()]
      : [...(this.doc.model?.getChildrenIds?.(blockId) ?? [])]
  }

  getPersistedPlacement(blockId: string): ResolvedBlockPosition {
    const yProps = this.doc.crud?.getYBlock?.(blockId)?.get('props')
    const props = typeof yProps?.toJSON === 'function'
      ? yProps.toJSON()
      : this.doc.model?.getProps?.(blockId)
    return resolveBlockPlacement(props?.['placement'])
  }

  hasValidAbsolutePlacement(blockId: string): boolean {
    const flavour = this.doc.model?.getFlavour?.(blockId)
    if (!flavour) return false
    const capability =
      this.doc.schemas?.get?.(flavour, false)?.metadata.placement
    return !!capability?.modes.includes('absolute') &&
      this.getPersistedPlacement(blockId).mode === 'absolute'
  }

  isReadonly(block: BlockCraft.BlockComponent): boolean {
    return this.doc.isReadonly ||
      this.doc.readonlyManager.isReadonly(block) ||
      this.doc.readonlyManager.containsReadonly(block)
  }
}
