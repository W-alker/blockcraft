import type {SimpleRecord, UnknownRecord} from '@ccc/blockcraft/global/types';
import {BlockNodeType, type BlockDescriptor, type BlockSnapshot, type IBlockProps,
  type IMetadata, type InlineModel} from '@ccc/blockcraft/framework/model';
import type {BaseBlockDesc, IBlockSnapshot} from './registered-block.type.js';

// 不加载 Angular/内置块，验证编辑器契约确实由注册表约束并支持消费方增强。
declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      root: unknown;
      paragraph: unknown;
    }
    type BlockFlavour = keyof IBlockComponents;
  }
}
declare global {
  namespace BlockCraft {
    interface IBlockComponents { 'custom-note': unknown }
  }
}
declare module './registered-block.type.js' {
  interface BaseBlockDesc<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord> {
    consumerMarker?: string;
  }
}

// 保留重构前的结构作为兼容性基线；不从新实现自动生成。
interface PreviousDescriptor<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord> {
  id: string;
  flavour: BlockCraft.BlockFlavour;
  nodeType: BlockNodeType | `${BlockNodeType}`;
  meta: IMetadata & M;
  props: IBlockProps & P;
  consumerMarker?: string;
}
type PreviousSnapshot<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord> =
  UnknownRecord & Exclude<PreviousDescriptor<P, M>, 'nodeType'> & ({
    nodeType: BlockNodeType.block | BlockNodeType.root;
    children: PreviousSnapshot[];
  } | {
    nodeType: BlockNodeType.void;
    children: [];
  } | {
    nodeType: BlockNodeType.editable;
    children: InlineModel;
  });
type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Props = {requiredProp: string};
type Meta = {owner: string};
type DescriptorBefore = Expect<PreviousDescriptor<Props, Meta> extends BaseBlockDesc<Props, Meta> ? true : false>;
type DescriptorAfter = Expect<BaseBlockDesc<Props, Meta> extends PreviousDescriptor<Props, Meta> ? true : false>;
type SnapshotBefore = Expect<PreviousSnapshot<Props, Meta> extends IBlockSnapshot<Props, Meta> ? true : false>;
type SnapshotAfter = Expect<IBlockSnapshot<Props, Meta> extends PreviousSnapshot<Props, Meta> ? true : false>;
type RegisteredFlavours = Expect<Equal<IBlockSnapshot['flavour'], 'root' | 'paragraph' | 'custom-note'>>;
type CurrentChildren = Extract<IBlockSnapshot<Props, Meta>, {nodeType: BlockNodeType.block | BlockNodeType.root}>['children'][number];
type ChildrenKeepDefaultProps = Expect<Equal<CurrentChildren['props'], IBlockProps & SimpleRecord>>;
type ChildFlavours = Expect<Equal<CurrentChildren['flavour'], BlockCraft.BlockFlavour>>;
type ChildAugmentation = Expect<Equal<CurrentChildren['consumerMarker'], string | undefined>>;
type ParentAugmentation = Expect<Equal<IBlockSnapshot['consumerMarker'], string | undefined>>;

const custom: IBlockSnapshot = {id: 'custom', flavour: 'custom-note', nodeType: BlockNodeType.void, props: {}, meta: {}, children: []};
const container: IBlockSnapshot<Props, Meta> = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {requiredProp: 'only-parent'}, meta: {owner: 'parent'}, children: [custom]};
const portable: BlockSnapshot = container;
const descriptor: BlockDescriptor<Props, Meta, BlockCraft.BlockFlavour> = container;
// @ts-expect-error 编辑器入口不放宽为任意 flavour。
const unregistered: IBlockSnapshot = {...custom, flavour: 'unknown'};
// @ts-expect-error 后代块也不能绕过注册表。
const unknownChild: IBlockSnapshot = {...container, children: [{...custom, flavour: 'unknown'}]};
// @ts-expect-error 根节点专有属性仍然必填。
const missingProps: IBlockSnapshot<Props, Meta> = {...container, props: {}};
// @ts-expect-error 根节点专有 metadata 仍然必填。
const missingMeta: IBlockSnapshot<Props, Meta> = {...container, meta: {}};
// @ts-expect-error 通用数据没有自动获得编辑器注册资格。
const notValidated: IBlockSnapshot = portable;
