import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
  BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

export const TEXT_BOX_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.text-box', kind: 'block', flavour: 'text-box', schemaVersion: 1,
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
  atomicProps: ['position', 'fill', 'outline', 'effects', 'textFrame', 'textStyle'],
  examples: [{flavour: 'text-box', params: ['说明文字', {width: 240, height: 120}]}],
})
