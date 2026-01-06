import {SimpleBasicType, SimpleRecord, SimpleValue, UnknownRecord} from "../../../global";
import {InlineModel} from "./inline.type";

/**
 * root = 'root',
 * block: 普通的块级节点，一般这代表它有children\
 * void: 无children的block节点，且不可编辑，类似html的 \<img /> 闭合标签类型 \
 * editable: 可编辑的文本块节点，和void一样，是最底层的block节点\
 */
export enum BlockNodeType {
  root = 'root',
  block = 'block',
  void = 'void',
  editable = 'editable'
}

export interface IBaseMetadata {
  folded?: boolean
  selected?: boolean
  createdTime?: number
  lastModified?: {
    time: number
    [key: string]: SimpleBasicType
  }
}

export type IMetadata = IBaseMetadata & SimpleRecord

export interface IBlockProps {
  textAlign?: 'center' | 'right'
  depth?: number

  [key: string]: SimpleValue
}

export interface IEditableBlockProps extends IBlockProps {
  depth: number
  heading?: number
}

export interface BaseBlockDesc<P extends SimpleRecord = SimpleRecord, M extends SimpleRecord = SimpleRecord> {
  id: string
  flavour: BlockCraft.BlockFlavour
  nodeType: BlockNodeType | `${BlockNodeType}`
  meta: IMetadata & M
  props: IBlockProps & P
}

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
