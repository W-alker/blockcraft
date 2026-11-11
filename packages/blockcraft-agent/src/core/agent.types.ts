import type {ISelectionJSON} from '@ccc/blockcraft'
import type {DocumentAgentRuntimeManifest} from './host-extension'

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
  nodeType: string
  parentId?: string | null
  index?: number
  childIds?: readonly string[]
  props?: Readonly<Record<string, unknown>>
  text?: {
    plain: string
    delta: readonly unknown[]
  }
  readonly?: boolean
  /** Omitted means the block carries its normal full model detail. */
  detail?: 'full' | 'outline'
  /** Bounded model-facing preview used by progressive document context pages. */
  outline?: {
    textPreview?: string
    textLength?: number
    textTruncated?: boolean
    propKeys?: readonly string[]
    propKeysTruncated?: boolean
    childCount?: number
  }
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
  schemaVersion?: number
  includeChildren?: readonly string[]
  excludeChildren?: readonly string[]
  placementModes?: readonly string[]
  plainTextOnly?: boolean
  capabilityId?: string
  semanticRoles?: readonly string[]
  creatable?: boolean
  writablePropKeys?: readonly string[]
  atomicProps?: readonly string[]
}

export type DocumentAgentContextScope = 'selection' | 'document'

export interface DocumentAgentContextCoverage {
  /** A page is a document-wide outline slice, not the complete model baseline. */
  mode: 'paged'
  detail: 'outline'
  totalBlocks: number
  offset: number
  returnedBlocks: number
  nextOffset: number | null
  totalTextChars: number
  includedTextChars: number
  detailTools: readonly [
    'blockcraft.get_document_context',
    'blockcraft.get_block',
    'blockcraft.search_document',
  ]
}

export interface DocumentAgentModelContextOptions {
  /** Progressive by default. Use full only for a provider with its own context management. */
  strategy?: 'progressive' | 'full'
  /** Target serialized size before document scope switches to a paged outline. Default 24000. */
  maxInitialChars?: number
  /** Maximum outline blocks in the initial page. Default 80. */
  maxInitialBlocks?: number
  /** Maximum plain-text preview per outline block. Default 480. */
  previewCharsPerBlock?: number
}

export interface DocumentAgentDocumentAnchor {
  rootId: string
  append: {
    parentId: string
    index: number
  }
}

export type DocumentAgentPropValue =
  | string
  | number
  | boolean
  | null
  | readonly unknown[]
  | Readonly<Record<string, unknown>>

export interface DocumentAgentContext {
  protocolVersion: 2
  scope: DocumentAgentContextScope
  selection: ISelectionJSON | null
  selectedText: string
  blocks: readonly DocumentAgentContextBlock[]
  /** Present only when blocks is a bounded page rather than the complete baseline. */
  coverage?: DocumentAgentContextCoverage
  /** Stable model-first insertion positions that remain available in selection scope. */
  document?: DocumentAgentDocumentAnchor
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
  /** Runtime BlockCraft and host capabilities populated by the host facade. */
  runtime?: DocumentAgentRuntimeManifest
  /** Opaque short-lived conversation key; it is not document context. */
  sessionId?: string
  attachments?: readonly DocumentAgentImageAttachment[]
  /** Optional runtime prompt supplied by a trusted host during development. */
  systemPrompt?: string
}

/** Read-only Markdown response request. It never carries document operations. */
export interface DocumentAgentMarkdownRequest {
  markdownStreamVersion: 1
  instruction: string
  context: DocumentAgentContext
  /** Runtime BlockCraft and Markdown Adapter capabilities populated by the host facade. */
  runtime?: DocumentAgentRuntimeManifest
  sessionId?: string
  attachments?: readonly DocumentAgentImageAttachment[]
  systemPrompt?: string
}

export type DocumentAgentMarkdownStreamEvent =
  | {readonly type: 'delta'; readonly delta: string}
  | {
      readonly type: 'done'
      readonly markdown: string
      /** False when a provider only exposes its final answer. */
      readonly streamed: boolean
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
      kind: 'create-blocks'
      parentId: string
      index: number
      flavour: string
      params: readonly unknown[]
      /** Optional handle for nested-create parentId or existing-content move targetId refs. */
      clientRef?: string
    }
  | {
      kind: 'replace-block'
      blockId: string
      flavour: string
      params: readonly unknown[]
      /** Optional local handle for the replacement root snapshot. */
      clientRef?: string
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

/** One provider-independent tool request emitted by the Master Agent. */
export interface DocumentAgentModelToolCall {
  id: string
  name: string
  arguments?: unknown
}

export type DocumentAgentModelToolResult =
  | {
      callId: string
      name: string
      ok: true
      data: unknown
    }
  | {
      callId: string
      name: string
      ok: false
      error: string
    }

export interface DocumentAgentToolExchange {
  call: DocumentAgentModelToolCall
  result: DocumentAgentModelToolResult
}

export type DocumentAgentSpecialist =
  | 'document-analysis'
  | 'content-writing'
  | 'structure-planning'
  | 'host-workflow'
  | 'quality-review'

/** Read-only specialist request delegated by the Master Agent. */
export interface DocumentAgentSubAgentRequest {
  delegationVersion: 1
  specialist: DocumentAgentSpecialist
  objective: string
  request: DocumentAgentRequest
  input?: unknown
}

export type DocumentAgentQualityReviewVerdict = 'pass' | 'revise'

export interface DocumentAgentQualityReviewIssue {
  severity: 'error' | 'warning'
  /** Stable, provider-defined machine-readable category such as missing-evidence. */
  code: string
  message: string
  /** Candidate operation indexes affected by this issue; empty means result-wide. */
  operationIndexes: readonly number[]
  recommendation?: string
}

/** Structured decision returned only by the quality-review specialist. */
export interface DocumentAgentQualityReview {
  verdict: DocumentAgentQualityReviewVerdict
  issues: readonly DocumentAgentQualityReviewIssue[]
}

export interface DocumentAgentSubAgentResult {
  specialist: DocumentAgentSpecialist
  summary: string
  findings: readonly string[]
  recommendations: readonly string[]
  draft?: string
  /** Candidate operations only; the Master and host still validate them. */
  operations: readonly DocumentAgentOperation[]
  /** Required when specialist is quality-review; omitted for other specialists. */
  review?: DocumentAgentQualityReview
}

/**
 * Stateless transport envelope for one Master Agent turn. The browser host
 * executes requested tools, then sends the bounded exchange history on the
 * next turn so Codex CLI and remote providers share the same protocol.
 */
export interface DocumentAgentTurnRequest {
  orchestrationVersion: 1
  request: DocumentAgentRequest
  step: number
  toolHistory: readonly DocumentAgentToolExchange[]
}

export type DocumentAgentTurnResponse =
  | {
      kind: 'result'
      result: DocumentAgentResult
    }
  | {
      kind: 'tool-calls'
      calls: readonly DocumentAgentModelToolCall[]
    }

export interface DocumentAgentTransport {
  run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult>
  /** Optional Master Agent protocol. Legacy transports can keep run() only. */
  runTurn?(
    turn: DocumentAgentTurnRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentTurnResponse>
  /** Optional read-only specialist inference used by blockcraft.delegate. */
  runSubAgent?(
    delegation: DocumentAgentSubAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentSubAgentResult>
  /** Optional display-only Markdown response stream. */
  streamMarkdown?(
    request: DocumentAgentMarkdownRequest,
    options?: {signal?: AbortSignal},
  ): AsyncIterable<DocumentAgentMarkdownStreamEvent>
}
