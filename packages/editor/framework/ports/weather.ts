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

export interface DocWeatherPort {
  query: (query?: DocWeatherQuery, signal?: AbortSignal) => Promise<DocWeatherData>;
}
