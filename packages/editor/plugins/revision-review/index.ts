import {BehaviorSubject, skip, Subscription} from 'rxjs'
import {
  DocPlugin,
  ResolvedRevision,
  RevisionActorSnapshot,
  RevisionDecision,
  RevisionDomainChange,
  RevisionKind,
  RevisionListQuery,
  RevisionMode,
  RevisionNotFoundError,
  RevisionOverlapError,
  RevisionOverlapConflict,
  RevisionStatus,
  RevisionViewMode,
} from '../../framework'

export type RevisionReviewCommand = 'keep' | 'revert'

/** One review card/domain operation. Its `id` is the Revision `groupId`. */
export interface RevisionReviewItem {
  readonly id: string
  readonly revisionIds: readonly string[]
  readonly kinds: readonly RevisionKind[]
  readonly actors: readonly RevisionActorSnapshot[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly status: RevisionStatus
  readonly blockIds: readonly string[]
  readonly dependsOn: readonly string[]
  readonly activeDecisionIds: readonly string[]
  readonly overlapConflictIds: readonly string[]
}

/** Exact canonical content for one atomic revision in a review group. */
export interface RevisionReviewContentSegment {
  readonly revisionId: string
  readonly kind: RevisionKind
  readonly text: string
}

export interface RevisionReviewQuery extends RevisionListQuery {
  blockId?: string
}

export interface RevisionReviewNavigationOptions {
  query?: RevisionReviewQuery
  /** Defaults to true. */
  wrap?: boolean
}

export interface RevisionReviewState {
  readonly mode: RevisionMode
  readonly viewMode: RevisionViewMode
  readonly epoch: number
  readonly items: readonly RevisionReviewItem[]
  readonly activeItemId: string | null
  readonly activeItem: RevisionReviewItem | null
  readonly activeIndex: number
  readonly pendingItemCount: number
  readonly pendingRevisionCount: number
  readonly conflicts: readonly RevisionOverlapConflict[]
}

const EMPTY_STATE: RevisionReviewState = {
  mode: 'off',
  viewMode: 'markup',
  epoch: 0,
  items: [],
  activeItemId: null,
  activeItem: null,
  activeIndex: -1,
  pendingItemCount: 0,
  pendingRevisionCount: 0,
  conflicts: [],
}

/**
 * Headless review command/state layer over `doc.revisions`.
 *
 * It owns no Angular component, DOM, Overlay, role or permission policy.
 * Hosts may bind any UI to `state$`, activate an item, then call `keep()` or
 * `revert()`. Review decisions remain append-only and CRDT-owned by the
 * document Revision domain.
 */
export class RevisionReviewPlugin extends DocPlugin {
  override name = 'revision-review'

  readonly state$ = new BehaviorSubject<RevisionReviewState>(EMPTY_STATE)

  private _subscription = Subscription.EMPTY
  private _items: RevisionReviewItem[] = []
  private _itemIndex = new Map<string, number>()
  private _revisionToGroup = new Map<string, string>()
  private _pendingRevisionsByGroup = new Map<string, number>()
  private _activeItemId: string | null = null
  private _pendingItemCount = 0
  private _pendingRevisionCount = 0
  private _conflicts: readonly RevisionOverlapConflict[] = []
  private _mode: RevisionMode = 'off'
  private _viewMode: RevisionViewMode = 'markup'
  private _epoch = 0
  private _ready = false

  override init(): void {
    this._subscription.unsubscribe()
    this._ready = true
    const manager = this.doc.revisions
    this._mode = manager.mode
    this._viewMode = manager.viewMode
    this._epoch = manager.epoch
    this._conflicts = manager.getOverlapConflicts().map(cloneConflict)
    this._replaceAll(manager.list())
    this._publish()

    this._subscription = new Subscription()
    this._subscription.add(
      manager.change$.subscribe(change => this._onDomainChange(change)),
    )
    this._subscription.add(
      manager.mode$.pipe(skip(1)).subscribe(mode => {
        this._mode = mode
        this._publish()
      }),
    )
    this._subscription.add(
      manager.viewMode$.pipe(skip(1)).subscribe(viewMode => {
        this._viewMode = viewMode
        this._publish()
      }),
    )
  }

