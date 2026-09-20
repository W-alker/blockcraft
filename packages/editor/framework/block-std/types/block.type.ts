import type {SimpleRecord, UnknownRecord} from '@ccc/blockcraft/global/types';
import {BlockNodeType, type BlockDescriptor, type InlineModel} from '@ccc/blockcraft/framework/model';
export {
  BlockNodeType, type IBlockProps, type IEditableBlockProps,
  type BlockPlaceholderMode, type IBaseMetadata, type IMetadata,
  type BlockDescriptor, type BlockSnapshot,
} from '@ccc/blockcraft/framework/model';

export type BlockPlacementMode = 'relative' | 'absolute'
export type BlockPlacementLayer = 'under' | 'over'

/**
 * Runtime coordinates in the nearest placement-plane layout pixels.
 * Persisted IBlockProps.position uses a compact string.
 *
 * Layout mode is structural: a direct child of `placement-layout` or
 * `object-group` is absolute; an ordinary root child remains in normal flow.
 * Position therefore carries no duplicated `mode` or `unit` discriminator.
 */
export type BlockPosition = {
  x: number
  y: number
}

export type ResolvedBlockPosition = {
  mode: BlockPlacementMode
  x: number
  y: number
  layer: BlockPlacementLayer
}

/** 编辑器描述继续受注册表约束；通用数据描述使用模型入口的 BlockDescriptor。 */
export interface BaseBlockDesc<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord>
  extends BlockDescriptor<P, M, BlockCraft.BlockFlavour> {}

export type IBlockSnapshot<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord> =
  UnknownRecord
  & Exclude<BaseBlockDesc<P, M>, 'nodeType'>
  & ({
  nodeType: BlockNodeType.block | BlockNodeType.root
  children: IBlockSnapshot[]
} | {
  nodeType: BlockNodeType.void
  children: []
} | {
  nodeType: BlockNodeType.editable
  children: InlineModel
})
