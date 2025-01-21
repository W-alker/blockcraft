import {SimpleBasicType, SimpleRecord, SimpleValue} from "../../global";

/**
 * block: 普通的块级节点，一般这代表它有children\
 * void: 无children的block节点，且不可编辑，类似html的 <img /> 闭合标签类型 \
 * editable: 可编辑的文本块节点，和void一样，是最底层的block节点\
 */
export enum BlockNodeType {
  block = 'block',
  void = 'void',
  editable = 'editable'
}

export type BlockFlavour = string

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

export type IBlockProps = {
  [key: string]: SimpleValue | undefined | null
}

export interface IBlockSnapshot {
  id: string
  flavour: BlockFlavour
  nodeType: BlockNodeType
  meta: IMetadata
  props: IBlockProps
  children: Array<IBlockSnapshot>
}
