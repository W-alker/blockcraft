import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

export const PAGE_DIVIDER_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.page-divider',
  kind: 'block',
  flavour: 'page-divider',
  schemaVersion: 1,
  title: '分页符',
  description: '在分页布局中强制从下一页开始。',
  domains: ['document'],
  semanticRoles: ['page-break'],
  createParameters: {type: 'array', maxItems: 0},
  writableProps: blockAgentWritableProps({}),
  examples: [{flavour: 'page-divider', params: []}],
})
