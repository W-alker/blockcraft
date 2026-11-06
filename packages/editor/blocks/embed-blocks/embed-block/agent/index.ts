import {defineBlockAgentCapability} from '../../../../framework'
import {BLOCK_AGENT_URL_SCHEMA, blockAgentWritableProps} from '../../../agent-support'

const URL_SCHEMA = {...BLOCK_AGENT_URL_SCHEMA, pattern: '^https?://'} as const

export const EMBED_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.embed',
  kind: 'block',
  flavour: 'embed',
  schemaVersion: 1,
  title: '网页嵌入',
  description: '嵌入宿主已提供的网页或已上传 HTML 文件的真实 HTTP/HTTPS 地址，不执行 HTML 源码生成或文件上传。',
  domains: ['document', 'web'],
  semanticRoles: ['embed', 'file'],
  createParameters: {
    type: 'array', minItems: 1, maxItems: 1,
    prefixItems: [URL_SCHEMA],
  },
  writableProps: blockAgentWritableProps({url: URL_SCHEMA}),
  examples: [{flavour: 'embed', params: ['https://example.com/report.html']}],
})
