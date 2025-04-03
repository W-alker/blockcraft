import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/types";
import {
  BlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";
import {ParagraphBlockComponent} from "./paragraph.block";

export interface ParagraphBlockModel extends EditableBlockNative {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable
}

export const ParagraphBlockSchema: BlockSchemaOptions<ParagraphBlockModel> = {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  component: ParagraphBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<ParagraphBlockModel>('paragraph'),
  metadata: {
    version: 1,
    label: "基础段落",
    icon: "bc_icon bc_wenben",
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
