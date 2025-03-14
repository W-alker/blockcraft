import {EditableBlockNative} from "../../framework";
import {CodeBlockComponent} from "./code.block";
import {BlockNodeType, IEditableBlockProps} from "../../framework/types";
import {
  BlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/schema/block-schema";

export interface CodeBlockModel extends EditableBlockNative {
  flavour: 'code',
  props: {
    lang: string
    mode: string
  } & IEditableBlockProps
}

export const CodeBlockSchema: BlockSchemaOptions<CodeBlockModel> = {
  flavour: 'code',
  nodeType: BlockNodeType.editable,
  component: CodeBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<CodeBlockModel>('code', {lang: 'JavaScript'}),
  metadata: {
    version: 1,
    label: "代码块"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'code': CodeBlockComponent
    }

    interface IBlockCreateParameters {
      'code': EditableBlockCreateSnapshotParams
    }
  }
}
