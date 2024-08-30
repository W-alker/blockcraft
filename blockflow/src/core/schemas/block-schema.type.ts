import {BlockNodeType, DeltaInsert, IBlockFlavour, IBlockModel, IBlockProps, IMetadata} from "../types";
import {Type} from "@angular/core";
import {BaseBlock} from "@core/block-std";

export interface BlockSchema<T extends IBlockProps = IBlockProps> {
  flavour: IBlockFlavour;
  nodeType: BlockNodeType;
  render: Type<BaseBlock>;
  children?: IBlockFlavour[];
  meta?: () => IMetadata;
  props?: () => T;
  onCreate?: (...params: any[]) => {
    props?: () => T,
    meta?: () => IMetadata,
    children: Array<DeltaInsert> | Array<{ flavour: IBlockFlavour, params?: any[] }>
  }
}

export type IBlockModelMap = Record<IBlockFlavour, IBlockModel>


