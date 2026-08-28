import type {
  DocumentAgentMarkdownRequest,
  DocumentAgentMarkdownStreamEvent,
  DocumentAgentTransport,
} from './agent.types'
import {DocumentAgentResultError, DocumentAgentRunner} from './document-agent-runner'

const request: DocumentAgentMarkdownRequest = {
  markdownStreamVersion: 1,
  instruction: '解释文档',
  context: {
    protocolVersion: 2,
    scope: 'document',
    selection: null,
    selectedText: '',
    blocks: [],
    baseRevision: {structureRevision: 0, contentFingerprint: ''},
  },
}

describe('DocumentAgentRunner Markdown stream', () => {
  it('preserves provider deltas and validates the exact final Markdown', async () => {
    const transport = createTransport(async function* () {
      yield {type: 'delta', delta: '# 标题\n\n'}
      yield {type: 'delta', delta: '正文'}
      yield {type: 'done', markdown: '# 标题\n\n正文', streamed: true}
    })
    const events: DocumentAgentMarkdownStreamEvent[] = []
    for await (const event of new DocumentAgentRunner(transport).streamMarkdown(request)) {
      events.push(event)
    }
    expect(events).toEqual([
      {type: 'delta', delta: '# 标题\n\n'},
      {type: 'delta', delta: '正文'},
      {type: 'done', markdown: '# 标题\n\n正文', streamed: true},
    ])
  })

  it('accepts a final-only provider without manufacturing typing deltas', async () => {
    const transport = createTransport(async function* () {
      yield {type: 'done', markdown: '最终内容', streamed: false}
    })
    const events: DocumentAgentMarkdownStreamEvent[] = []
    for await (const event of new DocumentAgentRunner(transport).streamMarkdown(request)) {
      events.push(event)
    }
    expect(events).toEqual([{type: 'done', markdown: '最终内容', streamed: false}])
  })

  it('rejects a final payload that diverges from visible deltas', async () => {
    const transport = createTransport(async function* () {
      yield {type: 'delta', delta: 'visible'}
      yield {type: 'done', markdown: 'different', streamed: true}
    })
    await expectAsync(collect(new DocumentAgentRunner(transport).streamMarkdown(request)))
      .toBeRejectedWithError(DocumentAgentResultError, /does not match streamed deltas/)
  })
})

function createTransport(
  streamMarkdown: DocumentAgentTransport['streamMarkdown'],
): DocumentAgentTransport {
  return {
    run: async () => ({summary: '', operations: []}),
    streamMarkdown,
  }
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of source) values.push(value)
  return values
}
