import {editableBlockCreateSnapShotFn, IBlockSchemaOptions} from "../../framework/schema/block-schema";
import {BlockNodeType} from "../../framework/types";
import {EditableBlockNative} from "../../framework";
import {DeltaInsert} from "blockflow-editor";
import {CaptionBlockComponent} from "./caption.block";

export interface CaptionBlockModel extends EditableBlockNative {
  flavour: 'caption'
}

export const CaptionBlockSchema: IBlockSchemaOptions<CaptionBlockModel> = {
  flavour: "caption",
  nodeType: BlockNodeType.editable,
  component: CaptionBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<CaptionBlockModel>('caption', {textAlign: 'center'}),
  metadata: {
    version: 1,
    label: "标题",
    isLeaf: true,
    includeChildren: ['caption']
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      caption: CaptionBlockComponent
    }

    interface IBlockCreateParameters {
      caption: [(string | DeltaInsert[])?]
    }
  }
}
