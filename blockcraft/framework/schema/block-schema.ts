import {Type} from "@angular/core";
import {IBlockProps, IBlockSnapshot, InlineModel} from "../types";
import {NativeBlockModel} from "../reactive";

export type EditableBlockCreateSnapshotParams = [(InlineModel | string)?, IBlockProps?];

type BlockCreateFn<T extends unknown[], M extends NativeBlockModel> = T extends [infer A, infer B, infer C] ? (arg1: A, arg: B, arg3: C) => IBlockSnapshot<M['props'], M['meta']> : (...args: T) => IBlockSnapshot<M['props'], M['meta']>

export interface BlockSchemaOptions<T extends NativeBlockModel = NativeBlockModel> {
  flavour: T['flavour'];
  nodeType: T['nodeType'];
  component: Type<BlockCraft.IBlockComponents[T['flavour']]>;
  createSnapshot: BlockCreateFn<BlockCraft.BlockCreateParameters<T['flavour']>, T>
  metadata: {
    version: number
    icon?: string;
    svgIcon?: string;
    label: string;
    description?: string;
    isLeaf?: boolean;
    /**
     * ['paragraph', 'image'] means that this block can contain in paragraph and image blocks\
     * ['table-*'] contains 'table-row', 'table-cell' blocks\
     * ['*'] means that this block can contain any blocks
     */
    children?: string[]
  }
}
