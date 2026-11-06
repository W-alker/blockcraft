import * as Y from 'yjs'
import {Subject} from 'rxjs'
import {YBlock} from '../block-std'
import {SchemaManager} from '../block-std/schema'
import {ParagraphBlockSchema, RootBlockSchema, RenderUnitBlockSchema, TextBoxBlockSchema, ImageBlockSchema} from '../../blocks'
import {BlockModelGraph} from './model-graph'
import {BlockMutationPolicyManager} from './block-mutation-policy'
import {DocUndoManger} from './undoManger'
import {writeSnapshotsToYBlockMap} from './snapshot-yblock'
import {applyDocumentStructurePlan, DocumentStructurePlan} from './structure-transform'

function harness() {
  const yDoc = new Y.Doc({gc: false})
  const yBlockMap = yDoc.getMap<YBlock>('blocks')
  const schemas = new SchemaManager([RootBlockSchema, ParagraphBlockSchema, RenderUnitBlockSchema, TextBoxBlockSchema, ImageBlockSchema])
  const paragraph = schemas.createSnapshot('paragraph', [])
  paragraph.children = [{insert: '保留内容', attributes: {bold: true, 'd:scGroupId': 'comment-1'}}] as any
  const old = schemas.createSnapshot('render-unit', [{}, {}])
  old.children = [paragraph]
  const root = schemas.createSnapshot('root', ['root', [old]])
  writeSnapshotsToYBlockMap(yBlockMap, [root])
  const doc: any = {
    yDoc, yBlockMap, rootId: 'root', schemas, isInitialized: true, isReadonly: false,
    config: {authorizeStructureTransform: () => true},
    event: {status: {isComposing: false}}, inputManger: {compositionSession: {isActive: false}},
    readonlyManager: {assertUndoRedoWritable: jasmine.createSpy('ordinary-history-guard')},
    selection: {value: null, replay: jasmine.createSpy('replay'), restoreBookmark: jasmine.createSpy('restoreBookmark')},
    onDestroy$: new Subject(), onDestroy: () => undefined,
    crud: {transact: (fn: () => void) => yDoc.transact(fn)},
  }
  doc.model = new BlockModelGraph(doc)
  doc.model.build('root')
  doc.exportSnapshot = () => doc.model.toSnapshot('root')
  doc.mutationPolicy = new BlockMutationPolicyManager(doc)
  doc.crud.undoManager = new DocUndoManger(doc, yBlockMap)
  const target = schemas.createSnapshot('text-box', [])
  target.children = []
  const plan: DocumentStructurePlan = {
    purpose: 'test-template', children: [target],
    retainedChildren: [{sourceId: old.id, targetId: target.id}],
    rootProps: {background: '#123456'}, rootMeta: {tplSourceId: 'new'}
  }
  const destroy = () => { doc.model.destroy(); yDoc.destroy() }
  return {doc: doc as BlockCraft.Doc, yDoc, yBlockMap, old, target, paragraph, plan, destroy}
}

