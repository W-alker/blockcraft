import {
  BlockNodeType,
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
} from '../core/agent.types'
import {captureBlockCraftAgentContext} from './blockcraft-context-adapter'
import {
  DocumentAgentOperationCompileError,
  DocumentAgentOperationCompiler,
} from './document-agent-operation-compiler'
import {DocumentAgentOperationApplier} from './document-agent-operation-applier'

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
    expect(calls).toEqual(['text:p1', 'props:p1'])
  })
})

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

function createFakeDoc(): Record<string, any> {
  let sequence = 0
  const blocks = new Map<string, {
    flavour: string
    nodeType: BlockNodeType
    parentId: string | null
    children: string[]
    props: Record<string, unknown>
    meta: Record<string, unknown>
    delta?: unknown[]
  }>([
    ['root', {flavour: 'root', nodeType: BlockNodeType.root, parentId: null, children: ['p1'], props: {}, meta: {}}],
    ['p1', {flavour: 'paragraph', nodeType: BlockNodeType.editable, parentId: 'root', children: [], props: {depth: 0}, meta: {}, delta: [{insert: 'Hello'}]}],
  ])
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
      getYBlock: (id: string) => ({get: (key: string) => key === 'meta' ? {toJSON: () => blocks.get(id)?.meta ?? {}} : undefined}),
    },
  }
}

function createApplyDoc(calls: string[], revisionIds: readonly string[]): Record<string, any> {
  const doc = createFakeDoc()
  doc['crud'] = {
    transact: (callback: () => void) => callback(),
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
  return doc
}
