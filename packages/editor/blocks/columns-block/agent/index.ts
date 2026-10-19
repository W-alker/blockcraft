import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

export const COLUMNS_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.columns',
  kind: 'block',
  flavour: 'columns',
  schemaVersion: 1,
  title: '分栏',
  description: '创建二至六栏的布局容器。',
  domains: ['document', 'layout'],
  semanticRoles: ['columns', 'layout'],
  createParameters: {
    type: 'array', maxItems: 1,
    prefixItems: [{type: 'integer', minimum: 2, maximum: 6}],
  },
  writableProps: blockAgentWritableProps({}),
  examples: [{flavour: 'columns', params: [2]}],
})
