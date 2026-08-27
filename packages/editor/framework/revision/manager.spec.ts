import * as Y from 'yjs'
import {BlockNodeType, IBlockSnapshot, NativeBlockModel, YBlock, native2YBlock} from '../block-std'
import {DocumentRevisionManager} from './manager'
import {
  RevisionActorRequiredError,
  RevisionConflictError,
} from './errors'
import {setAttributes} from '../block-std/inline/setAttributes'
import {subscribeRevisionPresentationChange} from './presentation-change'

const ROOT_ID = 'root'
const FIRST_ID = 'p1'
const SECOND_ID = 'p2'

describe('DocumentRevisionManager', () => {
  it('requires an explicit actor before tracking is enabled', () => {
    const harness = createHarness('abc', '', false)
    expect(() => harness.manager.setMode('track'))
      .toThrowError(RevisionActorRequiredError)
  })

  it('records a scoped revision Diff without enabling global tracking', () => {
    const harness = createHarness('abc', '', false)
    harness.manager.setActor({actorId: 'reviewer', displayName: 'Reviewer'})
    const modeChanges: string[] = []
    const subscription = harness.manager.mode$.subscribe(mode => modeChanges.push(mode))

    harness.manager.runAsRevision(
      {actorId: 'blockcraft-agent', displayName: 'BlockCraft AI'},
      () => {
        expect(harness.manager.isTracking).toBeTrue()
        expect(harness.manager.currentActor?.actorId).toBe('blockcraft-agent')
        harness.manager.runInGroup(() => {
          harness.manager.replaceText(FIRST_ID, 1, 1, 'X')
        })
      },
      {groupId: 'agent-diff'},
    )

    expect(harness.manager.mode).toBe('off')
    expect(harness.manager.isTracking).toBeFalse()
    expect(harness.manager.currentActor?.actorId).toBe('reviewer')
    expect(modeChanges).toEqual(['off'])
    expect(harness.manager.listGroup('agent-diff').map(item => item.actor.actorId))
      .toEqual(['blockcraft-agent', 'blockcraft-agent'])
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('aXc')
    subscription.unsubscribe()
  })

  it('restores scoped revision state when the mutation throws', () => {
    const harness = createHarness('abc', '', false)
    expect(() => harness.manager.runAsRevision(
      {actorId: 'blockcraft-agent'},
      () => {
        throw new Error('boom')
      },
    )).toThrowError('boom')

    expect(harness.manager.mode).toBe('off')
    expect(harness.manager.isTracking).toBeFalse()
    expect(harness.manager.currentActor).toBeNull()
  })

  it('projects pending and decided inline revisions without mutating raw content', () => {
    const harness = createHarness('abc', '')
    const insertId = harness.manager.insertText(FIRST_ID, 1, 'X')!
    const deleteId = harness.manager.deleteText(FIRST_ID, 3, 1)!

    expect(harness.text(FIRST_ID)).toBe('aXbc')
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('aXb')
    const inserted = harness.manager.projectInlineDeltas(FIRST_ID, [{insert: 'aXbc'}])
      .find(operation => operation.insert === 'X')
    const revisionElement = document.createElement('c-element')
    setAttributes(revisionElement, inserted?.attributes ?? {})
    expect(revisionElement.getAttribute('data-bc-revision-kind')).toBe('insert')
    expect(revisionElement.getAttribute('data-bc-revision-state')).toBe('pending')

    harness.manager.accept(insertId)
    harness.manager.reject(deleteId)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('aXbc')

    harness.manager.reject(insertId)
    harness.manager.accept(deleteId)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('ab')
    expect(harness.text(FIRST_ID)).toBe('aXbc')
  })

  it('applies an untrackable mixed Delta normally without creating a partial Diff', () => {
    const harness = createHarness('abc', '')

    harness.manager.applyDelta(FIRST_ID, [
      {retain: 1},
      {delete: 1},
      {insert: 'X'},
      {retain: 1, attributes: {'a:bold': true}},
    ])

    expect(harness.text(FIRST_ID)).toBe('aXc')
    expect(harness.manager.list()).toEqual([])
    expect(harness.yText(FIRST_ID).toDelta()).toEqual([
      {insert: 'aX'},
      {insert: 'c', attributes: {'a:bold': true}},
    ])
  })

  it('inserts an unsupported inline object normally without creating a Diff', () => {
    const harness = createHarness('abc', '')

    harness.manager.applyDelta(FIRST_ID, [
      {retain: 1},
      {insert: {mention: 'member-1'}},
    ])

    expect(harness.manager.list()).toEqual([])
    expect(harness.yText(FIRST_ID).toDelta()).toEqual([
      {insert: 'a'},
      {insert: {mention: 'member-1'}},
      {insert: 'bc'},
    ])
  })

  it('reads only the canonical content owned by a revision', () => {
    const insertion = createHarness('abc', '')
    const insertionId = insertion.manager.insertText(FIRST_ID, 1, 'XY')!
    expect(insertion.manager.readRevisionContent(insertionId)).toBe('XY')

    const deletion = createHarness('abc', '')
    const deletionId = deletion.manager.deleteText(FIRST_ID, 1, 1)!
    expect(deletion.manager.readRevisionContent(deletionId)).toBe('b')

    const wholeBlock = createHarness('first', 'second')
    const blockId = wholeBlock.manager.recordBlockDeletion([FIRST_ID], ROOT_ID)!
    expect(wholeBlock.manager.readRevisionContent(blockId)).toBe('first')
  })

  it('keeps exact content when consecutive typing expands one insertion', () => {
    const harness = createHarness('abc', '')
    harness.yDoc.transact(() => {
      harness.yText(FIRST_ID).insertEmbed(1, {type: 'test-embed'})
    })
    const revisionId = harness.manager.insertText(FIRST_ID, 4, ' ')!
    'REVIEW_UI'.split('').forEach(character => {
      harness.manager.insertText(
        FIRST_ID,
        harness.yText(FIRST_ID).length,
        character,
      )
    })

    expect(harness.manager.list({kind: 'text-insert'})).toHaveSize(1)
    expect(harness.manager.readRevisionContent(revisionId)).toBe(' REVIEW_UI')
  })

  it('publishes affected block ids for revision-only presentation changes', () => {
    const harness = createHarness('abc', '')
    const changes: string[][] = []
    const unsubscribe = subscribeRevisionPresentationChange(
      harness.manager,
      change => changes.push([...change.blockIds]),
    )

    const revisionId = harness.manager.deleteText(FIRST_ID, 1, 1)!
    expect(changes.at(-1)).toEqual([FIRST_ID])

    harness.manager.accept(revisionId)
    expect(changes.at(-1)).toEqual([FIRST_ID])

    harness.manager.setViewMode('final')
    expect(new Set(changes.at(-1))).toEqual(new Set([FIRST_ID, ROOT_ID]))

    unsubscribe()
  })

  it('publishes incremental domain changes and indexes revision groups', () => {
    const harness = createHarness('abc', '')
    const changes: Array<{
      kind: string
      revisionIds: readonly string[]
      groupIds: readonly string[]
    }> = []
    harness.manager.change$.subscribe(change => changes.push(change))

    const revisionId = harness.manager.insertText(FIRST_ID, 1, 'X')!
    const groupId = harness.manager.get(revisionId).groupId
    expect(changes.at(-1)).toEqual(jasmine.objectContaining({
      kind: 'records',
      revisionIds: [revisionId],
      groupIds: [groupId],
    }))
    expect(harness.manager.listGroup(groupId).map(item => item.id))
      .toEqual([revisionId])

    harness.manager.insertText(FIRST_ID, 2, 'Y')
    expect(changes.at(-1)?.groupIds).toEqual([groupId])
    expect(harness.manager.listGroup(groupId)).toHaveSize(1)

    harness.manager.accept(revisionId)
    expect(changes.at(-1)).toEqual(jasmine.objectContaining({
      kind: 'decisions',
      revisionIds: [revisionId],
      groupIds: [groupId],
    }))
    expect(harness.manager.listGroup(groupId)[0].status).toBe('accepted')
  })

  it('keeps replacement insertion outside the deletion attribution range', () => {
    const harness = createHarness('abc', '')
    harness.manager.replaceText(FIRST_ID, 1, 1, 'X')

    expect(harness.text(FIRST_ID)).toBe('aXbc')
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('aXc')
  })

  it('lets an author resize one pending insertion and stacks another author edit', () => {
    const harness = createHarness('abc', '')
    const revisionId = harness.manager.insertText(FIRST_ID, 1, 'X')!
    expect(harness.manager.insertText(FIRST_ID, 2, 'Y')).toBe(revisionId)
    expect(harness.manager.list()).toHaveSize(1)
    expect(harness.text(FIRST_ID)).toBe('aXYbc')

    harness.manager.setActor({actorId: 'author-b'})
    const nestedId = harness.manager.insertText(FIRST_ID, 2, 'Z')!
    expect(nestedId).not.toBe(revisionId)
    expect(harness.manager.get(nestedId).dependsOn).toEqual([revisionId])
    expect(harness.text(FIRST_ID)).toBe('aXZYbc')

    harness.manager.reject(revisionId)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('abc')
  })

  it('cancels an own pending insertion when the author deletes it again', () => {
    const harness = createHarness('abc', '')
    harness.manager.insertText(FIRST_ID, 1, 'XY')

    harness.manager.deleteText(FIRST_ID, 1, 2)

    expect(harness.text(FIRST_ID)).toBe('abc')
    expect(harness.manager.list()).toEqual([])
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('abc')
  })

  it('consumes the own pending-insert portion and marks only baseline text as deleted', () => {
    const harness = createHarness('abc', '')
    harness.manager.insertText(FIRST_ID, 1, 'X')

    harness.manager.deleteText(FIRST_ID, 1, 2)

    expect(harness.text(FIRST_ID)).toBe('abc')
    expect(harness.manager.list({kind: 'text-insert'})).toEqual([])
    expect(harness.manager.list({kind: 'text-delete'})).toHaveSize(1)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('ac')
  })

  it('consumes multiple own pending insertions covered by one deletion gesture', () => {
    const harness = createHarness('abc', '')
    harness.manager.insertText(FIRST_ID, 1, 'X')
    harness.manager.insertText(FIRST_ID, 3, 'Y')

    harness.manager.deleteText(FIRST_ID, 1, 3)

    expect(harness.text(FIRST_ID)).toBe('abc')
    expect(harness.manager.list({kind: 'text-insert'})).toEqual([])
    expect(harness.manager.list({kind: 'text-delete'})).toHaveSize(1)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('ac')
  })

  it('replaces own pending content without leaving an insert-delete overlay', () => {
    const harness = createHarness('abc', '')
    harness.manager.insertText(FIRST_ID, 1, 'X')

    harness.manager.replaceText(FIRST_ID, 1, 2, 'Q')

    expect(harness.text(FIRST_ID)).toBe('aQbc')
    expect(harness.manager.list({kind: 'text-insert'})).toHaveSize(1)
    expect(harness.manager.list({kind: 'text-delete'})).toHaveSize(1)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('aQc')
  })

  it('keeps an accepted insertion immutable and records a later deletion', () => {
    const harness = createHarness('abc', '')
    const insertionId = harness.manager.insertText(FIRST_ID, 1, 'X')!
    harness.manager.accept(insertionId)

    harness.manager.deleteText(FIRST_ID, 1, 1)

    expect(harness.text(FIRST_ID)).toBe('aXbc')
    expect(harness.manager.list({kind: 'text-insert'})).toHaveSize(1)
    expect(harness.manager.list({kind: 'text-delete'})).toHaveSize(1)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('abc')
  })

  it('splits an overlapping deletion at dependency boundaries', () => {
    const harness = createHarness('abc', '')
    const insertionId = harness.manager.insertText(FIRST_ID, 1, 'X')!

    harness.manager.setActor({actorId: 'author-b'})
    harness.manager.deleteText(FIRST_ID, 1, 2)
    const deletions = harness.manager.list({kind: 'text-delete'})

    expect(deletions).toHaveSize(2)
    expect(new Set(deletions.map(record => record.groupId)).size).toBe(1)
    expect(deletions.map(record => record.dependsOn)).toContain([insertionId])
    expect(deletions.map(record => record.dependsOn)).toContain([])

    harness.manager.reject(insertionId)
    deletions.forEach(record => harness.manager.reject(record.id))
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('abc')
  })

  it('keeps a replacement across inserted and original text in one review group', () => {
    const harness = createHarness('abc', '')
    const outerInsertion = harness.manager.insertText(FIRST_ID, 1, 'X')!
    harness.manager.setActor({actorId: 'author-b'})

    const replacementIds = harness.manager.replaceText(FIRST_ID, 1, 2, 'Q')
    const replacement = replacementIds.map(id => harness.manager.get(id))
    expect(replacement).toHaveSize(3)
    expect(new Set(replacement.map(record => record.groupId)).size).toBe(1)
    expect(harness.text(FIRST_ID)).toBe('aQXbc')

    harness.manager.reject(outerInsertion)
    harness.manager.acceptGroup(replacement[0].groupId)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('aQc')
  })

  it('reuses an active own deletion instead of stacking the same diff again', () => {
    const harness = createHarness('abc', '')
    const firstDeletion = harness.manager.deleteText(FIRST_ID, 1, 1)!

    expect(harness.manager.deleteText(FIRST_ID, 1, 1)).toBe(firstDeletion)
    expect(harness.manager.list({kind: 'text-delete'})).toHaveSize(1)

    harness.manager.accept(firstDeletion)
    expect(harness.manager.deleteText(FIRST_ID, 1, 1)).toBe(firstDeletion)
    expect(harness.manager.list({kind: 'text-delete'})).toHaveSize(1)
  })

  it('records only the uncovered suffix when an own deletion is extended', () => {
    const harness = createHarness('abcde', '')
    const firstDeletion = harness.manager.deleteText(FIRST_ID, 1, 2)!

    const extensionId = harness.manager.deleteText(FIRST_ID, 1, 3)!
    const deletions = harness.manager.list({kind: 'text-delete'})

    expect(extensionId).toBe(firstDeletion)
    expect(deletions).toHaveSize(2)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('ae')
  })

  it('creates a fresh deletion after the previous own proposal was rejected', () => {
    const harness = createHarness('abc', '')
    const rejectedId = harness.manager.deleteText(FIRST_ID, 1, 1)!
    harness.manager.reject(rejectedId)

    const retryId = harness.manager.deleteText(FIRST_ID, 1, 1)!

    expect(retryId).not.toBe(rejectedId)
    expect(harness.manager.list({kind: 'text-delete'})).toHaveSize(2)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('ac')
  })

  it('keeps overlapping deletions independently reviewable', () => {
    const harness = createHarness('abc', '')
    const firstDeletion = harness.manager.deleteText(FIRST_ID, 1, 1)!

    harness.manager.setActor({actorId: 'author-b'})
    const secondDeletion = harness.manager.deleteText(FIRST_ID, 1, 1)!
    expect(harness.manager.get(secondDeletion).dependsOn).toEqual([firstDeletion])

    harness.manager.reject(firstDeletion)
    harness.manager.accept(secondDeletion)
    expect(snapshotText(harness.manager.projectFinalSnapshot(), FIRST_ID)).toBe('ac')
  })

  it('reuses an active own whole-block deletion and records only new block targets', () => {
    const harness = createHarness('first', 'second')
    const firstDeletion = harness.manager.recordBlockDeletion([FIRST_ID], ROOT_ID)!

    expect(harness.manager.recordBlockDeletion([FIRST_ID], ROOT_ID)).toBe(firstDeletion)
    const extensionId = harness.manager.recordBlockDeletion(
      [FIRST_ID, SECOND_ID],
      ROOT_ID,
    )!
    const deletions = harness.manager.list({kind: 'block-delete'})

    expect(extensionId).not.toBe(firstDeletion)
    expect(deletions).toHaveSize(2)
    expect(deletions.find(record => record.id === extensionId)?.target).toEqual({
      kind: 'block',
      blockIds: [SECOND_ID],
      parentId: ROOT_ID,
    })
  })

  it('keeps another author whole-block deletion independently reviewable', () => {
    const harness = createHarness('first', 'second')
    const firstDeletion = harness.manager.recordBlockDeletion([FIRST_ID], ROOT_ID)!
    harness.manager.setActor({actorId: 'author-b'})

    const secondDeletion = harness.manager.recordBlockDeletion([FIRST_ID], ROOT_ID)!

    expect(secondDeletion).not.toBe(firstDeletion)
    expect(harness.manager.list({kind: 'block-delete'})).toHaveSize(2)
    expect(harness.manager.get(secondDeletion).dependsOn).toContain(firstDeletion)
  })

  it('does not let a rejected nested deletion override the pending insertion mark', () => {
    const harness = createHarness('abc', '')
    harness.manager.insertText(FIRST_ID, 1, 'X')
    harness.manager.setActor({actorId: 'author-b'})
    const deletionId = harness.manager.deleteText(FIRST_ID, 1, 1)!
    harness.manager.reject(deletionId)

    const inserted = harness.manager.projectInlineDeltas(
      FIRST_ID,
      [{insert: harness.text(FIRST_ID)}],
    ).find(operation => operation.insert === 'X')
    const revisionElement = document.createElement('c-element')
    setAttributes(revisionElement, inserted?.attributes ?? {})

    expect(revisionElement.getAttribute('data-bc-revision-kind')).toBe('insert')
    expect(revisionElement.getAttribute('data-bc-revision-state')).toBe('pending')
  })

  it('does not destructively resize an own insertion across a nested revision', () => {
    const harness = createHarness('abc', '')
    const outerId = harness.manager.insertText(FIRST_ID, 1, 'XY')!
    harness.manager.setActor({actorId: 'author-b'})
    const innerId = harness.manager.insertText(FIRST_ID, 2, 'Z')!

    harness.manager.setActor({actorId: 'author-a'})
    const deletionId = harness.manager.deleteText(FIRST_ID, 2, 1)!

    expect(deletionId).not.toBe(outerId)
    expect(deletionId).not.toBe(innerId)
    expect(harness.text(FIRST_ID)).toBe('aXZYbc')
    expect(harness.manager.get(deletionId).dependsOn).toEqual([innerId, outerId].sort())
  })

  it('converges opposite offline decisions to conflict and allows explicit redecision', () => {
    const first = createHarness('abc', '')
    const revisionId = first.manager.insertText(FIRST_ID, 3, '!')!
    const seed = Y.encodeStateAsUpdate(first.yDoc)
    const second = createHarness('', '')
    Y.applyUpdate(second.yDoc, seed)
    second.manager.setActor({actorId: 'reviewer-b'})

    first.manager.accept(revisionId)
    second.manager.reject(revisionId)
    exchange(first.yDoc, second.yDoc)

    expect(first.manager.get(revisionId).status).toBe('conflict')
    expect(second.manager.get(revisionId).status).toBe('conflict')
    expect(() => first.manager.projectFinalSnapshot()).toThrowError(RevisionConflictError)

    first.manager.redecide(revisionId, 'accept')
    exchange(first.yDoc, second.yDoc)
    expect(first.manager.get(revisionId).status).toBe('accepted')
    expect(second.manager.get(revisionId).status).toBe('accepted')
  })

  it('reopens a decision conflict when a late offline head arrives', () => {
    const first = createHarness('abc', '')
    const revisionId = first.manager.insertText(FIRST_ID, 3, '!')!
    const seed = Y.encodeStateAsUpdate(first.yDoc)
    const late = createHarness('', '')
    Y.applyUpdate(late.yDoc, seed)
    late.manager.setActor({actorId: 'late-reviewer'})

    first.manager.accept(revisionId)
    first.manager.redecide(revisionId, 'accept')
    late.manager.reject(revisionId)
    exchange(first.yDoc, late.yDoc)

    expect(first.manager.get(revisionId).status).toBe('conflict')
    expect(late.manager.get(revisionId).status).toBe('conflict')
  })

  it('surfaces concurrent destructive structural overlap instead of choosing a winner', () => {
    const first = createHarness('left', 'right')
    const seed = Y.encodeStateAsUpdate(first.yDoc)
    const second = createHarness('', '')
    Y.applyUpdate(second.yDoc, seed)
    second.manager.setActor({actorId: 'author-b'})

    first.yDoc.transact(() => {
      first.manager.recordBlockDeletion([FIRST_ID], ROOT_ID)
    })
    second.yDoc.transact(() => {
      second.manager.recordBoundary('block-merge', ROOT_ID, FIRST_ID, SECOND_ID)
    })
    exchange(first.yDoc, second.yDoc)

    expect(first.manager.getOverlapConflicts().length).toBe(1)
    expect(() => first.manager.projectFinalSnapshot()).toThrowError(RevisionConflictError)
  })

  it('materializes only fully decided content at a matching checkpoint', () => {
    const harness = createHarness('abc', '')
    const revisionId = harness.manager.deleteText(FIRST_ID, 1, 1)!
    harness.manager.accept(revisionId)
    const compacted = harness.manager.compactResolved({
      epoch: 0,
      stateVector: Y.encodeStateVector(harness.yDoc),
    })

    expect(harness.text(FIRST_ID)).toBe('ac')
    expect(compacted.revisionEpoch).toBe(1)
    expect(compacted.revisions).toEqual([])
    expect(compacted.decisions).toEqual([])
  })

  it('round-trips a complete document snapshot with revision decisions', () => {
    const source = createHarness('abc', '')
    const revisionId = source.manager.insertText(FIRST_ID, 1, 'X')!
    source.manager.reject(revisionId)
    const snapshot = source.manager.exportDocumentSnapshot()

    const restored = createHarness('aXbc', '')
    restored.manager.importDocumentSnapshot(snapshot)

    expect(restored.manager.get(revisionId).status).toBe('rejected')
    expect(snapshotText(restored.manager.projectFinalSnapshot(), FIRST_ID)).toBe('abc')
  })
})

