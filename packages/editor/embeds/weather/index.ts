import type {EmbedConverter} from '../../framework/block-std/inline'
import type {DeltaInsertEmbed} from '../../framework/block-std/types'
import type {DocWeatherData} from '../../framework/ports/weather'
import {WEATHER_ICONS} from '../../blocks/dynamic-material-blocks/weather/weather-icon.const'

export const INLINE_WEATHER_EMBED_KEY = 'weather'
export const INLINE_WEATHER_CLASS = 'bc-inline-weather'
export const INLINE_WEATHER_FORMATS = ['full', 'weather-temp', 'temp', 'condition'] as const
export type InlineWeatherFormat = typeof INLINE_WEATHER_FORMATS[number]

export function isInlineWeatherFormat(value: unknown): value is InlineWeatherFormat {
  return typeof value === 'string' && (INLINE_WEATHER_FORMATS as readonly string[]).includes(value)
}

/** 空值是模板意向；非空值是创建文档时获取的天气快照，不在渲染时联网。 */
export function createInlineWeatherDelta(weather?: DocWeatherData, format: InlineWeatherFormat = 'full'): DeltaInsertEmbed {
  return weather
    ? {insert: {weather: JSON.stringify(weather)}, attributes: {weatherFormat: format}}
    : {insert: {weather: ''}, attributes: {weatherSource: 'createdTime', weatherFormat: format}}
}

export function readInlineWeatherDelta(delta: DeltaInsertEmbed): DocWeatherData | null {
  const raw = delta.insert[INLINE_WEATHER_EMBED_KEY]
  if (typeof raw !== 'string' || !raw) return null
  try {
    const value = JSON.parse(raw) as DocWeatherData | null
    if (!value || !Object.prototype.hasOwnProperty.call(WEATHER_ICONS, value.tone)
      || typeof value.temp !== 'number' || !Number.isFinite(value.temp)
      || typeof value.high !== 'number' || !Number.isFinite(value.high)
      || typeof value.low !== 'number' || !Number.isFinite(value.low)
      || typeof value.condition !== 'string' || typeof value.location !== 'string') return null
    return value
  } catch {
    return null
  }
}

export function formatInlineWeatherDelta(delta: DeltaInsertEmbed): string {
  const weather = readInlineWeatherDelta(delta)
  if (weather) {
    const format = delta.attributes?.['weatherFormat']
    if (format === 'temp') return `${weather.temp}°C`
    if (format === 'condition') return weather.condition
    const text = `${weather.temp}°C · ${weather.condition}`
    return format === 'weather-temp' || !weather.location ? text : `${text} · ${weather.location}`
  }
  if (delta.attributes?.['weatherSource'] !== 'createdTime') return '天气暂不可用'
  const format = delta.attributes?.['weatherFormat']
  if (format === 'temp') return '--°C'
  if (format === 'condition') return '天气'
  return format === 'weather-temp' ? '--°C · 天气' : '--°C · 天气 · 城市'
}

export function createInlineWeatherEmbedConverter(): EmbedConverter {
  return {
    toView: delta => {
      const host = document.createElement('span')
      host.className = INLINE_WEATHER_CLASS
      // DOM 回读保留完整模型，包括模板意向和文字格式，不能从显示文案反推天气。
      host.dataset['bcWeatherDelta'] = JSON.stringify(delta)
      if (delta.attributes?.['weatherSource'] === 'createdTime') host.title = '使用模板时获取当地天气'
      const weather = readInlineWeatherDelta(delta)
      if (weather) {
        const icon = document.createElement('span')
        icon.className = `${INLINE_WEATHER_CLASS}__icon`
        icon.setAttribute('aria-hidden', 'true')
        // 复用天气卡片的内置多色图标；不接受快照中的 SVG/HTML。
        icon.innerHTML = WEATHER_ICONS[weather.tone]
        host.append(icon)
      } else {
        const icon = document.createElement('i')
        icon.className = 'bc_icon bc_taiyang'
        icon.setAttribute('aria-hidden', 'true')
        host.append(icon)
      }
      const text = document.createElement('span')
      text.textContent = formatInlineWeatherDelta(delta)
      host.append(text)
      return host
    },
    toDelta: element => {
      const host = element.closest<HTMLElement>(`.${INLINE_WEATHER_CLASS}`)
        ?? element.querySelector<HTMLElement>(`.${INLINE_WEATHER_CLASS}`)
      try {
        const delta = JSON.parse(host?.dataset['bcWeatherDelta'] ?? '') as DeltaInsertEmbed
        if (delta?.insert && typeof delta.insert[INLINE_WEATHER_EMBED_KEY] === 'string') return delta
      } catch { /* 缺失/损坏数据保留诚实的不可用占位。 */ }
      return {insert: {weather: ''}}
    },
  }
}
