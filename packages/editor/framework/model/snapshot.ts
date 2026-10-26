import type {SimpleRecord, UnknownRecord} from '@ccc/blockcraft/global/types';
import {BlockNodeType, type IBlockProps} from './block';
import type {IMetadata} from './metadata';
import type {InlineModel} from './inline';

/** 与组件注册表无关的数据描述；F 可由消费方限定为自己的 flavour 集合。 */
export interface BlockDescriptor<
  P extends SimpleRecord = SimpleRecord,
  M extends SimpleRecord = SimpleRecord,
  F extends PropertyKey = string,
> {
  id: string
  flavour: F
  nodeType: BlockNodeType | `${BlockNodeType}`
  meta: IMetadata & M
  props: IBlockProps & P
}

/**
 * 通用快照数据。子块沿用 flavour 集合，但其 props/meta 不继承父块的专有泛型。
 * 此类型不表示数据已通过 Schema 校验，也不授予文档写入权限。
 */
export type BlockSnapshot<
  P extends SimpleRecord = SimpleRecord,
  M extends SimpleRecord = SimpleRecord,
  F extends PropertyKey = string,
> = UnknownRecord & BlockDescriptor<P, M, F> & ({
  nodeType: BlockNodeType.block | BlockNodeType.root
  children: BlockSnapshot<SimpleRecord, SimpleRecord, F>[]
} | {
  nodeType: BlockNodeType.void
  children: []
} | {
  nodeType: BlockNodeType.editable
  children: InlineModel
})
