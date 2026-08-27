import {defineInlineEmbedAgentCapability} from '../../../framework/block-std/agent'
import {
  INLINE_DATE_EMBED_KEY,
  INLINE_DATE_FORMATS,
} from '..'

export const INLINE_DATE_AGENT_CAPABILITY = defineInlineEmbedAgentCapability({
  id: 'blockcraft.inline-embed.date',
  kind: 'inline-embed',
  embedKey: INLINE_DATE_EMBED_KEY,
  title: '冻结日期',
  description: '冻结的本地 wall-clock 日期时间；值不会随时区或重开文档变化。',
  domains: ['document', 'date-time'],
  semanticRoles: ['date', 'time'],
  insert: {
    value: {
      type: 'string',
      pattern: '^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])' +
        '(?:T(?:[01]\\d|2[0-3]):[0-5]\\d)?$',
    },
    attributes: {
      type: 'object',
      properties: {format: {enum: INLINE_DATE_FORMATS}},
      additionalProperties: false,
    },
  },
  examples: [{
    value: '2026-08-28T09:30',
    attributes: {format: 'YYYY-MM-DD HH:mm'},
  }],
})
