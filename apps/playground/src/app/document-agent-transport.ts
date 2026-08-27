import type {
  DocumentAgentRequest,
  DocumentAgentResult,
  DocumentAgentSubAgentRequest,
  DocumentAgentSubAgentResult,
  DocumentAgentTransport,
  DocumentAgentTurnRequest,
  DocumentAgentTurnResponse,
} from 'blockcraft-agent'

export class PlaygroundDocumentAgentTransport implements DocumentAgentTransport {
  async run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult> {
    // The production server owns the stable Agent prompt. Keep the optional
    // field available for trusted non-browser hosts, but never upload it from
    // the Playground transport.
    const {systemPrompt: _systemPrompt, ...transportRequest} = request
    const payload = await this.post<{result?: DocumentAgentResult}>(transportRequest, options)
    if (!payload.result) {
      throw new Error('Agent 服务返回了空结果')
    }
    return payload.result
  }

  async runTurn(
    turn: DocumentAgentTurnRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentTurnResponse> {
    const {systemPrompt: _systemPrompt, ...transportRequest} = turn.request
    const payload = await this.post<{turn?: DocumentAgentTurnResponse}>({
      ...turn,
      request: transportRequest,
    }, options)
    if (!payload.turn) throw new Error('Agent 服务返回了空回合')
    return payload.turn
  }

  async runSubAgent(
    delegation: DocumentAgentSubAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentSubAgentResult> {
    const {systemPrompt: _systemPrompt, ...transportRequest} = delegation.request
    const payload = await this.post<{subAgent?: DocumentAgentSubAgentResult}>({
      ...delegation,
      request: transportRequest,
    }, options)
    if (!payload.subAgent) throw new Error('Agent 服务返回了空 specialist 结果')
    return payload.subAgent
  }

  private async post<T>(
    body: unknown,
    options?: {signal?: AbortSignal},
  ): Promise<T> {
    const response = await fetch('/api/document-agent', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    const payload = await response.json().catch(() => null) as (T & {error?: string}) | null

    if (!response.ok) {
      throw new Error(payload?.error ?? `Agent 请求失败（HTTP ${response.status}）`)
    }
    if (!payload) throw new Error('Agent 服务返回了空响应')
    return payload
  }
}
