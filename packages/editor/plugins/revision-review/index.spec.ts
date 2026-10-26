import {BehaviorSubject, Subject} from 'rxjs'
import {
  ResolvedRevision,
  RevisionDecision,
  RevisionDomainChange,
  RevisionOverlapConflict,
  RevisionStateSnapshot,
} from '../../framework'
import {RevisionReviewPlugin} from './index'

const actor = {actorId: 'reviewer-a', displayName: 'Reviewer A'}

function revision(
  id: string,
  groupId: string,
  status: ResolvedRevision['status'] = 'pending',
  options: {
    blockId?: string
    kind?: ResolvedRevision['kind']
    createdAt?: string
  } = {},
): ResolvedRevision {
  return {
    id,
    groupId,
    kind: options.kind ?? 'text-insert',
    actor,
    createdAt: options.createdAt ?? `2026-08-27T00:00:0${id.length}.000Z`,
    target: {
      kind: 'text',
      blockId: options.blockId ?? 'paragraph-a',
      start: [1],
      end: [2],
    },
    dependsOn: [],
    status,
    activeDecisionIds: status === 'pending' ? [] : [`decision-${id}`],
  }
}

function createHarness(
  revisions: ResolvedRevision[],
  conflicts: RevisionOverlapConflict[] = [],
) {
  const state$ = new BehaviorSubject<RevisionStateSnapshot>({
    mode: 'track',
    viewMode: 'markup',
    revisions,
    conflicts,
    epoch: 3,
  })
  const change$ = new Subject<RevisionDomainChange>()
  const mode$ = new BehaviorSubject<RevisionStateSnapshot['mode']>('track')
  const viewMode$ = new BehaviorSubject<RevisionStateSnapshot['viewMode']>('markup')
  const decision = (
    item: ResolvedRevision,
    action: RevisionDecision['action'],
  ): RevisionDecision => ({
    id: `${action}-${item.id}`,
    revisionId: item.id,
    action,
    actor,
    createdAt: '2026-08-27T01:00:00.000Z',
    supersedes: [...item.activeDecisionIds],
  })
  const manager = {
    state$,
    change$,
    mode$,
    viewMode$,
    mode: 'track',
    viewMode: 'markup',
    epoch: 3,
    list: jasmine.createSpy('list').and.callFake(() =>
      [...state$.value.revisions]),
    listGroup: jasmine.createSpy('listGroup').and.callFake((groupId: string) =>
      state$.value.revisions.filter(item => item.groupId === groupId)),
    getOverlapConflicts: jasmine.createSpy('getOverlapConflicts').and.callFake(() =>
      [...state$.value.conflicts]),
    get: jasmine.createSpy('get').and.callFake((revisionId: string) => {
      const item = state$.value.revisions.find(value => value.id === revisionId)
      if (!item) throw new Error('missing revision')
      return item
    }),
    readRevisionContent: jasmine.createSpy('readRevisionContent')
      .and.callFake((revisionId: string) => `content:${revisionId}`),
    acceptGroup: jasmine.createSpy('acceptGroup').and.callFake((groupId: string) =>
      state$.value.revisions
        .filter(item => item.groupId === groupId)
        .map(item => decision(item, 'accept')),
    ),
    rejectGroup: jasmine.createSpy('rejectGroup').and.callFake((groupId: string) =>
      state$.value.revisions
        .filter(item => item.groupId === groupId)
        .map(item => decision(item, 'reject')),
    ),
    resolveOverlap: jasmine.createSpy('resolveOverlap').and.returnValue([]),
  }
  const plugin = new RevisionReviewPlugin()
  plugin.register({revisions: manager} as unknown as BlockCraft.Doc)
  const emit = (
    nextRevisions: ResolvedRevision[],
    change: RevisionDomainChange,
    nextConflicts = state$.value.conflicts,
  ) => {
    state$.next({...state$.value, revisions: nextRevisions, conflicts: nextConflicts})
    change$.next(change)
  }
  return {plugin, manager, state$, emit}
}

