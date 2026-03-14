import "../../blocks"
import * as Y from 'yjs'
import { Subject } from 'rxjs'
import { BlockNodeType, IBlockSnapshot, NativeBlockModel, YBlock, native2YBlock } from "../block-std"
import { DocCRUD } from "./crud"

type MockBlockRef = {
  instance: MockBlockInstance
}

type MockChildrenRenderRef = {
  items: MockBlockRef[]
  splice: (index: number, deleteCount: number, ...items: MockBlockRef[]) => MockBlockRef[]
}

class MockBlockInstance {
  parentId: string | null
  readonly onChildrenChange = jasmine.createSpy('onChildrenChange')
  readonly onPropsChange = {
    emit: jasmine.createSpy('emit')
  }
  readonly changeDetectorRef = {
    markForCheck: jasmine.createSpy('markForCheck')
  }
  readonly childrenRenderRef: MockChildrenRenderRef
  _childrenIds: string[]

  constructor(
    private readonly store: Map<string, MockBlockRef>,
    public readonly id: string,
    public readonly flavour: BlockCraft.BlockFlavour,
    public readonly nodeType: BlockNodeType,
    public readonly yBlock: YBlock,
    parentId: string | null,
  ) {
    this.parentId = parentId
    this._childrenIds = nodeType === BlockNodeType.editable ? [] : (yBlock.get('children') as Y.Array<string>).toArray()

    const items: MockBlockRef[] = []
    this.childrenRenderRef = {
      items,
      splice: (index: number, deleteCount: number, ...newItems: MockBlockRef[]) => items.splice(index, deleteCount, ...newItems)
    }
  }

  get childrenIds() {
    return this._childrenIds
  }

  get childrenLength() {
    return this._childrenIds.length
  }

  getIndexOfParent() {
    if (!this.parentId) return -1
    return this.store.get(this.parentId)?.instance.childrenIds.indexOf(this.id) ?? -1
  }
}

const createEditableSnapshot = (id: string): IBlockSnapshot => ({
  id,
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  props: {depth: 0},
  meta: {},
  children: []
})

const createRootSnapshot = (id: string, children: IBlockSnapshot[] = []): IBlockSnapshot => ({
  id,
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children
})

const createBlockRef = (
  store: Map<string, MockBlockRef>,
  yBlock: YBlock,
  parentId: string | null = null
): MockBlockRef => {
  const ref: MockBlockRef = {
    instance: new MockBlockInstance(
      store,
      yBlock.get('id'),
      yBlock.get('flavour'),
      yBlock.get('nodeType'),
      yBlock,
      parentId,
    )
  }
  store.set(ref.instance.id, ref)
  return ref
}

