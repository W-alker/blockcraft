import type {
  DocumentAgentOperation,
  DocumentAgentResult,
} from './agent.types'

export type DocumentAgentToolName =
  | 'blockcraft.get_editor_state'
  | 'blockcraft.get_block'
  | 'blockcraft.get_document_context'
  | 'blockcraft.get_schema_capabilities'
  | 'blockcraft.get_capability_directory'
  | 'blockcraft.get_capability'
  | 'blockcraft.delegate'
  | 'blockcraft.search_document'
  | 'blockcraft.preview_changes'
  | 'blockcraft.apply_changes'

export interface DocumentAgentToolDefinition {
  type: 'function'
  name: DocumentAgentToolName
  description: string
  parameters: Record<string, unknown>
}

const primitiveJsonSchema = {
  anyOf: [
    {type: 'string'},
    {type: 'number'},
    {type: 'boolean'},
    {type: 'null'},
  ],
}

const inlineEmbedInsertSchema = {
  type: 'object',
  minProperties: 1,
  maxProperties: 1,
  additionalProperties: primitiveJsonSchema,
}

const deltaAttributesSchema = {
  type: 'object',
  maxProperties: 32,
  additionalProperties: primitiveJsonSchema,
}

const operationSchema = {
  type: 'array',
  description: '经过 BlockCraft 规则约束的结构化文档操作。',
  items: {
    oneOf: [
      operationVariant('replace-text', {
        blockId: {type: 'string'},
        from: {type: 'integer', minimum: 0},
        to: {type: 'integer', minimum: 0},
        replacement: {type: 'string'},
      }, ['blockId', 'from', 'to', 'replacement']),
      operationVariant('update-block-props', {
        blockId: {type: 'string'},
        props: {type: 'object'},
      }, ['blockId', 'props']),
      operationVariant('create-blocks', {
        parentId: {type: 'string'},
        index: {type: 'integer', minimum: 0},
        flavour: {type: 'string'},
        params: {type: 'array'},
        clientRef: {type: 'string', pattern: '^[A-Za-z][A-Za-z0-9._-]{0,63}$'},
      }, ['parentId', 'index', 'flavour', 'params']),
      operationVariant('replace-block', {
        blockId: {type: 'string'},
        flavour: {type: 'string'},
        params: {type: 'array'},
        clientRef: {type: 'string', pattern: '^[A-Za-z][A-Za-z0-9._-]{0,63}$'},
      }, ['blockId', 'flavour', 'params']),
      operationVariant('apply-text-delta', {
        blockId: {type: 'string'},
        delta: {
          type: 'array',
          items: {
            oneOf: [
              textDeltaVariant('retain', {type: 'integer', minimum: 1}, true),
              textDeltaVariant('insert', {
                anyOf: [{type: 'string'}, inlineEmbedInsertSchema],
              }, true),
              textDeltaVariant('delete', {type: 'integer', minimum: 1}, false),
            ],
          },
        },
      }, ['blockId', 'delta']),
      operationVariant('delete-blocks', {
        parentId: {type: 'string'},
        index: {type: 'integer', minimum: 0},
        count: {type: 'integer', minimum: 1},
      }, ['parentId', 'index', 'count']),
      operationVariant('move-blocks', {
        parentId: {type: 'string'},
        index: {type: 'integer', minimum: 0},
        count: {type: 'integer', minimum: 1},
        targetId: {type: 'string'},
        targetIndex: {type: 'integer', minimum: 0},
      }, ['parentId', 'index', 'count', 'targetId', 'targetIndex']),
    ],
  },
  maxItems: 100,
} as Record<string, unknown>

function textDeltaVariant(
  operation: 'retain' | 'insert' | 'delete',
  valueSchema: Record<string, unknown>,
  allowsAttributes: boolean,
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      [operation]: valueSchema,
      ...(allowsAttributes ? {attributes: deltaAttributesSchema} : {}),
    },
    required: [operation],
  }
}

function operationVariant(
  kind: DocumentAgentOperation['kind'],
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      kind: {type: 'string', enum: [kind]},
      ...properties,
    },
    required: ['kind', ...required],
  }
}

