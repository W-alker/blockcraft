import type {
  AdapterRegistry,
  BlockCraftDoc,
  MarkdownAdapterProfile,
  RevisionActorSnapshot,
} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentMarkdownRequest,
  DocumentAgentMarkdownStreamEvent,
  DocumentAgentModelToolCall,
  DocumentAgentModelToolResult,
  DocumentAgentRequest,
  DocumentAgentResult,
  DocumentAgentSpecialist,
  DocumentAgentToolExchange,
} from '../core/agent.types'
import type {
  DocumentAgentToolCall,
  DocumentAgentToolHostResult,
} from '../core/agent-tools'
import {isDocumentAgentToolCall} from '../core/agent-tools'
import {BLOCKCRAFT_BUILTIN_AGENT_EXTENSION} from '../core/builtin-block-capabilities'
import {
  DocumentAgentExtensionRegistry,
  type DocumentAgentHostContext,
  type DocumentAgentHostExtension,
  type DocumentAgentRuntimeManifest,
} from '../core/host-extension'
import {DocumentAgentRunner} from '../core/document-agent-runner'
import {captureBlockCraftAgentContext} from './blockcraft-context-adapter'
import {captureDocumentAgentManifestOptions} from './document-agent-capability-scope'
import {
  DocumentAgentApplyError,
  DocumentAgentOperationApplier,
  type DocumentAgentRevisionApplyResult,
} from './document-agent-operation-applier'
import {DocumentAgentToolExecutor} from './document-agent-tool-executor'

/**
 * Host-facing facade for the BlockCraft Editor Agent.
 *
 * It keeps model inference, live editor reads and guarded editor tools in one
 * boundary. The model never receives the editor instance and cannot mutate
 * BlockCraft without going through an explicit host-owned write boundary.
 */
export class BlockCraftEditorAgent {
  readonly tools: DocumentAgentToolExecutor
  readonly extensions: DocumentAgentExtensionRegistry

  constructor(
    private readonly doc: BlockCraftDoc,
    private readonly runner: DocumentAgentRunner,
    private readonly options: BlockCraftEditorAgentOptions = {},
  ) {
    this.extensions = new DocumentAgentExtensionRegistry([
      BLOCKCRAFT_BUILTIN_AGENT_EXTENSION,
      ...(options.extensions ?? []),
    ])
    this.tools = new DocumentAgentToolExecutor(doc, null, this.extensions)
  }

  getContext(scope?: DocumentAgentContext['scope']): DocumentAgentContext | null {
    return captureBlockCraftAgentContext(this.doc, {
      ...(scope ? {scope} : {}),
      extensions: this.extensions,
    })
  }

  getRuntimeManifest(_context?: DocumentAgentContext | null): DocumentAgentRuntimeManifest {
    const manifest = this.extensions.createRuntimeManifest(
      this.options.resolveHostContext?.() ?? null,
      captureDocumentAgentManifestOptions(this.doc),
    )
    const markdown = this.options.markdown
    return markdown
      ? {
        ...manifest,
        markdown: markdown.adapterRegistry.createMarkdownManifest(
          markdown.profile ?? 'hybrid',
        ),
      }
      : manifest
  }

  async *streamMarkdown(
    request: DocumentAgentMarkdownRequest,
    options?: {signal?: AbortSignal},
  ): AsyncIterable<DocumentAgentMarkdownStreamEvent> {
    const context = this.getContext(request.context.scope)
    if (!context) throw new Error('BlockCraft 文档尚未初始化。')
    const resolvedRequest: DocumentAgentMarkdownRequest = {
      ...request,
      markdownStreamVersion: 1,
      context,
      runtime: this.getRuntimeManifest(context),
    }
    yield* this.runner.streamMarkdown(resolvedRequest, options)
  }