const createDocHarness = () => {
  const yDoc = new Y.Doc()
  const yBlockMap = yDoc.getMap<YBlock>('blocks')
  const rootSnapshot = createRootSnapshot('root')
  const rootYBlock = native2YBlock({
    id: rootSnapshot.id,
    flavour: rootSnapshot.flavour,
    nodeType: rootSnapshot.nodeType,
    props: rootSnapshot.props,
    meta: rootSnapshot.meta,
    children: []
  } as NativeBlockModel)
  yBlockMap.set(rootSnapshot.id, rootYBlock)

  const store = new Map<string, MockBlockRef>()
  const rootRef = createBlockRef(store, rootYBlock)
  const createdParagraphs: IBlockSnapshot[] = []

  const vm = {
    get: (id: string) => store.get(id),
    deleteByIds: (ids: string[]) => {
      ids.forEach(id => {
        store.delete(id)
      })
    },
    destroy: (id: string) => {
      store.delete(id)
    },
    insert: (parent: MockBlockRef, index: number, comps: MockBlockRef[]) => {
      parent.instance.childrenRenderRef.splice(index, 0, ...comps)
      comps.forEach(comp => {
        comp.instance.parentId = parent.instance.id
      })
    },
    createComponentByYBlocks: (yBlocks: Record<string, YBlock>) => {
      const created: Record<string, MockBlockRef> = {}
      Object.values(yBlocks).forEach(yBlock => {
        const ref = createBlockRef(store, yBlock)
        created[ref.instance.id] = ref
      })
      return created as unknown as Record<string, BlockCraft.BlockComponentRef>
    }
  }

  const selection = {
    value: null,
    recalculate: jasmine.createSpy('recalculate')
  }

  const doc = {
    yDoc,
    yBlockMap,
    vm,
    selection,
    ngZone: {
      run: (fn: () => void) => fn()
    },
    logger: {
      warn: jasmine.createSpy('warn')
    },
    messageService: {
      warn: jasmine.createSpy('warn')
    },
    schemas: {
      get: jasmine.createSpy('get').and.callFake((flavour: string) => ({
        flavour,
        metadata: {
          label: flavour,
          renderUnit: flavour === 'root'
        }
      })),
      isValidChildren: jasmine.createSpy('isValidChildren').and.returnValue(true),
      createSnapshot: jasmine.createSpy('createSnapshot').and.callFake((flavour: string) => {
        const snapshot = createEditableSnapshot(`${flavour}-auto-${createdParagraphs.length + 1}`)
        createdParagraphs.push(snapshot)
        return snapshot
      })
    },
    getBlockById: (id: string) => {
      const block = store.get(id)?.instance
      if (!block) throw new Error(`Block not found: ${id}`)
      return block as unknown as BlockCraft.BlockComponent
    },
    afterInit: (fn: (root: BlockCraft.IBlockComponents['root']) => void) => {
      fn(rootRef.instance as unknown as BlockCraft.IBlockComponents['root'])
    },
    isEditable: (block: { nodeType: BlockNodeType }) => block.nodeType === BlockNodeType.editable,
    onDestroy$: new Subject<void>()
  }

  const crud = new DocCRUD(doc as unknown as BlockCraft.Doc)

  return {
    crud,
    rootRef,
    store,
    selection,
    createdParagraphs
  }
}

describe('DocCRUD', () => {
  it('emits children updates synchronously for insert operations', () => {
    const {crud, rootRef} = createDocHarness()
    const snapshot = createEditableSnapshot('paragraph-1')
    let phase: 'before' | 'during' | 'after' = 'before'
    let insertedIds: string[] = []

    crud.onChildrenUpdate$.subscribe(event => {
      expect(phase).toBe('during')
      insertedIds = event.transactions[0]?.inserted?.map(block => block.id) ?? []
    })

    phase = 'during'
    const inserted = crud.insertBlocks(rootRef.instance.id, 0, [snapshot])
    phase = 'after'

    expect(inserted.map(block => block.id)).toEqual(['paragraph-1'])
    expect(insertedIds).toEqual(['paragraph-1'])
    expect(rootRef.instance.childrenIds).toEqual(['paragraph-1'])
  })

  it('replaces the last render-unit child with a paragraph synchronously on delete', () => {
    const {crud, rootRef, selection, createdParagraphs} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('paragraph-1')])

    let phase: 'before' | 'during' | 'after' = 'before'
    let transaction = crud.onChildrenUpdate$.subscribe(event => {
      expect(phase).toBe('during')
      expect(event.transactions[0]?.deleted?.[0]?.length).toBe(1)
      expect(event.transactions[0]?.inserted?.map(block => block.id)).toEqual(['paragraph-auto-1'])
    })

    phase = 'during'
    const deleted = crud.deleteBlocks(rootRef.instance.id, 0, 1)
    phase = 'after'

    transaction.unsubscribe()

    expect(deleted).toEqual([{index: 0, length: 1}])
    expect(selection.recalculate).toHaveBeenCalled()
    expect(createdParagraphs.map(snapshot => snapshot.id)).toEqual(['paragraph-auto-1'])
    expect(rootRef.instance.childrenIds).toEqual(['paragraph-auto-1'])
  })
})
