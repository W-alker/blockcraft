import * as Y from 'yjs'
import {BlockNodeType} from '../../model/block'
import type {IBlockSnapshot} from '../../block-std/types'
import type {YBlock} from '../../block-std/reactive/block'
import {generateId} from '../../utils/id'
import {writeSnapshotsToYBlockMap} from '../snapshot-yblock'
import {ORIGIN_SKIP_SYNC} from '../origins'
import {DocumentCompositionSession} from './session'
import {DocumentCompositionError, type DocumentPersonalData} from './types'

function paragraph(text: string): IBlockSnapshot {
  return {id: generateId(), flavour: 'paragraph', nodeType: BlockNodeType.editable,
    props: {}, meta: {}, children: [{insert: text}]} as IBlockSnapshot
}
function container(children: IBlockSnapshot[]): IBlockSnapshot {
  return {id: generateId(), flavour: 'render-unit', nodeType: BlockNodeType.block,
    props: {}, meta: {}, children} as IBlockSnapshot
}
function text(doc: Y.Doc, id: string): Y.Text {
  return doc.getMap<YBlock>('blocks').get(id)!.get('children') as unknown as Y.Text
}
function children(doc: Y.Doc, id: string): Y.Array<string> {
  return doc.getMap<YBlock>('blocks').get(id)!.get('children') as Y.Array<string>
}
function data(regionId: string, blocks: IBlockSnapshot[]): DocumentPersonalData {
  return {formatVersion: 1, regions: {[regionId]: {children: blocks}}}
}
function fixture(extra = 0) {
  const shared = new Y.Doc({gc: false})
  const publicText = paragraph('shared')
  const defaultText = paragraph('default')
  const region = container([defaultText])
  const root = {id: generateId(), flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {},
    children: [publicText, region, ...Array.from({length: extra}, () => paragraph('unchanged'))]} as IBlockSnapshot
  shared.transact(() => writeSnapshotsToYBlockMap(shared.getMap<YBlock>('blocks'), [root]))
  const regions = [{id: 'answer', blockId: region.id}]
  const sessions: DocumentCompositionSession[] = []
  const session = (personalData?: DocumentPersonalData, source = shared) => {
    const result = new DocumentCompositionSession({sharedDoc: source, rootId: root.id, regions, personalData})
    sessions.push(result)
    return result
  }
  const destroy = () => { sessions.forEach(value => value.dispose()); shared.destroy() }
  return {shared, root, publicText, defaultText, region, regions, session, destroy}
}

