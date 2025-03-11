import {EditableBlockNative, generateId} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {
  BlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";
import {ParagraphBlockComponent} from "./paragraph.block";
import {BlockCraftError, ErrorCode} from "../../global";

export interface ParagraphBlockModel extends EditableBlockNative {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable
}

export const ParagraphBlockSchema: BlockSchemaOptions<ParagraphBlockModel> = {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  component: ParagraphBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn('paragraph'),
  metadata: {
    version: 1,
    label: "基础段落"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      paragraph: ParagraphBlockComponent
    }

    interface IBlockCreateParameters {
      paragraph: EditableBlockCreateSnapshotParams
    }
  }
}