export const DOCUMENT_AGENT_TOOL_DEFINITIONS: readonly DocumentAgentToolDefinition[] = [
  {
    type: 'function',
    name: 'blockcraft.get_editor_state',
    description: '读取当前编辑器状态、选区、只读状态、结构版本和已注册 Schema。',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    type: 'function',
    name: 'blockcraft.get_block',
    description: '按稳定 blockId 读取块的模型属性、文本、父节点、子节点和 Snapshot。',
    parameters: {
      type: 'object',
      properties: {blockId: {type: 'string'}},
      required: ['blockId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'blockcraft.get_schema_capabilities',
    description: '读取当前宿主已注册的 BlockCraft Schema、块类型和父子能力。',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    type: 'function',
    name: 'blockcraft.get_document_context',
    description: '读取当前 BlockCraft 文档。传 offset/maxBlocks 时返回有界 outline 页；精确编辑前再用 get_block 读取完整 Delta/Snapshot。省略分页参数保留完整上下文兼容行为。',
    parameters: {
      type: 'object',
      properties: {
        offset: {type: 'integer', minimum: 0},
        maxBlocks: {type: 'integer', minimum: 1, maximum: 50},
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'blockcraft.get_capability_directory',
    description: '读取当前宿主注册给 Agent 的 Block、Inline Embed、Plugin、Context、Skill 和语义工具目录。',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    type: 'function',
    name: 'blockcraft.get_capability',
    description: '按能力 ID 读取完整 Agent Capability，包含 Block 创建参数、Inline Embed 插入契约和允许动作。',
    parameters: {
      type: 'object',
      properties: {capabilityId: {type: 'string'}},
      required: ['capabilityId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'blockcraft.delegate',
    description: '把只读分析、写作、结构规划、图片复原、宿主工作流或质量复核任务委派给独立 specialist 模型回合。',
    parameters: {
      type: 'object',
      properties: {
        specialist: {
          type: 'string',
          enum: [
            'document-analysis',
            'content-writing',
            'structure-planning',
            'visual-reconstruction',
            'host-workflow',
            'quality-review',
          ],
        },
        objective: {type: 'string'},
        input: {},
      },
      required: ['specialist', 'objective'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'blockcraft.search_document',
    description: '直接在当前完整 BlockCraft 模型文本中搜索关键词，返回实时稳定 blockId；不受初始 outline 页范围限制。',
    parameters: {
      type: 'object',
      properties: {
        query: {type: 'string'},
        maxResults: {type: 'integer', minimum: 1, maximum: 50},
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'blockcraft.preview_changes',
    description: '校验一组修改操作并生成预览，不写入文档。',
    parameters: {
      type: 'object',
      properties: {summary: {type: 'string'}, operations: operationSchema},
      required: ['operations'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'blockcraft.apply_changes',
    description: '在宿主确认后，通过 DocCRUD 原子应用已校验的修改操作。',
    parameters: {
      type: 'object',
      properties: {summary: {type: 'string'}, operations: operationSchema},
      required: ['operations'],
      additionalProperties: false,
    },
  },
]

export type DocumentAgentToolCall = {
  name: DocumentAgentToolName
  arguments?: unknown
}

export type DocumentAgentToolHostResult =
  | {ok: true; tool: DocumentAgentToolName; data: unknown}
  | {ok: false; tool: DocumentAgentToolName; error: string}

export type DocumentAgentToolOperationPayload = Pick<DocumentAgentResult, 'operations'> &
  Partial<Pick<DocumentAgentResult, 'summary'>>

export function isDocumentAgentToolCall(value: unknown): value is DocumentAgentToolCall {
  if (!value || typeof value !== 'object') return false
  const call = value as Record<string, unknown>
  return typeof call['name'] === 'string' && call['name'] in toolNames
}

const toolNames: Record<DocumentAgentToolName, true> = {
  'blockcraft.get_editor_state': true,
  'blockcraft.get_block': true,
  'blockcraft.get_document_context': true,
  'blockcraft.get_schema_capabilities': true,
  'blockcraft.get_capability_directory': true,
  'blockcraft.get_capability': true,
  'blockcraft.delegate': true,
  'blockcraft.search_document': true,
  'blockcraft.preview_changes': true,
  'blockcraft.apply_changes': true,
}

export function asToolOperationPayload(value: unknown): DocumentAgentToolOperationPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  if (!Array.isArray(payload['operations'])) return null
  return {
    summary: typeof payload['summary'] === 'string' ? payload['summary'] : undefined,
    operations: payload['operations'] as readonly DocumentAgentOperation[],
  }
}