/** These tests exercise real Yjs semantics; browser input is tested separately. */
describe('DocumentCompositionSession', () => {
  it('isolates private text, formatting, props, structure and undo from shared updates', () => {
    const h = fixture()
    const aliceText = paragraph('ALICE_PRIVATE')
    const bobText = paragraph('BOB_PRIVATE')
    const alice = h.session(data('answer', [aliceText]))
    const bob = h.session(data('answer', [bobText]))
    const before = Y.encodeStateVector(h.shared)
    const updates = jasmine.createSpy('shared-updates')
    const dirty = jasmine.createSpy('personal-dirty')
    h.shared.on('update', updates)
    alice.personalChanges$.subscribe(dirty)
    const undo = new Y.UndoManager(alice.editorDoc.getMap('blocks'))
    text(alice.editorDoc, aliceText.id).insert(13, '!')
    text(alice.editorDoc, aliceText.id).format(0, 5, {'a:bold': true})
    alice.editorDoc.getMap<YBlock>('blocks').get(aliceText.id)!.get('props').set('textAlign', 'center')
    const extra = paragraph('MORE_PRIVATE')
    alice.editorDoc.transact(() => {
      writeSnapshotsToYBlockMap(alice.editorDoc.getMap<YBlock>('blocks'), [extra])
      children(alice.editorDoc, h.region.id).push([extra.id])
    })
    expect(alice.getBlockScope(extra.id)).toBe('answer')
    expect(alice.exportPersonalData().regions['answer'].children.length).toBe(2)
    expect(text(bob.editorDoc, bobText.id).toString()).toBe('BOB_PRIVATE')
    undo.undo()
    undo.redo()
    expect(Y.encodeStateVector(h.shared)).toEqual(before)
    expect(updates).not.toHaveBeenCalled()
    expect(dirty).toHaveBeenCalled()
    const freshPeer = new Y.Doc()
    Y.applyUpdate(freshPeer, Y.encodeStateAsUpdate(h.shared))
    expect(JSON.stringify(freshPeer.getMap('blocks').toJSON())).not.toContain('PRIVATE')
    expect(alice.failed).toBeNull()
    expect(bob.failed).toBeNull()
    freshPeer.destroy(); undo.destroy(); h.destroy()
  })

  it('rejects directly bound columns at startup and when the shared shell changes', () => {
    const h = fixture()
    const shell = h.shared.getMap<YBlock>('blocks').get(h.region.id)!
    shell.set('flavour', 'columns')
    expect(() => h.session()).toThrowError(DocumentCompositionError, /外层/)
    shell.set('flavour', 'render-unit')
    const a = h.session()
    shell.set('flavour', 'columns')
    expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
    expect(a.editorDoc.getMap<YBlock>('blocks').get(h.region.id)!.get('flavour')).toBe('render-unit')
    h.destroy()
  })

  it('rejects local conversion of a region shell to columns before writing the shared source', () => {
    const h = fixture()
    const a = h.session()
    const before = Y.encodeStateAsUpdate(h.shared)
    a.editorDoc.getMap<YBlock>('blocks').get(h.region.id)!.set('flavour', 'columns')
    expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
    expect(Y.encodeStateAsUpdate(h.shared)).toEqual(before)
    h.destroy()
  })

  it('routes actual writes with ORIGIN_SKIP_SYNC according to block ownership', () => {
    const h = fixture()
    const privateText = paragraph('private')
    const a = h.session(data('answer', [privateText])); const b = h.session()
    const before = Y.encodeStateVector(h.shared)
    a.editorDoc.transact(() => text(a.editorDoc, privateText.id).insert(0, 'code:'), ORIGIN_SKIP_SYNC)
    expect(Y.encodeStateVector(h.shared)).toEqual(before)
    a.editorDoc.transact(() => text(a.editorDoc, h.publicText.id).insert(0, 'code:'), ORIGIN_SKIP_SYNC)
    expect(text(h.shared, h.publicText.id).toString()).toBe('code:shared')
    expect(text(b.editorDoc, h.publicText.id).toString()).toBe('code:shared')
    expect(a.exportPersonalData().regions['answer'].children[0].children).toEqual([{insert: 'code:private'}])
    expect(a.failed).toBeNull(); expect(b.failed).toBeNull()
    h.destroy()
  })

  it('projects shared text deltas, attributes, props and new blocks in both directions', () => {
    const h = fixture()
    const a = h.session(); const b = h.session()
    const aText = text(a.editorDoc, h.publicText.id)
    const bText = text(b.editorDoc, h.publicText.id)
    const relative = Y.createRelativePositionFromTypeIndex(bText, 3)
    aText.insert(0, 'A', {'a:bold': true})
    expect(bText.toDelta()).toEqual(aText.toDelta())
    expect(Y.createAbsolutePositionFromRelativePosition(relative, b.editorDoc)?.index).toBe(4)
    bText.delete(2, 1)
    bText.format(0, 1, {'a:bold': null, 'a:italic': true})
    expect(aText.toDelta()).toEqual(bText.toDelta())
    a.editorDoc.getMap<YBlock>('blocks').get(h.publicText.id)!.get('props').set('textAlign', 'right')
    expect(b.editorDoc.getMap<YBlock>('blocks').get(h.publicText.id)!.get('props').get('textAlign')).toBe('right')
    const added = paragraph('new shared')
    a.editorDoc.transact(() => {
      writeSnapshotsToYBlockMap(a.editorDoc.getMap<YBlock>('blocks'), [added])
      children(a.editorDoc, h.root.id).push([added.id])
    })
    expect(text(h.shared, added.id).toString()).toBe('new shared')
    expect(text(b.editorDoc, added.id).toString()).toBe('new shared')
    expect(a.failed).toBeNull(); expect(b.failed).toBeNull()
    h.destroy()
  })

  it('relays shared undo and excludes remote projections from local undo', () => {
    const h = fixture()
    const a = h.session(); const b = h.session()
    const undo = new Y.UndoManager(a.editorDoc.getMap('blocks'))
    text(a.editorDoc, h.publicText.id).insert(0, 'A')
    undo.stopCapturing()
    text(b.editorDoc, h.publicText.id).insert(0, 'B')
    expect(undo.undoStack.length).toBe(1)
    undo.undo()
    expect(text(h.shared, h.publicText.id).toString()).toBe('Bshared')
    expect(text(b.editorDoc, h.publicText.id).toString()).toBe('Bshared')
    undo.redo()
    expect(text(b.editorDoc, h.publicText.id).toString()).toBe(text(a.editorDoc, h.publicText.id).toString())
    undo.destroy(); h.destroy()
  })

  it('converges concurrent offline edits after duplicate and reverse-order shared updates', () => {
    const h = fixture()
    const secondSource = new Y.Doc({gc: false})
    Y.applyUpdate(secondSource, Y.encodeStateAsUpdate(h.shared))
    const ap = paragraph('PRIVATE_A'); const bp = paragraph('PRIVATE_B')
    const a = h.session(data('answer', [ap]))
    const b = h.session(data('answer', [bp]), secondSource)
    const aUpdates: Uint8Array[] = []; const bUpdates: Uint8Array[] = []
    h.shared.on('update', update => aUpdates.push(update))
    secondSource.on('update', update => bUpdates.push(update))
    text(a.editorDoc, h.publicText.id).insert(0, 'A')
    text(a.editorDoc, h.publicText.id).insert(2, 'a')
    text(b.editorDoc, h.publicText.id).insert(0, 'B')
    text(b.editorDoc, h.publicText.id).insert(2, 'b')
    const left = aUpdates.slice(); const right = bUpdates.slice()
    for (const update of left.reverse()) { Y.applyUpdate(secondSource, update); Y.applyUpdate(secondSource, update) }
    for (const update of right.reverse()) { Y.applyUpdate(h.shared, update); Y.applyUpdate(h.shared, update) }
    Y.applyUpdate(secondSource, Y.encodeStateAsUpdate(h.shared, Y.encodeStateVector(secondSource)))
    Y.applyUpdate(h.shared, Y.encodeStateAsUpdate(secondSource, Y.encodeStateVector(h.shared)))
    expect(text(a.editorDoc, h.publicText.id).toDelta()).toEqual(text(b.editorDoc, h.publicText.id).toDelta())
    expect(text(a.editorDoc, ap.id).toString()).toBe('PRIVATE_A')
    expect(text(b.editorDoc, bp.id).toString()).toBe('PRIVATE_B')
    expect(a.failed).toBeNull(); expect(b.failed).toBeNull()
    secondSource.destroy(); h.destroy()
  })

  it('handles source changes reentering during an editor transaction cleanup', () => {
    const h = fixture()
    const a = h.session(); const b = h.session()
    let reentered = false
    h.shared.on('update', () => {
      if (reentered) return
      reentered = true
      text(h.shared, h.publicText.id).insert(0, 'external:')
    })
    text(a.editorDoc, h.publicText.id).insert(0, 'local:')
    expect(text(h.shared, h.publicText.id).toString()).toBe('external:local:shared')
    expect(text(a.editorDoc, h.publicText.id).toString()).toBe('external:local:shared')
    expect(text(b.editorDoc, h.publicText.id).toString()).toBe('external:local:shared')
    expect(a.failed).toBeNull(); expect(b.failed).toBeNull()
    h.destroy()
  })

  it('clones defaults only for absent records and preserves explicit empty children', () => {
    const h = fixture()
    const absent = h.session()
    const empty = h.session(data('answer', []))
    const defaults = absent.exportPersonalData().regions['answer'].children
    expect(defaults[0].id).not.toBe(h.defaultText.id)
    expect(defaults[0].children).toEqual(h.defaultText.children)
    expect(empty.exportPersonalData().regions['answer'].children).toEqual([])
    expect(children(empty.editorDoc, h.region.id).length).toBe(0)
    h.destroy()
  })

  it('round-trips nested rich content and orphan regions with stable IDs and detached output values', () => {
    const h = fixture()
    const privateText = paragraph('rich')
    privateText.children = [{insert: 'rich', attributes: {'a:bold': true, 's:color': '#123456'}}] as never
    const nested = container([privateText])
    const orphan = paragraph('orphan')
    const a = h.session({formatVersion: 1, regions: {answer: {children: [nested]}, removed: {children: [orphan]}}})
    const persisted = JSON.parse(JSON.stringify(a.exportPersonalData())) as DocumentPersonalData
    a.dispose()
    const b = h.session(persisted)
    expect(b.exportPersonalData()).toEqual(persisted)
    ;(persisted.regions['answer'].children[0].props as Record<string, unknown>)['new'] = 'caller'
    expect(b.exportPersonalData().regions['answer'].children[0].props['new']).toBeUndefined()
    h.destroy()
  })

  it('keeps removed region data, reopens while detached and restores it when the source anchor returns', () => {
    const h = fixture()
    const privateText = paragraph('KEEP_PRIVATE')
    const a = h.session(data('answer', [privateText]))
    const sourceUndo = new Y.UndoManager(h.shared.getMap('blocks'))
    h.shared.transact(() => { children(h.shared, h.root.id).delete(1, 1) })
    expect(a.editorDoc.getMap('blocks').has(h.region.id)).toBeFalse()
    const saved = a.exportPersonalData()
    expect(saved.regions['answer'].children[0].id).toBe(privateText.id)
    a.dispose()
    const b = h.session(saved)
    sourceUndo.undo()
    expect(children(b.editorDoc, h.region.id).toArray()).toEqual([privateText.id])
    expect(text(b.editorDoc, privateText.id).toString()).toBe('KEEP_PRIVATE')
    expect(b.failed).toBeNull()
    sourceUndo.destroy(); h.destroy()
  })

  it('keeps region textFit local while sharing explicit shell appearance', () => {
    const h = fixture()
    const a = h.session(); const b = h.session()
    const before = Y.encodeStateVector(h.shared)
    const props = a.editorDoc.getMap<YBlock>('blocks').get(h.region.id)!.get('props')
    props.set('textFit', {height: 340})
    expect(Y.encodeStateVector(h.shared)).toEqual(before)
    expect(b.editorDoc.getMap<YBlock>('blocks').get(h.region.id)!.get('props').has('textFit')).toBeFalse()
    a.editorDoc.transact(() => { props.set('textFit', {height: 400}); props.set('backColor', '#fff') })
    expect(h.shared.getMap<YBlock>('blocks').get(h.region.id)!.get('props').has('textFit')).toBeFalse()
    expect(b.editorDoc.getMap<YBlock>('blocks').get(h.region.id)!.get('props').get('backColor')).toBe('#fff')
    expect(props.get('textFit')).toEqual({height: 400})
    h.destroy()
  })

  it('does not scan all shared IDs, rebuild ownership or export snapshots for one text edit', () => {
    const h = fixture(2000)
    const a = h.session(); const b = h.session()
    const aRefresh = spyOn<any>(a, 'refreshViewScopes').and.callThrough()
    const bRefresh = spyOn<any>(b, 'refreshViewScopes').and.callThrough()
    const ids = (b as any).sourceGraph.sharedIds as Set<string>
    const iterate = jasmine.createSpy('shared-id-iterator').and.callFake(ids[Symbol.iterator].bind(ids))
    ids[Symbol.iterator] = iterate
    const exportA = spyOn(a, 'exportPersonalData').and.callThrough()
    text(a.editorDoc, h.publicText.id).insert(0, 'x')
    expect(aRefresh).not.toHaveBeenCalled()
    expect(bRefresh).not.toHaveBeenCalled()
    expect(iterate).not.toHaveBeenCalled()
    expect(exportA).not.toHaveBeenCalled()
    expect(text(b.editorDoc, h.publicText.id).toString()).toBe('xshared')
    Reflect.deleteProperty(ids, Symbol.iterator)
    h.destroy()
  })

  it('rejects ID collisions including detached shared blocks and invalid JSON before mutation', () => {
    const h = fixture()
    const detached = paragraph('detached')
    writeSnapshotsToYBlockMap(h.shared.getMap<YBlock>('blocks'), [detached])
    const before = Y.encodeStateAsUpdate(h.shared)
    for (const invalid of [data('answer', [detached]), data('answer', [h.publicText]),
      {formatVersion: 2, regions: {}}, {formatVersion: 1, regions: {answer: {children: [undefined]}}},
      {formatVersion: 1, regions: {answer: {children: new Array(1)}}}]) {
      expect(() => h.session(invalid as DocumentPersonalData)).toThrowError(DocumentCompositionError)
    }
    expect(Y.encodeStateAsUpdate(h.shared)).toEqual(before)
    h.destroy()
  })

  it('rejects nested, duplicate, root and missing region bindings', () => {
    const h = fixture()
    const nested = container([paragraph('inside')])
    h.shared.transact(() => {
      writeSnapshotsToYBlockMap(h.shared.getMap<YBlock>('blocks'), [nested])
      children(h.shared, h.region.id).push([nested.id])
    })
    for (const regions of [
      [{id: 'one', blockId: h.region.id}, {id: 'two', blockId: nested.id}],
      [{id: 'one', blockId: h.region.id}, {id: 'one', blockId: nested.id}],
      [{id: 'root', blockId: h.root.id}], [{id: 'missing', blockId: generateId()}],
    ]) expect(() => new DocumentCompositionSession({sharedDoc: h.shared, rootId: h.root.id, regions})).toThrowError(DocumentCompositionError)
    h.destroy()
  })

  it('fails closed on raw cross-scope moves even without editor guards', () => {
    const h = fixture()
    const privateText = paragraph('DO_NOT_SHARE')
    const a = h.session(data('answer', [privateText]))
    const before = Y.encodeStateAsUpdate(h.shared)
    const errors = jasmine.createSpy('errors')
    a.errors$.subscribe(errors)
    a.editorDoc.transact(() => {
      children(a.editorDoc, h.region.id).delete(0, 1)
      children(a.editorDoc, h.root.id).push([privateText.id])
    })
    expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
    expect(errors).toHaveBeenCalledTimes(1)
    expect(Y.encodeStateAsUpdate(h.shared)).toEqual(before)
    h.destroy()
  })

  it('preflights an entire event batch before any shared write', () => {
    const h = fixture()
    const a = h.session()
    const before = Y.encodeStateAsUpdate(h.shared)
    a.editorDoc.transact(() => {
      text(a.editorDoc, h.publicText.id).insert(0, 'must-not-partially-save')
      a.editorDoc.getMap<YBlock>('blocks').get(h.publicText.id)!.get('props').set('invalid', undefined)
    })
    expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
    expect(Y.encodeStateAsUpdate(h.shared)).toEqual(before)
    h.destroy()
  })

  it('preflights malformed property-map replacements before any shared write', () => {
    for (const value of [{invalid: 'plain-object'}, new Y.Map([['nested', new Y.Map()]])]) {
      const h = fixture()
      const a = h.session()
      const before = Y.encodeStateAsUpdate(h.shared)
      a.editorDoc.transact(() => {
        text(a.editorDoc, h.publicText.id).insert(0, 'must-not-save')
        a.editorDoc.getMap<YBlock>('blocks').get(h.publicText.id)!.set('props', value as never)
      })
      expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
      expect(Y.encodeStateAsUpdate(h.shared)).toEqual(before)
      h.destroy()
    }
  })

  it('stops listening and destroys only its local runtime on disposal', () => {
    const h = fixture()
    const a = h.session()
    a.dispose(); a.dispose()
    expect(a.disposed).toBeTrue()
    expect(a.editorDoc.isDestroyed).toBeTrue()
    expect(h.shared.isDestroyed).toBeFalse()
    expect(() => a.exportPersonalData()).toThrowError(DocumentCompositionError)
    const b = h.session()
    h.shared.destroy()
    expect(b.disposed).toBeTrue()
    h.destroy()
  })

  it('rejects preexisting and newly received revision records without projecting a partial document', () => {
    const h = fixture()
    h.shared.getMap('bc:revisions').set('pending', {id: 'pending'})
    expect(() => h.session()).toThrowError(DocumentCompositionError)
    h.shared.getMap('bc:revisions').clear()
    const a = h.session()
    h.shared.transact(() => {
      text(h.shared, h.publicText.id).insert(0, 'review-only')
      h.shared.getMap('bc:revision-decisions').set('legacy', {id: 'legacy'})
    })
    expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
    expect(text(a.editorDoc, h.publicText.id).toString()).toBe('shared')
    h.destroy()
  })

  it('rejects revision maps received as untyped roots in binary updates', () => {
    const h = fixture()
    const replica = new Y.Doc()
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(h.shared))
    replica.getMap('bc:revisions').set('pending', {id: 'pending'})
    const unopened = new Y.Doc()
    Y.applyUpdate(unopened, Y.encodeStateAsUpdate(replica))
    expect(() => new DocumentCompositionSession({sharedDoc: unopened, rootId: h.root.id,
      regions: [{id: 'answer', blockId: h.region.id}]})).toThrowError(DocumentCompositionError)
    const a = h.session()
    const before = text(a.editorDoc, h.publicText.id).toString()
    replica.transact(() => text(replica, h.publicText.id).insert(0, 'review-only'))
    Y.applyUpdate(h.shared, Y.encodeStateAsUpdate(replica, Y.encodeStateVector(h.shared)))
    expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
    expect(text(a.editorDoc, h.publicText.id).toString()).toBe(before)
    replica.destroy(); unopened.destroy(); h.destroy()
  })

  it('rejects incorrectly typed revision domains', () => {
    const h = fixture()
    h.shared.getArray('bc:revisions').push(['unsupported'])
    expect(() => h.session()).toThrowError(DocumentCompositionError)
    h.destroy()
  })

  it('rejects raw local revision records before the accompanying content reaches the shared source', () => {
    const h = fixture()
    const a = h.session()
    const before = Y.encodeStateAsUpdate(h.shared)
    a.editorDoc.transact(() => {
      text(a.editorDoc, h.publicText.id).insert(0, 'review-only')
      a.editorDoc.getMap('bc:revisions').set('pending', {id: 'pending'})
    })
    expect(a.failed).toEqual(jasmine.any(DocumentCompositionError))
    expect(Y.encodeStateAsUpdate(h.shared)).toEqual(before)
    h.destroy()
  })


  it('keeps existing personal content when the shared template default changes', () => {
    const h = fixture()
    const a = h.session()
    const before = a.exportPersonalData()
    const dirty = jasmine.createSpy('personal-dirty')
    a.personalChanges$.subscribe(dirty)
    text(h.shared, h.defaultText.id).insert(0, 'new default ')
    const extraDefault = paragraph('extra default')
    h.shared.transact(() => {
      writeSnapshotsToYBlockMap(h.shared.getMap<YBlock>('blocks'), [extraDefault])
      children(h.shared, h.region.id).push([extraDefault.id])
    })
    expect(a.exportPersonalData()).toEqual(before)
    expect(a.editorDoc.getMap('blocks').has(extraDefault.id)).toBeFalse()
    expect(dirty).not.toHaveBeenCalled()
    expect(a.failed).toBeNull()
    h.destroy()
  })

})
