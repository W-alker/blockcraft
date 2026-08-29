import {
  BlockNodeType,
  AdapterRegistry,
  defineBlockAgentCapability,
  defineInlineEmbedAgentCapability,
  type IBlockSnapshot,
} from '@ccc/blockcraft'
import {BLOCKCRAFT_BUILTIN_AGENT_EXTENSION} from '../core/builtin-block-capabilities'
import {DocumentAgentExtensionRegistry} from '../core/host-extension'
import {
  normalizeDocumentAgentResult,
  validateDocumentAgentResult,
} from '../core/operation-validator'
import type {
  DocumentAgentContext,
  DocumentAgentResult,
  DocumentAgentSubAgentRequest,
  DocumentAgentTurnRequest,
} from '../core/agent.types'
import {
  BlockCraftEditorAgent,
  DocumentAgentCandidatePreviewError,
  DocumentAgentQualityReviewError,
} from './blockcraft-editor-agent'
import {captureBlockCraftAgentContext} from './blockcraft-context-adapter'
import {
  DocumentAgentOperationCompileError,
  DocumentAgentOperationCompiler,
} from './document-agent-operation-compiler'
import {DocumentAgentOperationApplier} from './document-agent-operation-applier'
import {projectDocumentAgentCandidate} from './document-agent-candidate-projector'

