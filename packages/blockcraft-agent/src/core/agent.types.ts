import type {ISelectionJSON} from '@ccc/blockcraft'

export type DocumentAgentTask =
  | 'rewrite'
  | 'continue'
  | 'expand'
  | 'condense'
  | 'proofread'
  | 'summarize'
  | 'outline'

export interface DocumentAgentContextBlock {
  blockId: string
  flavour: string
  parentId?: string | null
  index?: number
  childIds?: readonly string[]
  props?: Readonly<Record<string, unknown>>
  textDeltas?: readonly unknown[]
  snapshot?: unknown
}

export interface DocumentAgentEditorState {
  rootId: string
  isReadonly: boolean
  selection: ISelectionJSON | null
  selectedText: string
  structureRevision: number
  capabilities: readonly DocumentAgentSchemaCapability[]
}

export interface DocumentAgentSchemaCapability {
  flavour: string
  nodeType: string
  label: string
  description?: string
  includeChildren?: readonly string[]
  excludeChildren?: readonly string[]
  placementModes?: readonly string[]
  plainTextOnly?: boolean
}

export type DocumentAgentContextScope = 'selection' | 'document'

export type DocumentAgentPropValue =
  | string
  | number
  | boolean
  | null
  | readonly unknown[]
  | Readonly<Record<string, unknown>>

export interface DocumentAgentContext {
  scope: DocumentAgentContextScope
  selection: ISelectionJSON | null
  selectedText: string
  blocks: readonly DocumentAgentContextBlock[]
  capabilities?: readonly DocumentAgentSchemaCapability[]
  baseRevision: {
    structureRevision: number
    contentFingerprint: string
  }
}

export interface DocumentAgentImageAttachment {
  type: 'image'
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  name: string
  dataUrl: string
  width: number
  height: number
}

export interface DocumentAgentRequest {
  task: DocumentAgentTask
  instruction: string
  context: DocumentAgentContext
  attachments?: readonly DocumentAgentImageAttachment[]
  /** Optional runtime prompt supplied by a trusted host during development. */
  systemPrompt?: string
}

export type DocumentAgentOperation =
  | {
      kind: 'replace-text'
      blockId: string
      from: number
      to: number
      replacement: string
    }
  | {
      kind: 'update-block-props'
      blockId: string
      props: Readonly<Record<string, DocumentAgentPropValue>>
    }
  | {
      kind: 'insert-blocks'
      parentId: string
      index: number
      snapshots: readonly unknown[]
    }
  | {
      kind: 'create-blocks'
      parentId: string
      index: number
      flavour: string
      params: readonly unknown[]
    }
  | {
      kind: 'replace-block'
      blockId: string
      flavour: string
      params: readonly unknown[]
    }
  | {
      kind: 'apply-text-delta'
      blockId: string
      delta: readonly unknown[]
    }
  | {
      kind: 'delete-blocks'
      parentId: string
      index: number
      count: number
    }
  | {
      kind: 'move-blocks'
      parentId: string
      index: number
      count: number
      targetId: string
      targetIndex: number
    }

export interface DocumentAgentResult {
  summary: string
  draft?: string
  operations: readonly DocumentAgentOperation[]
}

export interface DocumentAgentTransport {
  run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult>
}
