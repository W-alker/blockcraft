import "../../blocks"
import * as Y from 'yjs'
import {BehaviorSubject, Subject} from 'rxjs'
import { BlockNodeType, IBlockSnapshot, NativeBlockModel, YBlock, native2YBlock } from "../block-std"
import {BlockSelection} from '../modules/selection/blockSelection'
import {lazyBoundaryPoint, lazyPoint} from '../modules/selection/normalize'
import { DocCRUD } from "./crud"
import {RemoteSelectionReconciler} from '../modules/selection/remote-selection-reconciler'
import {DOMSelectionSurfaceAdapter} from '../modules/selection/surface-adapter'
import {BlockReadonlyError, BlockReadonlyOperation} from "./block-readonly.types"

type MockBlockRef = {
  instance: MockBlockInstance
  hostView: { destroyed: boolean }
}

type MockChildrenRenderRef = {
  items: MockBlockRef[]
  readonly ids: string[]
  readonly length: number
  containerElement: HTMLElement
  get: (index: number) => MockBlockRef | undefined
  splice: (index: number, deleteCount: number, ...items: MockBlockRef[]) => MockBlockRef[]
}

class MockBlockInstance {
  parentId: string | null
  isAttached = true
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
      get ids() {
        return items.map(item => item.instance.id)
      },
      get length() {
        return items.length
      },
      containerElement: this.hostElement,
      get: (index: number) => items[index],
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

  detach() {
    this.isAttached = false
  }

