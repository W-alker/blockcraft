import {defineInlineEmbedAgentCapability} from '../../../framework/block-std/agent'
import {INLINE_LATEX_EMBED_KEY} from '..'

export const INLINE_LATEX_AGENT_CAPABILITY =
  defineInlineEmbedAgentCapability({
    id: 'blockcraft.inline-embed.latex',
    kind: 'inline-embed',
    embedKey: INLINE_LATEX_EMBED_KEY,
    title: '行内公式',
    description: '使用 LaTeX 表达式表示的一长度行内数学公式。',
    domains: ['document', 'math'],
    semanticRoles: ['formula', 'math'],
    insert: {
      value: {type: 'string', minLength: 1, maxLength: 20_000},
    },
    examples: [{value: 'E=mc^2'}],
  })
