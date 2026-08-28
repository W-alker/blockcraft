import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { PlaceableProps } from '../../core/placement'
import { defineDeco } from '../../core/deco.types'
import { LogoTemplateEditComponent } from './logo.template-edit.component'
import { LogoTemplateRenderComponent } from './logo.template-render.component'

export interface LogoModel extends NoEditableBlockNative {
  flavour: 'logo'
  nodeType: BlockNodeType.void
  // src + 核心 objectSizing 的 wr/ar；三态排版字段来自 PlaceableProps。
  props: PlaceableProps & { src: string; wr: number; ar: number }
}

export const LogoDeco = defineDeco<LogoModel>({
  flavour: 'logo',
  nodeType: BlockNodeType.void,
  label: 'Logo',
  svgIcon: 'bc_tupian-color',                // 图片
  defaultProps: { src: '', wr: 16, ar: 1 },
  objectSizing: {defaultWr: 16, defaultAr: 1},
  templateEdit: LogoTemplateEditComponent,
  templateRender: LogoTemplateRenderComponent,
})
