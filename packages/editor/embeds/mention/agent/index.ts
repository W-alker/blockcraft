import {defineInlineEmbedAgentCapability} from '../../../framework/block-std/agent'
import {INLINE_MENTION_EMBED_KEY} from '..'

export const INLINE_MENTION_AGENT_CAPABILITY =
  defineInlineEmbedAgentCapability({
    id: 'blockcraft.inline-embed.mention',
    kind: 'inline-embed',
    embedKey: INLINE_MENTION_EMBED_KEY,
    title: '提及',
    description: '指向宿主实体 ID 的 @mention。默认只提供理解能力；引用完整性必须由宿主解析后再写入。',
    domains: ['document', 'collaboration'],
    semanticRoles: ['mention', 'entity-reference'],
  })