function createHarness(firstText: string, secondText: string, withActor = true) {
  const yDoc = new Y.Doc({gc: false})
  const yBlockMap = yDoc.getMap<YBlock>('blocks')
  const root = containerYBlock(ROOT_ID, [FIRST_ID, SECOND_ID])
  const first = editableYBlock(FIRST_ID, firstText)
  const second = editableYBlock(SECOND_ID, secondText)
  yDoc.transact(() => {
    yBlockMap.set(ROOT_ID, root)
    yBlockMap.set(FIRST_ID, first)
    yBlockMap.set(SECOND_ID, second)
  })

  let manager!: DocumentRevisionManager
  const doc: any = {
    yDoc,
    yBlockMap,
    rootId: ROOT_ID,
    isInitialized: true,
    onDestroy: () => undefined,
    vm: {get: () => undefined},
    model: {
      exists: (id: string) => yBlockMap.has(id),
      getParentId: (id: string) => id === ROOT_ID ? null : ROOT_ID,
      getChildrenIds: (id: string) => id === ROOT_ID ? [FIRST_ID, SECOND_ID] : [],
      toSnapshot: (id: string) => {
        if (id === ROOT_ID) return exportRoot(yBlockMap)
        const block = yBlockMap.get(id)
        if (!block) return null
        return {
          id,
          flavour: 'paragraph',
          nodeType: BlockNodeType.editable,
          props: {},
          meta: {},
          children: (block.get('children') as unknown as Y.Text).toDelta(),
        } as IBlockSnapshot
      },
    },
    crud: {
      undoManager: null,
      transact: (callback: () => void, origin: unknown = null) =>
        yDoc.transact(callback, origin),
      deleteBlockById: (id: string) => {
        const children = root.get('children') as Y.Array<string>
        const index = children.toArray().indexOf(id)
        if (index >= 0) children.delete(index, 1)
        yBlockMap.delete(id)
      },
    },
    exportSnapshot: () => exportRoot(yBlockMap),
  }
  manager = new DocumentRevisionManager(doc, withActor ? {
    actor: {actorId: 'author-a', displayName: 'Author A'},
    mode: 'track',
  } : undefined)
  doc.revisions = manager
  return {
    yDoc,
    manager,
    text: (id: string) =>
      (yBlockMap.get(id)!.get('children') as unknown as Y.Text).toString(),
    yText: (id: string) =>
      yBlockMap.get(id)!.get('children') as unknown as Y.Text,
  }
}

