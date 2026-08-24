import type {
  DocumentAgentRequest,
  DocumentAgentResult,
  DocumentAgentTransport,
} from 'blockcraft-agent'

export class PlaygroundDocumentAgentTransport implements DocumentAgentTransport {
  async run(
    request: DocumentAgentRequest,
    options?: {signal?: AbortSignal},
  ): Promise<DocumentAgentResult> {
    const response = await fetch('/api/document-agent', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(request),
      signal: options?.signal,
    })

    const payload = await response.json().catch(() => null) as {
      error?: string
      result?: DocumentAgentResult
    } | null

    if (!response.ok) {
      throw new Error(payload?.error ?? `Agent 请求失败（HTTP ${response.status}）`)
    }
    if (!payload?.result) {
      throw new Error('Agent 服务返回了空结果')
    }
    return payload.result
  }
}
