import "../../blocks"
import * as Y from 'yjs'
import {BehaviorSubject, Subject} from 'rxjs'
import { BlockNodeType, IBlockSnapshot, NativeBlockModel, YBlock, native2YBlock } from "../block-std"
import {BlockSelection} from '../modules/selection/blockSelection'
import {lazyBoundaryPoint, lazyPoint} from '../modules/selection/normalize'
import { DocCRUD } from "./crud"

type MockBlockRef = {
  instance: MockBlockInstance
  hostView: { destroyed: boolean }
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
  readonly hostElement = document.createElement('div')
  readonly onTextChange = {
    next: jasmine.createSpy('next')
  }
  readonly _applyDeltaToView = jasmine.createSpy('_applyDeltaToView')
  readonly rerender = jasmine.createSpy('rerender')
  readonly childrenRenderRef: MockChildrenRenderRef
  _childrenIds: string[]
  doc: any = null

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
    if (nodeType === BlockNodeType.root) {
      this.hostElement.setAttribute('contenteditable', 'true')
      this.hostElement.tabIndex = 0
    }

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

  get yText() {
    return this.yBlock.get('children') as unknown as Y.Text
  }

  get textLength() {
    return this.nodeType === BlockNodeType.editable ? this.yText.length : 0
  }

  getIndexOfParent() {
    if (!this.parentId) return -1
    return this.store.get(this.parentId)?.instance.childrenIds.indexOf(this.id) ?? -1
  }
}

const createEditableSnapshot = (id: string, text = ''): IBlockSnapshot => ({
  id,
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  props: {depth: 0},
  meta: {},
  children: text ? [{insert: text}] : []
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
    ),
    hostView: { destroyed: false }
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
        ref.instance.doc = rootRef.instance.doc
        created[ref.instance.id] = ref
      })
      return created as unknown as Record<string, BlockCraft.BlockComponentRef>
    }
  }

  const selectionChange$ = new BehaviorSubject<any>(null)
  const selection: any = {
    selectionChange$,
    changeObserve: () => selectionChange$.asObservable(),
    replay: jasmine.createSpy('replay').and.callFake((value: any) => selectionChange$.next(value)),
    recalculate: jasmine.createSpy('recalculate'),
  }
  Object.defineProperty(selection, 'value', {
    get: () => selectionChange$.value,
    set: (value: any) => selectionChange$.next(value),
  })

  const destroyCallbacks: Array<() => void> = []

  const doc = {
    yDoc,
    yBlockMap,
    vm,
    selection,
    root: rootRef.instance,
    isInitialized: true,
    ngZone: {
      run: (fn: () => void) => fn()
    },
    logger: {
      warn: jasmine.createSpy('warn')
    },
    inputManger: {
      compositionSession: {
        shouldDeferPatch: jasmine.createSpy('shouldDeferPatch').and.returnValue(false),
        deferPatch: jasmine.createSpy('deferPatch'),
        handleBlocksDeleted: jasmine.createSpy('handleBlocksDeleted'),
      },
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
    onDestroy$: new Subject<void>(),
    onDestroy: (fn: () => void) => destroyCallbacks.push(fn)
  }

  store.forEach(ref => ref.instance.doc = doc)

  const crud = new DocCRUD(doc as unknown as BlockCraft.Doc)

  const destroy = () => {
    doc.isInitialized = false
    destroyCallbacks.forEach(fn => fn())
    selectionChange$.complete()
    rootRef.instance.hostElement.remove()
    yDoc.destroy()
  }

  return {
    crud,
    doc,
    rootRef,
    rootHost: rootRef.instance.hostElement,
    store,
    selection,
    selectionChange$,
    createdParagraphs,
    yDoc,
    destroy,
  }
}

/**
 * Replay a mutation as a *remote* transaction: clone current state into a
 * second Y.Doc, mutate it there, then apply the resulting update back. The
 * observer on the original doc sees `tr.local === false`, exercising the
 * collaboration path.
 */
const applyRemoteUpdate = (yDoc: Y.Doc, mutate: (blocks: Y.Map<YBlock>) => void) => {
  const remote = new Y.Doc()
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(yDoc))
  let update: Uint8Array | null = null
  const handler = (u: Uint8Array) => { update = u }
  remote.on('update', handler)
  remote.transact(() => mutate(remote.getMap<YBlock>('blocks')))
  remote.off('update', handler)
  if (update) Y.applyUpdate(yDoc, update)
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

const createTextSelection = (doc: any, blockId: string, offset: number) => {
  const point = lazyPoint({blockId, type: 'text', offset}, doc.getBlockById)
  return new BlockSelection(point, point, blockId, doc.getBlockById, () => 0)
}

