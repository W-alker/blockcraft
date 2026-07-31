import { inject, signal, Signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TEMPLATE_DATA, Weather } from '../../data/template-data'
import { wireColumnZoom } from '../_shared/page-size'

/**
 * 天气数据订阅的组合式接线：编辑 / 渲染两个 chip 组件各调一行，订阅逻辑只此一份。
 * 之前收在 WeatherChipBase 里，但基类继承位已让给排版链（Angular 单继承：编辑态继承
 * PlaceableEditBase、渲染态继承 PlaceableDecoBase），"能力"类接线一律降级为函数组合。
 * 必须在注入上下文调用（字段初始化器 / constructor）——takeUntilDestroyed 依赖 inject(DestroyRef)。
 */
export function wireWeatherData(apply: (w: Weather | null) => void): void {
  inject(TEMPLATE_DATA).weather.get().pipe(takeUntilDestroyed()).subscribe(v => apply(v))
}

/**
 * 天气 chip 的整套接线（数据信号 w + 列宽 zoom 信号）：编辑 / 渲染两个 chip 组件各调一行 `chip = wireWeatherChip()`，
 * 替代此前两处逐行复制的「4 行字段声明 + 接线」——逻辑只此一份。必须在注入上下文调用（字段初始化器）：
 * 内部走 wireWeatherData / wireColumnZoom（依赖 inject）。
 */
export function wireWeatherChip(): { w: Signal<Weather | null>; zoom: Signal<number> } {
  const w = signal<Weather | null>(null)
  const zoom = signal(1)
  wireWeatherData(v => w.set(v))
  wireColumnZoom(s => zoom.set(s))
  return { w, zoom }
}
