import {defineEditableBlockAgentCapability} from '../../agent-support'

export const PARAGRAPH_BLOCK_AGENT_CAPABILITY =
  defineEditableBlockAgentCapability({
    flavour: 'paragraph',
    title: '段落',
    description: '普通正文；heading 是段落属性，不是独立 flavour。',
    semanticRoles: ['paragraph', 'heading'],
    extraWritable: {heading: {enum: [1, 2, 3, null]}, decoration: {
      type: ['object', 'null'], additionalProperties: false, required: ['position'],
      properties: {
        position: {enum: ['before', 'after', 'both', 'above', 'below']},
        style: {enum: ['solid', 'dashed', 'dotted', 'double']},
        color: {type: 'string', maxLength: 128},
        width: {type: 'number', minimum: .5, maximum: 12},
        opacity: {type: 'number', minimum: 0, maximum: 1},
        gap: {type: 'number', minimum: 0, maximum: 120},
        align: {enum: ['first', 'center', 'last']},
        before: {type: 'string', pattern: '^(auto|[0-9]+(\\.[0-9]+)?(px|%))$'},
        after: {type: 'string', pattern: '^(auto|[0-9]+(\\.[0-9]+)?(px|%))$'},
        span: {enum: ['text', 'paragraph']},
        overflow: {enum: ['shrink', 'hide']},
      },
    }},
  })
