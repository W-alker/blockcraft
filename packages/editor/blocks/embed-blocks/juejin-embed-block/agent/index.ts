import {defineBlockAgentCapability} from '../../../../framework'
import {
  BLOCK_AGENT_URL_SCHEMA,
  blockAgentWritableProps,
} from '../../../agent-support'

export const JUEJIN_EMBED_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.juejin-embed',
  kind: 'block',
  flavour: 'juejin-embed',
  schemaVersion: 1,
  title: '掘金嵌入',
  description: '以已注册的第三方嵌入块展示 URL。',
  domains: ['document', 'web'],
  semanticRoles: ['embed', 'link'],
  createParameters: {
    type: 'array', minItems: 1, maxItems: 1,
    prefixItems: [BLOCK_AGENT_URL_SCHEMA],
  },
  writableProps: blockAgentWritableProps({url: BLOCK_AGENT_URL_SCHEMA}),
  examples: [{flavour: 'juejin-embed', params: ['https://example.com']}],
})
