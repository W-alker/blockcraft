import {BlockNodeType} from "./node-type.type";
import {IInlineModel} from "./inline.type";
import {SimpleBasicType, SimpleRecord, SimpleValue} from "./currency.type";

export type IBlockFlavour = string;

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
  indent?: number
  [key: string]: SimpleValue | undefined | null
}

export interface IBlockModel {
  id: string
  flavour: IBlockFlavour
  nodeType: BlockNodeType
  meta: IMetadata
  props: IBlockProps
  children: Array<IBlockModel | IInlineModel>
}

export interface IEditableBlockModel extends IBlockModel {
  nodeType: 'editable'
  children: IInlineModel[]
  props: IBlockProps & {
    indent: number
    textAlign?: 'left' | 'center' | 'right'
  }
}


