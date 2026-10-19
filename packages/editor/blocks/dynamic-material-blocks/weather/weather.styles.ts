import {ChangeDetectionStrategy, Component} from '@angular/core'
import {WeatherCardComponent} from './weather-card.component'
import {defineMaterialStyles} from '../kernel/material-styles.util'
import {WEATHER_LAYOUTS, resolveWeatherLayout} from './weather-presentation'

// 缩略图与真实块的尺寸只读取 WEATHER_LAYOUTS，不另存一组宽高。
const previewHost = {
  'style': 'display:block',
  '[style.width]': "'calc(' + size.width + ' * var(--u,1px))'",
  '[style.height]': "'calc(' + size.height + ' * var(--u,1px))'",
}

@Component({
  selector:'wt-classic-thumb', standalone:true, changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WeatherCardComponent], host:previewHost, template:`<bc-weather-card layout="classic" />`,
})
export class ClassicWeatherThumb { readonly size = resolveWeatherLayout('classic') }

@Component({
  selector:'wt-inline-thumb', standalone:true, changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WeatherCardComponent], host:previewHost, template:`<bc-weather-card layout="inline" />`,
})
export class InlineWeatherThumb { readonly size = resolveWeatherLayout('inline') }

@Component({
  selector:'wt-ruled-thumb', standalone:true, changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WeatherCardComponent], host:previewHost, template:`<bc-weather-card layout="ruled" />`,
})
export class RuledWeatherThumb { readonly size = resolveWeatherLayout('ruled') }

@Component({
  selector:'wt-sidebar-thumb', standalone:true, changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WeatherCardComponent], host:previewHost, template:`<bc-weather-card layout="sidebar" />`,
})
export class SidebarWeatherThumb { readonly size = resolveWeatherLayout('sidebar') }

@Component({
  selector:'wt-card-thumb', standalone:true, changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WeatherCardComponent], host:previewHost, template:`<bc-weather-card layout="card" />`,
})
export class CardWeatherThumb { readonly size = resolveWeatherLayout('card') }

@Component({
  selector:'wt-stack-thumb', standalone:true, changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WeatherCardComponent], host:previewHost, template:`<bc-weather-card layout="stack" />`,
})
export class StackWeatherThumb { readonly size = resolveWeatherLayout('stack') }

@Component({
  selector:'wt-ledger-thumb', standalone:true, changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WeatherCardComponent], host:previewHost, template:`<bc-weather-card layout="ledger" />`,
})
export class LedgerWeatherThumb { readonly size = resolveWeatherLayout('ledger') }

const components = [ClassicWeatherThumb, InlineWeatherThumb, RuledWeatherThumb, SidebarWeatherThumb, CardWeatherThumb, StackWeatherThumb, LedgerWeatherThumb]
export const WEATHER_STYLES = defineMaterialStyles('style', '样式', WEATHER_LAYOUTS.map((layout, index) => ({
  id: layout.id, label: layout.label, component: components[index],
  defaultWidth: layout.width, defaultAr: layout.width / layout.height,
})))
