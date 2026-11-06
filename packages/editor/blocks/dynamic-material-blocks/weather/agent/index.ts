import {defineBlockAgentCapability} from '../../../../framework'
import {BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES, blockAgentWritableProps} from '../../../agent-support'

export const WEATHER_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.weather', kind: 'block', flavour: 'weather', schemaVersion: 1,
  title: '天气', description: '宿主数据物料；创建后由宿主物化业务 props。',
  domains: ['document', 'dynamic-material'], semanticRoles: ['weather', 'dynamic-material'],
  createParameters: {type: 'array', maxItems: 0},
  writableProps: blockAgentWritableProps(BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES),
  atomicProps: ['position'], examples: [{flavour: 'weather', params: []}],
})
