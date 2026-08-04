import {
  BlockNodeType,
  type DeltaInsert,
  type IBlockSchemaOptions,
  type InlineModel,
  EditableBlockNative,
  generateId,
} from '../../framework'
import {WordArtBlockComponent} from './word-art.block'
import {
  normalizeWordArtProps,
  type WordArtBlockProps,
} from './word-art.types'

export * from './word-art.presets'
export * from './word-art-embed'
export * from './word-art-resize'
export * from './word-art.types'
export {WordArtBlockComponent} from './word-art.block'

export interface WordArtBlockModel extends EditableBlockNative {
  flavour: 'word-art'
  nodeType: BlockNodeType.editable
  props: WordArtBlockProps
}

export type WordArtCreateText = string | InlineModel

const normalizeWordArtText = (
  value: WordArtCreateText | undefined,
): DeltaInsert[] => {
  const source = value === undefined ? '艺术字' : value
  if (typeof source === 'string') {
    return source ? [{insert: source}] : []
  }
  const result: DeltaInsert[] = []
  for (const delta of source) {
    if (typeof delta.insert === 'string') {
      if (delta.insert) result.push({insert: delta.insert})
      continue
    }
    if (delta.insert?.['break']) {
      result.push({insert: {break: '\n'}})
    }
  }
  return result
}

export const WordArtBlockSchema: IBlockSchemaOptions<WordArtBlockModel> = {
  flavour: 'word-art',
  nodeType: BlockNodeType.editable,
  component: WordArtBlockComponent,
  createSnapshot: (
    text?: WordArtCreateText,
    props?: Partial<WordArtBlockProps>,
  ) => ({
    id: generateId(),
    flavour: 'word-art',
    nodeType: BlockNodeType.editable,
    props: normalizeWordArtProps(props),
    meta: {},
    children: normalizeWordArtText(text),
  }),
  metadata: {
    version: 1,
    label: '艺术字',
    description: '可编辑、可缩放和自由放置的艺术文字',
    icon: 'bc_icon bc_yishuzishengcheng',
    placeholder: '输入艺术字',
    plainTextOnly: true,
    placement: {modes: ['relative', 'absolute']},
  },
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'word-art': WordArtBlockComponent
    }

    interface IBlockCreateParameters {
      'word-art': [
        WordArtCreateText?,
        Partial<WordArtBlockProps>?,
      ]
    }
  }
}
