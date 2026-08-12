import {
  BlockNodeType,
  EditableBlockNative,
  type DeltaInsert,
  type IBlockSchemaOptions,
  NoEditableBlockNative,
  editableBlockCreateSnapShotFn,
  generateId,
} from '../../framework'
import {ShapeBlockComponent} from './shape.block'
import {ShapeTextBlockComponent} from './shape-text.block'
import {
  DEFAULT_SHAPE_PROPS,
  type ShapeBlockProps,
  type ShapeKind,
} from './shape.types'

export * from './shape-definitions'
export * from './shape-embed'
export * from './shape-icon.component'
export * from './shape-resizer.component'
export * from './shape.types'
export {ShapeBlockComponent} from './shape.block'
export {ShapeTextBlockComponent} from './shape-text.block'

export interface ShapeTextBlockModel extends EditableBlockNative {
  flavour: 'shape-text'
}

export const ShapeTextBlockSchema:
  IBlockSchemaOptions<ShapeTextBlockModel> = {
    flavour: 'shape-text',
    nodeType: BlockNodeType.editable,
    component: ShapeTextBlockComponent,
    createSnapshot:
      editableBlockCreateSnapShotFn<ShapeTextBlockModel>('shape-text'),
    metadata: {
      version: 1,
      label: '形状文字',
      description: '编辑形状内部的文字内容',
      isLeaf: true,
      hideInInsertMenu: true,
    },
  }

export interface ShapeBlockModel extends NoEditableBlockNative {
  flavour: 'shape'
  nodeType: BlockNodeType.block
  props: ShapeBlockProps
}

const hasShapeTextContent = (
  text?: string | DeltaInsert[],
): text is string | DeltaInsert[] => {
  if (typeof text === 'string') return text.length > 0
  return Array.isArray(text) && text.some(delta => {
    if (typeof delta.insert === 'string') return delta.insert.length > 0
    return delta.insert != null
  })
}

export const ShapeBlockSchema: IBlockSchemaOptions<ShapeBlockModel> = {
  flavour: 'shape',
  nodeType: BlockNodeType.block,
  component: ShapeBlockComponent,
  createSnapshot: (
    shapeType: ShapeKind = DEFAULT_SHAPE_PROPS.shapeType,
    text?: string | DeltaInsert[],
  ) => ({
    id: generateId(),
    flavour: 'shape',
    nodeType: BlockNodeType.block,
    props: {
      ...DEFAULT_SHAPE_PROPS,
      shapeType,
    },
    meta: {},
    children: hasShapeTextContent(text)
      ? [ShapeTextBlockSchema.createSnapshot(text)]
      : [],
  }),
  metadata: {
    version: 1,
    label: '形状',
    description: '插入可编辑和自由放置的形状',
    icon: 'bc_icon bc_tuxing',
    includeChildren: ['shape-text'],
    selectionScope: 'container',
    placement: {modes: ['relative', 'absolute']},
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
