import {InjectionToken} from '@angular/core'
import type {Observable} from 'rxjs'
import type {
  DocWeatherData,
  DocWeatherQuery,
  DocWeatherTone,
} from '../../framework/services/weather.service'

/** @deprecated Use DocWeatherTone from the dedicated weather service. */
export type WeatherTone = DocWeatherTone
/** @deprecated Use DocWeatherData from the dedicated weather service. */
export type WeatherData = DocWeatherData
/** @deprecated Use DocWeatherQuery from the dedicated weather service. */
export type WeatherDataRequest = DocWeatherQuery

/** @deprecated Provide DOC_WEATHER_SERVICE_TOKEN instead. */
export interface DynamicMaterialDataPort {
  weather: {get(request?: WeatherDataRequest): Observable<WeatherData>}
}

/** @deprecated Provide DOC_WEATHER_SERVICE_TOKEN instead. */
export const DYNAMIC_MATERIAL_DATA =
  new InjectionToken<DynamicMaterialDataPort>('DYNAMIC_MATERIAL_DATA')

export interface FrozenPersonCardData {
  avatar?: string
  name: string
  pinyin?: string
  description?: string
}

export function readFrozenPersonCardData(raw: unknown): FrozenPersonCardData | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    const name = typeof value['name'] === 'string' ? value['name'] : ''
    if (!name) return null
    return {
      name,
      avatar: typeof value['avatar'] === 'string' ? value['avatar'] : undefined,
      pinyin: typeof value['pinyin'] === 'string' ? value['pinyin'] : undefined,
      description: typeof value['description'] === 'string'
        ? value['description']
        : undefined,
    }
  } catch {
    return null
  }
}