const createBoundarySelection = (doc: any, blockId: string, index: number) => {
  const point = lazyBoundaryPoint(blockId, index, doc.getBlockById)
  return new BlockSelection(point, point, blockId, doc.getBlockById, () => 0)
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

  it('replaces the last render-unit child without sampling DOM selection', () => {
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
    expect(selection.recalculate).not.toHaveBeenCalled()
    expect(createdParagraphs.map(snapshot => snapshot.id)).toEqual(['paragraph-auto-1'])
    expect(rootRef.instance.childrenIds).toEqual(['paragraph-auto-1'])
  })

  it('does NOT recalculate selection when a remote change misses the selection blocks', async () => {
    const {crud, doc, rootRef, selection, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a'), createEditableSnapshot('b')])

    selection.value = createTextSelection(doc, 'a', 0)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    // A collaborator inserts a brand-new block "c" elsewhere — never touches "a".
    applyRemoteUpdate(yDoc, blocks => {
      const cBlock = native2YBlock({
        id: 'c',
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {depth: 0},
        meta: {},
        children: []
      } as unknown as NativeBlockModel)
      blocks.set('c', cBlock)
      ;(blocks.get('root')!.get('children') as Y.Array<string>).insert(2, ['c'])
    })

    await nextFrame()
    await Promise.resolve()

    expect(selection.recalculate).not.toHaveBeenCalled()
    expect(selection.replay).not.toHaveBeenCalled()
    expect(rootRef.instance.childrenIds).toEqual(['a', 'b', 'c'])
  })

  it('maps a caret through remote text insertion without DOM recalculation', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a', 'ab')])
    document.body.appendChild(rootHost)
    rootHost.focus()
    selection.value = createTextSelection(doc, 'a', 1)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a')!.get('children') as unknown as Y.Text).insert(0, 'X')
    })

    await nextFrame()

    expect(selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: 'a', type: 'text', offset: 2},
      head: {blockId: 'a', type: 'text', offset: 2},
      commonParent: 'a',
    })
    expect(selection.recalculate).not.toHaveBeenCalled()
    rootHost.remove()
  })

  it('maps a container boundary through a remote children insertion', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a'), createEditableSnapshot('b')])
    document.body.appendChild(rootHost)
    rootHost.focus()
    selection.value = createBoundarySelection(doc, 'root', 1)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      const cBlock = native2YBlock({
        id: 'c',
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {depth: 0},
        meta: {},
        children: [],
      } as unknown as NativeBlockModel)
      blocks.set('c', cBlock)
      ;(blocks.get('root')!.get('children') as Y.Array<string>).insert(0, ['c'])
    })

    await nextFrame()

    expect(selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: 'root', type: 'boundary', index: 2},
      head: {blockId: 'root', type: 'boundary', index: 2},
      commonParent: 'root',
    })
    expect(selection.recalculate).not.toHaveBeenCalled()
    rootHost.remove()
  })

  it('fails closed when a remote change deletes a selection endpoint block', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a'), createEditableSnapshot('b')])
    document.body.appendChild(rootHost)
    rootHost.focus()
    document.getSelection()?.removeAllRanges()

    selection.value = createTextSelection(doc, 'a', 0)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      blocks.delete('a')
      ;(blocks.get('root')!.get('children') as Y.Array<string>).delete(0, 1)
    })

    await nextFrame()

    expect(selection.replay).toHaveBeenCalledWith(null)
    expect(selection.recalculate).not.toHaveBeenCalled()
    rootHost.remove()
  })

  it('does not steal focus back when the user leaves before remote reconciliation', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc} = createDocHarness()
    const outside = document.createElement('button')
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a', 'ab')])
    document.body.append(rootHost, outside)
    rootHost.focus()
    selection.value = createTextSelection(doc, 'a', 1)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a')!.get('children') as unknown as Y.Text).insert(0, 'X')
    })
    outside.focus()
    await nextFrame()

    expect(selection.replay).not.toHaveBeenCalled()
    expect(selection.recalculate).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(outside)
    rootHost.remove()
    outside.remove()
  })

  it('cancels a stale remote task after the local selection changes', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a', 'ab')])
    document.body.appendChild(rootHost)
    rootHost.focus()
    selection.value = createTextSelection(doc, 'a', 1)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a')!.get('children') as unknown as Y.Text).insert(0, 'X')
    })
    selection.value = createTextSelection(doc, 'a', 0)
    await nextFrame()

    expect(selection.replay).not.toHaveBeenCalled()
    expect(selection.recalculate).not.toHaveBeenCalled()
    rootHost.remove()
  })

  it('coalesces multiple relevant remote transactions into one frame replay', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a', 'ab')])
    document.body.appendChild(rootHost)
    rootHost.focus()
    selection.value = createTextSelection(doc, 'a', 1)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a')!.get('children') as unknown as Y.Text).insert(0, 'X')
    })
    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a')!.get('children') as unknown as Y.Text).insert(0, 'Y')
    })

    await nextFrame()

    expect(selection.replay).toHaveBeenCalledTimes(1)
    expect(selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: 'a', type: 'text', offset: 3},
      head: {blockId: 'a', type: 'text', offset: 3},
      commonParent: 'a',
    })
    expect(selection.recalculate).not.toHaveBeenCalled()
    rootHost.remove()
  })

  it('cancels pending remote reconciliation when the document is destroyed', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc, destroy} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a', 'ab')])
    document.body.appendChild(rootHost)
    rootHost.focus()
    selection.value = createTextSelection(doc, 'a', 1)
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a')!.get('children') as unknown as Y.Text).insert(0, 'X')
    })
    destroy()
    await nextFrame()

    expect(selection.replay).not.toHaveBeenCalled()
    expect(selection.recalculate).not.toHaveBeenCalled()
  })
})
