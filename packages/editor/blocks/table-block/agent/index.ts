import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

export const TABLE_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.table', kind: 'block', flavour: 'table', schemaVersion: 1,
  title: '表格', description: '按行列数创建原生可编辑表格。可选第三个参数是完整 string[][] 单元格内容，必须与行列数一致；未知值用待核实，不猜测。',
  domains: ['document', 'data'], semanticRoles: ['table', 'structured-data'],
  createParameters: {
    type: 'array', maxItems: 3,
    prefixItems: [
      {type: 'integer', minimum: 1, maximum: 100},
      {type: 'integer', minimum: 1, maximum: 50},
      {type: 'array', minItems: 1, maxItems: 100, items: {type: 'array', minItems: 1, maxItems: 50, items: {type: 'string', maxLength: 4000}}},
    ],
  },
  writableProps: blockAgentWritableProps({
    colWidths: {type: 'array', items: {type: 'number', minimum: 1}},
  }),
  atomicProps: ['colWidths'], examples: [{flavour: 'table', params: [3, 3]}, {flavour: 'table', params: [2, 2, [['项目', '数量'], ['材料A', '12']]]}],
})
