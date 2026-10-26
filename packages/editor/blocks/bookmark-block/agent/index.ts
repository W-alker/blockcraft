import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_URL_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

export const BOOKMARK_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.bookmark',
  kind: 'block',
  flavour: 'bookmark',
  schemaVersion: 1,
  title: '书签',
  description: '以链接卡片形式展示 URL。',
  domains: ['document', 'web'],
  semanticRoles: ['bookmark', 'link-card'],
  createParameters: {
    type: 'array', minItems: 1, maxItems: 1,
    prefixItems: [BLOCK_AGENT_URL_SCHEMA],
  },
  writableProps: blockAgentWritableProps({url: BLOCK_AGENT_URL_SCHEMA}),
  examples: [{flavour: 'bookmark', params: ['https://example.com']}],
})