  reattach() {
    this.isAttached = true
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
    usesSparseRoot: false,
    applySparseRootChildrenDelta: jasmine.createSpy('applySparseRootChildrenDelta'),
    _reconcileSparseRootChildren: jasmine.createSpy('_reconcileSparseRootChildren')
      .and.callFake((ids: readonly string[]) => {
        rootRef.instance._childrenIds = [...ids]
      }),
    isMounted: (id: string) => (store.get(id)?.instance as any)?.isAttached !== false,
    retainComponentSubtree: jasmine.createSpy('retainComponentSubtree').and.callFake((component: MockBlockRef) => {
      component.instance.detach()
    }),
    retainRootChild: jasmine.createSpy('retainRootChild').and.callFake((id: string) => {
      const component = store.get(id)
      if (!component) return undefined
      component.instance.hostElement.remove()
      component.instance.parentId = rootRef.instance.id
      component.instance.detach()
      return component
    }),
    ensureRootChildComponent: jasmine.createSpy('ensureRootChildComponent').and.callFake((id: string) => {
      const existing = store.get(id)
      if (existing) return existing
      const yBlock = yBlockMap.get(id)
      if (!yBlock) return undefined
      const created = createBlockRef(store, yBlock, rootRef.instance.id)
      created.instance.doc = rootRef.instance.doc
      return created
    }),
    get: (id: string) => store.get(id),
    deleteByIds: (ids: string[]) => {
      ids.forEach(id => {
        store.delete(id)
      })
    },
    destroy: jasmine.createSpy('destroy').and.callFake((id: string) => {
      store.get(id)?.instance.hostElement.remove()
      store.delete(id)
    }),
    insert: (parent: MockBlockRef, index: number, comps: MockBlockRef[]) => {
      const next = parent.instance.childrenRenderRef.items[index]
      if (next) {
        next.instance.hostElement.before(...comps.map(comp => comp.instance.hostElement))
      } else {
        parent.instance.hostElement.append(...comps.map(comp => comp.instance.hostElement))
      }
      parent.instance.childrenRenderRef.splice(index, 0, ...comps)
      comps.forEach(comp => {
        comp.instance.parentId = parent.instance.id
        if (parent.instance.isAttached) comp.instance.reattach()
        else comp.instance.detach()
      })
    },
    createComponentByYBlocks: (yBlocks: Record<string, YBlock>) => {
      const created: Record<string, MockBlockRef> = {}
      Object.values(yBlocks).forEach(yBlock => {
        const existing = store.get(yBlock.get('id'))
        if (existing) {
          created[existing.instance.id] = existing
          return
        }
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
    restoreBookmark: jasmine.createSpy('restoreBookmark'),
  }
  Object.defineProperty(selection, 'value', {
    get: () => selectionChange$.value,
    set: (value: any) => selectionChange$.next(value),
  })

  const destroyCallbacks: Array<() => void> = []

  const readonlyManager = {
    assertTextWritable: jasmine.createSpy('assertTextWritable'),
    assertPropsWritable: jasmine.createSpy('assertPropsWritable'),
    assertInsertable: jasmine.createSpy('assertInsertable'),
    assertRemovable: jasmine.createSpy('assertRemovable'),
    assertMovable: jasmine.createSpy('assertMovable'),
    assertUndoRedoWritable: jasmine.createSpy('assertUndoRedoWritable'),
  }

  const doc = {
    yDoc,
    yBlockMap,
    readonlyManager,
    model: {
      exists: (id: string) => yBlockMap.has(id),
      synchronizeParentBeforeView: jasmine.createSpy('synchronizeParentBeforeView'),
      getYBlock: (id: string) => yBlockMap.get(id),
      getParentId: (id: string) => {
        for (const [candidateId, candidate] of yBlockMap.entries()) {
          const children = candidate.get('children')
          if (children instanceof Y.Array && children.toArray().includes(id)) return candidateId
        }
        return null
      },
      indexInParent: (id: string) => {
        for (const candidate of yBlockMap.values()) {
          const children = candidate.get('children')
          if (!(children instanceof Y.Array)) continue
          const index = children.toArray().indexOf(id)
          if (index >= 0) return index
        }
        return -1
      },
      getChildrenIds: (id: string) => {
        const children = yBlockMap.get(id)?.get('children')
        return children instanceof Y.Array ? children.toArray() : []
      },
    },
    vm,
    selection,
    root: rootRef.instance,
    rootId: rootRef.instance.id,
    isInitialized: true,
    ngZone: {
      run: (fn: () => void) => fn()
    },
    logger: {
      warn: jasmine.createSpy('warn')
    },
    event: {
      status: {
        isComposing: false,
      },
    },
    inputManger: {
      compositionSession: {
        isActive: false,
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
  ;(doc as any).crud = crud
  const remoteSelectionReconciler = new RemoteSelectionReconciler(
    doc as unknown as BlockCraft.Doc,
    crud.remoteSyncLifecycle$,
    selectionChange$,
    new DOMSelectionSurfaceAdapter(doc as unknown as BlockCraft.Doc),
  )

  const destroy = () => {
    remoteSelectionReconciler.destroy()
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
  it('writes block props by model id without a mounted component', () => {
    const {crud, doc, store} = createDocHarness()
    const yBlock = native2YBlock({
      id: 'offscreen-props',
      flavour: 'ordered',
      nodeType: BlockNodeType.editable,
      props: {depth: 0, marker: 'remove-me'},
      meta: {},
      children: [],
    } as unknown as NativeBlockModel)
    doc.yBlockMap.set('offscreen-props', yBlock)

    crud.updateBlockProps('offscreen-props', {
      depth: 2,
      order: 4,
      marker: null,
    })

    expect(store.has('offscreen-props')).toBeFalse()
    expect((yBlock.get('props') as Y.Map<unknown>).toJSON()).toEqual({
      depth: 2,
      order: 4,
    })
    expect(doc.readonlyManager.assertPropsWritable).toHaveBeenCalledOnceWith(
      'offscreen-props',
      BlockReadonlyOperation.Props,
    )
  })

  it('writes editable text by model id without a mounted component', () => {
    const {crud, doc, store} = createDocHarness()
    const yBlock = native2YBlock({
      id: 'offscreen',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [{insert: 'abcd'}],
    } as unknown as NativeBlockModel)
    doc.yBlockMap.set('offscreen', yBlock)

    crud.replaceText('offscreen', 1, 2, 'XY')
    crud.applyTextDelta('offscreen', [{retain: 4}, {insert: '!'}])

    expect(store.has('offscreen')).toBeFalse()
    expect((yBlock.get('children') as unknown as Y.Text).toString()).toBe('aXYd!')
    expect(doc.readonlyManager.assertTextWritable.calls.allArgs()).toEqual([
      ['offscreen', BlockReadonlyOperation.Replace],
      ['offscreen', BlockReadonlyOperation.Text],
    ])
  })

  it('formats editable text by model id without a mounted component', () => {
    const {crud, doc, store} = createDocHarness()
    const yBlock = native2YBlock({
      id: 'offscreen-format',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [{insert: 'abcd'}],
    } as unknown as NativeBlockModel)
    doc.yBlockMap.set('offscreen-format', yBlock)

    crud.formatText('offscreen-format', 1, 2, {'a:bold': true})

    expect(store.has('offscreen-format')).toBeFalse()
    expect((yBlock.get('children') as unknown as Y.Text).toDelta()).toEqual([
      {insert: 'a'},
      {insert: 'bc', attributes: {'a:bold': true}},
      {insert: 'd'},
    ])
    expect(doc.readonlyManager.assertTextWritable).toHaveBeenCalledOnceWith(
      'offscreen-format',
      BlockReadonlyOperation.Format,
    )
  })

  it('emits meta changes by block id when no component is mounted', () => {
    const {crud, doc} = createDocHarness()
    const yBlock = native2YBlock({
      id: 'offscreen',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [],
    } as unknown as NativeBlockModel)
    doc.yBlockMap.set('offscreen', yBlock)
    let received: any = null
    crud.onMetaUpdate$.subscribe(event => received = event)

    ;(yBlock.get('meta') as Y.Map<unknown>).set('lock', 'user-1')

    expect(received?.transactions).toEqual([jasmine.objectContaining({
      blockId: 'offscreen',
    })])
    expect(doc.logger.warn).not.toHaveBeenCalled()
  })

  it('skips uncreated view patches without interrupting mounted updates in the same remote transaction', () => {
    const {crud, doc, rootRef, yDoc, store} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('mounted', 'a')])
    const offscreen = native2YBlock({
      id: 'offscreen',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [{insert: 'x'}],
    } as unknown as NativeBlockModel)
    doc.yBlockMap.set('offscreen', offscreen)
    doc.logger.warn.calls.reset()
    const mounted = store.get('mounted')!.instance
    mounted._applyDeltaToView.calls.reset()
    const metaIds: string[] = []
    crud.onMetaUpdate$.subscribe(event => {
      metaIds.push(...event.transactions.map(transaction => transaction.blockId))
    })

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('offscreen')!.get('children') as unknown as Y.Text).insert(1, 'y')
      ;(blocks.get('offscreen')!.get('props') as Y.Map<unknown>).set('depth', 1)
      ;(blocks.get('offscreen')!.get('meta') as Y.Map<unknown>).set('lock', 'user-1')
      ;(blocks.get('mounted')!.get('children') as unknown as Y.Text).insert(1, 'b')
    })

    expect(mounted._applyDeltaToView).toHaveBeenCalled()
    expect(metaIds).toContain('offscreen')
    expect(doc.logger.warn).not.toHaveBeenCalled()
  })

  it('does not initialize structural ownership tracking for remote text-only updates', () => {
    const {crud, doc, rootRef, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('remote-text-only', 'a')])

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('remote-text-only')!.get('children') as unknown as Y.Text).insert(1, 'b')
    })