  async run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult> {
    const context = this.getContext(request.context.scope)
    if (!context) throw new Error('BlockCraft 文档尚未初始化。')
    const resolvedRequest: DocumentAgentRequest = {
      ...request,
      context,
      runtime: this.getRuntimeManifest(context),
    }
    const toolHistory: DocumentAgentToolExchange[] = []
    const maxTurns = clampInteger(this.options.orchestration?.maxTurns, 6, 1, 12)
    const maxToolCallsPerTurn = clampInteger(
      this.options.orchestration?.maxToolCallsPerTurn,
      8,
      1,
      16,
    )
    const maxDelegations = clampInteger(
      this.options.orchestration?.maxDelegations,
      3,
      0,
      6,
    )
    let delegationCount = 0
    let finalValidationError: string | null = null

    for (let step = 0; step < maxTurns; step++) {
      const turn = await this.runner.runTurn({
        orchestrationVersion: 1,
        request: resolvedRequest,
        step,
        toolHistory,
      }, options)
      if (turn.kind === 'result') {
        try {
          new DocumentAgentOperationApplier(this.doc, this.extensions)
            .validate(context, turn.result)
          return turn.result
        } catch (error) {
          if (!(error instanceof DocumentAgentApplyError) ||
              error.code !== 'invalid' ||
              !this.runner.supportsTurnProtocol) {
            throw error
          }
          appendBoundedExchange(toolHistory, createFinalValidationExchange(
            step,
            turn.result,
            error.message,
          ))
          finalValidationError = error.message
          continue
        }
      }
      if (!turn.calls.length) throw new Error('Master Agent 返回了空工具调用。')
      if (turn.calls.length > maxToolCallsPerTurn) {
        throw new Error(`Master Agent 单轮工具调用超过 ${maxToolCallsPerTurn} 个。`)
      }

      for (const call of turn.calls) {
        let result: DocumentAgentModelToolResult
        if (call.name === 'blockcraft.delegate' && delegationCount >= maxDelegations) {
          result = {
            callId: call.id,
            name: call.name,
            ok: false,
            error: `Master Agent 单次请求最多委派 ${maxDelegations} 个 specialist。`,
          }
        } else {
          if (call.name === 'blockcraft.delegate') delegationCount++
          result = await this.executeModelToolCall(call, resolvedRequest, context, options)
        }
        appendBoundedExchange(toolHistory, {
          call: {...call, arguments: boundStructuredValue(call.arguments)},
          result: result.ok
            ? {...result, data: boundStructuredValue(result.data)}
            : result,
        })
      }
    }

    throw new Error(finalValidationError
      ? `Master Agent 在 ${maxTurns} 轮内未生成可执行结果：${finalValidationError}`
      : `Master Agent 在 ${maxTurns} 轮内未生成最终结果。`)
  }

  executeTool(
    call: DocumentAgentToolCall,
    options: {allowWrite?: boolean} = {},
    context?: DocumentAgentContext | null,
  ): DocumentAgentToolHostResult {
    if (!context) return this.tools.execute(call, options)
    return new DocumentAgentToolExecutor(this.doc, context, this.extensions).execute(call, options)
  }

  /**
   * Applies an Agent result immediately. Revision-capable operations are
   * projected into one review group; operations outside Revision v1 still use
   * their normal model/Yjs path and therefore have no Diff styling. This does
   * not enable the document's global revision tracking mode.
   */
  stageRevisionDiff(
    context: DocumentAgentContext,
    result: DocumentAgentResult,
    options: BlockCraftEditorAgentRevisionOptions = {},
  ): DocumentAgentRevisionApplyResult {
    return new DocumentAgentOperationApplier(this.doc, this.extensions).applyAsRevision(context, result, {
      actor: options.actor ?? this.options.revisionActor ?? DEFAULT_AGENT_REVISION_ACTOR,
      ...(options.groupId ? {groupId: options.groupId} : {}),
    })
  }

  executeHostTool(
    toolName: string,
    argumentsValue: unknown,
    options: {allowWrite?: boolean; signal?: AbortSignal} = {},
  ) {
    return this.extensions.executeTool(toolName, argumentsValue, {
      ...options,
      host: this.options.resolveHostContext?.() ?? undefined,
    })
  }