  override destroy(): void {
    if (!this._ready) return
    this._ready = false
    this._subscription.unsubscribe()
    this._items = []
    this._itemIndex.clear()
    this._revisionToGroup.clear()
    this._pendingRevisionsByGroup.clear()
    this._activeItemId = null
    this._pendingItemCount = 0
    this._pendingRevisionCount = 0
    this._conflicts = []
    if (!this.state$.closed) this.state$.complete()
  }

  get current(): RevisionReviewItem | null {
    return this.state$.value.activeItem
  }

  list(query: RevisionReviewQuery = {}): readonly RevisionReviewItem[] {
    this._assertReady()
    const statuses = toSet(query.status)
    const kinds = toSet(query.kind)
    return this._items.filter(item => {
      if (statuses && !statuses.has(item.status)) return false
      if (kinds && !item.kinds.some(kind => kinds.has(kind))) return false
      if (query.actorId && !item.actors.some(actor => actor.actorId === query.actorId)) {
        return false
      }
      if (query.blockId && !item.blockIds.includes(query.blockId)) return false
      return true
    })
  }

  /**
   * Reads model-only content for a review group. It never mounts block views or
   * scans unrelated document content, so virtualized hosts can call it lazily.
   */
  readContent(itemId?: string): readonly RevisionReviewContentSegment[] {
    const item = this._requireItem(itemId)
    return item.revisionIds.map(revisionId => {
      const revision = this.doc.revisions.get(revisionId)
      return {
        revisionId,
        kind: revision.kind,
        text: this.doc.revisions.readRevisionContent(revisionId),
      }
    })
  }

  activate(itemId: string | null): RevisionReviewItem | null {
    this._assertReady()
    if (itemId === null) {
      this._activeItemId = null
      this._publish()
      return null
    }
    const index = this._itemIndex.get(itemId)
    if (index === undefined) {
      throw new RevisionNotFoundError(`修订评审项不存在：${itemId}`)
    }
    this._activeItemId = itemId
    this._publish()
    return this._items[index]
  }

  activateRevision(revisionId: string): RevisionReviewItem {
    this._assertReady()
    const revision = this.doc.revisions.get(revisionId)
    return this.activate(revision.groupId)!
  }

  next(options: RevisionReviewNavigationOptions = {}): RevisionReviewItem | null {
    return this._move(1, options)
  }

  previous(options: RevisionReviewNavigationOptions = {}): RevisionReviewItem | null {
    return this._move(-1, options)
  }

  /** Keep the proposed change. Maps to an accept/redecide decision. */
  keep(itemId?: string): RevisionDecision[] {
    const item = this._requireItem(itemId)
    this._assertNoStructuralOverlap(item)
    return this.doc.revisions.acceptGroup(item.id)
  }

  /** Revert the proposed change. Maps to a reject/redecide decision. */
  revert(itemId?: string): RevisionDecision[] {
    const item = this._requireItem(itemId)
    return this.doc.revisions.rejectGroup(item.id)
  }

  /** Defaults to pending review items only. */
  keepAll(query: RevisionReviewQuery = {status: 'pending'}): RevisionDecision[] {
    return this._decideAll('keep', query)
  }

  /** Defaults to pending review items only. */
  revertAll(query: RevisionReviewQuery = {status: 'pending'}): RevisionDecision[] {
    return this._decideAll('revert', query)
  }

  resolveOverlap(
    conflictId: string,
    keepRevisionIds: readonly string[],
  ): RevisionDecision[] {
    this._assertReady()
    return this.doc.revisions.resolveOverlap(conflictId, keepRevisionIds)
  }

  private _move(
    direction: 1 | -1,
    options: RevisionReviewNavigationOptions,
  ): RevisionReviewItem | null {
    const candidates = this.list(options.query)
    if (!candidates.length) return null
    const currentIndex = candidates.findIndex(
      item => item.id === this._activeItemId,
    )
    if (currentIndex < 0) {
      return this.activate(direction > 0 ? candidates[0].id : candidates.at(-1)!.id)
    }
    const targetIndex = currentIndex + direction
    if (targetIndex >= 0 && targetIndex < candidates.length) {
      return this.activate(candidates[targetIndex].id)
    }
    if (options.wrap === false) return null
    return this.activate(direction > 0 ? candidates[0].id : candidates.at(-1)!.id)
  }

