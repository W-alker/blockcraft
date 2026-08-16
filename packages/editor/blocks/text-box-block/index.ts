import {
  BlockNodeType,
  type DeltaInsert,
  type IBlockSchemaOptions,
  NoEditableBlockNative,
  generateId,
} from '../../framework'
import {ParagraphBlockSchema} from '../paragraph-block'
import {TextBoxBlockComponent} from './text-box.block'
import {
  normalizeTextBoxProps,
  type TextBoxBlockProps,
} from './text-box.types'

export * from './text-box.types'
export * from './text-box.presets'
export * from './presets/artwork'
export {TextBoxBlockComponent} from './text-box.block'

export interface TextBoxBlockModel extends NoEditableBlockNative {
  flavour: 'text-box'
  nodeType: BlockNodeType.block
  props: TextBoxBlockProps
}

export const TextBoxBlockSchema: IBlockSchemaOptions<TextBoxBlockModel> = {
  flavour: 'text-box',
  nodeType: BlockNodeType.block,
  component: TextBoxBlockComponent,
  createSnapshot: (
    text: string | DeltaInsert[] = '',
    props: Partial<TextBoxBlockProps> = {},
  ) => ({
    id: generateId(),
    flavour: 'text-box',
    nodeType: BlockNodeType.block,
    props: normalizeTextBoxProps(props),
    meta: {},
    children: [ParagraphBlockSchema.createSnapshot(text)],
  }),
  metadata: {
    version: 1,
    label: '文本框',
    description: '插入可自由放置、缩放和旋转的富文本框',
    icon: 'bc_icon bc_wenbenkuang',
    renderUnit: true,
    includeChildren: [
      'paragraph',
      'bullet',
      'ordered',
      'todo',
      'blockquote',
    ],
    selectionScope: 'container',
    placement: {modes: ['relative', 'absolute']},
    virtualization: {
      estimateHeight: ({props}) => normalizeTextBoxProps(props).height,
    },
  },
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'text-box': TextBoxBlockComponent
    }

    interface IBlockCreateParameters {
      'text-box': [
        (string | DeltaInsert[])?,
        Partial<TextBoxBlockProps>?,
      ]
    }
  }
}
