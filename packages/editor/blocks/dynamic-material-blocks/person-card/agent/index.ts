import {defineBlockAgentCapability} from '../../../../framework'
import {BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES, blockAgentWritableProps} from '../../../agent-support'

export const PERSON_CARD_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.person-card', kind: 'block', flavour: 'person-card', schemaVersion: 1,
  title: '人员卡片', description: '宿主数据物料；创建后由宿主物化业务 props。',
  domains: ['document', 'dynamic-material'], semanticRoles: ['person-card', 'dynamic-material'],
  createParameters: {type: 'array', maxItems: 0},
  writableProps: blockAgentWritableProps(BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES),
  atomicProps: ['position'], examples: [{flavour: 'person-card', params: []}],
})
