export function createProviderCapabilities({
  webSearchEnabled,
  allowTools = true,
} = {}) {
  return {
    webSearch: {
      available: webSearchEnabled === true && allowTools === true,
      effect: 'external-read',
      evidence: 'provider-native',
    },
  }
}

export function createOpenAiTools({webSearchEnabled, allowTools = true} = {}) {
  return webSearchEnabled === true && allowTools === true
    ? [{type: 'web_search'}]
    : []
}
