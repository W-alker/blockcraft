import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA,
  BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
  BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
  BLOCK_AGENT_URL_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

export const IMAGE_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.image',
  kind: 'block',
  flavour: 'image',
  schemaVersion: 1,
  title: '图片',
  description: '通过 URL 或宿主资源地址插入图片。',
  domains: ['document', 'media'],
  semanticRoles: ['image', 'media'],
  createParameters: {
    type: 'array', minItems: 1, maxItems: 4,
    prefixItems: [
      {
        anyOf: [
          BLOCK_AGENT_URL_SCHEMA,
          {
            type: 'object',
            properties: {
              src: BLOCK_AGENT_URL_SCHEMA,
              wr: {type: 'number', minimum: 0.1},
              ar: {type: 'number', minimum: 0.01},
            },
            required: ['src'],
            additionalProperties: false,
          },
        ],
      },
      {type: 'number', minimum: 1},
      {type: 'number', minimum: 1},
      BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
    ],
  },
  writableProps: blockAgentWritableProps({
    src: {...BLOCK_AGENT_URL_SCHEMA, type: ['string', 'null']},
    wr: BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA,
    ar: BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA,
    align: {enum: ['center', 'right', null]},
    ...BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
  }),
  atomicProps: ['position'],
  examples: [{flavour: 'image', params: ['https://example.com/image.png']}],
})
