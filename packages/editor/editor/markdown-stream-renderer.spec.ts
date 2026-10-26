import {
  BlockNodeType,
  ClipboardDataType,
  DocAttachmentInfo,
  DocFileService,
  IAdapter,
  IBlockSnapshot,
  ORIGIN_NO_RECORD,
} from '../framework'
import {MarkdownAdapter} from '../adapters/markdown-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from './bundled-adapter-registry'
import {MarkdownStreamRenderer} from './markdown-stream-renderer'

class MarkdownStreamAdapterFileService extends DocFileService {
  uploadImg(): Promise<string> { return Promise.resolve('') }
  uploadVideo(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: '', type: '', url: '', size: 0})
  }
  uploadAttachment(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: '', type: '', url: '', size: 0})
  }
  previewAttachment(): void {}
  previewImg(): void {}
  createObjectURL(): string { return '' }
  getFileByObjectURL(): File | undefined { return undefined }
  getFilePreviewURLByObjectURL(): string { return '' }
  removeObjectURL(): void {}
  isLocalObjectURL(): boolean { return false }
  isOverMaxSize(): boolean { return false }
}

const editableSnapshot = (
  id: string,
  flavour: BlockCraft.BlockFlavour,
  text: string,
  props: IBlockSnapshot['props'],
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType: BlockNodeType.editable,
  props,
  meta: {},
  children: text ? [{insert: text}] : [],
})

const rootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'incoming-root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
})

const createHarness = (nextSnapshot: IBlockSnapshot) => {
  const current = new Map<string, {
    flavour: BlockCraft.BlockFlavour
    nodeType: BlockNodeType
    props: Record<string, unknown>
    delta: IBlockSnapshot['children']
  }>([
    ['offscreen', {
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0, stale: 'remove'},
      delta: [{insert: 'old'}],
    }],
  ])
  const getBlockById = jasmine.createSpy('getBlockById').and.throwError(
    'offscreen components must not be resolved',
  )
  const crud = {
    transact: jasmine.createSpy('transact').and.callFake((fn: () => void) => fn()),
    updateBlockProps: jasmine.createSpy('updateBlockProps'),
    applyTextDelta: jasmine.createSpy('applyTextDelta'),
    insertBlockSnapshots: jasmine.createSpy('insertBlockSnapshots'),
    deleteBlocks: jasmine.createSpy('deleteBlocks'),
    replaceBlockSnapshots: jasmine.createSpy('replaceBlockSnapshots'),
  }
  const doc = {
    rootId: 'root',
    getBlockById,
    model: {
      getChildrenIds: (blockId: string) => blockId === 'root' ? ['offscreen'] : [],
      getFlavour: (blockId: string) => current.get(blockId)?.flavour,
      getNodeType: (blockId: string) => current.get(blockId)?.nodeType,
      getProps: (blockId: string) => current.get(blockId)?.props,
      getTextDeltas: (blockId: string) => current.get(blockId)?.delta,
    },
    crud,
    schemas: {
      createSnapshot: jasmine.createSpy('createSnapshot'),
    },
  }
  const adapter: IAdapter = {
    type: ClipboardDataType.MARKDOWN,
    toSnapshot: jasmine.createSpy('toSnapshot').and.resolveTo(nextSnapshot),
    fromSnapshot: jasmine.createSpy('fromSnapshot').and.resolveTo(''),
  }

  return {
    renderer: new MarkdownStreamRenderer(doc as unknown as BlockCraft.Doc, adapter),
    doc: doc as unknown as BlockCraft.Doc,
    adapter,
    crud,
    getBlockById,
  }
}