  private async executeModelToolCall(
    call: DocumentAgentModelToolCall,
    request: DocumentAgentRequest,
    context: DocumentAgentContext,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentModelToolResult> {
    if (call.name === 'blockcraft.delegate') {
      const delegation = readDelegationArguments(call.arguments)
      if (!delegation) {
        return {
          callId: call.id,
          name: call.name,
          ok: false,
          error: 'blockcraft.delegate 缺少合法的 specialist 或 objective。',
        }
      }
      try {
        const data = await this.runner.runSubAgent({
          delegationVersion: 1,
          specialist: delegation.specialist,
          objective: delegation.objective,
          request,
          input: boundStructuredValue(delegation.input),
        }, options)
        return {callId: call.id, name: call.name, ok: true, data}
      } catch (error) {
        return {
          callId: call.id,
          name: call.name,
          ok: false,
          error: error instanceof Error ? error.message : 'Specialist delegation failed.',
        }
      }
    }

    const builtInCall = {name: call.name, arguments: call.arguments}
    if (isDocumentAgentToolCall(builtInCall)) {
      const result = this.executeTool(builtInCall, {allowWrite: false}, context)
      return result.ok
        ? {callId: call.id, name: call.name, ok: true, data: result.data}
        : {callId: call.id, name: call.name, ok: false, error: result.error}
    }
    if (!this.extensions.hasTool(call.name)) {
      return {
        callId: call.id,
        name: call.name,
        ok: false,
        error: `Agent tool ${call.name} is not registered.`,
      }
    }

    const result = await this.executeHostTool(call.name, call.arguments, {
      allowWrite: false,
      signal: options?.signal,
    })
    return result.ok
      ? {callId: call.id, name: call.name, ok: true, data: result.data}
      : {callId: call.id, name: call.name, ok: false, error: result.error}
  }
}

export interface BlockCraftEditorAgentOptions {
  extensions?: readonly DocumentAgentHostExtension[]
  resolveHostContext?: () => DocumentAgentHostContext | null | undefined
  markdown?: {
    adapterRegistry: AdapterRegistry
    /** Defaults to the editor's normal hybrid profile. */
    profile?: MarkdownAdapterProfile
  }
  /** Attribution stored on revision records created by `stageRevisionDiff()`. */
  revisionActor?: RevisionActorSnapshot
  orchestration?: {
    /** Defaults to 6 and is clamped to 1..12. */
    maxTurns?: number
    /** Defaults to 8 and is clamped to 1..16. */
    maxToolCallsPerTurn?: number
    /** Defaults to 3 and is clamped to 0..6. */
    maxDelegations?: number
  }
}

export interface BlockCraftEditorAgentRevisionOptions {
  actor?: RevisionActorSnapshot
  groupId?: string
}

export const DEFAULT_AGENT_REVISION_ACTOR: RevisionActorSnapshot = {
  actorId: 'blockcraft-agent',
  displayName: 'BlockCraft AI',
}

const MAX_TOOL_HISTORY_ITEMS = 24
const MAX_TOOL_HISTORY_CHARS = 32_000
const MAX_TOOL_VALUE_CHARS = 12_000

function createFinalValidationExchange(
  step: number,
  result: DocumentAgentResult,
  error: string,
): DocumentAgentToolExchange {
  const callId = `host-final-validation-${step + 1}`
  return {
    call: {
      id: callId,
      name: 'blockcraft.preview_changes',
      arguments: {
        summary: result.summary,
        operations: result.operations,
      },
    },
    result: {
      callId,
      name: 'blockcraft.preview_changes',
      ok: false,
      error: `Final result failed host semantic validation: ${error} ` +
        'Return a corrected final result and do not repeat the invalid operation. ' +
        'Inspect the installed capability when an Embed or Block contract is uncertain; ' +
        'fall back to plain text when no writable capability exists.',
    },
  }
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function appendBoundedExchange(
  history: DocumentAgentToolExchange[],
  exchange: DocumentAgentToolExchange,
): void {
  history.push(exchange)
  while (history.length > MAX_TOOL_HISTORY_ITEMS || serializedLength(history) > MAX_TOOL_HISTORY_CHARS) {
    history.shift()
  }
}

function boundStructuredValue(value: unknown): unknown {
  let serialized: string
  try {
    serialized = JSON.stringify(value) ?? 'null'
  } catch {
    return {truncated: true, preview: '[Unserializable tool value]'}
  }
  if (serialized.length <= MAX_TOOL_VALUE_CHARS) return value ?? null
  return {
    truncated: true,
    originalChars: serialized.length,
    preview: serialized.slice(0, MAX_TOOL_VALUE_CHARS),
  }
}

function serializedLength(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

const SPECIALISTS = new Set<DocumentAgentSpecialist>([
  'document-analysis',
  'content-writing',
  'structure-planning',
  'visual-reconstruction',
  'host-workflow',
  'quality-review',
])

function readDelegationArguments(value: unknown): {
  specialist: DocumentAgentSpecialist
  objective: string
  input?: unknown
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const args = value as Record<string, unknown>
  if (typeof args['specialist'] !== 'string' ||
      !SPECIALISTS.has(args['specialist'] as DocumentAgentSpecialist)) return null
  if (typeof args['objective'] !== 'string' || !args['objective'].trim()) return null
  return {
    specialist: args['specialist'] as DocumentAgentSpecialist,
    objective: args['objective'].trim().slice(0, 2_000),
    ...(args['input'] === undefined ? {} : {input: args['input']}),
  }
}
