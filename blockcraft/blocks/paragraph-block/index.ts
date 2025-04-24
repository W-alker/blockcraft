import {EditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework/block-std/types";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/block-std/schema/block-schema";
import {ParagraphBlockComponent} from "./paragraph.block";

export interface ParagraphBlockModel extends EditableBlockNative {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable
}

export const ParagraphBlockSchema: IBlockSchemaOptions<ParagraphBlockModel> = {
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
