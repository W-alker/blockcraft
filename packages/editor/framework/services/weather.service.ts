import {InjectionToken} from '@angular/core'

export type DocWeatherTone =
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'snowy'
  | 'stormy'
  | 'foggy'

export interface DocWeatherData {
  tone: DocWeatherTone
  temp: number
  condition: string
  location: string
  high: number
  low: number
}

/** Omit date for live weather; pass an ISO date for a fixed document-day value. */
export interface DocWeatherQuery {
  date?: string
}

export const DOC_WEATHER_SERVICE_TOKEN =
  new InjectionToken<DocWeatherService>('DOC_WEATHER_SERVICE_TOKEN')

/**
 * Host boundary for dynamic weather blocks. The base implementation is an
 * honest unsupported service; applications provide their own network adapter.
 */
export class DocWeatherService {
  query = async (
    _query?: DocWeatherQuery,
    _signal?: AbortSignal,
  ): Promise<DocWeatherData> => {
    throw new Error('DocWeatherService is not configured')
  }
}
