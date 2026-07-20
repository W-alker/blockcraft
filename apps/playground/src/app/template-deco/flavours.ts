import { BaseBlockComponent } from '@ccc/blockcraft'
import type { WeatherModel } from './decos/weather/weather.deco'
import type { LogoModel } from './decos/logo/logo.deco'
import type { LayoutModel } from './core/layout.block'

// block 装饰每个 flavour 必须声明组件类型与 createSnapshot 参数。
// 注：人员/日期已改为行内 embed（无需在此声明）；背景图是整页背景动作（见 registry page-bg），也不是块。
declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'template-weather': BaseBlockComponent<WeatherModel>
      'template-logo': BaseBlockComponent<LogoModel>
      'template-layout': BaseBlockComponent<LayoutModel>           // 悬浮层容器（装自由悬浮物料）
    }
    interface IBlockCreateParameters {
      'template-weather': []                 // void 装饰 createSnapshot 无参
      'template-logo': []
      'template-layout': []                  // 悬浮层：空建后再把物料 move 进来
    }
  }
}
