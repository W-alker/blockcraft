import type {
  DocumentAgentRequest,
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

const editRequest: DocumentAgentRequest = {
  task: 'rewrite',
  instruction: '改写文档',
  context: request.context,
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

describe('DocumentAgentRunner specialist validation', () => {
  it('normalizes strict-schema null fields for a non-review specialist', async () => {
    const transport: DocumentAgentTransport = {
      run: async () => ({summary: '', operations: []}),
      runSubAgent: async () => ({
        specialist: 'document-analysis',
        summary: 'analysis complete',
        findings: ['fact'],
        recommendations: [],
        draft: null,
        operations: [],
        review: null,
      } as never),
    }

    const result = await new DocumentAgentRunner(transport).runSubAgent({
      delegationVersion: 1,
      specialist: 'document-analysis',
      objective: 'analyze document',
      request: editRequest,
    })

    expect(result.draft).toBeUndefined()
    expect(result.review).toBeUndefined()
  })

  it('accepts and normalizes a structured quality-review verdict', async () => {
    const transport: DocumentAgentTransport = {
      run: async () => ({summary: '', operations: []}),
      runSubAgent: async () => ({
        specialist: 'quality-review',
        summary: 'passed with a minor warning',
        findings: [],
        recommendations: [],
        draft: null,
        operations: [],
        review: {
          verdict: 'pass',
          issues: [{
            severity: 'warning',
            code: 'minor-style',
            message: 'A non-blocking style difference remains.',
            operationIndexes: [],
            recommendation: null,
          }],
        },
      } as never),
    }
    const runner = new DocumentAgentRunner(transport)

    const result = await runner.runSubAgent({
      delegationVersion: 1,
      specialist: 'quality-review',
      objective: 'review candidate',
      request: editRequest,
    })

    expect(runner.supportsSubAgents).toBeTrue()
    expect(result.draft).toBeUndefined()
    expect(result.review?.verdict).toBe('pass')
    expect(result.review?.issues[0].recommendation).toBeUndefined()
  })

  it('rejects a revise verdict without a mandatory error issue', async () => {
    const transport: DocumentAgentTransport = {
      run: async () => ({summary: '', operations: []}),
      runSubAgent: async () => ({
        specialist: 'quality-review',
        summary: 'inconsistent verdict',
        findings: [],
        recommendations: [],
        operations: [],
        review: {
          verdict: 'revise',
          issues: [{
            severity: 'warning',
            code: 'minor-style',
            message: 'Only a warning.',
            operationIndexes: [],
          }],
        },
      }),
    }

    await expectAsync(new DocumentAgentRunner(transport).runSubAgent({
      delegationVersion: 1,
      specialist: 'quality-review',
      objective: 'review candidate',
      request: editRequest,
    })).toBeRejectedWithError(
      DocumentAgentResultError,
      /must contain at least one error issue/,
    )
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
