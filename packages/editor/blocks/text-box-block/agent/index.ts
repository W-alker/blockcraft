import {defineBlockAgentCapability, OBJECT_FORMAT_SECTION_KEYS} from '../../../framework'
import {
  BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
  BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

export const TEXT_BOX_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.text-box', kind: 'block', flavour: 'text-box', schemaVersion: 2,
  title: '文本框', description: '固定几何、可放置的富文本容器。',
  domains: ['document', 'layout'], semanticRoles: ['text-box', 'layout-object'],
  createParameters: {
    type: 'array', maxItems: 2,
    prefixItems: [
      BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
      {type: 'object', properties: BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES, additionalProperties: false},
    ],
  },
  writableProps: blockAgentWritableProps(BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES),
  atomicProps: [
    'position',
    ...OBJECT_FORMAT_SECTION_KEYS.shapeFill,
    ...OBJECT_FORMAT_SECTION_KEYS.shapeOutline,
    ...OBJECT_FORMAT_SECTION_KEYS.shapeEffects,
    ...OBJECT_FORMAT_SECTION_KEYS.textFrame,
    ...OBJECT_FORMAT_SECTION_KEYS.textStyle,
  ],
  examples: [{flavour: 'text-box', params: ['说明文字', {width: 240, height: 120}]}],
})
