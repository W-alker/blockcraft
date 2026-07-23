import {
  BlockNodeType,
  ClipboardDataType,
  IAdapter,
  IBlockSnapshot,
  ORIGIN_NO_RECORD,
} from '../framework'
import {MarkdownStreamRenderer} from './markdown-stream-renderer'

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
})
