import {
  BLOCK_OBJECT_GROUP_FLAVOUR,
  BlockNodeType,
  generateId,
  type BlockObjectGroupProps,
  type IBlockSchemaOptions,
  type IBlockSnapshot,
  type NoEditableBlockNative,
  normalizeBlockObjectGroupProps,
} from '../../framework'
import {ObjectGroupBlockComponent} from './object-group.block'

export {ObjectGroupBlockComponent} from './object-group.block'

export interface ObjectGroupBlockModel extends NoEditableBlockNative {
  flavour: typeof BLOCK_OBJECT_GROUP_FLAVOUR
  nodeType: BlockNodeType.block
  props: BlockObjectGroupProps
}

export const ObjectGroupBlockSchema:
IBlockSchemaOptions<ObjectGroupBlockModel> = {
  flavour: BLOCK_OBJECT_GROUP_FLAVOUR,
  nodeType: BlockNodeType.block,
  component: ObjectGroupBlockComponent,
  createSnapshot: (
    props: Partial<BlockObjectGroupProps> = {},
    children: IBlockSnapshot[] = [],
  ) => ({
    id: generateId(),
    flavour: BLOCK_OBJECT_GROUP_FLAVOUR,
    nodeType: BlockNodeType.block,
    props: normalizeBlockObjectGroupProps(props),
    meta: {},
    children,
  }),
  metadata: {
    version: 1,
    label: '组合',
    description: '固定像素的局部绝对定位组合',
    hideInInsertMenu: true,
    renderUnit: true,
    includeChildren: ['*'],
    excludeChildren: [
      'root',
      'placement-layout',
      BLOCK_OBJECT_GROUP_FLAVOUR,
    ],
    allowEmptyChildren: true,
    selectionScope: 'container',
    placement: {modes: ['absolute']},
    virtualization: {
      estimateHeight: ({props}) => normalizeBlockObjectGroupProps(props).height,
    },
  },
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'object-group': ObjectGroupBlockComponent
    }

    interface IBlockCreateParameters {
      'object-group': [
        Partial<BlockObjectGroupProps>?,
        IBlockSnapshot[]?,
      ]
    }
  }
}
