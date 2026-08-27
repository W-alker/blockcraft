import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

export const DIVIDER_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.divider',
  kind: 'block',
  flavour: 'divider',
  schemaVersion: 1,
  title: '分割线',
  description: '分隔两个内容区域。',
  domains: ['document'],
  semanticRoles: ['separator'],
  createParameters: {type: 'array', maxItems: 0},
  writableProps: blockAgentWritableProps({}),
  examples: [{flavour: 'divider', params: []}],
})
