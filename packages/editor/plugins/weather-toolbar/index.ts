import {MaterialToolbarPlugin} from '../material-toolbar'

/** 兼容仅装配天气工具栏的宿主；bundled editor 使用 MaterialToolbarPlugin。 */
export class WeatherToolbarPlugin extends MaterialToolbarPlugin {
  override name = 'weather-toolbar'
  protected override acceptsFlavour(flavour: string): boolean { return flavour === 'weather' }
}
