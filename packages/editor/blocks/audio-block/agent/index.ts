import {defineBlockAgentCapability} from '../../../framework'
import {blockAgentWritableProps} from '../../agent-support'

const AUDIO_SOURCE_TYPE_SCHEMA = {enum: ['link', 'local', 'embed']} as const

export const AUDIO_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'blockcraft.block.audio',
  kind: 'block',
  flavour: 'audio',
  schemaVersion: 1,
  title: '音频',
  description: '通过 URL 创建音频媒体块。',
  domains: ['document', 'media'],
  semanticRoles: ['audio', 'media'],
  createParameters: {
    type: 'array', minItems: 1, maxItems: 1,
    prefixItems: [{
      type: 'object',
      properties: {
        url: {type: 'string', maxLength: 8_192},
        name: {type: 'string', maxLength: 1_024},
        type: {type: 'string', maxLength: 255},
        size: {type: 'number', minimum: 0},
        sourceType: AUDIO_SOURCE_TYPE_SCHEMA,
      },
      required: ['sourceType'],
      additionalProperties: false,
    }],
  },
  writableProps: blockAgentWritableProps({
    url: {type: 'string', maxLength: 8_192},
    name: {type: 'string', maxLength: 1_024},
    sourceType: AUDIO_SOURCE_TYPE_SCHEMA,
  }),
  examples: [{
    flavour: 'audio',
    params: [{url: 'https://example.com/audio.mp3', sourceType: 'link'}],
  }],
})
