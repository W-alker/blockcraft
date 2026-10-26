import { BaseBlockComponent } from '@ccc/blockcraft'
import type { LogoModel } from './decos/logo/logo.deco'

// block 装饰每个 flavour 必须声明组件类型与 createSnapshot 参数。
// weather/date-card/person-card 已由 bundled editor 声明；背景图是整页动作，不是块。
declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      logo: BaseBlockComponent<LogoModel>
    }
    interface IBlockCreateParameters {
      logo: []
    }
  }
}
