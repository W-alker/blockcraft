import {EditableBlockNative, BlockNodeType} from "../../framework";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/block-std/schema/block-schema";
import {BlockQuoteBlockComponent} from "./blockquote.block";

export interface BlockquoteBlockModel extends EditableBlockNative {
  flavour: 'blockquote',
  nodeType: BlockNodeType.editable
}

export const BlockquoteBlockSchema: IBlockSchemaOptions<BlockquoteBlockModel> = {
  flavour: 'blockquote',
  nodeType: BlockNodeType.editable,
  component: BlockQuoteBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<BlockquoteBlockModel>('blockquote'),
  metadata: {
    version: 1,
    label: "空引用",
    icon: "bc_icon bc_blockquote",
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      blockquote: BlockQuoteBlockComponent
    }

    interface IBlockCreateParameters {
      blockquote: EditableBlockCreateSnapshotParams
    }
  }
}
