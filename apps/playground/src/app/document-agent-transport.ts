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
} from '@ccc/blockcraft-agent'

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

  async *streamMarkdown(
    request: DocumentAgentMarkdownRequest,
    options?: {signal?: AbortSignal},
  ): AsyncIterable<DocumentAgentMarkdownStreamEvent> {
    const {systemPrompt: _systemPrompt, ...transportRequest} = request
    const response = await fetch('/api/document-agent/markdown', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(transportRequest),
      signal: options?.signal,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as {error?: string} | null
      throw new Error(payload?.error ?? `Agent 请求失败（HTTP ${response.status}）`)
    }
    if (!response.body) throw new Error('Agent 服务未返回 Markdown 流')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const {done, value} = await reader.read()
        buffer += decoder.decode(value, {stream: !done})
        let boundary = findSseBoundary(buffer)
        while (boundary) {
          const frame = buffer.slice(0, boundary.index)
          buffer = buffer.slice(boundary.index + boundary.length)
          const event = parseMarkdownSseFrame(frame)
          if (event) yield event
          boundary = findSseBoundary(buffer)
        }
        if (done) break
      }
      const event = parseMarkdownSseFrame(buffer)
      if (event) yield event
    } finally {
      reader.releaseLock()
    }
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

function findSseBoundary(value: string): {index: number; length: number} | null {
  const match = /\r?\n\r?\n/.exec(value)
  return match ? {index: match.index, length: match[0].length} : null
}

function parseMarkdownSseFrame(
  frame: string,
): DocumentAgentMarkdownStreamEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    throw new Error('Agent Markdown 流包含无效 JSON')
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Agent Markdown 流事件无效')
  }
  const event = payload as Partial<DocumentAgentMarkdownStreamEvent> & {error?: string}
  if (event.error) throw new Error(event.error)
  if (event.type === 'delta' && typeof event.delta === 'string') {
    return {type: 'delta', delta: event.delta}
  }
  if (
    event.type === 'done'
    && typeof event.markdown === 'string'
    && typeof event.streamed === 'boolean'
  ) {
    return {type: 'done', markdown: event.markdown, streamed: event.streamed}
  }
  throw new Error('Agent Markdown 流事件类型无效')
}