    expect((crud as any)._childrenRepairer._ownershipIndexReady).toBeFalse()
  })

  it('reconciles sparse root structure without creating remote inserted components', () => {
    const {crud, doc, rootRef, yDoc, store} = createDocHarness()
    doc.vm.usesSparseRoot = true

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

    expect(doc.vm.applySparseRootChildrenDelta).toHaveBeenCalled()
    expect(rootRef.instance.childrenIds).toEqual(['c'])
    expect(store.has('c')).toBeFalse()
  })

  it('preserves a composing sparse-root move only while native composition owns the DOM', () => {
    const {crud, doc} = createDocHarness()
    doc.inputManger.compositionSession.isActive = true
    ;(doc.inputManger.compositionSession as any).activeBlockId = 'a-text'
    ;(doc.model as any).getPath = (id: string) => id === 'a-text' ? ['root', 'a', 'a-text'] : null
    doc.event.status.isComposing = true

    expect([...(crud as any)._composingSparseRootMoveIds(['a', 'b'], ['b', 'a'])])
      .toEqual(['a'])

    doc.event.status.isComposing = false

    expect([...(crud as any)._composingSparseRootMoveIds(['a', 'b'], ['b', 'a'])])
      .toEqual([])
  })

  it('ensures local sparse-root inserts so the command still returns components', () => {
    const {crud, doc, rootRef} = createDocHarness()
    doc.vm.usesSparseRoot = true

    const inserted = crud.insertBlocks('root', 0, [createEditableSnapshot('local')])

    expect(doc.vm.ensureRootChildComponent).toHaveBeenCalledOnceWith('local')
    expect(inserted.map(block => block.id)).toEqual(['local'])
    expect(rootRef.instance.childrenIds).toEqual(['local'])
  })

  it('synchronizes a nested sparse-root insert before materializing its component', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const indexedIds = new Set(['root'])
    const order: string[] = []
    doc.model.exists = (id: string) => indexedIds.has(id)
    doc.model.synchronizeParentBeforeView.and.callFake((parentId: string) => {
      order.push(`sync:${parentId}`)
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>)
        .toArray()
        .forEach(id => indexedIds.add(id))
    })
    doc.vm.ensureRootChildComponent.and.callFake((id: string) => {
      order.push(`ensure:${id}`)
      if (!doc.model.exists(id)) throw new Error(`model not synchronized: ${id}`)
      const existing = store.get(id)
      if (existing) return existing
      const created = createBlockRef(store, doc.yBlockMap.get(id)!, rootRef.instance.id)
      created.instance.doc = doc
      return created
    })

    expect(() => crud.transact(() => {
      crud.insertBlocks('root', 0, [createEditableSnapshot('nested-local')])
    })).not.toThrow()

    expect(order).toEqual(['sync:root', 'ensure:nested-local'])
  })

  it('inserts sparse-root snapshots without creating components through the model-first API', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true

    const insertedIds = crud.insertBlockSnapshots('root', 0, [createEditableSnapshot('model-only')])

    expect(insertedIds).toEqual(['model-only'])
    expect(doc.vm.ensureRootChildComponent).not.toHaveBeenCalled()
    expect(store.has('model-only')).toBeFalse()
    expect(doc.yBlockMap.has('model-only')).toBeTrue()
    expect(rootRef.instance.childrenIds).toEqual(['model-only'])
  })

  it('keeps an existing parent view synchronized for model-first inserts', () => {
    const {crud, rootRef, store} = createDocHarness()

    const insertedIds = crud.insertBlockSnapshots('root', 0, [createEditableSnapshot('visible-model')])

    expect(insertedIds).toEqual(['visible-model'])
    expect(store.has('visible-model')).toBeTrue()
    expect(rootRef.instance.childrenIds).toEqual(['visible-model'])
  })

  it('inserts snapshots into an unmounted model parent', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const parent = native2YBlock({
      id: 'offscreen-parent',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [],
    } as NativeBlockModel)
    doc.yDoc.transact(() => {
      doc.yBlockMap.set('offscreen-parent', parent)
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(0, ['offscreen-parent'])
    })
    expect(store.has('offscreen-parent')).toBeFalse()

    const insertedIds = crud.insertBlockSnapshots(
      'offscreen-parent',
      0,
      [createEditableSnapshot('nested-model-only')],
    )

    expect(insertedIds).toEqual(['nested-model-only'])
    expect((parent.get('children') as Y.Array<string>).toArray()).toEqual(['nested-model-only'])
    expect(store.has('nested-model-only')).toBeFalse()
  })

  it('replaces an unmounted sparse-root block through the model layer', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const oldSnapshot = createEditableSnapshot('offscreen-old', 'old')
    crud.insertBlockSnapshots('root', 0, [oldSnapshot])
    expect(store.has(oldSnapshot.id)).toBeFalse()

    const replacement = createEditableSnapshot('offscreen-replacement', 'new')
    const insertedIds = crud.replaceBlockSnapshots(oldSnapshot.id, [replacement])

    expect(insertedIds).toEqual([replacement.id])
    expect(rootRef.instance.childrenIds).toEqual([replacement.id])
    expect(doc.yBlockMap.has(oldSnapshot.id)).toBeFalse()
    expect(doc.yBlockMap.has(replacement.id)).toBeTrue()
    expect(store.has(replacement.id)).toBeFalse()
    expect(doc.readonlyManager.assertRemovable).toHaveBeenCalledWith(
      [oldSnapshot.id],
      BlockReadonlyOperation.Replace,
    )
    expect(doc.readonlyManager.assertInsertable).toHaveBeenCalledWith(
      rootRef.instance.id,
      BlockReadonlyOperation.Replace,
    )
  })

  it('rejects a non-container model parent before writing snapshot data', () => {
    const {crud, doc, rootRef} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const parent = native2YBlock({
      id: 'editable-parent',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [],
    } as NativeBlockModel)
    doc.yDoc.transact(() => {
      doc.yBlockMap.set('editable-parent', parent)
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(0, ['editable-parent'])
    })

    expect(() => crud.insertBlockSnapshots(
      'editable-parent',
      0,
      [createEditableSnapshot('must-not-be-written')],
    )).toThrowError(/cannot contain block children/)
    expect(doc.yBlockMap.has('must-not-be-written')).toBeFalse()
  })

  it('deletes children from an unmounted model parent', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const parentSnapshot: IBlockSnapshot = {
      id: 'offscreen-delete-parent',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [
        createEditableSnapshot('delete-a'),
        createEditableSnapshot('delete-b'),
      ],
    }
    const parent = native2YBlock({
      ...parentSnapshot,
      children: parentSnapshot.children.map(child => child.id),
    } as NativeBlockModel)
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(parentSnapshot.id, parent)
      parentSnapshot.children.forEach(snapshot => {
        doc.yBlockMap.set(snapshot.id, native2YBlock({
          ...snapshot,
          children: snapshot.children,
        } as unknown as NativeBlockModel))
      })
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(0, [parentSnapshot.id])
    })
    expect(store.has(parentSnapshot.id)).toBeFalse()

    const deleted = crud.deleteBlocks(parentSnapshot.id, 0, 1, true)

    expect(deleted).toEqual([{index: 0, length: 1}])
    expect((parent.get('children') as Y.Array<string>).toArray()).toEqual(['delete-b'])
    expect(doc.yBlockMap.has('delete-a')).toBeFalse()
    expect(doc.yBlockMap.has('delete-b')).toBeTrue()
  })

  it('deletes an unmounted block by model id', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const snapshot = createEditableSnapshot('offscreen-delete-by-id')
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(snapshot.id, native2YBlock({
        ...snapshot,
        children: snapshot.children,
      } as unknown as NativeBlockModel))
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(0, [snapshot.id])
    })
    expect(store.has(snapshot.id)).toBeFalse()

    crud.deleteBlockById(snapshot.id)

    expect(rootRef.instance.childrenIds).toEqual(['paragraph-auto-1'])
    expect(doc.yBlockMap.has(snapshot.id)).toBeFalse()
    expect(doc.yBlockMap.has('paragraph-auto-1')).toBeTrue()
  })

  it('moves blocks between unmounted model parents', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const child = createEditableSnapshot('offscreen-move-child')
    const createParent = (id: string, children: string[]) => native2YBlock({
      id,
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children,
    } as NativeBlockModel)
    const source = createParent('offscreen-source', [child.id])
    const target = createParent('offscreen-target', [])
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, native2YBlock({
        ...child,
        children: child.children,
      } as unknown as NativeBlockModel))
      doc.yBlockMap.set('offscreen-source', source)
      doc.yBlockMap.set('offscreen-target', target)
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(
        0,
        ['offscreen-source', 'offscreen-target'],
      )
    })
    expect(store.has('offscreen-source')).toBeFalse()
    expect(store.has('offscreen-target')).toBeFalse()

    crud.moveBlocks('offscreen-source', 0, 1, 'offscreen-target', 0)

    expect((source.get('children') as Y.Array<string>).toArray()).toEqual([])
    expect((target.get('children') as Y.Array<string>).toArray()).toEqual([child.id])
    expect(doc.yBlockMap.has(child.id)).toBeTrue()
  })

  it('keeps the mounted view synchronized when moving an existing block', () => {
    const {crud, rootRef, store} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [
      createEditableSnapshot('move-a'),
      createEditableSnapshot('move-b'),
      createEditableSnapshot('move-c'),
    ])
    const movedRef = store.get('move-a')

    crud.moveBlocks(rootRef.instance.id, 0, 1, rootRef.instance.id, 2)

    expect(rootRef.instance.childrenIds).toEqual(['move-b', 'move-c', 'move-a'])
    expect(rootRef.instance.childrenRenderRef.items.map(ref => ref.instance.id)).toEqual([
      'move-b',
      'move-c',
      'move-a',
    ])
    expect(store.get('move-a')).toBe(movedRef)
  })

  it('settles a moved component into sparse-root retention before view observers run', () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const child = createEditableSnapshot('nested-to-root', 'hello')
    const childYBlock = native2YBlock({
      ...child,
      children: child.children,
    } as unknown as NativeBlockModel)
    const targetYBlock = native2YBlock({
      id: 'target-container',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [child.id],
    } as NativeBlockModel)
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, childYBlock)
      doc.yBlockMap.set('target-container', targetYBlock)
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>)
        .insert(0, ['target-container'])
    })
    const targetRef = createBlockRef(store, targetYBlock, rootRef.instance.id)
    const childRef = createBlockRef(store, childYBlock, targetRef.instance.id)
    targetRef.instance.doc = doc
    childRef.instance.doc = doc
    targetRef.instance.childrenRenderRef.splice(0, 0, childRef)
    doc.vm.retainRootChild.calls.reset()
    let retainedBeforeBroadcast = false
    crud.onChildrenUpdate$.subscribe(() => {
      retainedBeforeBroadcast = doc.vm.retainRootChild.calls
        .allArgs()
        .some(args => args[0] === child.id)
    })

    crud.moveBlocks('target-container', 0, 1, rootRef.instance.id, 1)

    expect(doc.vm.retainRootChild).toHaveBeenCalledWith(child.id)
    expect(retainedBeforeBroadcast).toBeTrue()
    expect((targetYBlock.get('children') as Y.Array<string>).toArray()).toEqual([])
    expect(rootRef.instance.childrenIds).toEqual(['target-container', child.id])
  })

  it('skips a deleted parent children event when undo returns its child to root', () => {
    const {doc, rootRef, store, yDoc} = createDocHarness()
    const child = createEditableSnapshot('undo-column-child', 'hello')
    const childYBlock = native2YBlock({
      ...child,
      children: child.children,
    } as unknown as NativeBlockModel)
    const containerYBlock = native2YBlock({
      id: 'undo-columns',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [child.id],
    } as NativeBlockModel)
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, childYBlock)
      doc.yBlockMap.set('undo-columns', containerYBlock)
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(0, ['undo-columns'])
    })
    const containerRef = store.get('undo-columns') ?? createBlockRef(store, containerYBlock, rootRef.instance.id)
    const childRef = store.get(child.id) ?? createBlockRef(store, childYBlock, containerRef.instance.id)
    containerRef.instance.doc = doc
    childRef.instance.doc = doc
    containerRef.instance.childrenRenderRef.splice(0, 0, childRef)
    containerRef.instance.hostElement.append(childRef.instance.hostElement)
    containerRef.instance.onChildrenChange.calls.reset()

    yDoc.transact(() => {
      const rootChildren = rootRef.instance.yBlock.get('children') as Y.Array<string>
      const containerChildren = containerYBlock.get('children') as Y.Array<string>
      containerChildren.delete(0, 1)
      rootChildren.delete(0, 1)
      rootChildren.insert(0, [child.id])
      doc.yBlockMap.delete('undo-columns')
    })

    expect(containerRef.instance.onChildrenChange).not.toHaveBeenCalled()
    expect(store.has('undo-columns')).toBeFalse()
    expect(store.has(child.id)).toBeTrue()
    expect(rootRef.instance.childrenIds).toEqual([child.id])
  })

  it('releases and evicts a stale source view when its move target has no component', async () => {
    const {crud, doc, rootRef, store} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const child = createEditableSnapshot('move-to-offscreen', 'hello')
    const childYBlock = native2YBlock({
      ...child,
      children: child.children,
    } as unknown as NativeBlockModel)
    const sourceYBlock = native2YBlock({
      id: 'mounted-source',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [child.id],
    } as NativeBlockModel)
    const targetYBlock = native2YBlock({
      id: 'offscreen-target',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [],
    } as NativeBlockModel)
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, childYBlock)
      doc.yBlockMap.set('mounted-source', sourceYBlock)
      doc.yBlockMap.set('offscreen-target', targetYBlock)
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>)
        .insert(0, ['mounted-source', 'offscreen-target'])
    })
    const sourceRef = createBlockRef(store, sourceYBlock, rootRef.instance.id)
    const childRef = createBlockRef(store, childYBlock, sourceRef.instance.id)
    sourceRef.instance.doc = doc
    childRef.instance.doc = doc
    sourceRef.instance.childrenRenderRef.splice(0, 0, childRef)
    sourceRef.instance.hostElement.append(childRef.instance.hostElement)
    doc.vm.destroy.calls.reset()
    let releasedBeforeBroadcast = false
    crud.onChildrenUpdate$.subscribe(() => {
      releasedBeforeBroadcast = !sourceRef.instance.hostElement.contains(childRef.instance.hostElement)
    })

    crud.moveBlocks(sourceRef.instance.id, 0, 1, 'offscreen-target', 0)

    expect(releasedBeforeBroadcast).toBeTrue()
    expect(store.has(child.id)).toBeTrue()
    await Promise.resolve()

    expect(doc.vm.destroy).toHaveBeenCalledWith(child.id)
    expect(store.has(child.id)).toBeFalse()
    expect(sourceRef.instance.hostElement.contains(childRef.instance.hostElement)).toBeFalse()
    expect(sourceRef.instance.childrenRenderRef.items).toEqual([])
    expect((targetYBlock.get('children') as Y.Array<string>).toArray()).toEqual([child.id])
  })

  it('repairs concurrent cross-parent moves when every parent view is offscreen', async () => {
    const {crud, doc, rootRef, store, yDoc, destroy} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const child = createEditableSnapshot('concurrent-offscreen-child', 'hello')
    const childYBlock = native2YBlock({
      ...child,
      children: child.children,
    } as unknown as NativeBlockModel)
    const createParent = (id: string, children: string[]) => native2YBlock({
      id,
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children,
    } as NativeBlockModel)
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, childYBlock)
      doc.yBlockMap.set('offscreen-a', createParent('offscreen-a', [child.id]))
      doc.yBlockMap.set('offscreen-b', createParent('offscreen-b', []))
      doc.yBlockMap.set('offscreen-c', createParent('offscreen-c', []))
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(
        0,
        ['offscreen-a', 'offscreen-b', 'offscreen-c'],
      )
    })
    expect(store.has('offscreen-a')).toBeFalse()
    expect(store.has('offscreen-b')).toBeFalse()
    expect(store.has('offscreen-c')).toBeFalse()

    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(yDoc))
    const remoteBlocks = remote.getMap<YBlock>('blocks')

    crud.moveBlocks('offscreen-a', 0, 1, 'offscreen-b', 0)
    remote.transact(() => {
      ;(remoteBlocks.get('offscreen-a')!.get('children') as Y.Array<string>).delete(0, 1)
      ;(remoteBlocks.get('offscreen-c')!.get('children') as Y.Array<string>).insert(0, [child.id])
    })
    Y.applyUpdate(
      yDoc,
      Y.encodeStateAsUpdate(remote, Y.encodeStateVector(yDoc)),
    )

    await Promise.resolve()
    await Promise.resolve()

    const owners = ['offscreen-a', 'offscreen-b', 'offscreen-c'].filter(parentId =>
      (doc.yBlockMap.get(parentId)!.get('children') as Y.Array<string>)
        .toArray()
        .includes(child.id),
    )
    expect(owners).toEqual(['offscreen-b'])
    expect(store.has(child.id)).toBeFalse()

    Y.applyUpdate(
      remote,
      Y.encodeStateAsUpdate(yDoc, Y.encodeStateVector(remote)),
    )
    const remoteOwners = ['offscreen-a', 'offscreen-b', 'offscreen-c'].filter(parentId =>
      (remoteBlocks.get(parentId)!.get('children') as Y.Array<string>)
        .toArray()
        .includes(child.id),
    )
    expect(remoteOwners).toEqual(owners)

    remote.destroy()
    destroy()
  })

  it('does not materialize a raw duplicate edge before ownership repair settles', async () => {
    const {doc, rootRef, store, yDoc, destroy} = createDocHarness()
    const child = createEditableSnapshot('projected-conflict-child', 'hello')
    const createParent = (id: string, children: string[]) => native2YBlock({
      id,
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children,
    } as NativeBlockModel)

    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, native2YBlock({
        ...child,
        children: child.children,
      } as unknown as NativeBlockModel))
      doc.yBlockMap.set('z-source', createParent('z-source', [child.id]))
      doc.yBlockMap.set('a-winner', createParent('a-winner', []))
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>)
        .insert(0, ['z-source', 'a-winner'])
    })

    const sourceRef = store.get('z-source')!
    const winnerRef = store.get('a-winner')!
    const childRef = createBlockRef(store, doc.yBlockMap.get(child.id)!, sourceRef.instance.id)
    childRef.instance.doc = doc
    sourceRef.instance.childrenRenderRef.splice(0, 0, childRef)
    sourceRef.instance.hostElement.append(childRef.instance.hostElement)
    let winnerSynchronized = false
    doc.model.synchronizeParentBeforeView = jasmine.createSpy('synchronizeParentBeforeView')
      .and.callFake((parentId: string) => {
        if (parentId === 'a-winner') winnerSynchronized = true
      })
    doc.model.getChildrenIds = (parentId: string) => {
      const children = doc.yBlockMap.get(parentId)?.get('children')
      const raw = children instanceof Y.Array ? children.toArray() : []
      return parentId === 'a-winner' && !winnerSynchronized ? [] : raw
    }
    doc.model.getParentId = (id: string) => {
      if (id === child.id) return winnerSynchronized ? 'a-winner' : 'z-source'
      return rootRef.instance.childrenIds.includes(id) ? rootRef.instance.id : null
    }

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a-winner')!.get('children') as Y.Array<string>)
        .insert(0, [child.id])
    })

    // The raw CRDT edge is ambiguous until the repair microtask chooses one
    // owner. The mounted projection must keep showing the current model owner.
    expect(sourceRef.instance.childrenRenderRef.items).toEqual([childRef])
    expect(winnerRef.instance.childrenRenderRef.items).toEqual([])

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(doc.model.synchronizeParentBeforeView).toHaveBeenCalledWith('a-winner')
    expect(sourceRef.instance.childrenRenderRef.items).toEqual([])
    expect(winnerRef.instance.childrenRenderRef.items).toEqual([childRef])
    expect(childRef.instance.parentId).toBe('a-winner')
    expect(winnerRef.instance.hostElement.contains(childRef.instance.hostElement)).toBeTrue()

    destroy()
  })

  it('prunes a remote dangling child ref and releases its cached component', async () => {
    const {doc, rootRef, store, yDoc, destroy} = createDocHarness()
    const child = createEditableSnapshot('remote-dangling-child', 'hello')
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, native2YBlock({
        ...child,
        children: child.children,
      } as unknown as NativeBlockModel))
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>)
        .insert(0, [child.id])
    })
    expect(store.has(child.id)).toBeTrue()

    applyRemoteUpdate(yDoc, blocks => blocks.delete(child.id))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(
      (rootRef.instance.yBlock.get('children') as Y.Array<string>).toArray(),
    ).toEqual([])
    expect(rootRef.instance.childrenRenderRef.items).toEqual([])
    expect(store.has(child.id)).toBeFalse()
    expect(doc.inputManger.compositionSession.handleBlocksDeleted)
      .toHaveBeenCalledWith(jasmine.setContaining(new Set([child.id])))

    destroy()
  })

  it('prunes a dangling child ref created by undoing a late YBlock arrival', async () => {
    const {crud, doc, rootRef, destroy} = createDocHarness()
    const child = createEditableSnapshot('undo-dangling-child', 'hello')
    const rootChildren = rootRef.instance.yBlock.get('children') as Y.Array<string>

    // Model a previously merged dangling edge, then a later block arrival. The
    // UndoManager reverses only that arrival and must not leave the edge live.
    rootChildren.insert(0, [child.id])
    crud.undoManager.clearHistory()
    crud.undoManager.stopCapturing()
    crud.transact(() => {
      doc.yBlockMap.set(child.id, native2YBlock({
        ...child,
        children: child.children,
      } as unknown as NativeBlockModel))
    })

    crud.undoManager.undo()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(doc.yBlockMap.has(child.id)).toBeFalse()
    expect(rootChildren.toArray()).toEqual([])
    expect(rootRef.instance.childrenRenderRef.items).toEqual([])

    destroy()
  })

  it('repairs a same-parent duplicate without materializing its offscreen view', async () => {
    const {doc, rootRef, store, yDoc, destroy} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const child = createEditableSnapshot('same-parent-offscreen-child', 'hello')
    doc.yDoc.transact(() => {
      doc.yBlockMap.set(child.id, native2YBlock({
        ...child,
        children: child.children,
      } as unknown as NativeBlockModel))
      doc.yBlockMap.set('same-parent-offscreen', native2YBlock({
        id: 'same-parent-offscreen',
        flavour: 'callout',
        nodeType: BlockNodeType.block,
        props: {},
        meta: {},
        children: [child.id],
      } as NativeBlockModel))
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>)
        .insert(0, ['same-parent-offscreen'])
    })

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('same-parent-offscreen')!.get('children') as Y.Array<string>)
        .insert(1, [child.id])
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(
      (doc.yBlockMap.get('same-parent-offscreen')!.get('children') as Y.Array<string>).toArray(),
    ).toEqual([child.id])
    expect(store.has('same-parent-offscreen')).toBeFalse()
    expect(store.has(child.id)).toBeFalse()

    destroy()
  })

  ;[
    {
      name: 'keeps the visible winner mounted',
      visibleId: 'a-visible',
      offscreenId: 'z-offscreen',
      expectedOwner: 'visible',
    },
    {
      name: 'releases the visible loser when the winner is offscreen',
      visibleId: 'z-visible',
      offscreenId: 'a-offscreen',
      expectedOwner: 'offscreen',
    },
  ].forEach(({name, visibleId, offscreenId, expectedOwner}) => {
    it(`settles concurrent view ownership and ${name}`, async () => {
      const {crud, doc, rootRef, store, yDoc, destroy} = createDocHarness()
      doc.vm.usesSparseRoot = true
      const child = createEditableSnapshot(`conflict-child-${expectedOwner}`, 'kept')
      const childYBlock = native2YBlock({
        ...child,
        children: child.children,
      } as unknown as NativeBlockModel)
      const createParent = (id: string, children: string[]) => native2YBlock({
        id,
        flavour: 'callout',
        nodeType: BlockNodeType.block,
        props: {},
        meta: {},
        children,
      } as NativeBlockModel)
      const sourceYBlock = createParent('m-source', [child.id])
      const visibleYBlock = createParent(visibleId, [])
      doc.yDoc.transact(() => {
        doc.yBlockMap.set(child.id, childYBlock)
        doc.yBlockMap.set('m-source', sourceYBlock)
        doc.yBlockMap.set(visibleId, visibleYBlock)
        doc.yBlockMap.set(offscreenId, createParent(offscreenId, []))
        ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(
          0,
          ['m-source', visibleId, offscreenId],
        )
      })
      const sourceRef = createBlockRef(store, sourceYBlock, rootRef.instance.id)
      const visibleRef = createBlockRef(store, visibleYBlock, rootRef.instance.id)
      const childRef = createBlockRef(store, childYBlock, sourceRef.instance.id)
      sourceRef.instance.doc = doc
      visibleRef.instance.doc = doc
      childRef.instance.doc = doc
      sourceRef.instance.childrenRenderRef.splice(0, 0, childRef)
      sourceRef.instance.hostElement.append(childRef.instance.hostElement)

      const remote = new Y.Doc()
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(yDoc))
      const remoteBlocks = remote.getMap<YBlock>('blocks')

      crud.moveBlocks('m-source', 0, 1, visibleId, 0)
      remote.transact(() => {
        ;(remoteBlocks.get('m-source')!.get('children') as Y.Array<string>).delete(0, 1)
        ;(remoteBlocks.get(offscreenId)!.get('children') as Y.Array<string>).insert(0, [child.id])
      })
      Y.applyUpdate(
        yDoc,
        Y.encodeStateAsUpdate(remote, Y.encodeStateVector(yDoc)),
      )

      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      const expectedParentId = expectedOwner === 'visible' ? visibleId : offscreenId
      expect(
        [visibleId, offscreenId].filter(parentId =>
          (doc.yBlockMap.get(parentId)!.get('children') as Y.Array<string>)
            .toArray()
            .includes(child.id),
        ),
      ).toEqual([expectedParentId])
      expect(sourceRef.instance.childrenRenderRef.items).toEqual([])
      if (expectedOwner === 'visible') {
        expect(visibleRef.instance.childrenRenderRef.items).toEqual([childRef])
        expect(store.get(child.id)).toBe(childRef)
        expect(childRef.instance.parentId).toBe(visibleId)
        expect(visibleRef.instance.hostElement.contains(childRef.instance.hostElement)).toBeTrue()
      } else {
        expect(visibleRef.instance.childrenRenderRef.items).toEqual([])
        expect(store.has(child.id)).toBeFalse()
        expect(visibleRef.instance.hostElement.contains(childRef.instance.hostElement)).toBeFalse()
      }

      Y.applyUpdate(
        remote,
        Y.encodeStateAsUpdate(yDoc, Y.encodeStateVector(remote)),
      )
      expect(
        [visibleId, offscreenId].filter(parentId =>
          (remoteBlocks.get(parentId)!.get('children') as Y.Array<string>)
            .toArray()
            .includes(child.id),
        ),
      ).toEqual([expectedParentId])

      remote.destroy()
      destroy()
    })
  })

  it('stays convergent through alternating virtual moves and undo-redo pressure', async () => {
    const {crud, doc, rootRef, store, yDoc, destroy} = createDocHarness()
    doc.vm.usesSparseRoot = true
    const parentIds = ['visible-parent', 'offscreen-b', 'offscreen-c', 'root']
    const childIds = Array.from({length: 6}, (_, index) => `stress-child-${index}`)
    const createParent = (id: string, children: string[]) => native2YBlock({
      id,
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children,
    } as NativeBlockModel)
    const visibleYBlock = createParent('visible-parent', childIds)
    doc.yDoc.transact(() => {
      childIds.forEach((id, index) => {
        const snapshot = createEditableSnapshot(id, `text-${index}`)
        doc.yBlockMap.set(id, native2YBlock({
          ...snapshot,
          children: snapshot.children,
        } as unknown as NativeBlockModel))
      })
      doc.yBlockMap.set('visible-parent', visibleYBlock)
      doc.yBlockMap.set('offscreen-b', createParent('offscreen-b', []))
      doc.yBlockMap.set('offscreen-c', createParent('offscreen-c', []))
      ;(rootRef.instance.yBlock.get('children') as Y.Array<string>).insert(
        0,
        ['visible-parent', 'offscreen-b', 'offscreen-c'],
      )
    })
    const visibleRef = createBlockRef(store, visibleYBlock, rootRef.instance.id)
    visibleRef.instance.doc = doc
    childIds.forEach(id => {
      const childRef = createBlockRef(store, doc.yBlockMap.get(id)!, visibleRef.instance.id)
      childRef.instance.doc = doc
      visibleRef.instance.childrenRenderRef.splice(
        visibleRef.instance.childrenRenderRef.items.length,
        0,
        childRef,
      )
      visibleRef.instance.hostElement.append(childRef.instance.hostElement)
    })
    crud.undoManager.clearHistory()

    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(yDoc))
    const remoteBlocks = remote.getMap<YBlock>('blocks')
    const remoteUndo = new Y.UndoManager(remoteBlocks, {captureTimeout: 0})
    const childrenOf = (blocks: Y.Map<YBlock>, parentId: string) =>
      blocks.get(parentId)!.get('children') as Y.Array<string>
    const ownerOf = (blocks: Y.Map<YBlock>, childId: string) =>
      parentIds.find(parentId => childrenOf(blocks, parentId).toArray().includes(childId)) ?? null
    const moveIn = (targetDoc: Y.Doc, blocks: Y.Map<YBlock>, childId: string, targetId: string) => {
      const sourceId = ownerOf(blocks, childId)
      if (!sourceId || sourceId === targetId) return
      targetDoc.transact(() => {
        const source = childrenOf(blocks, sourceId)
        const target = childrenOf(blocks, targetId)
        source.delete(source.toArray().indexOf(childId), 1)
        target.insert(target.length, [childId])
      })
    }
    const sync = (source: Y.Doc, target: Y.Doc) => {
      Y.applyUpdate(
        target,
        Y.encodeStateAsUpdate(source, Y.encodeStateVector(target)),
      )
    }
    const settle = async () => {
      await Promise.resolve()
      await Promise.resolve()
      sync(yDoc, remote)
      sync(remote, yDoc)
      await Promise.resolve()
    }
    const assertStable = () => {
      childIds.forEach(childId => {
        const localOwners = parentIds.filter(parentId =>
          childrenOf(doc.yBlockMap, parentId).toArray().includes(childId),
        )
        const remoteOwners = parentIds.filter(parentId =>
          childrenOf(remoteBlocks, parentId).toArray().includes(childId),
        )
        expect(localOwners.length).withContext(`${childId} local owner count`).toBe(1)
        expect(remoteOwners).withContext(`${childId} peer ownership`).toEqual(localOwners)
        expect((doc.yBlockMap.get(childId)!.get('children') as unknown as Y.Text).toString())
          .toBe(`text-${childIds.indexOf(childId)}`)
      })

      const visibleChildren = childrenOf(doc.yBlockMap, 'visible-parent').toArray()
      expect(visibleRef.instance.childrenRenderRef.items.map(ref => ref.instance.id))
        .toEqual(visibleChildren)
      childIds.forEach(childId => {
        const owner = ownerOf(doc.yBlockMap, childId)
        if (owner === 'visible-parent') {
          expect(store.get(childId)?.instance.parentId).toBe('visible-parent')
        } else if (owner === 'offscreen-b' || owner === 'offscreen-c') {
          expect(store.has(childId)).withContext(`${childId} offscreen view released`).toBeFalse()
        }
      })
    }

    for (let index = 0; index < 48; index++) {
      const childId = childIds[(index * 5) % childIds.length]
      const currentOwner = ownerOf(doc.yBlockMap, childId)!
      let targetId = parentIds[(index * 3 + 1) % parentIds.length]
      if (targetId === currentOwner) {
        targetId = parentIds[(parentIds.indexOf(targetId) + 1) % parentIds.length]
      }

      if (index % 2 === 0) {
        crud.undoManager.stopCapturing()
        const sourceId = ownerOf(doc.yBlockMap, childId)!
        const source = childrenOf(doc.yBlockMap, sourceId)
        crud.moveBlocks(
          sourceId,
          source.toArray().indexOf(childId),
          1,
          targetId,
          childrenOf(doc.yBlockMap, targetId).length,
        )
        sync(yDoc, remote)
        if (index % 12 === 0) {
          crud.undoManager.undo()
          sync(yDoc, remote)
          crud.undoManager.redo()
          sync(yDoc, remote)
        }
      } else {
        remoteUndo.stopCapturing()
        moveIn(remote, remoteBlocks, childId, targetId)
        sync(remote, yDoc)
        if (index % 13 === 0) {
          remoteUndo.undo()
          sync(remote, yDoc)
          remoteUndo.redo()
          sync(remote, yDoc)
        }
      }

      await settle()
      assertStable()
    }

    remoteUndo.destroy()
    remote.destroy()
    destroy()
  })

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

  it('preflights insert, delete, replace and move before starting a transaction', () => {
    const {crud, doc, rootRef} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [
      createEditableSnapshot('a'),
      createEditableSnapshot('b'),
    ])
    const rootChildren = rootRef.instance.childrenIds.slice()
    const error = new BlockReadonlyError({
      operation: BlockReadonlyOperation.Delete,
      blockIds: ['a'],
      source: {kind: 'self', blockId: 'a'},
    })

    doc.readonlyManager.assertRemovable.and.throwError(error)
    expect(() => crud.deleteBlocks('root', 0, 2)).toThrowError(BlockReadonlyError)
    expect(rootRef.instance.childrenIds).toEqual(rootChildren)
    expect(doc.readonlyManager.assertRemovable).toHaveBeenCalledWith(
      ['a', 'b'],
      BlockReadonlyOperation.Delete,
    )

    doc.readonlyManager.assertRemovable.calls.reset()
    expect(() => crud.replaceWithSnapshots('a', [createEditableSnapshot('replacement')]))
      .toThrowError(BlockReadonlyError)
    expect(doc.yBlockMap.has('replacement')).toBeFalse()

    doc.readonlyManager.assertRemovable.and.stub()
    doc.readonlyManager.assertMovable.and.throwError(new BlockReadonlyError({
      operation: BlockReadonlyOperation.Move,
      blockIds: ['a'],
      source: {kind: 'self', blockId: 'a'},
    }))
    expect(() => crud.moveBlocks('root', 0, 1, 'root', 2))
      .toThrowError(BlockReadonlyError)
    expect(rootRef.instance.childrenIds).toEqual(rootChildren)
    expect(doc.readonlyManager.assertMovable).toHaveBeenCalledWith(
      ['a'],
      'root',
      BlockReadonlyOperation.Move,
    )

    doc.readonlyManager.assertMovable.and.stub()
    doc.readonlyManager.assertInsertable.and.throwError(new BlockReadonlyError({
      operation: BlockReadonlyOperation.Insert,
      blockIds: ['root'],
      source: {kind: 'document'},
    }))
    expect(() => crud.insertBlocks('root', 0, [createEditableSnapshot('blocked-insert')]))
      .toThrowError(BlockReadonlyError)
    expect(doc.yBlockMap.has('blocked-insert')).toBeFalse()
  })

  it('preflights the current delete range when the model index still contains a removed sibling', () => {
    const {crud, doc, rootRef} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [
      createEditableSnapshot('a'),
      createEditableSnapshot('b'),
    ])
    doc.readonlyManager.assertRemovable.calls.reset()
    spyOn(doc.model, 'getChildrenIds').and.returnValue(['already-removed', 'a', 'b'])

    crud.deleteBlocks(rootRef.instance.id, 0, 1)

    expect(doc.readonlyManager.assertRemovable).toHaveBeenCalledOnceWith(
      ['a'],
      BlockReadonlyOperation.Delete,
    )
    expect(rootRef.instance.childrenIds).toEqual(['b'])
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

  it('leaves the composing selection under CompositionSession ownership during remote text insertion', async () => {
    const {crud, doc, rootRef, rootHost, selection, yDoc} = createDocHarness()
    crud.insertBlocks(rootRef.instance.id, 0, [createEditableSnapshot('a', 'ab')])
    document.body.appendChild(rootHost)
    rootHost.focus()
    selection.value = createTextSelection(doc, 'a', 1)
    doc.event.status.isComposing = true
    doc.inputManger.compositionSession.isActive = true
    selection.recalculate.calls.reset()
    selection.replay.calls.reset()

    applyRemoteUpdate(yDoc, blocks => {
      ;(blocks.get('a')!.get('children') as unknown as Y.Text).insert(0, 'X')
    })

    await nextFrame()

    expect(selection.value.toJSON()).toEqual({
      anchor: {blockId: 'a', type: 'text', offset: 1},
      head: {blockId: 'a', type: 'text', offset: 1},
      commonParent: 'a',
    })
    expect(selection.replay).not.toHaveBeenCalled()
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