function containerYBlock(id: string, children: string[]): YBlock {
  return native2YBlock({
    id,
    flavour: 'root',
    nodeType: BlockNodeType.root,
    props: {},
    meta: {},
    children,
  } as NativeBlockModel)
}

function editableYBlock(id: string, text: string): YBlock {
  return native2YBlock({
    id,
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    props: {},
    meta: {},
    children: text ? [{insert: text}] : [],
  } as NativeBlockModel)
}

function exportRoot(yBlockMap: Y.Map<YBlock>): IBlockSnapshot {
  const root = yBlockMap.get(ROOT_ID)!
  const childIds = (root.get('children') as Y.Array<string>).toArray()
  return {
    id: ROOT_ID,
    flavour: 'root',
    nodeType: BlockNodeType.root,
    props: {},
    meta: {},
    children: childIds.map(id => {
      const block = yBlockMap.get(id)!
      return {
        id,
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        meta: {},
        children: (block.get('children') as unknown as Y.Text).toDelta(),
      } as IBlockSnapshot
    }),
  }
}

function snapshotText(snapshot: IBlockSnapshot, blockId: string): string {
  if (snapshot.nodeType !== BlockNodeType.root && snapshot.nodeType !== BlockNodeType.block) {
    return ''
  }
  const block = snapshot.children.find(child => child.id === blockId)
  if (!block || block.nodeType !== BlockNodeType.editable) return ''
  return block.children.map(delta =>
    typeof delta.insert === 'string' ? delta.insert : '\ufffc').join('')
}

function exchange(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left)
  const rightUpdate = Y.encodeStateAsUpdate(right)
  Y.applyUpdate(left, rightUpdate)
  Y.applyUpdate(right, leftUpdate)
}
