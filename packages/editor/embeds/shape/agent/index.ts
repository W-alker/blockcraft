import {defineInlineEmbedAgentCapability} from '../../../framework/block-std/agent'
import {INLINE_SHAPE_EMBED_KEY} from '..'

export const INLINE_SHAPE_AGENT_CAPABILITY = defineInlineEmbedAgentCapability({
  id: 'blockcraft.inline-embed.shape',
  kind: 'inline-embed',
  embedKey: INLINE_SHAPE_EMBED_KEY,
  title: '行内形状',
  description: '由 Shape Block 无损转换得到的一长度行内对象；复杂 payload 只读，Agent 应创建 Shape Block 而不是编造序列化值。',
  domains: ['document', 'diagram'],
  semanticRoles: ['shape', 'diagram-object'],
})
