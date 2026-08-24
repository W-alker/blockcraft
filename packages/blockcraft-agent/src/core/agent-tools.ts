import type {
  DocumentAgentOperation,
  DocumentAgentResult,
} from './agent.types'

export type DocumentAgentToolName =
  | 'blockcraft.get_document_context'
  | 'blockcraft.search_document'
  | 'blockcraft.preview_changes'
  | 'blockcraft.apply_changes'

export interface DocumentAgentToolDefinition {
  type: 'function'
  name: DocumentAgentToolName
  description: string
  parameters: Record<string, unknown>
}

const operationSchema = {
  type: 'array',
  description: '经过 BlockCraft 规则约束的结构化文档操作。',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      kind: {
        type: 'string',
        enum: ['replace-text', 'update-block-props', 'insert-blocks'],
      },
      blockId: {type: 'string'},
      from: {type: 'integer', minimum: 0},
      to: {type: 'integer', minimum: 0},
      replacement: {type: 'string'},
      props: {type: 'object'},
      parentId: {type: 'string'},
      index: {type: 'integer', minimum: 0},
      snapshots: {type: 'array'},
    },
  },
} as Record<string, unknown>

export const DOCUMENT_AGENT_TOOL_DEFINITIONS: readonly DocumentAgentToolDefinition[] = [
  {
    type: 'function',
    name: 'blockcraft.get_document_context',
    description: '读取当前 BlockCraft 文档的完整模型上下文和版本指纹。',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    type: 'function',
    name: 'blockcraft.search_document',
    description: '在当前 BlockCraft 文档的模型文本中搜索关键词，返回稳定 blockId。',
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
  'blockcraft.get_document_context': true,
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
