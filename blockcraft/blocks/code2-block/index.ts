import {EditableBlockNative, generateId, NoEditableBlockNative} from "../../framework";
import {CodeBlockComponent} from "./code.block";
import {BlockNodeType, IBlockProps, IEditableBlockProps} from "../../framework/types";
import {
  IBlockSchemaOptions,
  EditableBlockCreateSnapshotParams, editableBlockCreateSnapShotFn
} from "../../framework/schema/block-schema";
import {CodeLineBlockComponent} from "./code-line.block";

export interface CodeBlockModel extends NoEditableBlockNative {
  flavour: 'code2',
  props: {
    lang: string
    mode: string
  } & IBlockProps
}

export interface CodeLineBlockModel extends EditableBlockNative {
  flavour: 'code-line',
  props: {
    lang: string
  } & IEditableBlockProps
}

export const Code2BlockSchema: IBlockSchemaOptions<CodeBlockModel> = {
  flavour: 'code2',
  nodeType: BlockNodeType.block,
  component: CodeBlockComponent,
  createSnapshot: (lang) => {
    return {
      id: generateId(),
      flavour: 'code2',
      nodeType: BlockNodeType.block,
      props: {
        lang,
        mode: 'text',
      },
      meta: {},
      children: [CodeLineBlockSchema.createSnapshot()]
    }
  },
  metadata: {
    version: 2,
    label: "代码块V2",
    svgIcon: "bc_daimakuai1",
    icon: "bc_icon bc_daimakuai1"
  }
}

export const CodeLineBlockSchema: IBlockSchemaOptions<CodeLineBlockModel> = {
  flavour: 'code-line',
  nodeType: BlockNodeType.editable,
  component: CodeLineBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<CodeLineBlockModel>('code-line', {lang: 'JavaScript'}),
  metadata: {
    version: 1,
    label: "代码块",
    svgIcon: "bc_daimakuai1",
    icon: "bc_icon bc_daimakuai1",
    isLeaf: true
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'code2': CodeBlockComponent,
      'code-line': CodeLineBlockComponent
    }

    interface IBlockCreateParameters {
      'code2': [string]
      'code-line': EditableBlockCreateSnapshotParams
    }
  }
}
