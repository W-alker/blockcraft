import {BlockNodeType, EditableBlockNative, generateId, IBlockProps, NoEditableBlockNative} from "../../framework";
import {
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams,
  IBlockSchemaOptions
} from "../../framework";
import {MermaidTextareaBlockComponent} from "./mermaid-textarea.block";
import {MermaidBlockComponent} from "./mermaid.block";
import {MermaidViewMode} from "./types";

export interface MermaidBlockModel extends NoEditableBlockNative {
  flavour: 'mermaid',
  nodeType: BlockNodeType.block,
  props: {
    mode: MermaidViewMode,
    spellcheck?: boolean,
    // graphScale: number
  } & IBlockProps
}

export interface MermaidTextareaBlockModel extends EditableBlockNative {
  flavour: 'mermaid-textarea',
}

export const MermaidBlockSchema: IBlockSchemaOptions<MermaidBlockModel> = {
  flavour: 'mermaid',
  nodeType: BlockNodeType.block,
  component: MermaidBlockComponent,
  createSnapshot: (mode, text) => {
    return {
      id: generateId(),
      flavour: 'mermaid',
      nodeType: BlockNodeType.block,
      props: {
        mode: mode ||'text',
        // graphScale: 1.00
      },
      meta: {},
      children: [MermaidTextareaBlockSchema.createSnapshot(text)]
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
      mermaid: [MermaidViewMode?,string?]
      'mermaid-textarea': EditableBlockCreateSnapshotParams
    }
  }
}