describe('RevisionReviewPlugin', () => {
  it('projects atomic revisions into headless review groups', () => {
    const first = revision('r1', 'group-a')
    const second = revision('r2', 'group-a', 'pending', {
      blockId: 'paragraph-b',
      kind: 'text-delete',
      createdAt: '2026-08-27T00:00:08.000Z',
    })
    second.dependsOn = ['r1']
    const third = revision('r3', 'group-b', 'accepted', {
      blockId: 'paragraph-c',
      kind: 'block-insert',
      createdAt: '2026-08-27T00:00:09.000Z',
    })
    const conflict: RevisionOverlapConflict = {
      id: 'overlap-a',
      revisionIds: ['r2', 'r3'],
      blockIds: ['paragraph-b', 'paragraph-c'],
      kind: 'structure-overlap',
    }
    const {plugin} = createHarness([first, second, third], [conflict])

    expect(plugin.state$.value.items.length).toBe(2)
    expect(plugin.state$.value.items[0]).toEqual(jasmine.objectContaining({
      id: 'group-a',
      revisionIds: ['r1', 'r2'],
      kinds: ['text-insert', 'text-delete'],
      blockIds: ['paragraph-a', 'paragraph-b'],
      dependsOn: ['r1'],
      overlapConflictIds: ['overlap-a'],
      status: 'pending',
    }))
    expect(plugin.state$.value.pendingItemCount).toBe(1)
    expect(plugin.state$.value.pendingRevisionCount).toBe(2)
    expect(plugin.state$.value.conflicts).toEqual([conflict])
    expect(plugin.list({blockId: 'paragraph-c'}).map(item => item.id))
      .toEqual(['group-b'])
    expect(plugin.list({kind: 'text-delete'}).map(item => item.id))
      .toEqual(['group-a'])
  })

  it('keeps navigation model-only and activates a group from a revision id', () => {
    const {plugin, manager} = createHarness([
      revision('r1', 'group-a'),
      revision('r2', 'group-b', 'accepted'),
      revision('r3', 'group-c'),
    ])

    expect(plugin.current).toBeNull()
    expect(plugin.activateRevision('r1').id).toBe('group-a')
    expect(manager.get).toHaveBeenCalledWith('r1')
    expect(plugin.next()?.id).toBe('group-b')
    expect(plugin.next()?.id).toBe('group-c')
    expect(plugin.next()?.id).toBe('group-a')
    expect(plugin.previous({query: {status: 'accepted'}})?.id).toBe('group-b')
    expect(plugin.next({query: {status: 'accepted'}, wrap: false})).toBeNull()
    expect(plugin.current?.id).toBe('group-b')
  })

  it('reads exact revision content without mounting a document view', () => {
    const {plugin, manager} = createHarness([
      revision('r1', 'group-a'),
      revision('r2', 'group-a', 'pending', {kind: 'text-delete'}),
    ])

    expect(plugin.readContent('group-a')).toEqual([
      {revisionId: 'r1', kind: 'text-insert', text: 'content:r1'},
      {revisionId: 'r2', kind: 'text-delete', text: 'content:r2'},
    ])
    expect(manager.readRevisionContent.calls.allArgs()).toEqual([['r1'], ['r2']])
  })

  it('maps keep and revert to group decisions without role or UI policy', () => {
    const {plugin, manager} = createHarness([
      revision('r1', 'group-a'),
      revision('r2', 'group-a'),
      revision('r3', 'group-b', 'rejected'),
    ])

    plugin.activate('group-a')
    expect(plugin.keep().map(decision => decision.action))
      .toEqual(['accept', 'accept'])
    expect(manager.acceptGroup).toHaveBeenCalledOnceWith('group-a')

    expect(plugin.revert('group-b').map(decision => decision.action))
      .toEqual(['reject'])
    expect(manager.rejectGroup).toHaveBeenCalledOnceWith('group-b')

    plugin.resolveOverlap('overlap-a', ['r1'])
    expect(manager.resolveOverlap).toHaveBeenCalledOnceWith('overlap-a', ['r1'])
  })

  it('fails closed when keep would silently accept a structural overlap', () => {
    const conflict: RevisionOverlapConflict = {
      id: 'overlap-a',
      revisionIds: ['r1', 'r2'],
      blockIds: ['paragraph-a'],
      kind: 'structure-overlap',
    }
    const {plugin, manager} = createHarness([
      revision('r1', 'group-a', 'pending', {kind: 'block-delete'}),
      revision('r2', 'group-b', 'pending', {kind: 'block-insert'}),
    ], [conflict])

    expect(() => plugin.keep('group-a')).toThrowError(/resolveOverlap/)
    expect(() => plugin.keepAll()).toThrowError(/resolveOverlap/)
    expect(manager.acceptGroup).not.toHaveBeenCalled()

    plugin.revert('group-a')
    expect(manager.rejectGroup).toHaveBeenCalledOnceWith('group-a')
  })

  it('defaults batch decisions to pending review groups', () => {
    const {plugin, manager} = createHarness([
      revision('r1', 'group-a'),
      revision('r2', 'group-a'),
      revision('r3', 'group-b', 'accepted'),
      revision('r4', 'group-c', 'rejected'),
    ])

    plugin.keepAll()
    expect(manager.acceptGroup.calls.allArgs()).toEqual([['group-a']])

    plugin.revertAll({})
    expect(manager.rejectGroup.calls.allArgs()).toEqual([
      ['group-a'],
      ['group-b'],
      ['group-c'],
    ])
  })

  it('clears a stale active item and unsubscribes on destroy', () => {
    const {plugin, state$, emit} = createHarness([
      revision('r1', 'group-a'),
      revision('r2', 'group-b'),
    ])
    plugin.activate('group-a')

    emit([revision('r2', 'group-b')], {
      kind: 'records',
      revisionIds: ['r1'],
      groupIds: ['group-a'],
      conflictsChanged: false,
    })
    expect(plugin.current).toBeNull()
    expect(plugin.state$.value.items.map(item => item.id)).toEqual(['group-b'])

    plugin.destroy()
    state$.next({...state$.value, revisions: []})
    expect(plugin.state$.value.items.map(item => item.id)).toEqual(['group-b'])
  })

  it('does not republish when only an indexed text target changes', () => {
    const original = revision('r1', 'group-a')
    const {plugin, emit} = createHarness([original])
    const states: unknown[] = []
    plugin.state$.subscribe(state => states.push(state))
    const initialCount = states.length
    const rewritten = {
      ...original,
      target: {...original.target, start: [9], end: [10]},
    } as ResolvedRevision

    emit([rewritten], {
      kind: 'records',
      revisionIds: ['r1'],
      groupIds: ['group-a'],
      conflictsChanged: false,
    })

    expect(states.length).toBe(initialCount)
    expect(plugin.state$.value.items[0].revisionIds).toEqual(['r1'])
  })
})