  private _decideAll(
    action: RevisionReviewCommand,
    query: RevisionReviewQuery,
  ): RevisionDecision[] {
    this._assertReady()
    const items = this.list(query)
    if (action === 'keep') {
      items.forEach(item => this._assertNoStructuralOverlap(item))
    }
    const decisions: RevisionDecision[] = []
    items.forEach(item => {
      decisions.push(...(
        action === 'keep'
          ? this.doc.revisions.acceptGroup(item.id)
          : this.doc.revisions.rejectGroup(item.id)
      ))
    })
    return decisions
  }

  private _requireItem(itemId?: string): RevisionReviewItem {
    this._assertReady()
    const id = itemId ?? this._activeItemId
    if (!id) throw new RevisionNotFoundError('当前没有活动修订评审项')
    const index = this._itemIndex.get(id)
    if (index === undefined) {
      throw new RevisionNotFoundError(`修订评审项不存在：${id}`)
    }
    return this._items[index]
  }

  private _assertReady(): void {
    if (!this._ready) {
      throw new Error('RevisionReviewPlugin 尚未注册到文档')
    }
  }

  private _assertNoStructuralOverlap(item: RevisionReviewItem): void {
    if (!item.overlapConflictIds.length) return
    throw new RevisionOverlapError(
      `修订评审项 ${item.id} 存在结构冲突，必须通过 resolveOverlap() 选择要接收的一侧`,
    )
  }

  private _publish(): void {
    if (!this._ready || this.state$.closed) return
    const activeIndex = this._activeItemId === null
      ? -1
      : (this._itemIndex.get(this._activeItemId) ?? -1)
    const activeItem = activeIndex < 0 ? null : this._items[activeIndex]
    this.state$.next({
      mode: this._mode,
      viewMode: this._viewMode,
      epoch: this._epoch,
      items: this._items,
      activeItemId: activeItem?.id ?? null,
      activeItem,
      activeIndex,
      pendingItemCount: this._pendingItemCount,
      pendingRevisionCount: this._pendingRevisionCount,
      conflicts: this._conflicts,
    })
  }

  private _onDomainChange(change: RevisionDomainChange): void {
    this._epoch = this.doc.revisions.epoch
    const affectedGroups = new Set(change.groupIds)
    if (change.conflictsChanged) {
      conflictGroupIds(this._conflicts, this._revisionToGroup)
        .forEach(id => affectedGroups.add(id))
    }

    let itemsChanged = false
    change.groupIds.forEach(groupId => {
      itemsChanged = this._refreshGroup(groupId) || itemsChanged
    })

    let conflictsChanged = false
    if (change.conflictsChanged) {
      const nextConflicts = this.doc.revisions.getOverlapConflicts().map(cloneConflict)
      conflictsChanged = !conflictListsEqual(this._conflicts, nextConflicts)
      this._conflicts = nextConflicts
      conflictGroupIds(this._conflicts, this._revisionToGroup)
        .forEach(id => affectedGroups.add(id))
      affectedGroups.forEach(groupId => {
        itemsChanged = this._refreshGroup(groupId) || itemsChanged
      })
    }

    if (itemsChanged) this._recountPending()
    if (itemsChanged || conflictsChanged || change.kind === 'meta') {
      if (
        this._activeItemId !== null &&
        !this._itemIndex.has(this._activeItemId)
      ) {
        this._activeItemId = null
      }
      this._publish()
    }
  }

