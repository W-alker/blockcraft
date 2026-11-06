import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

const VIDEO_SOURCE_TYPE_SCHEMA = {enum: ['link', 'local', 'embed']} as const

export const VIDEO_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.video',
  kind: 'block',
  flavour: 'video',
  schemaVersion: 1,
  title: '视频',
  description: '通过 URL 创建视频媒体块。',
  domains: ['document', 'media'],
  semanticRoles: ['video', 'media'],
  createParameters: {
    type: 'array', minItems: 1, maxItems: 1,
    prefixItems: [{
      type: 'object',
      properties: {
        url: {type: 'string', maxLength: 8_192},
        name: {type: 'string', maxLength: 1_024},
        type: {type: 'string', maxLength: 255},
        size: {type: 'number', minimum: 0},
        sourceType: VIDEO_SOURCE_TYPE_SCHEMA,
        width: {type: 'number', minimum: 1},
        wr: {type: 'number', minimum: 0.1},
        ar: {type: 'number', minimum: 0.01},
        poster: {type: 'string', maxLength: 8_192},
      },
      required: ['sourceType'],
      additionalProperties: false,
    }],
  },
  writableProps: blockAgentWritableProps({
    url: {type: 'string', maxLength: 8_192},
    sourceType: VIDEO_SOURCE_TYPE_SCHEMA,
    type: {type: 'string', maxLength: 255},
    width: {type: ['number', 'null'], minimum: 1},
    wr: {type: ['number', 'null'], minimum: 0.1},
    ar: {type: ['number', 'null'], minimum: 0.01},
    poster: {type: ['string', 'null'], maxLength: 8_192},
  }),
  examples: [{
    flavour: 'video',
    params: [{url: 'https://example.com/video.mp4', sourceType: 'link'}],
  }],
})
