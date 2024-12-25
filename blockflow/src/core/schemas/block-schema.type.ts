import {
  BlockNodeType,
  DeltaInsert,
  IBlockFlavour,
  IBlockModel,
  IBlockProps,
  IEditableBlockModel,
  IMetadata
} from "../types";
import {Type} from "@angular/core";
import {BaseBlock} from "../block-std";

export interface BlockSchema<T extends IBlockProps = IBlockProps> {
  flavour: IBlockFlavour;
  nodeType: BlockNodeType;
  render: Type<BaseBlock<IBlockModel | IEditableBlockModel>>;
  children?: IBlockFlavour[];
  onCreate?: (...params: any[]) => {
    props?: () => T,
    meta?: () => IMetadata,
    children: Array<DeltaInsert> | Array<{ flavour: IBlockFlavour, params?: any[] }>
  },
  icon?: string;
  svgIcon?: string;
  label: string;
  description?: string;
  isLeaf?: boolean;
}

export interface EditableBlockSchema<Props extends IEditableBlockModel["props"]> extends BlockSchema<Props> {
  nodeType: 'editable'
  onCreate?: (deltas: DeltaInsert[], props: IEditableBlockModel["props"]) => {
    props?: () => Props,
    meta?: () => IMetadata,
    children: Array<DeltaInsert>
  }
}

export type IBlockModelMap = Record<IBlockFlavour, IBlockModel>
