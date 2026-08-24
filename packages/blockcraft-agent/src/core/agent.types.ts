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
  props?: Readonly<Record<string, unknown>>
  textDeltas?: readonly unknown[]
  snapshot?: unknown
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
  baseRevision: {
    structureRevision: number
    contentFingerprint: string
  }
}

export interface DocumentAgentRequest {
  task: DocumentAgentTask
  instruction: string
  context: DocumentAgentContext
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
