import {defineInlineEmbedAgentCapability} from '../../../framework/block-std/agent'
import {INLINE_WORD_ART_EMBED_KEY} from '..'

export const INLINE_WORD_ART_AGENT_CAPABILITY = defineInlineEmbedAgentCapability({
  id: 'blockcraft.inline-embed.word-art',
  kind: 'inline-embed',
  embedKey: INLINE_WORD_ART_EMBED_KEY,
  title: '行内艺术字',
  description: '由 WordArt Block 无损转换得到的一长度行内对象；复杂 payload 只读，Agent 应创建 WordArt Block 而不是编造序列化值。',
  domains: ['document', 'layout'],
  semanticRoles: ['word-art', 'decorative-text'],
})
