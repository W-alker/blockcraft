import {defineEditableBlockAgentCapability} from '../../agent-support'

export const BLOCKQUOTE_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'blockquote',
    title: '引用',
    description: '引用或强调文本。',
    semanticRoles: ['quote'],
  })