  private _replaceAll(revisions: readonly ResolvedRevision[]): void {
    this._items = [...buildReviewItems(revisions, this._conflicts)]
    this._itemIndex = new Map(this._items.map((item, index) => [item.id, index]))
    this._revisionToGroup.clear()
    this._pendingRevisionsByGroup.clear()
    this._items.forEach(item => item.revisionIds.forEach(
      revisionId => this._revisionToGroup.set(revisionId, item.id),
    ))
    const grouped = new Map<string, number>()
    revisions.forEach(revision => {
      if (revision.status !== 'pending') return
      grouped.set(revision.groupId, (grouped.get(revision.groupId) ?? 0) + 1)
    })
    grouped.forEach((count, groupId) =>
      this._pendingRevisionsByGroup.set(groupId, count))
    this._recountPending()
  }

  private _refreshGroup(groupId: string): boolean {
    const records = this.doc.revisions.listGroup(groupId)
    const previousIndex = this._itemIndex.get(groupId)
    const previous = previousIndex === undefined
      ? null
      : this._items[previousIndex]
    previous?.revisionIds.forEach(revisionId => {
      if (this._revisionToGroup.get(revisionId) === groupId) {
        this._revisionToGroup.delete(revisionId)
      }
    })
    records.forEach(record => this._revisionToGroup.set(record.id, groupId))
    const pendingRevisionCount = records.filter(
      record => record.status === 'pending',
    ).length
    if (pendingRevisionCount) {
      this._pendingRevisionsByGroup.set(groupId, pendingRevisionCount)
    } else {
      this._pendingRevisionsByGroup.delete(groupId)
    }

    if (!records.length) {
      if (previousIndex === undefined) return false
      const next = [...this._items]
      next.splice(previousIndex, 1)
      this._items = next
      this._itemIndex.delete(groupId)
      this._reindexFrom(previousIndex)
      return true
    }

    const nextItem = buildReviewItem(
      groupId,
      records,
      conflictIdsByRevision(this._conflicts),
    )
    if (previous && reviewItemsEqual(previous, nextItem)) return false

    const next = [...this._items]
    if (previousIndex !== undefined) {
      next[previousIndex] = nextItem
      this._items = next
      return true
    }

    const insertionIndex = next.findIndex(item =>
      compareReviewItems(nextItem, item) < 0,
    )
    const index = insertionIndex < 0 ? next.length : insertionIndex
    next.splice(index, 0, nextItem)
    this._items = next
    this._reindexFrom(index)
    return true
  }

  private _reindexFrom(index: number): void {
    for (let current = index; current < this._items.length; current += 1) {
      this._itemIndex.set(this._items[current].id, current)
    }
  }

