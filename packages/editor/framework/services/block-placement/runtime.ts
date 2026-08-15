import type {
  BlockPlacementMode,
  ResolvedBlockPosition,
} from '../../block-std/types'
import {resolveBlockPosition, resolvePlacementLayer} from './state'
import {
  BLOCK_OBJECT_GROUP_FLAVOUR,
  BLOCK_PLACEMENT_LAYOUT_FLAVOUR,
} from './types'

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
    if (!block || !this.isInAbsoluteLayout(block)) {
      return {mode: 'relative', x: 0, y: 0, layer: 'over'}
    }
    const position = resolveBlockPosition(block.props?.position)
    return {
      mode: 'absolute',
      ...position,
      layer: resolvePlacementLayer(block.props?.placementLayer),
    }
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
    if (this.isInObjectGroup(block)) return mode === 'absolute'
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

  isObjectGroup(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
    return this.doc.model?.getFlavour?.(id) === BLOCK_OBJECT_GROUP_FLAVOUR ||
      (
        typeof blockOrId !== 'string' &&
        blockOrId.flavour === BLOCK_OBJECT_GROUP_FLAVOUR
      )
  }

  isInObjectGroup(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
    const parentId = this.doc.model?.getParentId?.(id) ??
      (typeof blockOrId === 'string' ? null : blockOrId.parentId)
    return !!parentId && this.isObjectGroup(parentId)
  }

  isInAbsoluteLayout(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId.id
    const parentId = this.doc.model?.getParentId?.(id) ??
      (typeof blockOrId === 'string' ? null : blockOrId.parentId)
    return !!parentId &&
      (this.isPlacementLayout(parentId) || this.isObjectGroup(parentId))
  }

  allowsGapCursor(
    blockOrId: string | BlockCraft.BlockComponent,
  ): boolean {
    if (this.isPlacementLayout(blockOrId) || this.isObjectGroup(blockOrId)) {
      return false
    }
    return !this.isInAbsoluteLayout(blockOrId)
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
    return [...ids].filter(id => !this.isPlacementLayout(id))
  }

  getAbsoluteBlockIds(): string[] {
    const rootIds = this.doc.model?.getChildrenIds?.(this.rootId) ?? []
    return rootIds
      .filter(id => this.isPlacementLayout(id))
      .flatMap(id => [...(this.doc.model?.getChildrenIds?.(id) ?? [])])
      .filter(id => this.hasValidAbsolutePlacement(id))
  }

  getLiveChildrenIds(blockId: string): string[] {
    const children = this.doc.crud?.getYBlock?.(blockId)?.get('children')
    return typeof children?.toArray === 'function'
      ? [...children.toArray()]
      : [...(this.doc.model?.getChildrenIds?.(blockId) ?? [])]
  }

  getPersistedState(blockId: string): ResolvedBlockPosition {
    const yProps = this.doc.crud?.getYBlock?.(blockId)?.get('props')
    const props = typeof yProps?.toJSON === 'function'
      ? yProps.toJSON()
      : this.doc.model?.getProps?.(blockId)
    if (!this.isInAbsoluteLayout(blockId)) {
      return {mode: 'relative', x: 0, y: 0, layer: 'over'}
    }
    return {
      mode: 'absolute',
      ...resolveBlockPosition(props?.['position']),
      layer: resolvePlacementLayer(props?.['placementLayer']),
    }
  }

  hasAbsolutePositionIntent(blockId: string): boolean {
    const flavour = this.doc.model?.getFlavour?.(blockId)
    if (!flavour) return false
    const capability =
      this.doc.schemas?.get?.(flavour, false)?.metadata.placement
    if (!capability?.modes.includes('absolute')) return false
    const position = this.doc.model?.getProps?.(blockId)?.['position']
    return !!position && typeof position === 'object' && !Array.isArray(position)
  }

  hasValidAbsolutePlacement(blockId: string): boolean {
    const flavour = this.doc.model?.getFlavour?.(blockId)
    if (!flavour) return false
    const capability =
      this.doc.schemas?.get?.(flavour, false)?.metadata.placement
    return !!capability?.modes.includes('absolute') &&
      this.isInAbsoluteLayout(blockId)
  }

  isReadonly(block: string | BlockCraft.BlockComponent): boolean {
    return this.doc.isReadonly ||
      this.doc.readonlyManager.isReadonly(block) ||
      this.doc.readonlyManager.containsReadonly(block)
  }
}
