import {BlockNodeType, EditableBlockNative, generateId, NoEditableBlockNative} from "../../framework";
import {
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams,
  IBlockSchemaOptions
} from "../../framework/block-std/schema/block-schema";
import {MermaidTextareaBlockComponent} from "./mermaid-textarea.block";
import {MermaidBlockComponent} from "./mermaid.block";

export interface MermaidBlockModel extends NoEditableBlockNative {
  flavour: 'mermaid',
  nodeType: BlockNodeType.block
}

export interface MermaidTextareaBlockModel extends EditableBlockNative {
  flavour: 'mermaid-textarea',
}

export const MermaidBlockSchema: IBlockSchemaOptions<MermaidBlockModel> = {
  flavour: 'mermaid',
  nodeType: BlockNodeType.block,
  component: MermaidBlockComponent,
  createSnapshot: () => {
    return {
      id: generateId(),
      flavour: 'mermaid',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [MermaidTextareaBlockSchema.createSnapshot()]
    }
  },
  metadata: {
    version: 1,
    label: '代码绘图',
    svgIcon: 'bc_mermaid',
    icon: 'bf_icon bc_mermaid',
  }
}

export const MermaidTextareaBlockSchema: IBlockSchemaOptions<MermaidTextareaBlockModel> = {
  flavour: 'mermaid-textarea',
  nodeType: BlockNodeType.editable,
  component: MermaidTextareaBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<MermaidTextareaBlockModel>('mermaid-textarea'),
  metadata: {
    version: 1,
    label: "Mermaid输入框",
    icon: "bc_icon bc_wenben",
    isLeaf: true
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      mermaid: MermaidBlockComponent
      'mermaid-textarea': MermaidTextareaBlockComponent
    }

    interface IBlockCreateParameters {
      mermaid: EditableBlockCreateSnapshotParams
      'mermaid-textarea': EditableBlockCreateSnapshotParams
    }
  }
}
