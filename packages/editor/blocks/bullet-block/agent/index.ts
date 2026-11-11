import {defineEditableBlockAgentCapability} from '../../agent-support'

export const BULLET_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'bullet',
    title: '无序列表',
    description: '带项目符号的列表项。',
    semanticRoles: ['list-item', 'bullet-list'],
  })
