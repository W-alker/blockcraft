import {createInlineDirectiveAdapterContribution} from '../../../adapters/generic'
import {INLINE_WEATHER_EMBED_KEY, createInlineWeatherEmbedConverter, formatInlineWeatherDelta} from '..'

export const weatherEmbedAdapters = createInlineDirectiveAdapterContribution({
  key: INLINE_WEATHER_EMBED_KEY,
  createDomConverter: createInlineWeatherEmbedConverter,
  displayText: formatInlineWeatherDelta,
})