  private _recountPending(): void {
    this._pendingItemCount = this._items.filter(item => item.status === 'pending').length
    this._pendingRevisionCount = this._items.reduce(
      (count, item) => count + (this._pendingRevisionsByGroup.get(item.id) ?? 0),
      0,
    )
  }
}

function buildReviewItems(
  revisions: readonly ResolvedRevision[],
  conflicts: readonly RevisionOverlapConflict[],
): readonly RevisionReviewItem[] {
  const grouped = new Map<string, ResolvedRevision[]>()
  revisions.forEach(revision => {
    const records = grouped.get(revision.groupId) ?? []
    records.push(revision)
    grouped.set(revision.groupId, records)
  })

  const conflictsByRevision = conflictIdsByRevision(conflicts)
  return [...grouped.entries()]
    .map(([groupId, records]) =>
      buildReviewItem(groupId, records, conflictsByRevision))
    .sort(compareReviewItems)
}

function buildReviewItem(
  groupId: string,
  records: readonly ResolvedRevision[],
  conflictsByRevision: ReadonlyMap<string, ReadonlySet<string>>,
): RevisionReviewItem {
  const actorById = new Map<string, RevisionActorSnapshot>()
  const kinds = new Set<RevisionKind>()
  const blockIds = new Set<string>()
  const dependsOn = new Set<string>()
  const activeDecisionIds = new Set<string>()
  const overlapConflictIds = new Set<string>()
  records.forEach(record => {
    if (!actorById.has(record.actor.actorId)) {
      actorById.set(record.actor.actorId, cloneActor(record.actor))
    }
    kinds.add(record.kind)
    revisionBlockIds(record).forEach(id => blockIds.add(id))
    record.dependsOn.forEach(id => dependsOn.add(id))
    record.activeDecisionIds.forEach(id => activeDecisionIds.add(id))
    ;[...(conflictsByRevision.get(record.id) ?? [])]
      .forEach(id => overlapConflictIds.add(id))
  })
  const timestamps = records.map(record => record.createdAt).sort()
  return {
    id: groupId,
    revisionIds: records.map(record => record.id),
    kinds: [...kinds],
    actors: [...actorById.values()],
    createdAt: timestamps[0],
    updatedAt: timestamps.at(-1)!,
    status: mergeStatus(records),
    blockIds: [...blockIds],
    dependsOn: [...dependsOn].sort(),
    activeDecisionIds: [...activeDecisionIds].sort(),
    overlapConflictIds: [...overlapConflictIds].sort(),
  }
}

function mergeStatus(revisions: readonly ResolvedRevision[]): RevisionStatus {
  const statuses = new Set(revisions.map(revision => revision.status))
  if (statuses.has('conflict') || statuses.size > 1) return 'conflict'
  return revisions[0].status
}

function revisionBlockIds(revision: ResolvedRevision): readonly string[] {
  if (revision.target.kind === 'text') return [revision.target.blockId]
  if (revision.target.kind === 'block') return revision.target.blockIds
  return [revision.target.leftBlockId, revision.target.rightBlockId]
}

function cloneActor(actor: RevisionActorSnapshot): RevisionActorSnapshot {
  return {...actor}
}

function cloneConflict(conflict: RevisionOverlapConflict): RevisionOverlapConflict {
  return {
    ...conflict,
    revisionIds: [...conflict.revisionIds],
    blockIds: [...conflict.blockIds],
  }
}

function conflictIdsByRevision(
  conflicts: readonly RevisionOverlapConflict[],
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  conflicts.forEach(conflict => {
    conflict.revisionIds.forEach(revisionId => {
      const ids = result.get(revisionId) ?? new Set<string>()
      ids.add(conflict.id)
      result.set(revisionId, ids)
    })
  })
  return result
}

function conflictGroupIds(
  conflicts: readonly RevisionOverlapConflict[],
  revisionToGroup: ReadonlyMap<string, string>,
): Set<string> {
  const result = new Set<string>()
  conflicts.forEach(conflict => conflict.revisionIds.forEach(revisionId => {
    const groupId = revisionToGroup.get(revisionId)
    if (groupId) result.add(groupId)
  }))
  return result
}

function conflictListsEqual(
  left: readonly RevisionOverlapConflict[],
  right: readonly RevisionOverlapConflict[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((conflict, index) => {
    const other = right[index]
    return conflict.id === other.id &&
      arraysEqual(conflict.revisionIds, other.revisionIds) &&
      arraysEqual(conflict.blockIds, other.blockIds)
  })
}

function reviewItemsEqual(
  left: RevisionReviewItem,
  right: RevisionReviewItem,
): boolean {
  return left.id === right.id &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.status === right.status &&
    arraysEqual(left.revisionIds, right.revisionIds) &&
    arraysEqual(left.kinds, right.kinds) &&
    arraysEqual(left.blockIds, right.blockIds) &&
    arraysEqual(left.dependsOn, right.dependsOn) &&
    arraysEqual(left.activeDecisionIds, right.activeDecisionIds) &&
    arraysEqual(left.overlapConflictIds, right.overlapConflictIds) &&
    left.actors.length === right.actors.length &&
    left.actors.every((actor, index) => {
      const other = right.actors[index]
      return actor.actorId === other.actorId &&
        actor.displayName === other.displayName &&
        actor.avatarUrl === other.avatarUrl &&
        actor.color === other.color
    })
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index])
}

function compareReviewItems(
  left: RevisionReviewItem,
  right: RevisionReviewItem,
): number {
  return left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
}

function toSet<T>(value: T | readonly T[] | undefined): Set<T> | null {
  if (value === undefined) return null
  return new Set(Array.isArray(value) ? value : [value])
}

declare global {
  namespace BlockCraft {
    interface IPlugins {
      'revision-review': RevisionReviewPlugin
    }
  }
}
