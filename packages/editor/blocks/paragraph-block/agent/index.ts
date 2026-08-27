import {defineEditableBlockAgentCapability} from '../../agent-support'

export const PARAGRAPH_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'paragraph',
    title: '段落',
    description: '普通正文；heading 是段落属性，不是独立 flavour。',
    semanticRoles: ['paragraph', 'heading'],
    extraWritable: {heading: {enum: [1, 2, 3, null]}},
  })
