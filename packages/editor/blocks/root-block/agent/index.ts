import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

export const ROOT_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.root',
  kind: 'block',
  flavour: 'root',
  schemaVersion: 1,
  title: '文档',
  description: '文档根容器；不能由 Agent 创建或替换。',
  domains: ['document'],
  semanticRoles: ['document-root'],
  writableProps: blockAgentWritableProps({
    background: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    color: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    ff: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
    fs: {type: ['number', 'null'], minimum: 1, maximum: 512},
    lh: {type: ['number', 'null'], minimum: 0.5, maximum: 6},
  }),
  atomicProps: ['background'],
})
