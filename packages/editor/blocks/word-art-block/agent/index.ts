import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
  BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

const WORD_ART_PROPERTIES = {
  ...BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
  depth: {type: ['integer', 'null'], minimum: 0},
} as const

export const WORD_ART_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.word-art', kind: 'block', flavour: 'word-art', schemaVersion: 1,
  title: '艺术字', description: '统一样式、可放置的艺术文字。',
  domains: ['document', 'layout'], semanticRoles: ['word-art', 'decorative-text'],
  createParameters: {
    type: 'array', maxItems: 2,
    prefixItems: [
      BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
      {type: 'object', properties: WORD_ART_PROPERTIES, additionalProperties: false},
    ],
  },
  writableProps: blockAgentWritableProps(WORD_ART_PROPERTIES),
  atomicProps: ['position', 'textFrame', 'textStyle'],
  examples: [{flavour: 'word-art', params: ['新品发布', {width: 320, height: 96}]}],
})