describe('Document structure transform', () => {
  it('preserves Y.Text identity, relative anchors, rich text and block ids in one undo item', () => {
    const h = harness()
    const text = h.yBlockMap.get(h.paragraph.id)!.get('children') as unknown as Y.Text
    const relative = Y.createRelativePositionFromTypeIndex(text, 2)
    h.old.meta = {lock: 'author', lockKind: 'template'}
    h.yBlockMap.get(h.old.id)!.get('meta').set('lock', 'author')
    h.yBlockMap.get(h.old.id)!.get('meta').set('lockKind', 'template')
    h.doc.crud.undoManager.clearHistory()
    const before = h.doc.exportSnapshot()
    const updates = jasmine.createSpy('update')
    h.yDoc.on('update', updates)
    applyDocumentStructurePlan(h.doc, h.plan)
    expect(updates).toHaveBeenCalledTimes(1)
    expect(h.doc.model.getParentId(h.paragraph.id)).toBe(h.target.id)
    expect(h.yBlockMap.get(h.paragraph.id)!.get('children') as unknown).toBe(text)
    expect(text.toDelta()[0].attributes?.['d:scGroupId']).toBe('comment-1')
    expect(Y.createAbsolutePositionFromRelativePosition(relative, h.yDoc)?.index).toBe(2)
    expect(h.yBlockMap.has(h.old.id)).toBeFalse()
    h.doc.crud.undoManager.undo()
    expect(h.doc.exportSnapshot()).toEqual(before)
    expect(h.doc.crud.undoManager.isCanUndo()).toBeFalse()
    h.doc.crud.undoManager.redo()
    expect(h.doc.model.getParentId(h.paragraph.id)).toBe(h.target.id)
    h.doc.crud.undoManager.undo()
    expect(h.doc.model.getParentId(h.paragraph.id)).toBe(h.old.id)
    h.destroy()
  })

  it('rechecks owner permission and later user locks before both undo and redo', () => {
    const h = harness()
    applyDocumentStructurePlan(h.doc, h.plan)
    h.doc.config.authorizeStructureTransform = () => false
    h.doc.crud.undoManager.undo()
    expect(h.doc.model.getParentId(h.paragraph.id)).toBe(h.target.id)
    h.doc.config.authorizeStructureTransform = () => true
    const meta = h.yBlockMap.get(h.paragraph.id)!.get('meta')
    h.yDoc.transact(() => meta.set('lock', 'other'), 'remote')
    h.doc.crud.undoManager.undo()
    expect(h.doc.model.getParentId(h.paragraph.id)).toBe(h.target.id)
    h.yDoc.transact(() => meta.delete('lock'), 'remote')
    h.doc.crud.undoManager.undo()
    h.doc.config.authorizeStructureTransform = () => false
    h.doc.crud.undoManager.redo()
    expect(h.doc.model.getParentId(h.paragraph.id)).toBe(h.old.id)
    h.destroy()
  })

  for (const mode of ['permission', 'readonly', 'composition', 'tracking', 'user-lock', 'invalid-child', 'duplicate-id']) {
    it(`rejects ${mode} without any update or undo item`, () => {
      const h = harness()
      const mutable = h.doc as any
      if (mode === 'permission') mutable.config.authorizeStructureTransform = undefined
      if (mode === 'readonly') mutable.isReadonly = true
      if (mode === 'composition') mutable.inputManger.compositionSession.isActive = true
      if (mode === 'tracking') mutable.revisions = {isTracking: true}
      if (mode === 'user-lock') h.yDoc.transact(() => h.yBlockMap.get(h.old.id)!.get('meta').set('lock', 'someone'), 'remote')
      if (mode === 'invalid-child') { h.target.flavour = 'render-unit'; h.target.meta = {incl: ['image']} }
      if (mode === 'duplicate-id') h.plan.children.push(h.target)
      const before = Y.encodeStateAsUpdate(h.yDoc)
      const updated = jasmine.createSpy('update')
      h.yDoc.on('update', updated)
      expect(() => applyDocumentStructurePlan(h.doc, h.plan)).toThrow()
      expect(Y.encodeStateAsUpdate(h.yDoc)).toEqual(before)
      expect(updated).not.toHaveBeenCalled()
      expect(h.doc.crud.undoManager.isCanUndo()).toBeFalse()
      h.destroy()
    })
  }

  it('prepares a 2000-block template and still emits one update', () => {
    const h = harness()
    h.plan.children.push(...Array.from({length: 2000}, () => h.doc.schemas.createSnapshot('paragraph', ['默认正文'])))
    const updates = jasmine.createSpy('updates')
    h.yDoc.on('update', updates)
    const start = performance.now()
    applyDocumentStructurePlan(h.doc, h.plan)
    console.info('structure-transform-2000-blocks-ms', performance.now() - start)
    expect(updates).toHaveBeenCalledTimes(1)
    expect(h.doc.model.getChildrenIds(h.doc.rootId).length).toBe(2001)
    h.destroy()
  })

  it('syncs replacement and edits on retained text to another CRDT without recreating text', () => {
    const h = harness()
    const peer = new Y.Doc()
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(h.yDoc))
    const peerBlocks = peer.getMap<YBlock>('blocks')
    const peerText = peerBlocks.get(h.paragraph.id)!.get('children') as unknown as Y.Text
    const vector = Y.encodeStateVector(peer)
    applyDocumentStructurePlan(h.doc, h.plan)
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(h.yDoc, vector))
    expect(peerBlocks.get(h.paragraph.id)!.get('children') as unknown).toBe(peerText)
    peerText.insert(peerText.length, '协同')
    Y.applyUpdate(h.yDoc, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(h.yDoc)))
    expect((h.yBlockMap.get(h.paragraph.id)!.get('children') as unknown as Y.Text).toString()).toContain('协同')
    peer.destroy()
    h.destroy()
  })
})
