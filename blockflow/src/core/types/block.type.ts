import {BlockNodeType} from "./node-type.type";
import {IInlineModel} from "./inline.type";
import {SimpleBasicType, SimpleRecord} from "./currency.type";

export type IBlockFlavour = string;

export interface IBaseMetadata {
  folded?: boolean
  indent?: number
  selected?: boolean
}

export type IMetadata = IBaseMetadata & SimpleRecord

export type IBlockProps = SimpleRecord

export interface IBlockModel{
  id: string
  flavour: IBlockFlavour
  nodeType: BlockNodeType
  meta: IMetadata
  props: IBlockProps
  children?: Array<IBlockModel | IInlineModel>
}

export interface IEditableBlockModel extends IBlockModel{
  nodeType: 'editable'
  children: IInlineModel[]
}