describe('BlockCraft Agent v2 contract', () => {
  it('normalizes a structured-output null draft before validation', () => {
    const normalized = normalizeDocumentAgentResult({
      summary: '已完成',
      draft: null,
      operations: [],
    } as unknown as DocumentAgentResult)

    expect(normalized.draft).toBeUndefined()
    expect(validateDocumentAgentResult(normalized)).toEqual([])
  })

  it('projects compact blocks with nodeType and separated text, without recursive snapshots', () => {
    const doc = createFakeDoc()
    const context = captureBlockCraftAgentContext(doc as never)

    expect(context?.protocolVersion).toBe(2)
    expect(context?.blocks.map(block => block.nodeType)).toEqual(['root', 'editable'])
    expect(context?.blocks[1].text).toEqual({
      plain: 'Hello',
      delta: [{insert: 'Hello'}],
    })
    expect(context?.baseRevision.contentFingerprint.length).toBeLessThan(80)
    expect('snapshot' in (context?.blocks[0] ?? {})).toBeFalse()
    expect(context?.capabilities?.find(capability => capability.flavour === 'paragraph')).toEqual(
      jasmine.objectContaining({
        nodeType: 'editable',
        capabilityId: 'blockcraft.block.paragraph',
        creatable: true,
        semanticRoles: ['paragraph', 'heading'],
      }),
    )
  })

  it('rejects raw snapshot insertion and unexpected operation fields', () => {
    const rawSnapshotIssues = validateDocumentAgentResult({
      summary: 'unsafe',
      operations: [{kind: 'insert-blocks', parentId: 'root', index: 0, snapshots: []}],
    } as never)
    expect(rawSnapshotIssues).toContain('Operation 0 has an unsupported kind.')

    const unexpectedFieldIssues = validateDocumentAgentResult({
      summary: 'strict',
      operations: [{
        kind: 'replace-text',
        blockId: 'p1',
        from: 0,
        to: 1,
        replacement: 'H',
        html: '<b>H</b>',
      }],
    } as never)
    expect(unexpectedFieldIssues.join(' ')).toContain('unsupported fields: html')

    const invalidDeltaIssues = validateDocumentAgentResult({
      summary: 'invalid delta',
      operations: [{
        kind: 'apply-text-delta',
        blockId: 'p1',
        delta: [{delete: 1, attributes: {bold: true}}],
      }],
    })
    expect(invalidDeltaIssues.join(' ')).toContain('valid text delta')
  })

  it('rejects ambiguous or nested Inline Embed Delta shapes before compilation', () => {
    const invalidEmbeds = [
      {},
      {image: 'https://cdn.example.com/a.png', icon: 'bc_icon bc_document'},
      {image: {src: 'https://cdn.example.com/a.png'}},
    ]

    for (const insert of invalidEmbeds) {
      const issues = validateDocumentAgentResult({
        summary: 'invalid embed',
        operations: [{
          kind: 'apply-text-delta',
          blockId: 'p1',
          delta: [{insert}],
        }],
      })
      expect(issues.join(' ')).withContext(JSON.stringify(insert))
        .toContain('valid text delta')
    }
  })

  it('compiles clientRef structural operations against one sequential shadow tree', () => {
    const doc = createFakeDoc()
    const context = createDocumentContext()
    const compiler = new DocumentAgentOperationCompiler(
      doc as never,
      context,
      createExtensions(),
    )

    const prepared = compiler.compile([
      {
        kind: 'create-blocks',
        parentId: 'root',
        index: 1,
        flavour: 'callout',
        params: [],
        clientRef: 'box',
      },
      {
        kind: 'create-blocks',
        parentId: '$ref:box',
        index: 0,
        flavour: 'paragraph',
        params: ['Nested'],
      },
    ])

    const first = prepared[0]
    expect(first.kind).toBe('create-blocks')
    expect(prepared[1]).toEqual(jasmine.objectContaining({
      kind: 'create-blocks',
      parentId: 'generated-callout-1',
      index: 0,
      embedded: true,
    }))
    if (first.kind !== 'create-blocks') throw new Error('Expected create-blocks')
    expect(first.snapshot.children).toEqual([
      jasmine.objectContaining({flavour: 'paragraph'}),
    ])
  })

  it('projects sequential operations into an isolated renderable Snapshot', () => {
    const doc = createFakeDoc()
    const prepared = new DocumentAgentOperationCompiler(
      doc as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([
      {
        kind: 'apply-text-delta',
        blockId: 'p1',
        delta: [
          {retain: 1, attributes: {'a:bold': true}},
          {delete: 2},
          {insert: 'i'},
        ],
      },
      {kind: 'update-block-props', blockId: 'p1', props: {heading: 2}},
      {
        kind: 'create-blocks',
        parentId: 'root',
        index: 1,
        flavour: 'callout',
        params: [],
        clientRef: 'summary',
      },
      {
        kind: 'create-blocks',
        parentId: '$ref:summary',
        index: 0,
        flavour: 'paragraph',
        params: ['Summary'],
      },
    ])

    const projection = projectDocumentAgentCandidate(doc as never, prepared)
    const paragraph = projection.snapshot.children[0] as IBlockSnapshot
    const callout = projection.snapshot.children[1] as IBlockSnapshot

    expect(paragraph.children).toEqual([
      {insert: 'H', attributes: {'a:bold': true}},
      {insert: 'ilo'},
    ])
    expect(paragraph.props['heading']).toBe(2)
    expect(callout.flavour).toBe('callout')
    expect(callout.children).toEqual([
      jasmine.objectContaining({flavour: 'paragraph', children: [{insert: 'Summary'}]}),
    ])
    expect(projection.affectedBlockIds).toContain('p1')
    expect(projection.affectedBlockIds).toContain(callout.id)
    expect(doc['model'].getTextDeltas('p1')).toEqual([{insert: 'Hello'}])
  })

  it('projects replace, move, and delete with post-operation structural indexes', () => {
    const doc = createFakeDoc(['First', 'Second', 'Third'])
    const context = captureBlockCraftAgentContext(doc as never)
    if (!context) throw new Error('Expected document context')
    const prepared = new DocumentAgentOperationCompiler(
      doc as never,
      context,
      createExtensions(),
    ).compile([
      {
        kind: 'replace-block',
        blockId: 'p2',
        flavour: 'paragraph',
        params: ['Replacement'],
      },
      {
        kind: 'move-blocks',
        parentId: 'root',
        index: 2,
        count: 1,
        targetId: 'root',
        targetIndex: 0,
      },
      {
        kind: 'delete-blocks',
        parentId: 'root',
        index: 1,
        count: 1,
      },
    ])

    const projection = projectDocumentAgentCandidate(doc as never, prepared)
    const projectedChildren = projection.snapshot.children as IBlockSnapshot[]

    expect(projectedChildren.map(child => child.id)).toEqual([
      'p3',
      'generated-paragraph-1',
    ])
    expect(projectedChildren.map(child => child.children)).toEqual([
      [{insert: 'Third'}],
      [{insert: 'Replacement'}],
    ])
    expect(projection.operationTargets).toEqual([
      {operationIndex: 0, blockIds: ['generated-paragraph-1']},
      {operationIndex: 1, blockIds: ['p3', 'p1', 'generated-paragraph-1']},
      {operationIndex: 2, blockIds: ['p3', 'generated-paragraph-1']},
    ])
    expect(doc['model'].getChildrenIds('root')).toEqual(['p1', 'p2', 'p3'])
  })

  it('validates prop types from the selected Block capability', () => {
    const doc = createFakeDoc()
    const valid = new DocumentAgentOperationCompiler(
      doc as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'update-block-props',
      blockId: 'p1',
      props: {heading: 2},
    }])
    expect(valid.length).toBe(1)

    expect(() => new DocumentAgentOperationCompiler(
      doc as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'update-block-props',
      blockId: 'p1',
      props: {heading: 9},
    }])).toThrowError(DocumentAgentOperationCompileError, /props\.heading/)
  })

  it('fails closed when a capability targets a stale Schema version', () => {
    const extensions = new DocumentAgentExtensionRegistry([{
      id: 'test.stale',
      version: '1',
      description: 'stale test capability',
      capabilities: [{
        id: 'test.stale.paragraph',
        kind: 'block',
        flavour: 'paragraph',
        schemaVersion: 2,
        title: 'Paragraph',
        description: 'Wrong version on purpose.',
        createParameters: {type: 'array'},
      }],
    }])

    expect(() => new DocumentAgentOperationCompiler(
      createFakeDoc() as never,
      createDocumentContext(),
      extensions,
    ).compile([{
      kind: 'create-blocks',
      parentId: 'root',
      index: 1,
      flavour: 'paragraph',
      params: ['New'],
    }])).toThrowError(DocumentAgentOperationCompileError, /targets Schema version 2/)
  })

  it('discovers an external Block-owned capability only when its Schema is installed', () => {
    const externalCapability = defineBlockAgentCapability({
      id: 'test.block.task-card',
      kind: 'block',
      flavour: 'task-card',
      schemaVersion: 1,
      title: '任务卡片',
      description: '外部任务模块提供的卡片。',
      semanticRoles: ['task'],
      createParameters: {type: 'array', maxItems: 0},
    })
    const extensions = new DocumentAgentExtensionRegistry([{
      id: 'test.task-blocks',
      version: '1',
      description: 'test external Block package',
      capabilities: [externalCapability],
    }])

    expect(extensions.getBlockCapability('task-card', {
      registeredBlockFlavours: ['root'],
    })).toBeNull()
    expect(extensions.getBlockCapability('task-card', {
      registeredBlockFlavours: ['root', 'task-card'],
    })).toBe(externalCapability)
  })

  it('discovers an external Inline-Embed-owned capability only with its converter', () => {
    const externalCapability = defineInlineEmbedAgentCapability({
      id: 'test.inline-embed.task-reference',
      kind: 'inline-embed',
      embedKey: 'task-reference',
      title: '任务引用',
      description: '外部任务模块提供的行内引用。',
      insert: {
        value: {type: 'string', minLength: 1},
        attributes: {
          type: 'object',
          properties: {status: {enum: ['open', 'done']}},
          additionalProperties: false,
        },
      },
    })
    const extensions = new DocumentAgentExtensionRegistry([{
      id: 'test.task-embeds',
      version: '1',
      description: 'test external Inline Embed package',
      capabilities: [externalCapability],
    }])

    expect(extensions.getInlineEmbedCapability('task-reference', {
      registeredInlineEmbedKeys: ['image'],
    })).toBeNull()
    expect(extensions.getInlineEmbedCapability('task-reference', {
      registeredInlineEmbedKeys: ['image', 'task-reference'],
    })).toBe(externalCapability)
  })

  it('allows only installed, Agent-writable Inline Embeds with schema-valid data', () => {
    const doc = createFakeDoc()
    const compiler = new DocumentAgentOperationCompiler(
      doc as never,
      createDocumentContext(),
      createExtensions(),
    )

    const prepared = compiler.compile([
      {
        kind: 'apply-text-delta',
        blockId: 'p1',
        delta: [{
          retain: 5,
        }, {
          insert: {image: 'https://cdn.example.com/a.png'},
          attributes: {width: 320, height: 180, wrap: true},
        }],
      },
      {kind: 'replace-text', blockId: 'p1', from: 5, to: 6, replacement: ''},
    ])

    expect(prepared.length).toBe(2)

    expect(() => compiler.compile([{
      kind: 'apply-text-delta',
      blockId: 'p1',
      delta: [
        {
          insert: {date: '2026-08-28T12:00'},
          attributes: {format: 'YYYY-MM-DD HH:mm'},
        },
        {insert: ' '},
      ],
    }])).not.toThrow()

    expect(() => new DocumentAgentOperationCompiler(
      createFakeDoc() as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'apply-text-delta',
      blockId: 'p1',
      delta: [{insert: {image: 'https://cdn.example.com/a.png'}, attributes: {width: 'wide'}}],
    }])).toThrowError(DocumentAgentOperationCompileError, /attributes\.width/)
  })

  it('keeps understanding-only and undeclared Inline Embeds fail closed for insertion', () => {
    const doc = createFakeDoc()
    doc['config'].embeds.push(['host-pill', {}])

    for (const insert of [
      {mention: 'Ada'},
      {'host-pill': 'P-1'},
      {unknown: 'value'},
    ]) {
      expect(() => new DocumentAgentOperationCompiler(
        doc as never,
        createDocumentContext(),
        createExtensions(),
      ).compile([{
        kind: 'apply-text-delta',
        blockId: 'p1',
        delta: [{insert}],
      }])).withContext(JSON.stringify(insert))
        .toThrowError(DocumentAgentOperationCompileError)
    }
  })

  it('allows canonical text formats but rejects semantic Embed mutation through retain', () => {
    expect(() => new DocumentAgentOperationCompiler(
      createFakeDoc() as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'apply-text-delta',
      blockId: 'p1',
      delta: [{retain: 1, attributes: {'a:bold': true}}],
    }])).not.toThrow()

    expect(() => new DocumentAgentOperationCompiler(
      createFakeDoc() as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'apply-text-delta',
      blockId: 'p1',
      delta: [{retain: 1, attributes: {mentionId: 'person-2'}}],
    }])).toThrowError(DocumentAgentOperationCompileError, /not an Agent-writable text format/)
  })

  it('validates Inline Embeds emitted by Block Schema snapshot factories', () => {
    const doc = createFakeDoc()
    doc['schemas'].createSnapshot = () => ({
      id: 'generated-paragraph-with-mention',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [{insert: {mention: 'Ada'}, attributes: {mentionId: 'guessed'}}],
    })

    expect(() => new DocumentAgentOperationCompiler(
      doc as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'create-blocks',
      parentId: 'root',
      index: 1,
      flavour: 'paragraph',
      params: ['Ada'],
    }])).toThrowError(
      DocumentAgentOperationCompileError,
      /Inline Embed mention does not declare Agent insertion/,
    )
  })

  it('uses the same readonly guard as DocCRUD during preflight', () => {
    const doc = createFakeDoc()
    doc['readonlyManager'].assertPropsWritable = () => {
      throw new Error('locked by template')
    }

    expect(() => new DocumentAgentOperationCompiler(
      doc as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'update-block-props',
      blockId: 'p1',
      props: {heading: 2},
    }])).toThrowError(DocumentAgentOperationCompileError, /locked by template/)
  })

  it('interprets later text offsets after earlier operations', () => {
    const doc = createFakeDoc()
    const context = createDocumentContext()
    const compiler = new DocumentAgentOperationCompiler(doc as never, context, createExtensions())

    expect(() => compiler.compile([
      {kind: 'replace-text', blockId: 'p1', from: 0, to: 5, replacement: 'A'},
      {kind: 'replace-text', blockId: 'p1', from: 1, to: 2, replacement: 'B'},
    ])).toThrowError(DocumentAgentOperationCompileError, /Invalid text range/)
  })

  it('counts every delete against the original Delta source span', () => {
    expect(() => new DocumentAgentOperationCompiler(
      createFakeDoc() as never,
      createDocumentContext(),
      createExtensions(),
    ).compile([{
      kind: 'apply-text-delta',
      blockId: 'p1',
      delta: [{delete: 3}, {delete: 3}],
    }])).toThrowError(
      DocumentAgentOperationCompileError,
      /deletes beyond the current text length/,
    )
  })

  it('applies an operation without Diff styling when Revision v1 cannot represent it', () => {
    const calls: string[] = []
    const doc = createApplyDoc(calls, [])
    const context = captureBlockCraftAgentContext(doc as never, {scope: 'document'})!

    const applied = new DocumentAgentOperationApplier(doc as never).applyAsRevision(
      context,
      {
        summary: 'switch paragraph style',
        operations: [{
          kind: 'update-block-props',
          blockId: 'p1',
          props: {heading: 2},
        }],
      },
      {actor: {actorId: 'agent'}},
    )

    expect(applied.applied).toBe(1)
    expect(applied.revisionIds).toEqual([])
    expect(applied.undoItemToken).toBe(doc['undoItemToken'])
    expect(doc['transactionCount']).toBe(1)
    expect(calls).toEqual(['props:p1'])
  })

  it('allows Diff-capable and direct operations in the same Agent result', () => {
    const calls: string[] = []
    const doc = createApplyDoc(calls, ['revision-1'])
    const context = captureBlockCraftAgentContext(doc as never, {scope: 'document'})!

    const applied = new DocumentAgentOperationApplier(doc as never).applyAsRevision(
      context,
      {
        summary: 'edit text and style',
        operations: [
          {kind: 'replace-text', blockId: 'p1', from: 0, to: 1, replacement: 'H'},
          {kind: 'update-block-props', blockId: 'p1', props: {heading: 2}},
        ],
      },
      {actor: {actorId: 'agent'}, groupId: 'agent-group'},
    )

    expect(applied.applied).toBe(2)
    expect(applied.groupId).toBe('agent-group')
    expect(applied.revisionIds).toEqual(['revision-1'])
    expect(applied.undoItemToken).toBe(doc['undoItemToken'])
    expect(doc['transactionCount']).toBe(1)
    expect(calls).toEqual(['text:p1', 'props:p1'])
  })

  it('returns final semantic validation failures to the Master for correction', async () => {
    const turns: DocumentAgentTurnRequest[] = []
    const runner = {
      supportsTurnProtocol: true,
      runTurn: async (turn: DocumentAgentTurnRequest) => {
        turns.push(turn)
        if (turns.length === 1) {
          return {
            kind: 'result' as const,
            result: {
              summary: 'insert time',
              operations: [{
                kind: 'apply-text-delta' as const,
                blockId: 'p1',
                delta: [{insert: {mention: '2026-08-28T12:00'}}],
              }],
            },
          }
        }
        return {
          kind: 'result' as const,
          result: {
            summary: 'insert frozen time',
            operations: [{
              kind: 'apply-text-delta' as const,
              blockId: 'p1',
              delta: [
                {
                  insert: {date: '2026-08-28T12:00'},
                  attributes: {format: 'YYYY-MM-DD HH:mm'},
                },
                {insert: ' '},
              ],
            }],
          },
        }
      },
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never, {
      orchestration: {maxTurns: 3},
    })

    const result = await agent.run({
      task: 'continue',
      instruction: '帮我在第一段插入时间，今天12点',
      context: createDocumentContext(),
    })

    expect(result.summary).toBe('insert frozen time')
    expect(turns.length).toBe(2)
    expect(turns[1].toolHistory[0].call.name).toBe('blockcraft.preview_changes')
    expect(turns[1].toolHistory[0].result.ok).toBeFalse()
    expect((turns[1].toolHistory[0].result as {error: string}).error)
      .toContain('Inline Embed mention does not declare Agent insertion')
  })

  it('keeps a simple single-text edit off the automatic quality-review path', async () => {
    let qualityReviews = 0
    const runner = {
      supportsTurnProtocol: true,
      supportsSubAgents: true,
      runTurn: async () => ({
        kind: 'result' as const,
        result: {
          summary: 'fix one character',
          operations: [{
            kind: 'replace-text' as const,
            blockId: 'p1',
            from: 0,
            to: 1,
            replacement: 'H',
          }],
        },
      }),
      runSubAgent: async () => {
        qualityReviews++
        throw new Error('should not review a trivial edit')
      },
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never)

    const result = await agent.run({
      task: 'proofread',
      instruction: '修正第一个字符',
      context: createDocumentContext(),
    })

    expect(result.operations.length).toBe(1)
    expect(qualityReviews).toBe(0)
  })

  it('automatically reviews a non-trivial candidate before returning it', async () => {
    let qualityReviews = 0
    const runner = {
      supportsTurnProtocol: true,
      supportsSubAgents: true,
      runTurn: async () => ({
        kind: 'result' as const,
        result: {
          summary: 'append formatted content',
          operations: [{
            kind: 'apply-text-delta' as const,
            blockId: 'p1',
            delta: [{retain: 5}, {insert: '!'}],
          }],
        },
      }),
      runSubAgent: async () => {
        qualityReviews++
        return createQualityReviewResult('pass')
      },
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never)

    const result = await agent.run({
      task: 'continue',
      instruction: '在第一段末尾补充强调内容',
      context: createDocumentContext(),
    })

    expect(result.summary).toBe('append formatted content')
    expect(qualityReviews).toBe(1)
  })

  it('renders an isolated candidate and labels it for the quality-review specialist', async () => {
    let reviewRequest: DocumentAgentSubAgentRequest | null = null
    let renderedText = ''
    const runner = {
      supportsTurnProtocol: true,
      supportsSubAgents: true,
      runTurn: async () => ({
        kind: 'result' as const,
        result: {
          summary: 'append formatted content',
          operations: [{
            kind: 'apply-text-delta' as const,
            blockId: 'p1',
            delta: [{retain: 5}, {insert: '!'}],
          }],
        },
      }),
      runSubAgent: async (request: DocumentAgentSubAgentRequest) => {
        reviewRequest = request
        return createQualityReviewResult('pass')
      },
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never, {
      orchestration: {
        qualityReview: {
          candidatePreview: {
            failureMode: 'throw',
            adapter: {
              render: async request => {
                const paragraph = request.snapshot.children[0] as IBlockSnapshot
                renderedText = (paragraph.children as Array<{insert: string}>)
                  .map(item => item.insert)
                  .join('')
                return {
                  candidatePreviewVersion: 1 as const,
                  image: {
                    type: 'image' as const,
                    mimeType: 'image/png' as const,
                    name: 'candidate.png',
                    dataUrl: 'data:image/png;base64,AA==',
                    width: 1,
                    height: 1,
                  },
                  rendererId: 'test-renderer',
                  capturedBlockIds: request.affectedBlockIds,
                }
              },
            },
          },
        },
      },
    })

    await agent.run({
      task: 'continue',
      instruction: '参考图片补充结尾',
      context: createDocumentContext(),
      attachments: [{
        type: 'image',
        mimeType: 'image/png',
        name: 'reference.png',
        dataUrl: 'data:image/png;base64,AA==',
        width: 1,
        height: 1,
      }],
    })

    const delegated = reviewRequest as unknown as DocumentAgentSubAgentRequest
    expect(renderedText).toBe('Hello!')
    expect(delegated.request.attachments?.map(item => item.purpose)).toEqual([
      'candidate-preview',
      'user-reference',
    ])
    expect(delegated.input).toEqual(jasmine.objectContaining({
      automaticQualityReviewVersion: 2,
      candidatePreview: jasmine.objectContaining({
        status: 'available',
        rendererId: 'test-renderer',
        capturedBlockIds: ['p1'],
        operationTargets: [{operationIndex: 0, blockIds: ['p1']}],
      }),
    }))
  })

  it('fails closed when a required candidate renderer cannot capture the preview', async () => {
    const runner = {
      supportsTurnProtocol: true,
      supportsSubAgents: true,
      runTurn: async () => ({
        kind: 'result' as const,
        result: {
          summary: 'append content',
          operations: [{
            kind: 'apply-text-delta' as const,
            blockId: 'p1',
            delta: [{retain: 5}, {insert: '!'}],
          }],
        },
      }),
      runSubAgent: async () => createQualityReviewResult('pass'),
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never, {
      orchestration: {
        qualityReview: {
          candidatePreview: {
            failureMode: 'throw',
            adapter: {render: async () => { throw new Error('capture unavailable') }},
          },
        },
      },
    })

    await expectAsync(agent.run({
      task: 'continue',
      instruction: '补充结尾',
      context: createDocumentContext(),
    })).toBeRejectedWithError(DocumentAgentCandidatePreviewError, /capture unavailable/)
  })

  it('returns a revise verdict to the Master once and reviews the repaired candidate again', async () => {
    const turns: DocumentAgentTurnRequest[] = []
    let qualityReviews = 0
    const runner = {
      supportsTurnProtocol: true,
      supportsSubAgents: true,
      runTurn: async (turn: DocumentAgentTurnRequest) => {
        turns.push(turn)
        if (turns.length === 1) {
          return {
            kind: 'result' as const,
            result: {
              summary: 'append weak punctuation',
              operations: [{
                kind: 'apply-text-delta' as const,
                blockId: 'p1',
                delta: [{retain: 5}, {insert: '!'}],
              }],
            },
          }
        }
        return {
          kind: 'result' as const,
          result: {
            summary: 'use document tone',
            operations: [{
              kind: 'replace-text' as const,
              blockId: 'p1',
              from: 4,
              to: 5,
              replacement: '。',
            }],
          },
        }
      },
      runSubAgent: async () => {
        qualityReviews++
        return qualityReviews === 1
          ? createQualityReviewResult('revise')
          : createQualityReviewResult('pass')
      },
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never, {
      orchestration: {maxTurns: 3},
    })

    const result = await agent.run({
      task: 'continue',
      instruction: '按当前文档语气补充结尾',
      context: createDocumentContext(),
    })

    expect(result.summary).toBe('use document tone')
    expect(turns.length).toBe(2)
    expect(qualityReviews).toBe(2)
    expect(turns[1].toolHistory[0].call.name).toBe('blockcraft.delegate')
    expect((turns[1].toolHistory[0].result as {ok: true; data: {review: {verdict: string}}})
      .data.review.verdict).toBe('revise')
  })

  it('fails closed when the quality gate still requests revision after its repair budget', async () => {
    const runner = {
      supportsTurnProtocol: true,
      supportsSubAgents: true,
      runTurn: async () => ({
        kind: 'result' as const,
        result: {
          summary: 'append content',
          operations: [{
            kind: 'apply-text-delta' as const,
            blockId: 'p1',
            delta: [{retain: 5}, {insert: '!'}],
          }],
        },
      }),
      runSubAgent: async () => createQualityReviewResult('revise'),
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never, {
      orchestration: {qualityReview: {mode: 'always', maxRepairs: 0}},
    })

    await expectAsync(agent.run({
      task: 'continue',
      instruction: '补充结尾',
      context: createDocumentContext(),
    })).toBeRejectedWithError(DocumentAgentQualityReviewError, /仍未通过/)
  })

  it('requires both turn and specialist protocols when quality review is always on', async () => {
    const runner = {
      supportsTurnProtocol: true,
      supportsSubAgents: false,
      runTurn: async () => ({
        kind: 'result' as const,
        result: {
          summary: 'append content',
          operations: [{
            kind: 'apply-text-delta' as const,
            blockId: 'p1',
            delta: [{retain: 5}, {insert: '!'}],
          }],
        },
      }),
    }
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never, {
      orchestration: {qualityReview: {mode: 'always'}},
    })

    await expectAsync(agent.run({
      task: 'continue',
      instruction: '补充结尾',
      context: createDocumentContext(),
    })).toBeRejectedWithError(/需要同时实现 runTurn\(\) 与 runSubAgent\(\)/)
  })

  it('sends a paged outline to the model while validating omitted-block edits against the full baseline', async () => {
    const paragraphTexts = Array.from(
      {length: 120},
      (_, index) => `Section ${index + 1} ${'x'.repeat(600)}`,
    )
    const doc = createFakeDoc(paragraphTexts)
    let receivedTurn: DocumentAgentTurnRequest | null = null
    const runner = {
      supportsTurnProtocol: true,
      runTurn: async (turn: DocumentAgentTurnRequest) => {
        receivedTurn = turn
        return {
          kind: 'result' as const,
          result: {
            summary: 'edit an omitted block',
            operations: [{
              kind: 'replace-text' as const,
              blockId: 'p90',
              from: 0,
              to: 7,
              replacement: 'Chapter',
            }],
          },
        }
      },
    }
    const agent = new BlockCraftEditorAgent(doc as never, runner as never, {
      modelContext: {
        maxInitialChars: 8_000,
        maxInitialBlocks: 10,
        previewCharsPerBlock: 80,
      },
      orchestration: {maxTurns: 1},
    })

    const result = await agent.run({
      task: 'rewrite',
      instruction: '修改第 90 段开头',
      context: createDocumentContext(),
    })

    const modelContext = (receivedTurn as unknown as DocumentAgentTurnRequest).request.context
    expect(result.operations[0]).toEqual(jasmine.objectContaining({blockId: 'p90'}))
    expect(modelContext.coverage).toEqual(jasmine.objectContaining({
      mode: 'paged',
      totalBlocks: 121,
      offset: 0,
    }))
    expect(modelContext.blocks.length).toBeLessThanOrEqual(10)
    expect(modelContext.blocks.every(block => block.detail === 'outline')).toBeTrue()
    expect(modelContext.blocks.some(block => block.blockId === 'p90')).toBeFalse()
    expect(modelContext.selectedText).toBe('')
  })

  it('pages document outlines and searches live text outside the active context', () => {
    const paragraphTexts = Array.from(
      {length: 100},
      (_, index) => index === 94 ? 'Needle in the live document' : `Paragraph ${index + 1}`,
    )
    const doc = createFakeDoc(paragraphTexts)
    const context = captureBlockCraftAgentContext(doc as never, {scope: 'document'})!
    const agent = new BlockCraftEditorAgent(doc as never, {} as never)

    const pageResult = agent.executeTool({
      name: 'blockcraft.get_document_context',
      arguments: {offset: 90, maxBlocks: 5},
    }, {}, context)
    expect(pageResult.ok).toBeTrue()
    const page = (pageResult as {ok: true; data: DocumentAgentContext}).data
    expect(page.coverage).toEqual(jasmine.objectContaining({
      mode: 'paged',
      offset: 90,
      returnedBlocks: 5,
      nextOffset: 95,
    }))
    expect(page.capabilities).toBeUndefined()
    expect(page.blocks.every(block => block.detail === 'outline' && !block.text)).toBeTrue()

    const searchResult = agent.executeTool({
      name: 'blockcraft.search_document',
      arguments: {query: 'needle'},
    }, {}, {
      ...context,
      blocks: context.blocks.slice(0, 2),
    })
    expect(searchResult.ok).toBeTrue()
    expect((searchResult as {ok: true; data: {matches: Array<{blockId: string}>}})
      .data.matches.map(match => match.blockId)).toEqual(['p95'])
  })

  it('injects the active Adapter manifest into read-only Markdown requests', async () => {
    const received: unknown[] = []
    const runner = {
      streamMarkdown: async function* (request: unknown) {
        received.push(request)
        yield {type: 'done' as const, markdown: '# Result', streamed: false}
      },
    }
    const registry = new AdapterRegistry([{
      id: 'custom-card',
      flavours: ['custom-card'],
      markdownSyntax: [{
        id: 'block:custom-card',
        title: 'Custom card',
        description: 'Registered custom card.',
        kind: 'container-directive',
        profiles: ['hybrid'],
        example: ':::bc-custom-card\n\nReadable content.\n\n:::',
      }],
    }])
    const agent = new BlockCraftEditorAgent(createFakeDoc() as never, runner as never, {
      markdown: {adapterRegistry: registry, profile: 'hybrid'},
    })

    const events = []
    for await (const event of agent.streamMarkdown({
      markdownStreamVersion: 1,
      instruction: '生成卡片',
      context: createDocumentContext(),
    })) {
      events.push(event)
    }

    expect(events).toEqual([{type: 'done', markdown: '# Result', streamed: false}])
    expect((received[0] as any).runtime.markdown).toEqual(jasmine.objectContaining({
      profile: 'hybrid',
      standardFirst: true,
    }))
    expect((received[0] as any).runtime.markdown.syntaxes.map((item: any) => item.id))
      .toContain('block:custom-card')
  })
})

