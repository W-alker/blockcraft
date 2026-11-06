import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

export const CALLOUT_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.callout',
  kind: 'block',
  flavour: 'callout',
  schemaVersion: 1,
  title: '高亮块',
  description: '包含正文子块的强调容器。',
  domains: ['document'],
  semanticRoles: ['callout', 'container'],
  createParameters: {type: 'array', maxItems: 0},
  writableProps: blockAgentWritableProps({
    backColor: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    borderColor: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
  }),
  examples: [{flavour: 'callout', params: []}],
})
