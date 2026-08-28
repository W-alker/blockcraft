import type {
  DocumentAgentRequest,
  DocumentAgentMarkdownRequest,
  DocumentAgentMarkdownStreamEvent,
  DocumentAgentResult,
  DocumentAgentSubAgentRequest,
  DocumentAgentSubAgentResult,
  DocumentAgentTransport,
  DocumentAgentTurnRequest,
  DocumentAgentTurnResponse,
} from './agent.types'
import {
  normalizeDocumentAgentResult,
  validateDocumentAgentResult,
} from './operation-validator'

export class DocumentAgentResultError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid document Agent result: ${issues.join(' ')}`)
    this.name = 'DocumentAgentResultError'
  }
}

export class DocumentAgentRunner {
  constructor(private readonly transport: DocumentAgentTransport) {}

  /** Whether the transport can receive bounded tool/validation feedback. */
  get supportsTurnProtocol(): boolean {
    return typeof this.transport.runTurn === 'function'
  }

  async run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult> {
    const result = normalizeDocumentAgentResult(
      await this.transport.run(request, options),
    )
    const issues = validateDocumentAgentResult(result)
    if (issues.length) throw new DocumentAgentResultError(issues)
    return result
  }

  async runTurn(
    turn: DocumentAgentTurnRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentTurnResponse> {
    if (!this.transport.runTurn) {
      return {kind: 'result', result: await this.run(turn.request, options)}
    }

    const response = await this.transport.runTurn(turn, options)
    if (response.kind === 'result') {
      const result = normalizeDocumentAgentResult(response.result)
      const issues = validateDocumentAgentResult(result)
      if (issues.length) throw new DocumentAgentResultError(issues)
      return {...response, result}
    }
    if (response.kind !== 'tool-calls' || !Array.isArray(response.calls)) {
      throw new DocumentAgentResultError(['Agent turn must contain a result or tool calls.'])
    }
    if (response.calls.some(call =>
      !call || typeof call.id !== 'string' || !call.id.trim() ||
      typeof call.name !== 'string' || !call.name.trim()
    )) {
      throw new DocumentAgentResultError(['Agent returned an invalid tool call.'])
    }
    if (new Set(response.calls.map(call => call.id)).size !== response.calls.length) {
      throw new DocumentAgentResultError(['Agent returned duplicate tool call IDs.'])
    }
    return response
  }

  async runSubAgent(
    delegation: DocumentAgentSubAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentSubAgentResult> {
    if (!this.transport.runSubAgent) {
      throw new DocumentAgentResultError(['Transport does not support specialist delegation.'])
    }
    const result = normalizeDocumentAgentResult(
      await this.transport.runSubAgent(delegation, options),
    )
    const issues = validateDocumentAgentResult(result)
    if (result.specialist !== delegation.specialist) {
      issues.push('Specialist result does not match the delegation request.')
    }
    if (!Array.isArray(result.findings) || result.findings.some(value => typeof value !== 'string')) {
      issues.push('Specialist result must contain string findings.')
    }
    if (!Array.isArray(result.recommendations) ||
        result.recommendations.some(value => typeof value !== 'string')) {
      issues.push('Specialist result must contain string recommendations.')
    }
    if (issues.length) throw new DocumentAgentResultError(issues)
    return result
  }

  async *streamMarkdown(
    request: DocumentAgentMarkdownRequest,
    options?: {signal?: AbortSignal},
  ): AsyncIterable<DocumentAgentMarkdownStreamEvent> {
    if (!this.transport.streamMarkdown) {
      throw new DocumentAgentResultError([
        'Transport does not support Markdown response streaming.',
      ])
    }

    let accumulated = ''
    let completed = false
    for await (const event of this.transport.streamMarkdown(request, options)) {
      if (completed) {
        throw new DocumentAgentResultError([
          'Markdown transport emitted data after completion.',
        ])
      }
      if (event.type === 'delta') {
        if (typeof event.delta !== 'string' || !event.delta) continue
        accumulated += event.delta
        yield event
        continue
      }
      if (event.type !== 'done' || typeof event.markdown !== 'string') {
        throw new DocumentAgentResultError([
          'Markdown transport emitted an invalid event.',
        ])
      }
      if (event.markdown !== accumulated) {
        // A final-only provider legitimately has no preceding deltas. Any
        // other divergence would render a different document than was shown.
        if (accumulated) {
          throw new DocumentAgentResultError([
            'Markdown final content does not match streamed deltas.',
          ])
        }
        accumulated = event.markdown
      }
      completed = true
      yield {...event, markdown: accumulated}
    }
    if (!completed) {
      throw new DocumentAgentResultError([
        'Markdown transport ended without a completion event.',
      ])
    }
  }
}
