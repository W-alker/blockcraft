import {normalizeParagraphDecoration, type ParagraphDecoration} from './decoration'
import {EditableBlockNative, BlockNodeType} from "../../framework";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams
} from "../../framework/block-std/schema/block-schema";
import {ParagraphBlockComponent} from "./paragraph.block";

export * from './agent'
export * from './decoration'

export interface ParagraphBlockModel extends EditableBlockNative {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable
  props: EditableBlockNative['props'] & {decoration?: ParagraphDecoration | null}
}

export const ParagraphBlockSchema: IBlockSchemaOptions<ParagraphBlockModel> = {
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  component: ParagraphBlockComponent,
  createSnapshot: (...args) => {
    const snapshot = editableBlockCreateSnapShotFn<ParagraphBlockModel>('paragraph')(...args)
    const decoration = normalizeParagraphDecoration((args[1] as Record<string, unknown> | undefined)?.['decoration'])
    if (decoration) snapshot.props['decoration'] = decoration
    return snapshot
  },
  metadata: {
    version: 1,
    label: "基础段落",
    description: "输入普通正文内容",
    icon: "bc_icon bc_wenben",
    placeholder: {
      default: '输入"/"呼出菜单',
      heading: { 1: '一级标题', 2: '二级标题', 3: '三级标题' },
    },
    virtualization: {
      speculativeMount: 'safe',
    },
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
