import type {
  DocumentAgentRequest,
  DocumentAgentResult,
  DocumentAgentTransport,
} from './agent.types'
import {validateDocumentAgentResult} from './operation-validator'

export class DocumentAgentResultError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid document Agent result: ${issues.join(' ')}`)
    this.name = 'DocumentAgentResultError'
  }
}

export class DocumentAgentRunner {
  constructor(private readonly transport: DocumentAgentTransport) {}

  async run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult> {
    const result = await this.transport.run(request, options)
    const issues = validateDocumentAgentResult(result)
    if (issues.length) throw new DocumentAgentResultError(issues)
    return result
  }
}
