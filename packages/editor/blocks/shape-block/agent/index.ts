import {defineBlockAgentCapability, OBJECT_FORMAT_SECTION_KEYS} from '../../../framework'
import {
  BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
  BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'
import {SHAPE_KINDS} from '../shape.types'

export const SHAPE_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.shape', kind: 'block', flavour: 'shape', schemaVersion: 2,
  title: '形状', description: '可放置、缩放和旋转的目录形状。',
  domains: ['document', 'diagram'], semanticRoles: ['shape', 'diagram-object'],
  createParameters: {
    type: 'array', maxItems: 2,
    prefixItems: [{enum: SHAPE_KINDS}, BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA],
  },
  writableProps: blockAgentWritableProps({
    ...BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES,
    adjustments: {type: ['object', 'null'], additionalProperties: {type: 'number'}},
  }),
  atomicProps: [
    'position', 'adjustments', 'customGeometry',
    ...OBJECT_FORMAT_SECTION_KEYS.shapeFill,
    ...OBJECT_FORMAT_SECTION_KEYS.shapeOutline,
    ...OBJECT_FORMAT_SECTION_KEYS.shapeEffects,
    ...OBJECT_FORMAT_SECTION_KEYS.textFrame,
    ...OBJECT_FORMAT_SECTION_KEYS.textStyle,
  ],
  examples: [{flavour: 'shape', params: ['rectangle', '说明']}],
})