function createQualityReviewResult(verdict: 'pass' | 'revise') {
  return {
    specialist: 'quality-review' as const,
    summary: verdict === 'pass' ? 'candidate passed' : 'candidate needs revision',
    findings: [],
    recommendations: verdict === 'pass' ? [] : ['Use the document tone.'],
    operations: [],
    review: {
      verdict,
      issues: verdict === 'pass' ? [] : [{
        severity: 'error' as const,
        code: 'tone-mismatch',
        message: 'The candidate does not match the document tone.',
        operationIndexes: [0],
        recommendation: 'Use the document tone.',
      }],
    },
  }
}

function createExtensions(): DocumentAgentExtensionRegistry {
  return new DocumentAgentExtensionRegistry([BLOCKCRAFT_BUILTIN_AGENT_EXTENSION])
}

function createDocumentContext(): DocumentAgentContext {
  return {
    protocolVersion: 2,
    scope: 'document',
    selection: null,
    selectedText: 'Hello',
    blocks: [
      {blockId: 'root', flavour: 'root', nodeType: 'root', parentId: null, index: -1, childIds: ['p1'], props: {}},
      {blockId: 'p1', flavour: 'paragraph', nodeType: 'editable', parentId: 'root', index: 0, childIds: [], props: {depth: 0}, text: {plain: 'Hello', delta: [{insert: 'Hello'}]}},
    ],
    document: {rootId: 'root', append: {parentId: 'root', index: 1}},
    baseRevision: {structureRevision: 0, contentFingerprint: ''},
  }
}

