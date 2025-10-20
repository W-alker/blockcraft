import {EditableBlockNative} from "../../framework";
import {CodeBlockComponent} from "./code.block";
import {BlockNodeType, IEditableBlockProps} from "../../framework";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework";
import {CodeBlockLanguage} from "./const";

export interface CodeBlockModel extends EditableBlockNative {
  flavour: 'code',
  props: {
    lang: CodeBlockLanguage
    mode: string
    h?: number,
    collapse?: boolean | null
  } & IEditableBlockProps
}

export const CodeBlockSchema: IBlockSchemaOptions<CodeBlockModel> = {
  flavour: 'code',
  nodeType: BlockNodeType.editable,
  component: CodeBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<CodeBlockModel>('code', {lang: 'PlainText'}),
  metadata: {
    version: 1,
    label: "代码块",
    svgIcon: "bc_daimakuai1",
    icon: "bc_icon bc_daimakuai1"
  }
}

export * from './const'

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
