import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOpenAiTools,
  createProviderCapabilities,
} from './document-agent-provider-capabilities.mjs'
import {
  createDocumentAgentMarkdownSystemPrompt,
  createDocumentAgentSystemPrompt,
  DOCUMENT_AGENT_PROMPT_VERSION,
} from './document-agent-prompt.mjs'

test('declares provider-native web search as a read-only external capability', () => {
  assert.deepEqual(createProviderCapabilities({webSearchEnabled: true}), {
    webSearch: {
      available: true,
      effect: 'external-read',
      evidence: 'provider-native',
    },
  })
})

test('disables provider tools for specialists that cannot call tools', () => {
  assert.equal(createProviderCapabilities({
    webSearchEnabled: true,
    allowTools: false,
  }).webSearch.available, false)
  assert.deepEqual(createOpenAiTools({
    webSearchEnabled: true,
    allowTools: false,
  }), [])
})

test('enables the Responses API web_search tool only when configured', () => {
  assert.deepEqual(createOpenAiTools({webSearchEnabled: true}), [{type: 'web_search'}])
  assert.deepEqual(createOpenAiTools({webSearchEnabled: false}), [])
})

test('prompts treat provider capability state as authoritative search evidence', () => {
  assert.equal(DOCUMENT_AGENT_PROMPT_VERSION, 'blockcraft-agent-v16')
  assert.match(createDocumentAgentSystemPrompt('rewrite'), /providerCapabilities\.webSearch\.available/)
  assert.match(createDocumentAgentMarkdownSystemPrompt(), /providerCapabilities\.webSearch\.available/)
})
