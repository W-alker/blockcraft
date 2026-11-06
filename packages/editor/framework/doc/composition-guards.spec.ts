import * as Y from 'yjs'
import {BehaviorSubject} from 'rxjs'
import {BlockNodeType, IBlockSnapshot, YBlock} from '../block-std'
import {DocumentCompositionError, DocumentCompositionSession} from './composition'
import {
  assertCompositionInsertion,
  assertCompositionMutation,
  assertCompositionRevisionSupport,
  assertCompositionRoot,
  assertCompositionWriteFootprint,
  attachCompositionDocument,
  detachCompositionDocument,
  DocumentCompositionMutationError,
} from './composition-guards'
import {writeSnapshotsToYBlockMap} from './snapshot-yblock'
import {DocUndoManger} from './undoManger'
import {BlockMutationPolicyManager} from './block-mutation-policy'
import {InputTransformer} from '../modules/input'
import {ColumnStructureNormalizer} from '../modules/columns/column-structure'
import {BlockReadonlyOperation} from './block-readonly.types'
import {DocumentRevisionManager} from '../revision/manager'
import {BlockCraftDoc} from './document'

function paragraph(id: string, text = ''): IBlockSnapshot {
  return {id, flavour: 'paragraph', nodeType: BlockNodeType.editable, props: {}, meta: {}, children: text ? [{insert: text}] : []}
}

function container(id: string, children: IBlockSnapshot[], root = false): IBlockSnapshot {
  return {id, flavour: root ? 'root' : 'callout', nodeType: root ? BlockNodeType.root : BlockNodeType.block, props: {}, meta: {}, children}
}

function harness() {
  const sharedDoc = new Y.Doc()
  const sharedBlocks = sharedDoc.getMap<YBlock>('blocks')
  writeSnapshotsToYBlockMap(sharedBlocks, [container('root', [
    paragraph('shared', 'shared'),
    container('outer', [container('shell-a', [paragraph('default-a', 'A')])]),
    container('shell-b', [paragraph('default-b', 'B')]),
  ], true)])
  const session = new DocumentCompositionSession({
    sharedDoc, rootId: 'root',
    regions: [{id: 'a', blockId: 'shell-a'}, {id: 'b', blockId: 'shell-b'}],
  })
  const blocks = session.editorDoc.getMap<YBlock>('blocks')
  const children = (id: string) => blocks.get(id)?.get('children') as Y.Array<string>
  const parent = (id: string) => {
    for (const [parentId, block] of blocks) {
      const list = block.get('children')
      if (list instanceof Y.Array && list.toArray().includes(id)) return parentId
    }
    return null
  }
  const disposeHandlers: (() => void)[] = []
  const doc = {
    config: {contentComposition: session, yDoc: session.editorDoc, readonly: false},
    readonlySwitch$: new BehaviorSubject(false),
    toggleReadonly: BlockCraftDoc.prototype.toggleReadonly,
    yDoc: session.editorDoc,
    yBlockMap: blocks,
    rootId: 'root',
    model: {getParentId: parent, exists: (id: string) => blocks.has(id)},
    selection: {value: null, replay: jasmine.createSpy('replay'), restoreBookmark: jasmine.createSpy('restoreBookmark')},
    getBlockById: () => {throw new Error('No view in model-only test')},
    isEditable: () => false,
    readonlyManager: {
      assertUndoRedoWritable: jasmine.createSpy('historyWritable'),
      assertTextWritable: jasmine.createSpy('textWritable'),
      assertRemovable: jasmine.createSpy('removable'),
      assertInsertable: jasmine.createSpy('insertable'),
    },
    messageService: {warn: jasmine.createSpy('warn')},
    onDestroy: (callback: () => void) => disposeHandlers.push(callback),
  } as unknown as BlockCraftDoc
  return {
    doc, session, sharedDoc, sharedBlocks, blocks, children, parent,
    a: children('shell-a').get(0), b: children('shell-b').get(0),
    text: (id: string) => blocks.get(id)!.get('children') as unknown as Y.Text,
    destroy: () => {
      disposeHandlers.forEach(callback => callback())
      detachCompositionDocument(doc)
      session.dispose()
      sharedDoc.destroy()
    },
  }
}

