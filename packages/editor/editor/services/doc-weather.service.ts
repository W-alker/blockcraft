import type {DocWeatherPort, DocWeatherData, DocWeatherQuery} from '@ccc/blockcraft/framework/ports';

/**
 * Host boundary for dynamic weather blocks. The base implementation is an
 * honest unsupported service; applications provide their own network adapter.
 */
export class DocWeatherService implements DocWeatherPort {
  query = async (
    _query?: DocWeatherQuery,
    _signal?: AbortSignal,
  ): Promise<DocWeatherData> => {
    throw new Error('DocWeatherService is not configured')
  }
}
