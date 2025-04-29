import {Type} from "@angular/core";
import {BlockNodeType, IBlockProps, IBlockSnapshot, IEditableBlockProps, InlineModel} from "../types";
import {NativeBlockModel} from "../index";
import {BlockCraftError, ErrorCode} from "../../../global";
import {generateId} from "../../utils";

export type EditableBlockCreateSnapshotParams = [(InlineModel | string)?, IBlockProps?];

type BlockCreateFn<T extends unknown[], M extends NativeBlockModel> = T extends [infer A, infer B, infer C] ? (arg1: A, arg: B, arg3: C) => IBlockSnapshot<M['props'], M['meta']> : (...args: T) => IBlockSnapshot<M['props'], M['meta']>

export interface IBlockSchemaOptions<T extends NativeBlockModel = NativeBlockModel> {
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
    includeChildren?: string[]
    /**
     * This block cannot contain the specified block. It is priority over 'includeChildren'
     */
    excludeChildren?: string[]
  }
}

export const editableBlockCreateSnapShotFn = <M extends NativeBlockModel = NativeBlockModel>(flavour: M['flavour'], defaultProps?: Omit<IEditableBlockProps, 'depth'>): BlockCreateFn<unknown[], M> => {
  return (...args: unknown[]) => {
    const [deltas, props] = args
    const ch = []
    if (!deltas) {
    } else if (typeof deltas === 'string') {
      ch.push({insert: deltas})
    } else if (Array.isArray(deltas)) {
      ch.push(...deltas)
    } else {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${flavour} block createSnapshot error: deltas must be string or deltas`)
    }

    if (props !== undefined && typeof props !== 'object') {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${flavour} block createSnapshot error: props must be undefined or object`)
    }

    return {
      id: generateId(),
      flavour: flavour,
      nodeType: BlockNodeType.editable,
      // @ts-expect-error
      props: {depth: 0, ...defaultProps, textAlign: defaultProps?.['textAlign'] || props?.['textAlign'] },
      meta: {},
      children: ch
    }
  }
}
