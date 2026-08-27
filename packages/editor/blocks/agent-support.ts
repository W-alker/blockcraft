import {
  defineBlockAgentCapability,
  type BlockAgentCapabilityDefinition,
} from '../framework'

export const BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA = {
  anyOf: [
    {type: 'string'},
    {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          insert: {
            anyOf: [
              {type: 'string'},
              {
                type: 'object',
                properties: {break: {const: '\n'}},
                required: ['break'],
                additionalProperties: false,
              },
            ],
          },
          attributes: {type: 'object'},
        },
        required: ['insert'],
        additionalProperties: false,
      },
    },
  ],
} as const

export const BLOCK_AGENT_NULLABLE_STRING_SCHEMA = {
  type: ['string', 'null'],
} as const

export const BLOCK_AGENT_NULLABLE_NUMBER_SCHEMA = {
  type: ['number', 'null'],
} as const

export const BLOCK_AGENT_URL_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: 8_192,
} as const

export const BLOCK_AGENT_OBJECT_GEOMETRY_PROPERTIES = {
  width: {type: ['number', 'null'], minimum: 1, maximum: 20_000},
  height: {type: ['number', 'null'], minimum: 1, maximum: 20_000},
  rotation: {type: ['number', 'null'], minimum: -3600, maximum: 3600},
  lockRatio: {type: ['boolean', 'null']},
  position: {
    anyOf: [
      {type: 'null'},
      {
        type: 'object',
        properties: {x: {type: 'number'}, y: {type: 'number'}},
        required: ['x', 'y'],
        additionalProperties: false,
      },
    ],
  },
  placementLayer: {enum: ['under', null]},
} as const

const EDITABLE_PROPERTIES = {
  depth: {type: ['integer', 'null'], minimum: 0},
  textAlign: {enum: ['left', 'center', 'right', 'justify', null]},
  backColor: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
  borderColor: BLOCK_AGENT_NULLABLE_STRING_SCHEMA,
  pfs: {type: ['number', 'null'], minimum: 0.25, maximum: 8},
  lh: {type: ['number', 'null'], minimum: 0.5, maximum: 6},
  psb: {type: ['number', 'null'], minimum: 0, maximum: 720},
  psa: {type: ['number', 'null'], minimum: 0, maximum: 720},
} as const

const EDITABLE_CREATE_PARAMETERS = {
  type: 'array',
  minItems: 0,
  maxItems: 2,
  prefixItems: [
    BLOCK_AGENT_TEXT_OR_DELTA_SCHEMA,
    {
      type: 'object',
      properties: {
        depth: {type: 'integer', minimum: 0},
        textAlign: {enum: ['left', 'center', 'right', 'justify']},
        heading: {enum: [1, 2, 3]},
        ms: {type: 'string'},
      },
      additionalProperties: false,
    },
  ],
  items: false,
} as const

export function blockAgentWritableProps(
  properties: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  }
}

export function defineEditableBlockAgentCapability(options: {
  flavour: string
  title: string
  description: string
  semanticRoles: readonly string[]
  extraWritable?: Readonly<Record<string, unknown>>
}): BlockAgentCapabilityDefinition {
  return defineBlockAgentCapability({
    id: `blockcraft.block.${options.flavour}`,
    kind: 'block',
    flavour: options.flavour,
    schemaVersion: 1,
    title: options.title,
    description: options.description,
    domains: ['document'],
    semanticRoles: options.semanticRoles,
    createParameters: EDITABLE_CREATE_PARAMETERS,
    writableProps: blockAgentWritableProps({
      ...EDITABLE_PROPERTIES,
      ...options.extraWritable,
    }),
    examples: [{flavour: options.flavour, params: ['示例文本']}],
  })
}
