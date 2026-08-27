import {defineInlineEmbedAgentCapability} from '../../../framework/block-std/agent'
import {INLINE_ICON_EMBED_KEY} from '..'

export const INLINE_ICON_AGENT_CAPABILITY = defineInlineEmbedAgentCapability({
  id: 'blockcraft.inline-embed.icon',
  kind: 'inline-embed',
  embedKey: INLINE_ICON_EMBED_KEY,
  title: '行内图标',
  description: '由 BlockCraft iconfont class 表示的一长度图标；Schema 只验证 class 语法，必须从宿主已知图标清单选择，不能猜测不存在的 glyph。',
  domains: ['document'],
  semanticRoles: ['icon', 'decoration'],
  insert: {
    value: {
      type: 'string',
      pattern: '^bc_icon(?:\\s+bc_[A-Za-z0-9_-]+)+$',
      maxLength: 256,
    },
  },
  examples: [{value: 'bc_icon bc_document'}],
})
