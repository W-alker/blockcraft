import {defineInlineEmbedAgentCapability} from '../../../framework/block-std/agent'
import {INLINE_IMAGE_EMBED_KEY} from '..'

export const INLINE_IMAGE_AGENT_CAPABILITY = defineInlineEmbedAgentCapability({
  id: 'blockcraft.inline-embed.image',
  kind: 'inline-embed',
  embedKey: INLINE_IMAGE_EMBED_KEY,
  title: '行内图片',
  description: '由已知资源 URL 表示的一长度图片，可携带尺寸和文字环绕参数。',
  domains: ['document', 'media'],
  semanticRoles: ['image', 'media'],
  insert: {
    value: {type: 'string', minLength: 1, maxLength: 8_192},
    attributes: {
      type: 'object',
      properties: {
        width: {type: 'number', minimum: 1, maximum: 20_000},
        height: {type: 'number', minimum: 1, maximum: 20_000},
        wrap: {const: true},
        side: {enum: ['auto', 'left', 'right']},
        x: {type: 'number', minimum: 0, maximum: 1},
        gap: {type: 'number', minimum: 0, maximum: 2_000},
      },
      additionalProperties: false,
    },
  },
  examples: [{
    value: 'https://example.com/image.png',
    attributes: {width: 320, height: 240},
  }],
})
