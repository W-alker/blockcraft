import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

export const MERMAID_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.mermaid', kind: 'block', flavour: 'mermaid', schemaVersion: 1,
  title: 'Mermaid 图表', description: '由 Mermaid DSL 创建的图表容器。',
  domains: ['document', 'diagram'], semanticRoles: ['diagram'],
  createParameters: {
    type: 'array', minItems: 2, maxItems: 2,
    prefixItems: [
      {enum: ['text', 'graph', 'default']},
      {type: 'string', maxLength: 100_000},
    ],
  },
  writableProps: blockAgentWritableProps({
    mode: {enum: ['text', 'graph', 'default']},
  }),
  examples: [{flavour: 'mermaid', params: ['graph', 'flowchart LR\nA-->B']}],
})
