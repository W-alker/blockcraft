import {
  BlockNodeType,
  generateId,
  IBaseMetadata,
  IBlockSchemaOptions,
  NoEditableBlockNative,
} from '../../framework'
import {RenderUnitBlockComponent} from './render-unit.block'

export interface RenderUnitBlockModel extends NoEditableBlockNative {
  flavour: 'render-unit'
  nodeType: BlockNodeType.block
  props: {
    backColor?: string | null
    borderColor?: string | null
  }
}

export const RenderUnitBlockSchema: IBlockSchemaOptions<RenderUnitBlockModel> = {
  flavour: 'render-unit',
  nodeType: BlockNodeType.block,
  component: RenderUnitBlockComponent,
  createSnapshot: (meta: IBaseMetadata = {}) => ({
    id: generateId(),
    flavour: 'render-unit',
    nodeType: BlockNodeType.block,
    props: {},
    meta: {...meta},
    children: [],
  }),
  metadata: {
    version: 1,
    label: '内容区域',
    description: '可配置提示语和允许添加的内容块',
    icon: 'bc_icon bc_erjidaohang_caogaoxiang',
    hideInInsertMenu: true,
    renderUnit: true,
    includeChildren: ['*'],
    excludeChildren: [
      'root',
      'table-row',
      'table-cell',
      'column',
      'caption',
      'shape-text',
      'mermaid-textarea',
    ],
    selectionScope: 'container',
    instanceMeta: {
      childConstraints: true,
    },
  },
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'render-unit': RenderUnitBlockComponent
    }

    interface IBlockCreateParameters {
      'render-unit': [IBaseMetadata?]
    }
  }
}