describe('MarkdownStreamRenderer', () => {
  it('patches an offscreen editable block through model APIs without resolving components', async () => {
    const incoming = editableSnapshot('incoming', 'paragraph', 'new', {depth: 1})
    const {renderer, crud, getBlockById} = createHarness(rootSnapshot([incoming]))

    await renderer.replace('new markdown', {immediate: true})

    expect(getBlockById).not.toHaveBeenCalled()
    expect(crud.transact).toHaveBeenCalledWith(jasmine.any(Function), ORIGIN_NO_RECORD)
    expect(crud.updateBlockProps).toHaveBeenCalledWith('offscreen', {
      depth: 1,
      stale: null,
    })
    expect(crud.applyTextDelta).toHaveBeenCalledWith('offscreen', [
      {delete: 3},
      {insert: 'new'},
    ])
  })

  it('replaces an incompatible offscreen block through DocCRUD', async () => {
    const incoming = editableSnapshot('incoming-code', 'code', 'const value = 1', {depth: 0})
    const {renderer, crud, getBlockById} = createHarness(rootSnapshot([incoming]))

    await renderer.replace('```ts\nconst value = 1\n```', {immediate: true})

    expect(getBlockById).not.toHaveBeenCalled()
    expect(crud.replaceBlockSnapshots).toHaveBeenCalledOnceWith('offscreen', [incoming])
    expect(crud.updateBlockProps).not.toHaveBeenCalled()
    expect(crud.applyTextDelta).not.toHaveBeenCalled()
  })

  it('tracks inserted sibling ids locally while the model graph is transaction-stale', async () => {
    const inserted = editableSnapshot('incoming-code', 'code', 'const value = 1', {depth: 0})
    const preserved = editableSnapshot('incoming-paragraph', 'paragraph', 'old', {
      depth: 0,
      stale: 'remove',
    })
    const {renderer, crud, getBlockById} = createHarness(rootSnapshot([inserted, preserved]))

    await renderer.replace('```ts\nconst value = 1\n```\n\nold', {immediate: true})

    expect(getBlockById).not.toHaveBeenCalled()
    expect(crud.insertBlockSnapshots).toHaveBeenCalledOnceWith('root', 0, [inserted])
    expect(crud.replaceBlockSnapshots).not.toHaveBeenCalled()
    expect(crud.deleteBlocks).not.toHaveBeenCalled()
  })

  it('discards an in-flight parse and renders the latest scheduled append', async () => {
    const {renderer, adapter, crud} = createHarness(rootSnapshot([]))
    const toSnapshot = adapter.toSnapshot as jasmine.Spy
    let releaseFirstParse!: () => void
    let markFirstParseStarted!: () => void
    const firstParseStarted = new Promise<void>(resolve => {
      markFirstParseStarted = resolve
    })
    const firstParseGate = new Promise<void>(resolve => {
      releaseFirstParse = resolve
    })
    let parseCount = 0
    toSnapshot.and.callFake(async (markdown: string) => {
      parseCount++
      if (parseCount === 1) {
        markFirstParseStarted()
        await firstParseGate
      }
      return rootSnapshot([
        editableSnapshot(`incoming-${parseCount}`, 'paragraph', markdown, {depth: 0}),
      ])
    })

    const firstRender = renderer.replace('Alpha')
    await firstParseStarted
    const latestRender = renderer.append(' Beta')
    releaseFirstParse()
    await Promise.all([firstRender, latestRender])

    expect(toSnapshot.calls.allArgs().map(args => args[0]))
      .toEqual(['Alpha', 'Alpha Beta'])
    expect(crud.applyTextDelta).toHaveBeenCalledOnceWith('offscreen', [
      {delete: 3},
      {insert: 'Alpha Beta'},
    ])
  })

  it('recovers on later input after an adapter parse rejects', async () => {
    const {renderer, adapter, crud} = createHarness(rootSnapshot([]))
    const toSnapshot = adapter.toSnapshot as jasmine.Spy
    let parseCount = 0
    toSnapshot.and.callFake(async (markdown: string) => {
      parseCount++
      if (parseCount === 1) {
        throw new Error('parse failed')
      }
      return rootSnapshot([
        editableSnapshot('incoming-recovered', 'paragraph', markdown, {depth: 0}),
      ])
    })

    await expectAsync(renderer.replace('broken', {immediate: true}))
      .toBeRejectedWithError('parse failed')
    await expectAsync(renderer.replace('recovered', {immediate: true}))
      .toBeResolved()

    expect(toSnapshot).toHaveBeenCalledTimes(2)
    expect(crud.applyTextDelta).toHaveBeenCalledOnceWith('offscreen', [
      {delete: 2},
      {insert: 'recovere'},
    ])
  })

  it('recovers on later input after applying a snapshot throws', async () => {
    const {renderer, crud} = createHarness(rootSnapshot([
      editableSnapshot('incoming', 'paragraph', 'new', {depth: 0}),
    ]))
    let applyCount = 0
    crud.transact.and.callFake((fn: () => void) => {
      applyCount++
      if (applyCount === 1) {
        throw new Error('apply failed')
      }
      fn()
    })

    await expectAsync(renderer.replace('first', {immediate: true}))
      .toBeRejectedWithError('apply failed')
    await expectAsync(renderer.replace('second', {immediate: true}))
      .toBeResolved()

    expect(crud.transact).toHaveBeenCalledTimes(2)
    expect(crud.applyTextDelta).toHaveBeenCalledTimes(1)
  })

  it('does not write to the document when an in-flight parse resolves after destroy', async () => {
    const {renderer, adapter, crud} = createHarness(rootSnapshot([]))
    const toSnapshot = adapter.toSnapshot as jasmine.Spy
    let releaseParse!: () => void
    let markParseStarted!: () => void
    const parseStarted = new Promise<void>(resolve => {
      markParseStarted = resolve
    })
    const parseGate = new Promise<void>(resolve => {
      releaseParse = resolve
    })
    toSnapshot.and.callFake(async () => {
      markParseStarted()
      await parseGate
      return rootSnapshot([
        editableSnapshot('incoming', 'paragraph', 'late', {depth: 0}),
      ])
    })

    const render = renderer.replace('late', {immediate: true})
    await parseStarted
    renderer.destroy()
    releaseParse()
    await expectAsync(render).toBeResolved()

    expect(crud.transact).not.toHaveBeenCalled()
    expect(crud.applyTextDelta).not.toHaveBeenCalled()
  })

  it('keeps a mermaid block through the real Markdown import renderer path', async () => {
    const markdown = new MarkdownAdapter(
      new MarkdownStreamAdapterFileService(),
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const {doc, crud} = createHarness(rootSnapshot([]))
    const renderer = new MarkdownStreamRenderer(doc, {
      type: ClipboardDataType.MARKDOWN,
      toSnapshot: value => markdown.toBlockSnapshot(value),
      fromSnapshot: snapshot => markdown.toMarkdown(snapshot),
    })

    await renderer.replace(
      '```mermaid\ngraph TD\n  A --> B\n```\n',
      {immediate: true},
    )

    const incoming = crud.replaceBlockSnapshots.calls.mostRecent()
      .args[1][0] as IBlockSnapshot
    expect(incoming.flavour).toBe('mermaid')
    expect((incoming.children[0] as IBlockSnapshot).flavour)
      .toBe('mermaid-textarea')
  })

  it('keeps a BlockCraft container through the default stream adapter path', async () => {
    const markdown = new MarkdownAdapter(
      new MarkdownStreamAdapterFileService(),
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const {doc, crud} = createHarness(rootSnapshot([]))
    const renderer = new MarkdownStreamRenderer(doc, {
      type: ClipboardDataType.MARKDOWN,
      toSnapshot: value => markdown.toBlockSnapshot(value),
      fromSnapshot: snapshot => markdown.toMarkdown(snapshot),
    })

    await renderer.replace(
      ':::bc-callout\nStream content\n:::\n',
      {immediate: true},
    )

    const incoming = crud.replaceBlockSnapshots.calls.mostRecent()
      .args[1][0] as IBlockSnapshot
    expect(incoming.flavour).toBe('callout')
    expect((incoming.children[0] as IBlockSnapshot).flavour)
      .toBe('paragraph')
  })
})
