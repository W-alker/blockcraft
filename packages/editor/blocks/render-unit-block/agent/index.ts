import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA,
  BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

export const RENDER_UNIT_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.render-unit', kind: 'block', flavour: 'render-unit', schemaVersion: 1,
  title: '内容区域', description: '可限制允许子块并配置表面的内容容器。',
  domains: ['document', 'layout'], semanticRoles: ['content-region', 'container'],
  createParameters: {
    type: 'array', maxItems: 2,
    prefixItems: [
      {
        type: 'object',
        properties: {
          plh: {type: 'string', maxLength: 1_024},
          plhMode: {enum: ['focused', 'always']},
          incl: {type: 'array', maxItems: 100, items: {type: 'string', minLength: 1, maxLength: 100}},
          excl: {type: 'array', maxItems: 100, items: {type: 'string', minLength: 1, maxLength: 100}},
        },
        additionalProperties: false,
      },
      {type: 'object'},
    ],
  },
  writableProps: blockAgentWritableProps({
    backColor: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    borderColor: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    p: {type: ['array', 'null'], minItems: 1, maxItems: 4, items: {type: 'number', minimum: 0}},
    bgi: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    bgs: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    bgx: BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA,
    bgy: BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA,
    bgo: BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA,
  }),
  atomicProps: ['p'], examples: [{flavour: 'render-unit', params: [{}, {p: [16, 24]}]}],
})
