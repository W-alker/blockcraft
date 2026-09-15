import {
  BlockSurfaceProps,
  BlockNodeType,
  generateId,
  IBaseMetadata,
  IBlockSchemaOptions,
  NoEditableBlockNative,
  normalizeBlockSurfaceProps,
  resolveBlockSurface,
} from '../../framework'
import {RenderUnitBlockComponent} from './render-unit.block'

export * from './agent'

export interface RenderUnitBlockProps extends BlockSurfaceProps {
  backColor?: string | null
  borderColor?: string | null
}

export interface RenderUnitBlockModel extends NoEditableBlockNative {
  flavour: 'render-unit'
  nodeType: BlockNodeType.block
  props: RenderUnitBlockProps
}

export function normalizeRenderUnitBlockProps(
  input: Readonly<Record<string, unknown>> | null | undefined,
): RenderUnitBlockProps {
  const normalized: RenderUnitBlockProps = normalizeBlockSurfaceProps(input)
  if (!input) return normalized

  const backColor = normalizeColor(input['backColor'])
  if (backColor) normalized.backColor = backColor
  const borderColor = normalizeColor(input['borderColor'])
  if (borderColor) normalized.borderColor = borderColor
  return normalized
}

export const RenderUnitBlockSchema: IBlockSchemaOptions<RenderUnitBlockModel> = {
  flavour: 'render-unit',
  nodeType: BlockNodeType.block,
  component: RenderUnitBlockComponent,
  createSnapshot: (
    meta: IBaseMetadata = {},
    props: Partial<RenderUnitBlockProps> = {},
  ) => ({
    id: generateId(),
    flavour: 'render-unit',
    nodeType: BlockNodeType.block,
    props: normalizeRenderUnitBlockProps(props),
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
    virtualization: {
      estimateHeight: context => {
        const {padding} = resolveBlockSurface(context.props)
        const childrenHeight = context.childIds.reduce(
          (height, childId) => height + context.estimateChildHeight(childId),
          0,
        )
        return Math.max(
          context.fallbackHeight,
          padding.top + childrenHeight + padding.bottom,
        )
      },
    },
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
      'render-unit': [IBaseMetadata?, Partial<RenderUnitBlockProps>?]
    }
  }
}

function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.trim() || null
}
