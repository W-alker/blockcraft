import {defineEditableBlockAgentCapability} from '../../agent-support'

export const ORDERED_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'ordered',
    title: '有序列表',
    description: '带编号的列表项。',
    semanticRoles: ['list-item', 'ordered-list'],
    extraWritable: {
      start: {type: ['integer', 'null'], minimum: 1},
      ms: {type: ['string', 'null']},
    },
  })
