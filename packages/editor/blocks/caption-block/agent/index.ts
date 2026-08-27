import {defineEditableBlockAgentCapability} from '../../agent-support'

export const CAPTION_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'caption',
    title: '题注',
    description: '媒体或表格的简短题注。',
    semanticRoles: ['caption'],
  })
