import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { PlaceableProps } from '../../core/placement'
import { defineDeco } from '../../core/deco.types'
import { WeatherTemplateEditComponent } from './weather.template-edit.component'
import { WeatherTemplateRenderComponent } from './weather.template-render.component'

export interface WeatherModel extends NoEditableBlockNative {
  flavour: 'template-weather'
  nodeType: BlockNodeType.void
  // field：取哪天（MVP 固定 today，城市按 IP 自动定位）。尺寸不存——整体 zoom 随列宽自适应（见组件）；
  // PlaceableProps：三态排版字段（void 物料全员可拖的家族契约，悬浮/环绕/边距/层级由面板与卫兵读写）
  props: PlaceableProps & { field: string }
}

export const WeatherDeco = defineDeco<WeatherModel>({
  flavour: 'template-weather',
  nodeType: BlockNodeType.void,
  label: '天气',
  svgIcon: 'tpl-weather',                    // iconfont 无天气字形，用 playground 内联 symbol（见面板 sprite）
  defaultProps: { field: 'today' },
  templateEdit: WeatherTemplateEditComponent,
  templateRender: WeatherTemplateRenderComponent,
})