describe('composition mutation guards', () => {
  let h: ReturnType<typeof harness>
  beforeEach(() => h = harness())
  afterEach(() => h.destroy())

  it('does not enable checks for ordinary documents', () => {
    const doc = {config: {}} as BlockCraftDoc
    expect(() => assertCompositionMutation(doc, {operation: 'delete', blockIds: ['anything']})).not.toThrow()
    expect(() => assertCompositionInsertion(doc, 'anything', [])).not.toThrow()
    expect(() => assertCompositionWriteFootprint(doc, {textBlockIds: ['a', 'b'], removableRootIds: [], insertParentIds: []})).not.toThrow()
    expect(() => assertCompositionRevisionSupport(doc)).not.toThrow()
  })

  it('requires the isolated editorDoc, exact root, and one attached editor', () => {
    const wrong = {...h.doc, config: {...h.doc.config, yDoc: h.sharedDoc}}
    expect(() => attachCompositionDocument(wrong as BlockCraftDoc)).toThrowError(DocumentCompositionMutationError)
    attachCompositionDocument(h.doc)
    expect(() => attachCompositionDocument({...h.doc} as BlockCraftDoc)).toThrowError(DocumentCompositionMutationError)
    expect(() => assertCompositionRoot(h.doc, h.blocks.get('root')!)).not.toThrow()
    expect(() => assertCompositionRoot(h.doc, h.sharedBlocks.get('root')!)).toThrowError(DocumentCompositionMutationError)
    detachCompositionDocument(h.doc)
    expect(() => attachCompositionDocument(h.doc)).not.toThrow()
  })

  it('supports nested private columns inside an ordinary region shell', () => {
    h.session.editorDoc.transact(() => {
      writeSnapshotsToYBlockMap(h.blocks, [{
        ...container('private-columns', [{...container('private-column', [paragraph('private-text')]), flavour: 'column'}]),
        flavour: 'columns',
      }])
      h.children('shell-a').push(['private-columns'])
    })
    expect(() => attachCompositionDocument(h.doc)).not.toThrow()
    expect(h.session.getBlockScope('private-columns')).toBe('a')
    expect(h.sharedBlocks.has('private-columns')).toBeFalse()
  })

  it('freezes failed sessions and rejects further edits through the public error type', () => {
    attachCompositionDocument(h.doc)
    h.sharedBlocks.delete('root')
    expect(h.session.failed).toBeTruthy()
    expect(h.doc.readonlySwitch$.value).toBeTrue()
    expect(h.doc.config.readonly).toBeTrue()
    expect(() => h.doc.toggleReadonly(false)).toThrowError(DocumentCompositionError)
    expect(() => assertCompositionInsertion(h.doc, 'shell-a', [paragraph('after-failure')])).toThrowError(DocumentCompositionError)
    expect(() => assertCompositionMutation(h.doc, {operation: 'update-meta', blockIds: [h.a]})).toThrowError(DocumentCompositionError)
    expect(() => assertCompositionWriteFootprint(h.doc, {textBlockIds: [h.a], removableRootIds: [], insertParentIds: []})).toThrowError(DocumentCompositionError)
    detachCompositionDocument(h.doc)
    expect(() => attachCompositionDocument(h.doc)).toThrowError(DocumentCompositionError)
  })

  it('freezes a destroyed session but releases listeners when the editor detaches', () => {
    attachCompositionDocument(h.doc)
    detachCompositionDocument(h.doc)
    h.session.errors$.next(new Error('detached'))
    expect(h.doc.readonlySwitch$.value).toBeFalse()
    attachCompositionDocument(h.doc)
    h.session.dispose()
    expect(h.doc.readonlySwitch$.value).toBeTrue()
    expect(() => h.doc.toggleReadonly(false)).toThrowError(DocumentCompositionError)
  })

  it('rejects snapshot initialization before changing the composed map', () => {
    const before = Y.encodeStateVector(h.session.editorDoc)
    expect(() => BlockCraftDoc.prototype.initBySnapshot.call(h.doc, container('root', [], true), document.createElement('div')))
      .toThrowError(DocumentCompositionMutationError)
    expect(Y.encodeStateVector(h.session.editorDoc)).toEqual(before)
  })

  it('allows edits and insertion within either domain and rejects cross-domain moves', () => {
    expect(() => assertCompositionMutation(h.doc, {operation: 'delete', blockIds: [h.a], parentId: 'shell-a'})).not.toThrow()
    expect(() => assertCompositionInsertion(h.doc, 'shell-a', [paragraph('new-private')])).not.toThrow()
    expect(() => assertCompositionInsertion(h.doc, 'root', [paragraph('new-shared')])).not.toThrow()
    for (const targetId of ['root', 'shell-b']) {
      expect(() => assertCompositionMutation(h.doc, {operation: 'move', blockIds: [h.a], parentId: 'shell-a', targetId}))
        .toThrowError(DocumentCompositionMutationError)
    }
    expect(() => assertCompositionMutation(h.doc, {operation: 'move', blockIds: [h.a], parentId: 'shell-a', targetId: 'shell-a'})).not.toThrow()
  })

  it('protects region shells and their ancestors before structural writes', () => {
    const manager = new BlockMutationPolicyManager(h.doc)
    for (const operation of ['delete', 'replace', 'move'] as const) {
      for (const id of ['shell-a', 'outer', 'root']) {
        const context = {operation, blockIds: [id]}
        expect(manager.allows(context).allowed).toBeFalse()
        expect(() => manager.assert(context)).toThrowError(DocumentCompositionMutationError)
      }
    }
    expect(() => manager.assert({operation: 'replace', blockIds: ['root'], structureTransform: 'host-authorized'}))
      .toThrowError(DocumentCompositionMutationError)
  })

  it('does not reclassify an old private id or insert a bound shell through snapshots', () => {
    expect(() => assertCompositionInsertion(h.doc, 'root', [paragraph(h.a)])).toThrowError(DocumentCompositionMutationError)
    expect(() => assertCompositionInsertion(h.doc, 'shell-a', [container('shell-b', [])])).toThrowError(DocumentCompositionMutationError)
  })

  it('resolves a newly inserted parent before the model/session observer runs', () => {
    h.session.editorDoc.transact(() => {
      writeSnapshotsToYBlockMap(h.blocks, [container('fresh-parent', [])])
      h.children('shell-a').push(['fresh-parent'])
      expect(() => assertCompositionInsertion(h.doc, 'fresh-parent', [paragraph('fresh-child')])).not.toThrow()
    })
  })

  it('preflights a full cross-region input plan before either endpoint changes', () => {
    const input = Object.create(InputTransformer.prototype) as any
    input.doc = h.doc
    input._readonlyEditReader = () => ({
      getParentId: h.parent,
      getChildrenIds: (id: string) => {
        const value = h.blocks.get(id)?.get('children')
        return value instanceof Y.Array ? value.toArray() : []
      },
      getTextLength: (id: string) => h.text(id)?.length ?? null,
    })
    const event = {preventDefault: jasmine.createSpy('preventDefault')}
    const before = Y.encodeStateVector(h.session.editorDoc)
    const plan = {
      kind: 'range', start: {kind: 'text', blockId: 'shared', from: 1, to: 6},
      end: {kind: 'text', blockId: h.a, from: 0, to: 1},
      insertAt: {blockId: 'shared', offset: 1}, stabilizeAt: null, tailMode: 'merge',
    }
    expect(input._tryAssertInputPlan(event, plan, BlockReadonlyOperation.Replace)).toBeFalse()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(Y.encodeStateVector(h.session.editorDoc)).toEqual(before)
    expect(() => assertCompositionWriteFootprint(h.doc, {textBlockIds: [h.a], removableRootIds: [], insertParentIds: ['shell-a']})).not.toThrow()
    expect(() => assertCompositionWriteFootprint(h.doc, {textBlockIds: [h.a, h.b], removableRootIds: [], insertParentIds: []})).toThrowError(DocumentCompositionMutationError)
  })

  it('keeps shared columns around a bound region when one-column normalization cannot lift its shell', () => {
    h.sharedDoc.transact(() => {
      h.sharedBlocks.get('outer')!.set('flavour', 'columns')
      writeSnapshotsToYBlockMap(h.sharedBlocks, [
        {...container('column-1', []), flavour: 'column'},
        {...container('column-2', [paragraph('cell-2', 'two')]), flavour: 'column'},
      ])
      ;(h.sharedBlocks.get('column-1')!.get('children') as Y.Array<string>).push(['shell-a'])
      const outer = h.sharedBlocks.get('outer')!.get('children') as Y.Array<string>
      outer.delete(0, 1)
      outer.push(['column-1', 'column-2'])
    })
    attachCompositionDocument(h.doc)
    const updateProps = jasmine.createSpy('updateProps').and.callFake((id: string, props: Record<string, unknown>) => {
      h.session.editorDoc.transact(() => {
        const target = h.blocks.get(id)!.get('props') as Y.Map<unknown>
        Object.entries(props).forEach(([key, value]) => target.set(key, value))
      })
    })
    const move = jasmine.createSpy('move')
    Object.assign(h.doc, {
      crud: {getYBlock: (id: string) => h.blocks.get(id), updateBlockProps: updateProps, moveBlocks: move},
      schemas: {isValidChildrenForInstance: () => true},
      mutationPolicy: new BlockMutationPolicyManager(h.doc),
    })
    Object.assign(h.doc.readonlyManager, {assertMovable: jasmine.createSpy('movable')})
    const normalizer = new ColumnStructureNormalizer(h.doc)
    normalizer.track('outer')
    h.session.editorDoc.transact(() => {
      h.children('outer').delete(1, 1)
      h.blocks.delete('column-2')
      h.blocks.delete('cell-2')
    })
    expect(() => normalizer.flush()).not.toThrow()
    expect(move).not.toHaveBeenCalled()
    expect(h.children('outer').toArray()).toEqual(['column-1'])
    expect(h.children('column-1').toArray()).toEqual(['shell-a'])
    expect(h.session.exportPersonalData().regions['a'].children.map(block => block.id)).toEqual([h.a])
    expect(updateProps).toHaveBeenCalledWith('outer', {columnCount: 1, columnWidths: [100]})
    expect(h.sharedBlocks.get('outer')!.get('props').get('columnWidths')).toEqual([100])
    expect(h.session.failed).toBeNull()
    expect(h.sharedBlocks.has(h.a)).toBeFalse()
  })

  it('rejects tracking, attributed edits, revision review and imports explicitly', () => {
    const manager = {doc: h.doc} as unknown as DocumentRevisionManager
    expect(() => DocumentRevisionManager.prototype.setMode.call(manager, 'track')).toThrowError(DocumentCompositionMutationError)
    expect(() => DocumentRevisionManager.prototype.setViewMode.call(manager, 'final')).toThrowError(DocumentCompositionMutationError)
    const write = jasmine.createSpy('write')
    expect(() => DocumentRevisionManager.prototype.runAsRevision.call(manager, {actorId: 'user'}, write)).toThrowError(DocumentCompositionMutationError)
    expect(write).not.toHaveBeenCalled()
    expect(() => DocumentRevisionManager.prototype.importDocumentSnapshot.call(manager, {} as any)).toThrowError(DocumentCompositionMutationError)
    expect(() => (DocumentRevisionManager.prototype as any).finalizePlan.call(manager, [])).toThrowError(DocumentCompositionMutationError)
  })
})

