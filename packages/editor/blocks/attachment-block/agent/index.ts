import {defineBlockAgentCapability} from '../../../framework'
import {
  BLOCK_AGENT_URL_SCHEMA,
  blockAgentWritableProps,
} from '../../agent-support'

const ATTACHMENT_PROPERTIES = {
  name: {type: 'string', maxLength: 1_024},
  url: BLOCK_AGENT_URL_SCHEMA,
  type: {type: 'string', maxLength: 255},
  size: {type: 'number', minimum: 0},
} as const

export const ATTACHMENT_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.attachment',
  kind: 'block',
  flavour: 'attachment',
  schemaVersion: 1,
  title: '附件',
  description: '展示宿主已经提供 URL 的可下载文件。',
  domains: ['document', 'media'],
  semanticRoles: ['attachment', 'file'],
  createParameters: {
    type: 'array', minItems: 1, maxItems: 1,
    prefixItems: [{
      type: 'object',
      properties: ATTACHMENT_PROPERTIES,
      required: ['url', 'type', 'size'],
      additionalProperties: false,
    }],
  },
  writableProps: blockAgentWritableProps(ATTACHMENT_PROPERTIES),
  examples: [{
    flavour: 'attachment',
    params: [{
      name: '说明.pdf',
      url: 'https://example.com/a.pdf',
      type: 'application/pdf',
      size: 1024,
    }],
  }],
})
