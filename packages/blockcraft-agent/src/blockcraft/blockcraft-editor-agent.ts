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
  DocumentAgentModelContextOptions,
  DocumentAgentModelToolCall,
  DocumentAgentModelToolResult,
  DocumentAgentOperation,
  DocumentAgentQualityReview,
  DocumentAgentRequest,
  DocumentAgentResult,
  DocumentAgentSpecialist,
  DocumentAgentSubAgentResult,
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
import {projectDocumentAgentContextForModel} from './document-agent-context-projection'
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
    const baselineContext = this.getContext(request.context.scope)
    if (!baselineContext) throw new Error('BlockCraft 文档尚未初始化。')
    const resolvedRequest: DocumentAgentMarkdownRequest = {
      ...request,
      markdownStreamVersion: 1,
      context: baselineContext,
      runtime: this.getRuntimeManifest(baselineContext),
    }
    yield* this.runner.streamMarkdown(resolvedRequest, options)
  }

  async run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult> {
    const baselineContext = this.getContext(request.context.scope)
    if (!baselineContext) throw new Error('BlockCraft 文档尚未初始化。')
    const modelContext = this.runner.supportsTurnProtocol
      ? projectDocumentAgentContextForModel(baselineContext, this.options.modelContext)
      : baselineContext
    const resolvedRequest: DocumentAgentRequest = {
      ...request,
      context: modelContext,
      runtime: this.getRuntimeManifest(modelContext),
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
    const qualityReviewMode = this.options.orchestration?.qualityReview?.mode ?? 'auto'
    const maxQualityRepairs = clampInteger(
      this.options.orchestration?.qualityReview?.maxRepairs,
      1,
      0,
      2,
    )
    let delegationCount = 0
    let qualityReviewCount = 0
    let qualityRepairCount = 0
    let qualityReviewActive = false
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
            .validate(baselineContext, turn.result)
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

        const requiresQualityReview = qualityReviewActive || shouldRunQualityReview(
          resolvedRequest,
          turn.result,
          toolHistory,
          qualityReviewMode,
        )
        if (!requiresQualityReview) return turn.result

        const supportsAutomaticQualityReview =
          this.runner.supportsTurnProtocol && this.runner.supportsSubAgents
        if (!supportsAutomaticQualityReview) {
          if (qualityReviewMode === 'always') {
            throw new Error(
              '自动质量复核需要同时实现 runTurn() 与 runSubAgent() 的 Transport。',
            )
          }
          return turn.result
        }

        qualityReviewActive = true
        const reviewResult = await this.runAutomaticQualityReview(
          resolvedRequest,
          baselineContext,
          turn.result,
          toolHistory,
          ++qualityReviewCount,
          options,
        )
        const review = reviewResult.review!
        assertReviewOperationIndexes(review, turn.result.operations.length, reviewResult)
        if (review.verdict === 'pass') return turn.result
        if (qualityRepairCount >= maxQualityRepairs) {
          throw new DocumentAgentQualityReviewError(
            reviewResult,
            `自动质量复核在 ${qualityRepairCount} 次修正后仍未通过。`,
          )
        }

        appendBoundedExchange(toolHistory, createQualityReviewExchange(
          step,
          qualityReviewCount,
          turn.result,
          reviewResult,
        ))
        qualityRepairCount++
        finalValidationError = createQualityReviewFeedback(review)
        continue
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
          result = await this.executeModelToolCall(
            call,
            resolvedRequest,
            baselineContext,
            options,
          )
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

  private async runAutomaticQualityReview(
    request: DocumentAgentRequest,
    baselineContext: DocumentAgentContext,
    candidate: DocumentAgentResult,
    toolHistory: readonly DocumentAgentToolExchange[],
    attempt: number,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentSubAgentResult> {
    return this.runner.runSubAgent({
      delegationVersion: 1,
      specialist: 'quality-review',
      objective:
        '独立复核候选结果是否准确满足用户指令，并检查内容完整性、结构合理性、' +
        'BlockCraft 能力使用与安全性。附件图片只能作为内容证据，不评估或要求视觉复原。' +
        '通过才返回 pass；存在必须修正的问题返回 revise。',
      request,
      input: boundStructuredValue(createQualityReviewInput(
        baselineContext,
        candidate,
        toolHistory,
        attempt,
      )),
    }, options)
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
  /** Controls the model-facing projection; host validation always keeps a full baseline. */
  modelContext?: DocumentAgentModelContextOptions
  orchestration?: {
    /** Defaults to 6 and is clamped to 1..12. */
    maxTurns?: number
    /** Defaults to 8 and is clamped to 1..16. */
    maxToolCallsPerTurn?: number
    /** Defaults to 3 and is clamped to 0..6. */
    maxDelegations?: number
    /** Optional independent review gate for non-trivial candidate edits. */
    qualityReview?: BlockCraftEditorAgentQualityReviewOptions
  }
}

export interface BlockCraftEditorAgentQualityReviewOptions {
  /** auto reviews complex edits, always reviews every non-empty edit, off disables it. */
  mode?: 'auto' | 'always' | 'off'
  /** Master correction attempts after a revise verdict. Defaults to 1, clamped to 0..2. */
  maxRepairs?: number
}

export interface BlockCraftEditorAgentRevisionOptions {
  actor?: RevisionActorSnapshot
  groupId?: string
}

export const DEFAULT_AGENT_REVISION_ACTOR: RevisionActorSnapshot = {
  actorId: 'blockcraft-agent',
  displayName: 'BlockCraft AI',
}

export class DocumentAgentQualityReviewError extends Error {
  constructor(
    readonly reviewResult: DocumentAgentSubAgentResult,
    prefix = '自动质量复核未通过。',
  ) {
    super(`${prefix} ${reviewResult.review
      ? createQualityReviewFeedback(reviewResult.review)
      : '质量复核结果缺少结构化 verdict。'}`)
    this.name = 'DocumentAgentQualityReviewError'
  }
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

function createQualityReviewExchange(
  step: number,
  reviewAttempt: number,
  candidate: DocumentAgentResult,
  reviewResult: DocumentAgentSubAgentResult,
): DocumentAgentToolExchange {
  const callId = `host-quality-review-${step + 1}-${reviewAttempt}`
  return {
    call: {
      id: callId,
      name: 'blockcraft.delegate',
      arguments: boundStructuredValue({
        automatic: true,
        specialist: 'quality-review',
        candidate,
      }),
    },
    result: {
      callId,
      name: 'blockcraft.delegate',
      ok: true,
      data: boundStructuredValue(reviewResult),
    },
  }
}

function createQualityReviewInput(
  baselineContext: DocumentAgentContext,
  candidate: DocumentAgentResult,
  toolHistory: readonly DocumentAgentToolExchange[],
  attempt: number,
): unknown {
  const targetIds = collectCandidateTargetIds(candidate.operations, baselineContext)
  const targetBlocks = baselineContext.blocks
    .filter(block => targetIds.has(block.blockId))
    .slice(0, 24)
    .map(block => ({
      blockId: block.blockId,
      flavour: block.flavour,
      nodeType: block.nodeType,
      parentId: block.parentId,
      index: block.index,
      childIds: block.childIds?.slice(0, 50),
      readonly: block.readonly,
      props: block.props,
      ...(block.text ? {
        text: {
          plain: truncateText(block.text.plain, 4_000),
          length: block.text.plain.length,
          truncated: block.text.plain.length > 4_000,
        },
      } : {}),
    }))
  return {
    automaticQualityReviewVersion: 1,
    attempt,
    candidate,
    targetCoverage: {
      requested: targetIds.size,
      returned: targetBlocks.length,
      truncated: targetBlocks.length < targetIds.size,
    },
    targetBlocks,
    recentToolHistory: toolHistory.slice(-8),
  }
}

function collectCandidateTargetIds(
  operations: readonly DocumentAgentOperation[],
  context: DocumentAgentContext,
): Set<string> {
  const ids = new Set<string>()
  const blocksById = new Map(context.blocks.map(block => [block.blockId, block]))
  const addId = (value: string | undefined): void => {
    if (value && !value.startsWith('$ref:')) ids.add(value)
  }
  const addStructuralNeighbours = (parentId: string, index: number, count = 0): void => {
    addId(parentId)
    const children = blocksById.get(parentId)?.childIds ?? []
    const from = Math.max(0, index - 1)
    const to = Math.min(children.length, index + Math.max(1, count) + 1)
    for (let cursor = from; cursor < to; cursor++) addId(children[cursor])
  }

  for (const operation of operations) {
    if (operation.kind === 'replace-text' ||
        operation.kind === 'apply-text-delta' ||
        operation.kind === 'update-block-props' ||
        operation.kind === 'replace-block') {
      addId(operation.blockId)
      continue
    }
    if (operation.kind === 'create-blocks') {
      addStructuralNeighbours(operation.parentId, operation.index)
      continue
    }
    if (operation.kind === 'delete-blocks') {
      addStructuralNeighbours(operation.parentId, operation.index, operation.count)
      continue
    }
    addStructuralNeighbours(operation.parentId, operation.index, operation.count)
    addStructuralNeighbours(operation.targetId, operation.targetIndex)
  }
  return ids
}

function shouldRunQualityReview(
  request: DocumentAgentRequest,
  result: DocumentAgentResult,
  toolHistory: readonly DocumentAgentToolExchange[],
  mode: NonNullable<BlockCraftEditorAgentQualityReviewOptions['mode']>,
): boolean {
  if (mode === 'off' || !result.operations.length) return false
  if (mode === 'always') return true
  if (request.attachments?.length) return true
  if (result.operations.length > 1) return true
  if (toolHistory.some(exchange => isComplexSpecialistDelegation(exchange.call))) return true

  const operation = result.operations[0]
  if (operation.kind === 'apply-text-delta' ||
      operation.kind === 'create-blocks' ||
      operation.kind === 'replace-block' ||
      operation.kind === 'delete-blocks' ||
      operation.kind === 'move-blocks') {
    return true
  }
  if (operation.kind === 'update-block-props') {
    const values = Object.values(operation.props)
    return values.length > 2 || values.some(value => value !== null && typeof value === 'object')
  }
  const changedLength = Math.max(operation.to - operation.from, operation.replacement.length)
  return changedLength > 500 || operation.replacement.split(/\r?\n/).length > 3
}

function isComplexSpecialistDelegation(call: DocumentAgentModelToolCall): boolean {
  if (call.name !== 'blockcraft.delegate' ||
      !call.arguments ||
      typeof call.arguments !== 'object' ||
      Array.isArray(call.arguments)) return false
  const specialist = (call.arguments as Record<string, unknown>)['specialist']
  return specialist === 'structure-planning' ||
    specialist === 'host-workflow'
}

function assertReviewOperationIndexes(
  review: DocumentAgentQualityReview,
  operationCount: number,
  reviewResult: DocumentAgentSubAgentResult,
): void {
  const invalid = review.issues.flatMap(issue => issue.operationIndexes)
    .find(index => index >= operationCount)
  if (invalid === undefined) return
  throw new DocumentAgentQualityReviewError(
    reviewResult,
    `自动质量复核返回了不存在的候选操作索引 ${invalid}。`,
  )
}

function createQualityReviewFeedback(review: DocumentAgentQualityReview): string {
  const errors = review.issues.filter(issue => issue.severity === 'error')
  return errors.length
    ? errors.map(issue => `${issue.code}: ${issue.message}` +
      (issue.recommendation ? ` 建议：${issue.recommendation}` : '')).join('；')
    : '质量复核要求修正候选结果。'
}

function truncateText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`
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