describe('composition undo ownership', () => {
  let h: ReturnType<typeof harness>
  let undo: DocUndoManger
  beforeEach(() => {
    h = harness()
    undo = new DocUndoManger(h.doc, h.blocks)
  })
  afterEach(() => h.destroy())

  it('separates immediate implicit Y.Text transactions in different storage domains', () => {
    h.text('shared').insert(6, '1')
    h.text(h.a).insert(1, '2')
    h.text(h.b).insert(1, '3')
    expect((undo as any)._yUndoManager.undoStack.length).toBe(3)
    undo.undo()
    expect(h.text(h.b).toString()).toBe('B')
    expect(h.text(h.a).toString()).toBe('A2')
    undo.undo()
    expect(h.text(h.a).toString()).toBe('A')
    expect(h.text('shared').toString()).toBe('shared1')
    undo.undo()
    expect(h.text('shared').toString()).toBe('shared')
    expect((h.sharedBlocks.get('shared')!.get('children') as unknown as Y.Text).toString()).toBe('shared')
    undo.redo()
    undo.redo()
    undo.redo()
    expect(h.text('shared').toString()).toBe('shared1')
    expect(h.text(h.a).toString()).toBe('A2')
    expect(h.text(h.b).toString()).toBe('B3')
  })

  it('continues merging typing in one domain and excludes remote projection', () => {
    h.text(h.a).insert(1, '1')
    h.text(h.a).insert(2, '2')
    expect((undo as any)._yUndoManager.undoStack.length).toBe(1)
    ;(h.sharedBlocks.get('shared')!.get('children') as unknown as Y.Text).insert(6, ' remote')
    expect((undo as any)._yUndoManager.undoStack.length).toBe(1)
    undo.undo()
    expect(h.text(h.a).toString()).toBe('A')
    expect(h.text('shared').toString()).toBe('shared remote')
  })

  it('retains a deleted private block domain for undo and redo', () => {
    h.session.editorDoc.transact(() => {
      h.children('shell-a').delete(0, 1)
      h.blocks.delete(h.a)
    })
    expect(h.blocks.has(h.a)).toBeFalse()
    undo.undo()
    expect(h.children('shell-a').toArray()).toEqual([h.a])
    expect(h.text(h.a).toString()).toBe('A')
    undo.redo()
    expect(h.children('shell-a').length).toBe(0)
  })

  it('does not replay old private history after a remote region removal', () => {
    h.text(h.b).insert(1, 'private')
    h.sharedDoc.transact(() => {
      const rootChildren = h.sharedBlocks.get('root')!.get('children') as Y.Array<string>
      rootChildren.delete(rootChildren.toArray().indexOf('shell-b'), 1)
      h.sharedBlocks.delete('shell-b')
      h.sharedBlocks.delete('default-b')
    })
    expect(h.blocks.has('shell-b')).toBeFalse()
    undo.undo()
    expect((undo as any)._yUndoManager.undoStack.length).toBe(1)
    expect(h.blocks.has('shell-b')).toBeFalse()
    expect(h.sharedBlocks.has(h.b)).toBeFalse()
  })
})
