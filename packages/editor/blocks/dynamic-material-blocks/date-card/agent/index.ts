import {defineBlockAgentCapability} from '../../../../framework'
import {BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES, blockAgentWritableProps} from '../../../agent-support'

export const DATE_CARD_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.date-card', kind: 'block', flavour: 'date-card', schemaVersion: 1,
  title: '日期卡片', description: '宿主数据物料；创建后由宿主物化业务 props。',
  domains: ['document', 'dynamic-material'], semanticRoles: ['date-card', 'dynamic-material'],
  createParameters: {type: 'array', maxItems: 0},
  writableProps: blockAgentWritableProps(BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES),
  atomicProps: ['position'], examples: [{flavour: 'date-card', params: []}],
})
