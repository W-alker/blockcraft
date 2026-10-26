import {defineEditableBlockAgentCapability} from '../../agent-support'

export const TODO_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'todo',
    title: '待办事项',
    description: '可勾选的任务项。',
    semanticRoles: ['task', 'checklist-item'],
    extraWritable: {checked: {enum: [0, 1, null]}},
  })
