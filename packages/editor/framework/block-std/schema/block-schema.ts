import { Type } from "@angular/core";
import { BlockNodeType, IBlockProps, IBlockSnapshot, IEditableBlockProps, InlineModel } from "../types";
import { NativeBlockModel } from "../index";
import { BlockCraftError, ErrorCode } from "../../../global";
import { generateId } from "../../utils";

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
    // 是否是某个block的依附子块
    isLeaf?: boolean;
    // 是否是渲染单元。代表它可以渲染各种块
    renderUnit?: boolean;
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
      ch.push({ insert: deltas })
    } else if (Array.isArray(deltas)) {
      ch.push(...deltas)
    } else {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${flavour} block createSnapshot error: deltas must be string or deltas`)
    }

    if (props !== undefined && typeof props !== 'object') {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${flavour} block createSnapshot error: props must be undefined or object`)
    }

    const _props = {
      ...defaultProps,
    }
    // @ts-ignore
    _props['depth'] = props?.['depth'] || 0
    // @ts-ignore
    const _textAlign = props?.['textAlign'] || defaultProps?.['textAlign']
    if (_textAlign) _props['textAlign'] = _textAlign
    // @ts-ignore
    const _heading = props?.['heading'] || defaultProps?.['heading'] || undefined
    if (_heading) _props['heading'] = _heading

    return {
      id: generateId(),
      flavour: flavour,
      nodeType: BlockNodeType.editable,
      props: _props,
      meta: {},
      children: ch
    }
  }
}
