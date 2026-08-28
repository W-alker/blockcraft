import {
  BlockNodeType,
  EditableBlockNative,
  type DeltaInsert,
  type IBlockSchemaOptions,
  NoEditableBlockNative,
  generateId,
} from '../../framework'
import {ShapeBlockComponent} from './shape.block'
import {ShapeTextBlockComponent} from './shape-text.block'
import {
  DEFAULT_SHAPE_PROPS,
  DEFAULT_SHAPE_BLOCK_PROPS,
  SHAPE_OBJECT_FORMAT_CAPABILITY,
  normalizeShapeProps,
  type ShapeBlockProps,
  type ShapeKind,
} from './shape.types'

export * from './shape-definitions'
export * from './agent'
export * from './shape-geometry'
export * from './shape-icon.component'
export * from './shape-resizer.component'
export * from './shape.types'
export {ShapeBlockComponent} from './shape.block'
export {ShapeTextBlockComponent} from './shape-text.block'

export interface ShapeTextBlockModel extends EditableBlockNative {
  flavour: 'shape-text'
}

const normalizeShapeText = (
  value: string | DeltaInsert[] | undefined,
): DeltaInsert[] => {
  if (typeof value === 'string') return value ? [{insert: value}] : []
  if (!value) return []

  const result: DeltaInsert[] = []
  for (const delta of value) {
    if (typeof delta.insert === 'string') {
      if (delta.insert) {
        result.push(delta.attributes
          ? {insert: delta.insert, attributes: {...delta.attributes}}
          : {insert: delta.insert})
      }
      continue
    }
    if (delta.insert?.['break']) {
      result.push({insert: {break: '\n'}})
    }
  }
  return result
}

export const ShapeTextBlockSchema:
  IBlockSchemaOptions<ShapeTextBlockModel> = {
    flavour: 'shape-text',
    nodeType: BlockNodeType.editable,
    component: ShapeTextBlockComponent,
    createSnapshot: (text?: string | DeltaInsert[]) => ({
      id: generateId(),
      flavour: 'shape-text',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: normalizeShapeText(text),
    }),
    metadata: {
      version: 1,
      label: '形状文字',
      description: '编辑形状内部的文字内容',
      isLeaf: true,
      hideInInsertMenu: true,
      pastePlainTextOnly: true,
    },
  }

export interface ShapeBlockModel extends NoEditableBlockNative {
  flavour: 'shape'
  nodeType: BlockNodeType.block
  props: ShapeBlockProps
}

export const ShapeBlockSchema: IBlockSchemaOptions<ShapeBlockModel> = {
  flavour: 'shape',
  nodeType: BlockNodeType.block,
  component: ShapeBlockComponent,
  createSnapshot: (
    shapeType: ShapeKind = DEFAULT_SHAPE_PROPS.shapeType,
    text?: string | DeltaInsert[],
  ) => {
    const normalizedText = normalizeShapeText(text)
    return {
      id: generateId(),
      flavour: 'shape',
      nodeType: BlockNodeType.block,
      props: {
        ...DEFAULT_SHAPE_BLOCK_PROPS,
        shape: shapeType,
      },
      meta: {},
      children: normalizedText.length > 0
        ? [ShapeTextBlockSchema.createSnapshot(normalizedText)]
        : [],
    }
  },
  metadata: {
    version: 1,
    label: '形状',
    description: '插入可编辑和自由放置的形状',
    icon: 'bc_icon bc_tuxing',
    includeChildren: ['shape-text'],
    selectionScope: 'container',
    placement: {modes: ['relative', 'absolute']},
    objectFormat: SHAPE_OBJECT_FORMAT_CAPABILITY,
    virtualization: {
      estimateHeight: ({props}) => normalizeShapeProps(props).height,
    },
  },
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      shape: ShapeBlockComponent
      'shape-text': ShapeTextBlockComponent
    }

    interface IBlockCreateParameters {
      shape: [ShapeKind?, (string | DeltaInsert[])?]
      'shape-text': [(string | DeltaInsert[])?]
    }
  }
}
