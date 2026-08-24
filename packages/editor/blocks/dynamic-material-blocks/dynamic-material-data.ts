import {InjectionToken} from '@angular/core'
import type {Observable} from 'rxjs'

export type WeatherTone =
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'snowy'
  | 'stormy'
  | 'foggy'

export interface WeatherData {
  tone: WeatherTone
  temp: number
  condition: string
  location: string
  high: number
  low: number
}

/** Host adapter boundary. BlockCraft never imports application auth or weather clients. */
export interface DynamicMaterialDataPort {
  weather: {get(): Observable<WeatherData>}
}

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
