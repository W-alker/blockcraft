import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

export const TABLE_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.table', kind: 'block', flavour: 'table', schemaVersion: 1,
  title: '表格', description: '按行列数创建结构完整的表格。',
  domains: ['document', 'data'], semanticRoles: ['table', 'structured-data'],
  createParameters: {
    type: 'array', maxItems: 2,
    prefixItems: [
      {type: 'integer', minimum: 1, maximum: 100},
      {type: 'integer', minimum: 1, maximum: 50},
    ],
  },
  writableProps: blockAgentWritableProps({
    colWidths: {type: 'array', items: {type: 'number', minimum: 1}},
  }),
  atomicProps: ['colWidths'], examples: [{flavour: 'table', params: [3, 3]}],
})
