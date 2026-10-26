import type {DynamicMaterialConfigEntry} from '../dynamic-material-config'
import {defineColorConfig} from '../kernel/material-color.util'
import {defineBorderConfigs} from '../kernel/material-border.util'
import {WEATHER_STYLES} from './weather.styles'
import {WEATHER_PALETTES} from './weather-presentation'

/** 宿主物料面板复用此清单；颜色为空表示恢复当前色调默认值。 */
export const WEATHER_DISPLAY_CONFIGS: DynamicMaterialConfigEntry[] = [
  WEATHER_STYLES.config,
  {key:'palette', label:'色调', default:'', options:WEATHER_PALETTES.map(p=>({value:p.id,label:p.label}))},
  defineColorConfig('fg', '文字颜色', ''), defineColorConfig('accent', '强调颜色', ''),
  defineColorConfig('line', '线条颜色', ''), defineColorConfig('bg', '背景颜色', ''),
  {key:'iconMode', label:'图标颜色', default:'original', options:[{value:'original',label:'天气原色'},{value:'mono',label:'随强调色'}]},
  {key:'range', label:'高低温', default:'on', options:[{value:'on',label:'显示'},{value:'off',label:'隐藏'}]},
  ...defineBorderConfigs(),
]
