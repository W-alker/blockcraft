import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { PlaceableProps } from '../../core/placement'
import { defineDeco } from '../../core/deco.types'
import { LogoTemplateEditComponent } from './logo.template-edit.component'
import { LogoTemplateRenderComponent } from './logo.template-render.component'

export interface LogoModel extends NoEditableBlockNative {
  flavour: 'template-logo'
  nodeType: BlockNodeType.void
  // src+缩放宽度（列宽%，logo 必填）；三态排版字段（x/y/float/z/deg/边距）来自 PlaceableProps 家族契约，判别语义见 placement.ts
  props: PlaceableProps & { src: string; width: number }
}

export const LogoDeco = defineDeco<LogoModel>({
  flavour: 'template-logo',
  nodeType: BlockNodeType.void,
  label: 'Logo',
  svgIcon: 'bc_tupian-color',                // 图片
  defaultProps: { src: '', width: 16 },     // 页宽 16%；不给 x/y → 插入时留在文档流，拖拽才抬起成自由浮层
  templateEdit: LogoTemplateEditComponent,
  templateRender: LogoTemplateRenderComponent,
})