function createFakeDoc(paragraphTexts: readonly string[] = ['Hello']): Record<string, any> {
  let sequence = 0
  const paragraphIds = paragraphTexts.map((_, index) => `p${index + 1}`)
  const blocks = new Map<string, {
    flavour: string
    nodeType: BlockNodeType
    parentId: string | null
    children: string[]
    props: Record<string, unknown>
    meta: Record<string, unknown>
    delta?: unknown[]
  }>()
  blocks.set('root', {
    flavour: 'root',
    nodeType: BlockNodeType.root,
    parentId: null,
    children: paragraphIds,
    props: {},
    meta: {},
  })
  for (let index = 0; index < paragraphTexts.length; index++) {
    blocks.set(paragraphIds[index], {
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      parentId: 'root',
      children: [],
      props: {depth: 0},
      meta: {},
      delta: [{insert: paragraphTexts[index]}],
    })
  }
  const schemas = new Map<string, Record<string, any>>([
    ['root', {flavour: 'root', nodeType: BlockNodeType.root, metadata: {version: 1, label: 'Root', includeChildren: ['paragraph', 'callout']}}],
    ['paragraph', {flavour: 'paragraph', nodeType: BlockNodeType.editable, metadata: {version: 1, label: '段落'}}],
    ['callout', {flavour: 'callout', nodeType: BlockNodeType.block, metadata: {version: 1, label: '高亮块', includeChildren: ['paragraph']}}],
  ])

  const createSnapshot = (flavour: string, params: readonly unknown[]): IBlockSnapshot => {
    sequence++
    if (flavour === 'paragraph') {
      return {
        id: `generated-paragraph-${sequence}`,
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {depth: 0},
        meta: {},
        children: typeof params[0] === 'string' ? [{insert: params[0]}] : [],
      }
    }
    return {
      id: `generated-callout-${sequence}`,
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [],
    }
  }

  return {
    rootId: 'root',
    config: {
      embeds: [
        ['image', {}],
        ['icon', {}],
        ['date', {}],
        ['mention', {}],
        ['latex', {}],
        ['shape', {}],
        ['word-art', {}],
      ],
    },
    isInitialized: true,
    isReadonly: false,
    isBlockReadonly: () => false,
    readonlyManager: {
      assertTextWritable: () => undefined,
      assertPropsWritable: () => undefined,
      assertInsertable: () => undefined,
      assertRemovable: () => undefined,
      assertMovable: () => undefined,
    },
    selection: {value: null},
    schemas: {
      getSchemaList: () => [...schemas.values()],
      has: (flavour: string) => schemas.has(flavour),
      get: (flavour: string) => schemas.get(flavour) ?? null,
      createSnapshot,
      isValidChildrenForInstance: (child: string, parent: string | Record<string, any>) => {
        const parentFlavour = typeof parent === 'string' ? parent : parent['flavour']
        return (parentFlavour === 'root' && ['paragraph', 'callout'].includes(child)) ||
          (parentFlavour === 'callout' && child === 'paragraph')
      },
    },
    model: {
      structureRevision: 0,
      exists: (id: string) => blocks.has(id),
      getFlavour: (id: string) => blocks.get(id)?.flavour,
      getNodeType: (id: string) => blocks.get(id)?.nodeType,
      getParentId: (id: string) => blocks.get(id)?.parentId ?? null,
      indexInParent: (id: string) => {
        const block = blocks.get(id)
        return block?.parentId ? blocks.get(block.parentId)?.children.indexOf(id) ?? -1 : -1
      },
      getChildrenIds: (id: string) => blocks.get(id)?.children ?? [],
      getProps: (id: string) => blocks.get(id)?.props,
      getTextDeltas: (id: string) => blocks.get(id)?.delta,
      getTextLength: (id: string) => (blocks.get(id)?.delta ?? []).reduce<number>(
        (length, delta: any) => length + String(delta.insert ?? '').length,
        0,
      ),
      toSnapshot: function toSnapshot(id: string): IBlockSnapshot | null {
        const block = blocks.get(id)
        if (!block) return null
        return {
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          props: JSON.parse(JSON.stringify(block.props)),
          meta: JSON.parse(JSON.stringify(block.meta)),
          children: block.nodeType === BlockNodeType.editable
            ? JSON.parse(JSON.stringify(block.delta ?? []))
            : block.children
              .map(childId => toSnapshot(childId))
              .filter((child): child is IBlockSnapshot => child !== null),
        } as IBlockSnapshot
      },
      getYBlock: (id: string) => ({get: (key: string) => key === 'meta' ? {toJSON: () => blocks.get(id)?.meta ?? {}} : undefined}),
    },
  }
}

function createApplyDoc(calls: string[], revisionIds: readonly string[]): Record<string, any> {
  const doc = createFakeDoc()
  const undoItemToken = Object.freeze({})
  doc['transactionCount'] = 0
  doc['crud'] = {
    transact: (callback: () => void) => {
      doc['transactionCount'] += 1
      return callback()
    },
    undoManager: {
      captureUndoItem: <T>(callback: () => T) => ({
        result: callback(),
        token: undoItemToken,
      }),
    },
    replaceText: (blockId: string) => calls.push(`text:${blockId}`),
    updateBlockProps: (blockId: string) => calls.push(`props:${blockId}`),
  }
  doc['revisions'] = {
    runAsRevision: (
      _actor: unknown,
      callback: () => void,
      _options: {groupId: string},
    ) => callback(),
    listGroup: () => revisionIds.map(id => ({id})),
  }
  doc['undoItemToken'] = undoItemToken
  return doc
}
