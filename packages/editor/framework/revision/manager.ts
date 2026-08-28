import * as Y from 'yjs'
import {BehaviorSubject, Subject} from 'rxjs'
import type {BlockCraftDoc} from '../doc'
import {ORIGIN_NO_RECORD} from '../doc/origins'
import {BlockNodeType, DeltaInsert, DeltaOperation, IBlockSnapshot} from '../block-std'
import {generateId, snapshots2Text} from '../utils'
import {deltaToString, sliceDelta} from '../../global'
import {
  RevisionActorRequiredError,
  RevisionCheckpointError,
  RevisionConflictError,
  RevisionNotFoundError,
  RevisionOverlapError,
} from './errors'
import {
  BlockCraftDocumentSnapshot,
  ResolvedRevision,
  RevisionActorSnapshot,
  RevisionBlockTarget,
  RevisionBoundaryTarget,
  RevisionCheckpoint,
  RevisionConfig,
  RevisionDecision,
  RevisionDecisionAction,
  RevisionDomainChange,
  RevisionKind,
  RevisionListQuery,
  RevisionMode,
  RevisionOverlapConflict,
  RevisionRecord,
  RevisionSnapshotRecord,
  RevisionSnapshotTarget,
  RevisionStateSnapshot,
  RevisionStatus,
  RevisionTarget,
  RevisionTextTarget,
  RevisionViewMode,
  RevisionWriteScopeOptions,
} from './types'
import {
  RevisionAttributionAdapter,
  Yjs13RevisionAttributionAdapter,
} from './attribution-adapter'
import {emitRevisionPresentationChange} from './presentation-change'

export const Y_REVISION_MAP_NAME = 'bc:revisions'
export const Y_REVISION_DECISION_MAP_NAME = 'bc:revision-decisions'
export const Y_REVISION_META_MAP_NAME = 'bc:revision-meta'

const REVISION_EPOCH_KEY = 'epoch'
const GROUP_IDLE_MS = 10_000

type TextRange = {start: number; end: number; revision: ResolvedRevision}
type TextDependencyRange = {start: number; end: number; revisionId: string}
type TextDeletionSegment = {start: number; end: number; dependsOn: string[]}
type InlineInsertOptions = {
  groupId: string
  dependsOn: readonly string[]
}
type EmbedFormatPlan = {
  index: number
  delta: DeltaInsert
  attributes: NonNullable<DeltaInsert['attributes']>
}

export interface RevisionBlockPresentation {
  revisionIds: string[]
  kind: 'insert' | 'delete' | 'boundary' | null
  state: RevisionStatus | null
  hidden: boolean
  boundaryBefore: 'insert' | 'delete' | 'conflict' | null
}

/**
 * Document-owned revision domain.
 *
 * Content remains in the canonical Yjs block tree until an explicit checkpoint.
 * Revision ranges and append-only review decisions live in separate top-level
 * Yjs maps, so concurrent review decisions converge without overwriting one
 * another.
 */
export class DocumentRevisionManager {
  readonly yRevisionMap: Y.Map<RevisionRecord>
  readonly yDecisionMap: Y.Map<RevisionDecision>
  readonly yMetaMap: Y.Map<unknown>

  readonly mode$ = new BehaviorSubject<RevisionMode>('off')
  readonly viewMode$ = new BehaviorSubject<RevisionViewMode>('markup')
  readonly state$ = new BehaviorSubject<RevisionStateSnapshot>({
    mode: 'off',
    viewMode: 'markup',
    revisions: [],
    conflicts: [],
    epoch: 0,
  })
  readonly change$ = new Subject<RevisionDomainChange>()

  private actor: RevisionActorSnapshot | null = null
  private trackingBypassDepth = 0
  private revisionWriteScopeDepth = 0
  private forcedGroupId: string | null = null
  private sessionId = generateId()
  private lastGroup: {
    sessionId: string
    groupId: string
    actorId: string
    kind: RevisionKind
    blockId: string
    start: number
    end: number
    at: number
  } | null = null
  private readonly revisionsByBlock = new Map<string, Set<string>>()
  private readonly revisionsByGroup = new Map<string, Set<string>>()
  private readonly decisionsByRevision = new Map<string, Set<string>>()
  private readonly resolvedByRevision = new Map<string, ResolvedRevision>()
  private readonly attribution: RevisionAttributionAdapter =
    new Yjs13RevisionAttributionAdapter()
  private stateEmitQueued = false
  private destroyed = false

  constructor(
    private readonly doc: BlockCraftDoc,
    config?: RevisionConfig,
  ) {
    this.yRevisionMap = this.doc.yDoc.getMap<RevisionRecord>(Y_REVISION_MAP_NAME)
    this.yDecisionMap = this.doc.yDoc.getMap<RevisionDecision>(Y_REVISION_DECISION_MAP_NAME)
    this.yMetaMap = this.doc.yDoc.getMap(Y_REVISION_META_MAP_NAME)
    if (!this.yMetaMap.has(REVISION_EPOCH_KEY)) {
      this.doc.yDoc.transact(() => this.yMetaMap.set(REVISION_EPOCH_KEY, 0), ORIGIN_NO_RECORD)
    }

    if (config?.actor) this.setActor(config.actor)
    if (config?.mode) this.setMode(config.mode)

    this.rebuildBlockIndex()
    this.rebuildGroupIndex()
    this.rebuildDecisionIndex()
    this.rebuildResolvedIndex()
    this.yRevisionMap.observe(this.onRevisionMapChange)
    this.yDecisionMap.observe(this.onDecisionMapChange)
    this.yMetaMap.observe(this.onMetaMapChange)
    this.mode$.subscribe(() => this.queueStateEmit())
    this.viewMode$.subscribe(() => this.queueStateEmit())
    this.doc.onDestroy(() => this.destroy())
    this.emitState()
  }

  get mode(): RevisionMode {
    return this.mode$.value
  }

  get viewMode(): RevisionViewMode {
    return this.viewMode$.value
  }

  get isTracking(): boolean {
    return (this.mode === 'track' || this.revisionWriteScopeDepth > 0) &&
      this.trackingBypassDepth === 0
  }

  get currentActor(): RevisionActorSnapshot | null {
    return this.actor ? cloneActor(this.actor) : null
  }

  hasTextRevisions(blockId: string): boolean {
    return [...(this.revisionsByBlock.get(blockId) ?? [])].some(id =>
      this.yRevisionMap.get(id)?.target.kind === 'text')
  }

  get epoch(): number {
    const value = this.yMetaMap.get(REVISION_EPOCH_KEY)
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : 0
  }

  setActor(actor: RevisionActorSnapshot): void {
    this.actor = normalizeActor(actor)
    this.startTrackingSession()
  }

  setMode(mode: RevisionMode): void {
    if (mode === 'track' && !this.actor) {
      throw new RevisionActorRequiredError('开启修订模式前必须由宿主提供有效 actorId')
    }
    if (this.mode$.value === mode) return
    this.mode$.next(mode)
    this.startTrackingSession()
  }

  setViewMode(mode: RevisionViewMode): void {
    if (mode === 'final') {
      this.assertNoConflicts()
    }
    if (this.viewMode$.value === mode) return
    this.viewMode$.next(mode)
    // Only blocks carrying Revision presentation need an inline rebuild. The
    // root owns the view-mode attribute; readonly propagation is handled once
    // by BlockReadonlyManager's viewMode subscription.
    const affected = new Set(this.revisionsByBlock.keys())
    affected.add(this.doc.rootId)
    this.refreshBlocks(affected)
    emitRevisionPresentationChange(this, affected)
  }

  startTrackingSession(): string {
    this.sessionId = generateId()
    this.lastGroup = null
    return this.sessionId
  }

  runWithoutTracking<T>(callback: () => T): T {
    this.trackingBypassDepth += 1
    try {
      return callback()
    } finally {
      this.trackingBypassDepth -= 1
    }
  }

  /**
   * Runs synchronous document mutations as one attributed revision Diff.
   *
   * Unlike `setMode('track')`, this does not change `mode$` or leave tracking
   * enabled for later user input. Actor/session/group state is restored even
   * when the callback throws. The callback must complete synchronously.
   */
  runAsRevision<T>(
    actor: RevisionActorSnapshot,
    callback: () => T,
    options: RevisionWriteScopeOptions = {},
  ): T {
    const previousActor = this.actor
    const previousSessionId = this.sessionId
    const previousLastGroup = this.lastGroup
    const normalizedActor = normalizeActor(actor)
    const groupId = options.groupId?.trim() || generateId()

    this.actor = normalizedActor
    this.sessionId = generateId()
    this.lastGroup = null
    this.revisionWriteScopeDepth += 1
    try {
      return this.runInGroup(callback, groupId)
    } finally {
      this.revisionWriteScopeDepth -= 1
      this.actor = previousActor
      this.sessionId = previousSessionId
      this.lastGroup = previousLastGroup
    }
  }

  /** @internal Groups one input gesture into a single review card. */
  runInGroup<T>(callback: () => T, groupId = this.forcedGroupId ?? generateId()): T {
    const previous = this.forcedGroupId
    this.forcedGroupId = groupId
    try {
      return callback()
    } finally {
      this.forcedGroupId = previous
      this.lastGroup = null
    }
  }

  list(query: RevisionListQuery = {}): ResolvedRevision[] {
    const statuses = query.status === undefined
      ? null
      : new Set(Array.isArray(query.status) ? query.status : [query.status])
    const kinds = query.kind === undefined
      ? null
      : new Set(Array.isArray(query.kind) ? query.kind : [query.kind])
    return [...this.resolvedByRevision.values()]
      .map(cloneResolvedRevision)
      .filter(record => !statuses || statuses.has(record.status))
      .filter(record => !kinds || kinds.has(record.kind))
      .filter(record => !query.actorId || record.actor.actorId === query.actorId)
      .sort(compareRevision)
  }

  listGroup(groupId: string): ResolvedRevision[] {
    return [...(this.revisionsByGroup.get(groupId) ?? [])]
      .map(id => this.resolvedByRevision.get(id))
      .filter((record): record is ResolvedRevision => !!record)
      .map(cloneResolvedRevision)
      .sort(compareRevision)
  }

  get(revisionId: string): ResolvedRevision {
    const record = this.resolvedByRevision.get(revisionId)
    if (!record) throw new RevisionNotFoundError(`修订不存在：${revisionId}`)
    return cloneResolvedRevision(record)
  }

  /**
   * Reads the canonical content owned by one revision without projecting UI.
   *
   * Text revisions return only their relative-position range. Whole-block
   * revisions return only the targeted block subtrees. Structural boundaries
   * do not own text and therefore return an empty string.
   */
  readRevisionContent(revisionId: string): string {
    const record = this.get(revisionId)
    if (record.target.kind === 'text') {
      const yText = this.tryGetYText(record.target.blockId)
      const range = this.resolveTextRange(record.target)
      return yText && range
        ? deltaToString(
          sliceDelta(yText.toDelta() as DeltaInsert[], range.start, range.end),
          '\ufffc',
        )
        : ''
    }
    if (record.target.kind === 'boundary') return ''
    return record.target.blockIds
      .map(blockId => {
        if (!this.doc.model.exists(blockId)) return ''
        const snapshot = this.doc.model.toSnapshot(blockId)
        return snapshot ? snapshots2Text([snapshot]).replace(/\n$/, '') : ''
      })
      .filter(Boolean)
      .join('\n')
  }

  accept(revisionId: string): RevisionDecision {
    return this.appendDecision(revisionId, 'accept')
  }

  reject(revisionId: string): RevisionDecision {
    return this.appendDecision(revisionId, 'reject')
  }

  redecide(revisionId: string, action: RevisionDecisionAction): RevisionDecision {
    return this.appendDecision(revisionId, action)
  }

  acceptAll(query: RevisionListQuery = {}): RevisionDecision[] {
    return this.decideMany(this.list(query), 'accept')
  }

  rejectAll(query: RevisionListQuery = {}): RevisionDecision[] {
    return this.decideMany(this.list(query), 'reject')
  }

  acceptGroup(groupId: string): RevisionDecision[] {
    return this.decideMany(this.listGroup(groupId), 'accept')
  }

  rejectGroup(groupId: string): RevisionDecision[] {
    return this.decideMany(this.listGroup(groupId), 'reject')
  }

  resolveOverlap(conflictId: string, keepRevisionIds: readonly string[]): RevisionDecision[] {
    const conflict = this.getOverlapConflicts().find(item => item.id === conflictId)
    if (!conflict) throw new RevisionNotFoundError(`结构冲突不存在：${conflictId}`)
    const keep = new Set(keepRevisionIds)
    if ([...keep].some(id => !conflict.revisionIds.includes(id))) {
      throw new RevisionOverlapError('保留列表包含不属于该冲突组的修订')
    }
    return conflict.revisionIds.map(id =>
      this.appendDecision(id, keep.has(id) ? 'accept' : 'reject'))
  }

  insertText(
    blockId: string,
    index: number,
    text: string,
    attributes?: DeltaInsert['attributes'],
    origin: unknown = null,
  ): string | null {
    return this.insertInlineContent(
      blockId,
      index,
      {insert: text, ...(attributes ? {attributes} : {})},
      origin,
    )
  }

  private insertInlineContent(
    blockId: string,
    index: number,
    content: DeltaInsert,
    origin: unknown,
    options?: InlineInsertOptions,
  ): string | null {
    const length = deltaInsertLength(content)
    if (length <= 0) return null
    const yText = this.getYText(blockId)
    if (!this.isTracking) {
      this.doc.crud.transact(() => insertDeltaAt(yText, index, content), origin)
      return null
    }
    const ownInsertion = options
      ? null
      : this.findMutableOwnInsertion(blockId, index, index)
    const ownRange = ownInsertion
      ? this.resolveTextRange(ownInsertion.target as RevisionTextTarget)
      : null
    if (ownInsertion && ownRange) {
      this.doc.crud.transact(() => {
        insertDeltaAt(yText, index, content)
        this.rewriteTextInsertionTarget(
          ownInsertion.id,
          blockId,
          ownRange.start,
          ownRange.end + length,
        )
      }, origin)
      return ownInsertion.id
    }
    const actor = this.requireActor()
    const dependsOn = options?.dependsOn ??
      this.findTextDependencies(blockId, index, index)
    const groupId = options?.groupId ??
      this.resolveTextGroup('text-insert', blockId, index, index + length)
    const id = generateId()
    this.doc.crud.undoManager?.captureSelectionBeforeChange?.()
    this.doc.crud.transact(() => {
      insertDeltaAt(yText, index, content)
      const record: RevisionRecord = {
        id,
        groupId,
        kind: 'text-insert',
        actor,
        createdAt: new Date().toISOString(),
        target: this.createTextTarget(blockId, index, index + length, 1, -1),
        dependsOn: [...dependsOn],
      }
      this.yRevisionMap.set(id, record)
    }, origin)
    return id
  }

  deleteText(
    blockId: string,
    index: number,
    length: number,
    origin: unknown = null,
  ): string | null {
    return this.deleteTextRecords(blockId, index, length, origin)[0] ?? null
  }

  private deleteTextRecords(
    blockId: string,
    index: number,
    length: number,
    origin: unknown = null,
  ): string[] {
    if (length <= 0) return []
    const yText = this.getYText(blockId)
    const end = Math.min(yText.length, index + length)
    if (end <= index) return []
    if (!this.isTracking) {
      this.doc.crud.transact(() => yText.delete(index, end - index), origin)
      return []
    }

    const ownInsertion = this.findMutableOwnInsertion(blockId, index, end)
    const ownRange = ownInsertion
      ? this.resolveTextRange(ownInsertion.target as RevisionTextTarget)
      : null
    if (ownInsertion && ownRange) {
      this.doc.crud.transact(() => {
        yText.delete(index, end - index)
        const remainingEnd = ownRange.end - (end - index)
        if (remainingEnd <= ownRange.start) {
          this.removeRevisionAndDecisions(ownInsertion.id)
        } else {
          this.rewriteTextInsertionTarget(
            ownInsertion.id,
            blockId,
            ownRange.start,
            remainingEnd,
          )
        }
      }, origin)
      return [ownInsertion.id]
    }

    const actor = this.requireActor()
    const mutableInsertionIds = new Set<string>()
    const activeOwnDeletionIds = new Set<string>()
    for (const id of this.revisionsByBlock.get(blockId) ?? []) {
      const record = this.yRevisionMap.get(id)
      if (!record || record.actor.actorId !== actor.actorId) continue
      const status = this.resolveRecord(record).status
      if (record.kind === 'text-insert' && status === 'pending') {
        mutableInsertionIds.add(record.id)
      } else if (
        record.kind === 'text-delete' &&
        (status === 'pending' || status === 'accepted')
      ) {
        activeOwnDeletionIds.add(record.id)
      }
    }
    const mutableSegments: Array<{
      start: number
      end: number
      revisionId: string
    }> = []
    const reusedDeletionIds = new Set<string>()
    const deletionSegments: TextDeletionSegment[] = []
    let mergeBlockedByRetainedText = false
    for (const segment of this.segmentTextDeletion(blockId, index, end)) {
      const mutableRevisionId = segment.dependsOn.length === 1 &&
        mutableInsertionIds.has(segment.dependsOn[0])
        ? segment.dependsOn[0]
        : null
      if (mutableRevisionId) {
        mutableSegments.push({
          start: segment.start,
          end: segment.end,
          revisionId: mutableRevisionId,
        })
        continue
      }

      const coveringOwnDeletions = segment.dependsOn.filter(id =>
        activeOwnDeletionIds.has(id))
      if (coveringOwnDeletions.length) {
        coveringOwnDeletions.forEach(id => reusedDeletionIds.add(id))
        // Unlike consumed insertions, a repeated deletion leaves canonical
        // Y.Text intact. Deletion ranges on either side must not be merged
        // across that retained interval.
        mergeBlockedByRetainedText = true
        continue
      }

      // Once the author's pending insert fragments are physically removed,
      // equal-attribution baseline segments on either side become adjacent.
      // Persist them as one deletion range and one review-card fragment.
      const previous = deletionSegments.at(-1)
      if (
        !mergeBlockedByRetainedText &&
        previous &&
        sameStringArray(previous.dependsOn, segment.dependsOn)
      ) {
        previous.end = segment.end
      } else {
        deletionSegments.push({...segment})
      }
      mergeBlockedByRetainedText = false
    }

    if (!mutableSegments.length && !deletionSegments.length) {
      return [...reusedDeletionIds]
    }

    const groupId = deletionSegments.length
      ? this.resolveTextGroup('text-delete', blockId, index, end)
      : null
    const createdAt = new Date().toISOString()
    const records = groupId === null ? [] : deletionSegments.map(segment => {
      const id = generateId()
      return {
        id,
        groupId,
        kind: 'text-delete' as const,
        actor,
        createdAt,
        target: this.createTextTarget(blockId, segment.start, segment.end, 1, -1),
        dependsOn: segment.dependsOn,
      }
    })
    this.doc.crud.undoManager?.captureSelectionBeforeChange?.()
    this.doc.crud.transact(() => {
      // Create stable relative anchors before consuming insert-only fragments.
      // The anchors follow the subsequent Y.Text deletions and resolve to the
      // now-adjacent baseline text at transaction commit.
      records.forEach(record => this.yRevisionMap.set(record.id, record))
      for (const segment of [...mutableSegments].reverse()) {
        const record = this.yRevisionMap.get(segment.revisionId)
        if (!record || record.kind !== 'text-insert') continue
        yText.delete(segment.start, segment.end - segment.start)
        const remainingRecord = this.yRevisionMap.get(segment.revisionId)
        const remainingRange = remainingRecord?.kind === 'text-insert'
          ? this.resolveTextRange(remainingRecord.target as RevisionTextTarget)
          : null
        if (!remainingRange || remainingRange.end <= remainingRange.start) {
          this.removeRevisionAndDecisions(segment.revisionId)
        } else {
          this.rewriteTextInsertionTarget(
            segment.revisionId,
            blockId,
            remainingRange.start,
            remainingRange.end,
          )
        }
      }
    }, origin)
    return [
      ...reusedDeletionIds,
      ...new Set(mutableSegments.map(segment => segment.revisionId)),
      ...records.map(record => record.id),
    ]
  }

  replaceText(
    blockId: string,
    index: number,
    length: number,
    text?: string | null,
    attributes?: DeltaInsert['attributes'],
    origin: unknown = null,
  ): string[] {
    if (!this.isTracking) {
      const yText = this.getYText(blockId)
      this.doc.crud.transact(() => {
        if (length > 0) yText.delete(index, length)
        if (text) yText.insert(index, text, attributes)
      }, origin)
      return []
    }
    const ownInsertion = length > 0
      ? this.findMutableOwnInsertion(blockId, index, index + length)
      : null
    const ownRange = ownInsertion
      ? this.resolveTextRange(ownInsertion.target as RevisionTextTarget)
      : null
    if (ownInsertion && ownRange) {
      const yText = this.getYText(blockId)
      this.doc.crud.transact(() => {
        yText.delete(index, length)
        if (text) yText.insert(index, text, attributes)
        const remainingEnd = ownRange.end - length + (text?.length ?? 0)
        if (remainingEnd <= ownRange.start) {
          this.removeRevisionAndDecisions(ownInsertion.id)
        } else {
          this.rewriteTextInsertionTarget(
            ownInsertion.id,
            blockId,
            ownRange.start,
            remainingEnd,
          )
        }
      }, origin)
      return [ownInsertion.id]
    }

    const replacementDependencies = length > 0
      ? this.findTextDependenciesCoveringRange(blockId, index, index + length)
      : null
    const groupId = this.forcedGroupId ?? generateId()
    const previousGroup = this.lastGroup
    this.lastGroup = null
    const ids: string[] = []
    if (length > 0) {
      ids.push(...this.deleteTextRecords(blockId, index, length, origin))
    }
    if (text) {
      const id = length > 0
        ? this.insertReplacementContent(
          blockId,
          index,
          {insert: text, ...(attributes ? {attributes} : {})},
          replacementDependencies ?? [],
          groupId,
          origin,
        )
        : this.insertText(blockId, index, text, attributes, origin)
      if (id) ids.push(id)
    }
    this.doc.crud.transact(() => {
      ids.forEach(id => {
        const record = this.yRevisionMap.get(id)
        if (record) this.yRevisionMap.set(id, {...record, groupId})
      })
    }, origin)
    this.lastGroup = previousGroup
    return ids
  }

  applyDelta(
    blockId: string,
    delta: readonly DeltaOperation[],
    origin: unknown = null,
  ): string[] {
    if (!delta.length) return []
    const yText = this.getYText(blockId)
    if (!this.isTracking) {
      this.doc.crud.transact(() => yText.applyDelta([...delta]), origin)
      return []
    }
    // Avoid materializing the whole Y.Text for ordinary input/insert/delete.
    // Only semantic format candidates need to inspect the retained model units.
    const embedFormatPlan = hasAttributedRetain(delta)
      ? planTrackedEmbedFormats(yText.toDelta() as DeltaInsert[], delta)
      : undefined
    if (embedFormatPlan === null ||
      (embedFormatPlan === undefined && !canTrackInlineContentDelta(delta))) {
      this.doc.crud.transact(() => yText.applyDelta([...delta]), origin)
      return []
    }

    const groupId = this.forcedGroupId ?? generateId()
    const ids: string[] = []
    let cursor = 0
    const previousForcedGroup = this.forcedGroupId
    this.forcedGroupId = groupId
    this.doc.crud.undoManager?.captureSelectionBeforeChange?.()
    try {
      this.doc.crud.transact(() => {
        if (embedFormatPlan) {
          for (const update of [...embedFormatPlan].sort((left, right) =>
            right.index - left.index)) {
            this.replaceInlineEmbedAttributes(
              blockId,
              update.index,
              update.delta,
              update.attributes,
              origin,
            ).forEach(id => {
              if (!ids.includes(id)) ids.push(id)
            })
          }
          return
        }
        for (const operation of delta) {
          if (operation.retain) {
            cursor += operation.retain
          }
          if (operation.delete) {
            const deletionIds = this.deleteTextRecords(
              blockId,
              cursor,
              operation.delete,
              origin,
            )
            deletionIds.forEach(id => {
              if (!ids.includes(id)) ids.push(id)
            })
          }
          if (operation.insert !== undefined) {
            const id = this.insertInlineContent(
              blockId,
              cursor,
              {
                insert: structuredClone(operation.insert),
                ...(operation.attributes
                  ? {attributes: structuredClone(operation.attributes)}
                  : {}),
              } as DeltaInsert,
              origin,
            )
            if (id && !ids.includes(id)) ids.push(id)
            cursor += typeof operation.insert === 'string'
              ? operation.insert.length
              : 1
          }
        }
      }, origin)
    } finally {
      this.forcedGroupId = previousForcedGroup
    }
    this.lastGroup = null
    return ids
  }

  private replaceInlineEmbedAttributes(
    blockId: string,
    index: number,
    current: DeltaInsert,
    attributes: NonNullable<DeltaInsert['attributes']>,
    origin: unknown,
  ): string[] {
    if (typeof current.insert === 'string') return []
    const nextAttributes = applyAttributePatch(current.attributes, attributes)
    if (sameAttributes(current.attributes, nextAttributes)) return []

    const ownInsertion = this.findMutableOwnInsertion(blockId, index, index + 1)
    const ownRange = ownInsertion
      ? this.resolveTextRange(ownInsertion.target as RevisionTextTarget)
      : null
    if (ownInsertion && ownRange) {
      const yText = this.getYText(blockId)
      this.doc.crud.transact(() => {
        yText.format(index, 1, attributes as Record<string, unknown>)
      }, origin)
      return [ownInsertion.id]
    }

    const dependencies = this.findTextDependenciesCoveringRange(
      blockId,
      index,
      index + 1,
    )
    const groupId = this.forcedGroupId ?? generateId()
    const ids = this.deleteTextRecords(blockId, index, 1, origin)
    const insertionId = this.insertReplacementContent(
      blockId,
      index,
      {
        insert: structuredClone(current.insert),
        ...(nextAttributes ? {attributes: nextAttributes} : {}),
      },
      dependencies,
      groupId,
      origin,
    )
    if (insertionId) ids.push(insertionId)
    return [...new Set(ids)]
  }

  recordBlockInsertion(
    blockIds: readonly string[],
    parentId: string,
    groupId?: string,
  ): string | null {
    if (!this.isTracking || blockIds.length === 0) return null
    const id = generateId()
    this.yRevisionMap.set(id, {
      id,
      groupId: groupId ?? this.forcedGroupId ?? generateId(),
      kind: 'block-insert',
      actor: this.requireActor(),
      createdAt: new Date().toISOString(),
      target: {kind: 'block', blockIds: [...blockIds], parentId},
      dependsOn: [...new Set([
        ...this.findBlockDependencies([parentId]),
        ...this.findBlockDependencies(blockIds),
      ])].sort(),
    })
    return id
  }

  recordBlockDeletion(
    blockIds: readonly string[],
    parentId: string,
    groupId?: string,
  ): string | null {
    if (!this.isTracking || blockIds.length === 0) return null
    const actor = this.requireActor()
    const requestedBlockIds = [...new Set(blockIds)]
    const activeOwnDeletions = [...this.yRevisionMap.values()]
      .filter(record => {
        if (
          record.kind !== 'block-delete' ||
          record.actor.actorId !== actor.actorId ||
          record.target.kind !== 'block' ||
          record.target.parentId !== parentId
        ) return false
        const status = this.resolveRecord(record).status
        return status === 'pending' || status === 'accepted'
      })
    const alreadyDeletedIds = new Set(
      activeOwnDeletions.flatMap(record =>
        record.target.kind === 'block' ? record.target.blockIds : []),
    )
    const uncoveredBlockIds = requestedBlockIds.filter(id => !alreadyDeletedIds.has(id))
    if (!uncoveredBlockIds.length) {
      return activeOwnDeletions.find(record => {
        const target = record.target
        return target.kind === 'block' &&
          requestedBlockIds.some(id => target.blockIds.includes(id))
      })?.id ?? null
    }

    const ownInsertions = [...this.yRevisionMap.values()].filter(record => {
      if (
        record.kind !== 'block-insert' ||
        this.resolveRecord(record).status !== 'pending' ||
        record.actor.actorId !== actor.actorId ||
        record.target.kind !== 'block'
      ) return false
      const insertedBlockIds = record.target.blockIds
      return uncoveredBlockIds.every(id => insertedBlockIds.includes(id))
    })
    if (ownInsertions.length === 1) {
      this.runWithoutTracking(() => {
        uncoveredBlockIds.slice().reverse().forEach(id => {
          if (this.doc.model.exists(id)) this.doc.crud.deleteBlockById(id)
        })
      })
      this.doc.crud.transact(() => {
        const insertion = ownInsertions[0]
        if (insertion.target.kind !== 'block') return
        const removed = new Set(uncoveredBlockIds)
        const remainingBlockIds = insertion.target.blockIds.filter(id => !removed.has(id))
        if (!remainingBlockIds.length) {
          this.removeRevisionAndDecisions(insertion.id)
        } else {
          this.yRevisionMap.set(insertion.id, {
            ...insertion,
            target: {...insertion.target, blockIds: remainingBlockIds},
          })
        }
      })
      return ownInsertions[0].id
    }
    const id = generateId()
    this.yRevisionMap.set(id, {
      id,
      groupId: groupId ?? this.forcedGroupId ?? generateId(),
      kind: 'block-delete',
      actor,
      createdAt: new Date().toISOString(),
      target: {kind: 'block', blockIds: uncoveredBlockIds, parentId},
      dependsOn: this.findBlockDependencies(uncoveredBlockIds),
    })
    return id
  }

  recordBoundary(
    kind: 'block-split' | 'block-merge',
    parentId: string,
    leftBlockId: string,
    rightBlockId: string,
    groupId?: string,
  ): string {
    const id = generateId()
    const target: RevisionBoundaryTarget = {
      kind: 'boundary',
      parentId,
      leftBlockId,
      rightBlockId,
    }
    this.yRevisionMap.set(id, {
      id,
      groupId: groupId ?? this.forcedGroupId ?? generateId(),
      kind,
      actor: this.requireActor(),
      createdAt: new Date().toISOString(),
      target,
      dependsOn: this.findBlockDependencies([leftBlockId, rightBlockId]),
    })
    return id
  }

  projectInlineDeltas(blockId: string, raw: readonly DeltaInsert[]): DeltaInsert[] {
    const ids = this.revisionsByBlock.get(blockId)
    if (!ids?.size) return raw.map(cloneDelta)
    const ranges = [...ids]
      .map(id => this.yRevisionMap.get(id))
      .filter((record): record is RevisionRecord => !!record && record.target.kind === 'text')
      .map(record => {
        const range = this.resolveTextRange(record.target as RevisionTextTarget)
        return range ? {...range, revision: this.resolveRecord(record)} : null
      })
      .filter((range): range is TextRange => !!range && range.end > range.start)
    const total = deltaLength(raw)
    if (!ranges.length || total === 0) return raw.map(cloneDelta)

    const boundaries = new Set<number>([0, total])
    ranges.forEach(range => {
      boundaries.add(clamp(range.start, 0, total))
      boundaries.add(clamp(range.end, 0, total))
    })
    const points = [...boundaries].sort((a, b) => a - b)
    const resolvedById = new Map(this.list().map(record => [record.id, record]))
    const out: DeltaInsert[] = []
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      if (end <= start) continue
      const covering = ranges
        .filter(range => range.start < end && range.end > start)
        .map(range => range.revision)
      const presentation = resolveInlinePresentation(
        covering,
        resolvedById,
        this.viewMode,
      )
      for (const op of sliceDeltas(raw, start, end)) {
        const attributes = this.attribution.decorateInlineAttributes(
          op.attributes,
          presentation,
        )
        if (presentation.hidden) attributes['s:display'] = 'none'
        pushMergedDelta(out, {...op, ...(Object.keys(attributes).length ? {attributes} : {})})
      }
    }
    return out
  }

  getBlockPresentation(blockId: string): RevisionBlockPresentation {
    const records = [...(this.revisionsByBlock.get(blockId) ?? [])]
      .map(id => this.yRevisionMap.get(id))
      .filter((record): record is RevisionRecord => !!record)
      .map(record => this.resolveRecord(record))
    let hidden = false
    let kind: RevisionBlockPresentation['kind'] = null
    let state: RevisionStatus | null = null
    let boundaryBefore: RevisionBlockPresentation['boundaryBefore'] = null
    for (const record of records) {
      if (record.target.kind === 'block') {
        if (record.kind === 'block-insert') {
          kind = 'insert'
          hidden ||= record.status === 'rejected'
        } else if (record.kind === 'block-delete') {
          kind = 'delete'
          hidden ||= record.status === 'accepted' ||
            (this.viewMode === 'final' && record.status === 'pending')
        }
        state = mergeStatus(state, record.status)
      } else if (
        record.target.kind === 'boundary' &&
        record.target.rightBlockId === blockId
      ) {
        const pendingKind = record.kind === 'block-split' ? 'insert' : 'delete'
        boundaryBefore = record.status === 'conflict' ? 'conflict' : pendingKind
        state = mergeStatus(state, record.status)
      }
    }
    return {
      revisionIds: records.map(record => record.id).sort(),
      kind,
      state,
      hidden,
      boundaryBefore,
    }
  }

  getOverlapConflicts(): RevisionOverlapConflict[] {
    const active = this.list().filter(record => record.status !== 'rejected')
    const conflicts = new Map<string, RevisionOverlapConflict>()
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const left = active[i]
        const right = active[j]
        if (left.groupId === right.groupId) continue
        if (left.dependsOn.includes(right.id) || right.dependsOn.includes(left.id)) continue
        if (!isStructural(left) && !isStructural(right)) continue
        const blockIds = intersectAffectedBlocks(
          affectedBlockIds(left, this.doc),
          affectedBlockIds(right, this.doc),
        )
        if (!blockIds.length) continue
        const revisionIds = [left.id, right.id].sort()
        const id = `structure:${revisionIds.join(':')}`
        conflicts.set(id, {
          id,
          revisionIds,
          blockIds,
          kind: 'structure-overlap',
        })
      }
    }
    return [...conflicts.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  projectFinalSnapshot(): IBlockSnapshot {
    this.assertNoConflicts()
    const exported = this.doc.exportSnapshot()
    if (!exported) throw new RevisionCheckpointError('文档尚未初始化')
    const root = cloneSnapshot(exported)
    const resolved = this.list()
    const resolvedById = new Map(resolved.map(record => [record.id, record]))

    const hiddenTextByBlock = new Map<string, Array<{start: number; end: number}>>()
    for (const record of resolved) {
      if (record.target.kind !== 'text') continue
      const range = this.resolveTextRange(record.target)
      if (!range) continue
      const hide =
        hasRejectedInsertionAncestor(record, resolvedById) ||
        (record.kind === 'text-insert' && record.status === 'rejected') ||
        (record.kind === 'text-delete' && record.status !== 'rejected')
      if (hide) {
        const list = hiddenTextByBlock.get(record.target.blockId) ?? []
        list.push(range)
        hiddenTextByBlock.set(record.target.blockId, list)
      }
    }
    visitSnapshots(root, snapshot => {
      if (snapshot.nodeType !== BlockNodeType.editable) return
      const ranges = mergeRanges(hiddenTextByBlock.get(snapshot.id) ?? [])
      if (ranges.length) snapshot.children = removeDeltaRanges(snapshot.children, ranges)
    })

    const removeBlocks = new Set<string>()
    for (const record of resolved) {
      if (record.target.kind !== 'block') continue
      const remove =
        (record.kind === 'block-insert' && record.status === 'rejected') ||
        (record.kind === 'block-delete' && record.status !== 'rejected')
      if (remove) record.target.blockIds.forEach(id => removeBlocks.add(id))
    }
    filterSnapshotBlocks(root, removeBlocks)

    for (const record of resolved) {
      if (record.target.kind !== 'boundary') continue
      const shouldMerge =
        (record.kind === 'block-split' && record.status === 'rejected') ||
        (record.kind === 'block-merge' && record.status !== 'rejected')
      if (shouldMerge) mergeSnapshotBoundary(root, record.target)
    }
    return root
  }

  exportDocumentSnapshot(): BlockCraftDocumentSnapshot {
    const root = this.doc.exportSnapshot()
    if (!root) throw new RevisionCheckpointError('文档尚未初始化')
    const revisions: RevisionSnapshotRecord[] = []
    for (const record of this.yRevisionMap.values()) {
      const target = this.serializeTarget(record.target)
      if (!target) continue
      revisions.push({...cloneRecord(record), target})
    }
    return {
      version: 1,
      root,
      revisions: revisions.sort(compareRevision),
      decisions: [...this.yDecisionMap.values()].map(cloneDecision).sort(compareDecision),
      revisionEpoch: this.epoch,
    }
  }

  importDocumentSnapshot(snapshot: BlockCraftDocumentSnapshot): void {
    if (snapshot.version !== 1) {
      throw new RevisionCheckpointError(`不支持的 BlockCraftDocumentSnapshot 版本：${snapshot.version}`)
    }
    this.runWithoutTracking(() => {
      this.doc.yDoc.transact(() => {
        this.yRevisionMap.clear()
        this.yDecisionMap.clear()
        this.yMetaMap.set(REVISION_EPOCH_KEY, normalizeEpoch(snapshot.revisionEpoch))
        for (const record of snapshot.revisions) {
          const target = this.deserializeTarget(record.target, record.kind)
          if (!target) continue
          this.yRevisionMap.set(record.id, {...cloneRecord(record as RevisionRecord), target})
        }
        snapshot.decisions.forEach(decision =>
          this.yDecisionMap.set(decision.id, cloneDecision(decision)))
      }, ORIGIN_NO_RECORD)
    })
  }

  compactResolved(checkpoint: RevisionCheckpoint): BlockCraftDocumentSnapshot {
    if (checkpoint.epoch !== this.epoch) {
      throw new RevisionCheckpointError(
        `修订 epoch 不匹配：当前 ${this.epoch}，检查点 ${checkpoint.epoch}`,
      )
    }
    const expected = Uint8Array.from(checkpoint.stateVector)
    const current = Y.encodeStateVector(this.doc.yDoc)
    if (!bytesEqual(expected, current)) {
      throw new RevisionCheckpointError('检查点 state vector 与当前文档不一致')
    }
    const unresolved = this.list().filter(record => record.status === 'pending')
    if (unresolved.length) {
      throw new RevisionCheckpointError(`仍有 ${unresolved.length} 条待审修订，不能压缩`)
    }
    this.assertNoConflicts()

    const resolved = this.list()
    const resolvedById = new Map(resolved.map(record => [record.id, record]))
    const textDeletes = new Map<string, Array<{start: number; end: number}>>()
    const boundaries: Array<{target: RevisionBoundaryTarget; merge: boolean}> = []
    const blockDeletes = new Set<string>()
    for (const record of resolved) {
      if (record.target.kind === 'text') {
        const range = this.resolveTextRange(record.target)
        const remove =
          (record.kind === 'text-insert' &&
            hasRejectedInsertionAncestor(record, resolvedById)) ||
          (record.kind === 'text-insert' && record.status === 'rejected') ||
          (record.kind === 'text-delete' && record.status === 'accepted')
        if (remove && range) {
          const ranges = textDeletes.get(record.target.blockId) ?? []
          ranges.push(range)
          textDeletes.set(record.target.blockId, ranges)
        }
      } else if (record.target.kind === 'boundary') {
        boundaries.push({
          target: record.target,
          merge:
            (record.kind === 'block-split' && record.status === 'rejected') ||
            (record.kind === 'block-merge' && record.status === 'accepted'),
        })
      } else if (record.target.kind === 'block') {
        const remove =
          (record.kind === 'block-insert' && record.status === 'rejected') ||
          (record.kind === 'block-delete' && record.status === 'accepted')
        if (remove) record.target.blockIds.forEach(id => blockDeletes.add(id))
      }
    }

    this.runWithoutTracking(() => {
      this.doc.crud.transact(() => {
        for (const [blockId, ranges] of textDeletes) {
          const yText = this.tryGetYText(blockId)
          if (!yText) continue
          for (const range of mergeRanges(ranges).sort((a, b) => b.start - a.start)) {
            yText.delete(range.start, range.end - range.start)
          }
        }
        boundaries.filter(item => item.merge).forEach(item =>
          this.materializeBoundaryMerge(item.target))
        for (const blockId of [...blockDeletes]) {
          if (this.doc.model.exists(blockId)) this.doc.crud.deleteBlockById(blockId)
        }
        this.yRevisionMap.clear()
        this.yDecisionMap.clear()
        this.yMetaMap.set(REVISION_EPOCH_KEY, this.epoch + 1)
      }, ORIGIN_NO_RECORD)
    })
    this.startTrackingSession()
    return this.exportDocumentSnapshot()
  }

  assertNoConflicts(): void {
    const decisionConflicts = this.list({status: 'conflict'}).map(record => record.id)
    const overlaps = this.getOverlapConflicts()
    if (decisionConflicts.length || overlaps.length) {
      throw new RevisionConflictError(
        '文档存在尚未裁决的修订冲突',
        decisionConflicts,
        overlaps.map(conflict => conflict.id),
      )
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.yRevisionMap.unobserve(this.onRevisionMapChange)
    this.yDecisionMap.unobserve(this.onDecisionMapChange)
    this.yMetaMap.unobserve(this.onMetaMapChange)
    this.mode$.complete()
    this.viewMode$.complete()
    this.state$.complete()
    this.change$.complete()
  }

  private readonly onRevisionMapChange = (event: Y.YMapEvent<RevisionRecord>) => {
    const affected = new Set<string>()
    const revisionIds = new Set<string>()
    const groupIds = new Set<string>()
    let conflictsChanged = false
    for (const key of event.keysChanged) {
      const change = event.changes.keys.get(key)
      const previous = change?.oldValue as RevisionRecord | undefined
      const next = this.yRevisionMap.get(key)
      if (previous) {
        revisionIds.add(previous.id)
        groupIds.add(previous.groupId)
        conflictsChanged ||= isStructural(previous)
        this.resolvedByRevision.delete(previous.id)
        this.revisionsByGroup.get(previous.groupId)?.delete(previous.id)
        if (!this.revisionsByGroup.get(previous.groupId)?.size) {
          this.revisionsByGroup.delete(previous.groupId)
        }
        revisionBlockIds(previous).forEach(blockId => {
          affected.add(blockId)
          this.revisionsByBlock.get(blockId)?.delete(previous.id)
        })
      }
      if (next) {
        revisionIds.add(next.id)
        groupIds.add(next.groupId)
        conflictsChanged ||= isStructural(next)
        this.resolvedByRevision.set(next.id, this.resolveRecord(next))
        const groupRevisionIds = this.revisionsByGroup.get(next.groupId) ?? new Set<string>()
        groupRevisionIds.add(next.id)
        this.revisionsByGroup.set(next.groupId, groupRevisionIds)
        revisionBlockIds(next).forEach(blockId => {
          affected.add(blockId)
          const ids = this.revisionsByBlock.get(blockId) ?? new Set<string>()
          ids.add(next.id)
          this.revisionsByBlock.set(blockId, ids)
        })
      }
    }
    this.refreshBlocks(affected)
    emitRevisionPresentationChange(this, affected)
    this.change$.next({
      kind: 'records',
      revisionIds: [...revisionIds].sort(),
      groupIds: [...groupIds].sort(),
      conflictsChanged,
    })
    this.queueStateEmit()
  }

  private readonly onDecisionMapChange = (event: Y.YMapEvent<RevisionDecision>) => {
    const affected = new Set<string>()
    const revisionIds = new Set<string>()
    const groupIds = new Set<string>()
    let conflictsChanged = false
    for (const key of event.keysChanged) {
      const previous = event.changes.keys.get(key)?.oldValue as RevisionDecision | undefined
      const next = this.yDecisionMap.get(key)
      if (previous) {
        this.decisionsByRevision.get(previous.revisionId)?.delete(previous.id)
      }
      if (next) {
        const ids = this.decisionsByRevision.get(next.revisionId) ?? new Set<string>()
        ids.add(next.id)
        this.decisionsByRevision.set(next.revisionId, ids)
      }
      const revisionId = next?.revisionId ?? previous?.revisionId
      if (!revisionId) continue
      revisionIds.add(revisionId)
      const record = this.yRevisionMap.get(revisionId)
      if (record) {
        groupIds.add(record.groupId)
        conflictsChanged ||= isStructural(record)
        this.resolvedByRevision.set(record.id, this.resolveRecord(record))
        revisionBlockIds(record).forEach(id => affected.add(id))
      }
    }
    this.refreshBlocks(affected)
    emitRevisionPresentationChange(this, affected)
    this.change$.next({
      kind: 'decisions',
      revisionIds: [...revisionIds].sort(),
      groupIds: [...groupIds].sort(),
      conflictsChanged,
    })
    this.queueStateEmit()
  }

  private readonly onMetaMapChange = () => {
    this.change$.next({
      kind: 'meta',
      revisionIds: [],
      groupIds: [],
      conflictsChanged: false,
    })
    this.queueStateEmit()
  }

  private appendDecision(revisionId: string, action: RevisionDecisionAction): RevisionDecision {
    const actor = this.requireActor()
    const record = this.yRevisionMap.get(revisionId)
    if (!record) throw new RevisionNotFoundError(`修订不存在：${revisionId}`)
    const active = this.activeDecisions(revisionId)
    if (active.length === 1 && active[0].action === action) return cloneDecision(active[0])
    const decision: RevisionDecision = {
      id: generateId(),
      revisionId,
      action,
      actor,
      createdAt: new Date().toISOString(),
      supersedes: active.map(item => item.id).sort(),
    }
    this.doc.crud.transact(() => this.yDecisionMap.set(decision.id, decision), ORIGIN_NO_RECORD)
    return cloneDecision(decision)
  }

  private decideMany(
    revisions: readonly ResolvedRevision[],
    action: RevisionDecisionAction,
  ): RevisionDecision[] {
    const decisions: RevisionDecision[] = []
    revisions.forEach(revision => decisions.push(this.appendDecision(revision.id, action)))
    return decisions
  }

  private resolveRecord(record: RevisionRecord): ResolvedRevision {
    const active = this.activeDecisions(record.id)
    const actions = new Set(active.map(decision => decision.action))
    const status: RevisionStatus = actions.size === 0
      ? 'pending'
      : actions.size > 1
        ? 'conflict'
        : actions.has('accept')
          ? 'accepted'
          : 'rejected'
    return {
      ...cloneRecord(record),
      status,
      activeDecisionIds: active.map(decision => decision.id).sort(),
    }
  }

  private activeDecisions(revisionId: string): RevisionDecision[] {
    const decisions = [...(this.decisionsByRevision.get(revisionId) ?? [])]
      .map(id => this.yDecisionMap.get(id))
      .filter((decision): decision is RevisionDecision => !!decision)
    const superseded = new Set(decisions.flatMap(decision => decision.supersedes))
    return decisions.filter(decision => !superseded.has(decision.id)).sort(compareDecision)
  }

  private requireActor(): RevisionActorSnapshot {
    if (!this.actor) {
      throw new RevisionActorRequiredError('修订或审批操作需要宿主提供有效 actorId')
    }
    return cloneActor(this.actor)
  }

  private getYText(blockId: string): Y.Text {
    const yText = this.tryGetYText(blockId)
    if (!yText) throw new RevisionNotFoundError(`可编辑块不存在：${blockId}`)
    return yText
  }

  private tryGetYText(blockId: string): Y.Text | null {
    const yBlock = this.doc.yBlockMap.get(blockId)
    const children = yBlock?.get('children')
    return children instanceof Y.Text ? children : null
  }

  private createTextTarget(
    blockId: string,
    start: number,
    end: number,
    startAssoc: -1 | 1 = -1,
    endAssoc: -1 | 1 = 1,
  ): RevisionTextTarget {
    const yText = this.getYText(blockId)
    return this.attribution.createTextTarget(
      blockId,
      yText,
      start,
      end,
      startAssoc,
      endAssoc,
    )
  }

  private resolveTextRange(target: RevisionTextTarget): {start: number; end: number} | null {
    const yText = this.tryGetYText(target.blockId)
    return yText
      ? this.attribution.resolveTextTarget(target, this.doc.yDoc, yText)
      : null
  }

  private findTextDependencies(blockId: string, start: number, end: number): string[] {
    return this.getTextDependencyRanges(blockId)
      .filter(range => start === end
        ? range.start < start && range.end > start
        : range.start < end && range.end > start)
      .map(range => range.revisionId)
      .sort()
  }

  private findTextDependenciesCoveringRange(
    blockId: string,
    start: number,
    end: number,
  ): string[] {
    return this.getTextDependencyRanges(blockId)
      .filter(range => range.start <= start && range.end >= end)
      .map(range => range.revisionId)
      .sort()
  }

  private insertReplacementContent(
    blockId: string,
    index: number,
    content: DeltaInsert,
    dependsOn: readonly string[],
    groupId: string,
    origin: unknown,
  ): string {
    return this.insertInlineContent(
      blockId,
      index,
      content,
      origin,
      {dependsOn, groupId},
    )!
  }

  private getTextDependencyRanges(blockId: string): TextDependencyRange[] {
    return [...(this.revisionsByBlock.get(blockId) ?? [])]
      .map(id => this.yRevisionMap.get(id))
      .filter((record): record is RevisionRecord =>
        !!record && record.target.kind === 'text')
      .filter(record => this.resolveRecord(record).status !== 'rejected')
      .map(record => {
        const range = this.resolveTextRange(record.target as RevisionTextTarget)
        return range ? {...range, revisionId: record.id} : null
      })
      .filter((range): range is TextDependencyRange => !!range && range.end > range.start)
  }

  /**
   * A tracked deletion may cross existing revision boundaries. Persist one
   * segment for each distinct dependency set so rejecting an insertion only
   * discards the nested portion, never adjacent original text from the same
   * user gesture. The segments still share one groupId/review card.
   */
  private segmentTextDeletion(
    blockId: string,
    start: number,
    end: number,
  ): TextDeletionSegment[] {
    const ranges = this.getTextDependencyRanges(blockId)
      .filter(range => range.start < end && range.end > start)
    if (!ranges.length) return [{start, end, dependsOn: []}]

    const starts = new Map<number, string[]>()
    const ends = new Map<number, string[]>()
    const boundaries = new Set<number>([start, end])
    ranges.forEach(range => {
      const rangeStart = clamp(range.start, start, end)
      const rangeEnd = clamp(range.end, start, end)
      if (rangeEnd <= rangeStart) return
      boundaries.add(rangeStart)
      boundaries.add(rangeEnd)
      starts.set(rangeStart, [...(starts.get(rangeStart) ?? []), range.revisionId])
      ends.set(rangeEnd, [...(ends.get(rangeEnd) ?? []), range.revisionId])
    })

    const points = [...boundaries].sort((left, right) => left - right)
    const active = new Set<string>()
    const segments: TextDeletionSegment[] = []
    for (let index = 0; index < points.length - 1; index += 1) {
      const segmentStart = points[index]
      const segmentEnd = points[index + 1]
      ends.get(segmentStart)?.forEach(id => active.delete(id))
      starts.get(segmentStart)?.forEach(id => active.add(id))
      if (segmentEnd <= segmentStart) continue
      const dependsOn = [...active].sort()
      const previous = segments.at(-1)
      if (
        previous &&
        previous.end === segmentStart &&
        sameStringArray(previous.dependsOn, dependsOn)
      ) {
        previous.end = segmentEnd
      } else {
        segments.push({start: segmentStart, end: segmentEnd, dependsOn})
      }
    }
    return segments
  }

  private findBlockDependencies(blockIds: readonly string[]): string[] {
    const dependencies = new Set<string>()
    blockIds.forEach(blockId => {
      let current: string | null = blockId
      while (current) {
        this.revisionsByBlock.get(current)?.forEach(id => dependencies.add(id))
        current = this.doc.model?.getParentId(current) ?? null
      }
    })
    return [...dependencies].sort()
  }

  private findMutableOwnInsertion(
    blockId: string,
    start: number,
    end: number,
  ): ResolvedRevision | null {
    const actorId = this.requireActor().actorId
    const candidates = [...(this.revisionsByBlock.get(blockId) ?? [])]
      .map(id => this.yRevisionMap.get(id))
      .filter((record): record is RevisionRecord => !!record && record.kind === 'text-insert')
      .map(record => this.resolveRecord(record))
      .filter(record => record.status === 'pending' && record.actor.actorId === actorId)
      .filter(record => {
        const range = this.resolveTextRange(record.target as RevisionTextTarget)
        return !!range && range.start <= start && range.end >= end
      })
    if (candidates.length !== 1) return null
    const candidate = candidates[0]
    const competingRevision = this.getTextDependencyRanges(blockId).some(range =>
      range.revisionId !== candidate.id && (
        start === end
          ? range.start <= start && range.end >= start
          : range.start < end && range.end > start
      ))
    return competingRevision ? null : candidate
  }

  private resolveTextGroup(
    kind: 'text-insert' | 'text-delete',
    blockId: string,
    start: number,
    end: number,
  ): string {
    if (this.forcedGroupId) return this.forcedGroupId
    const actorId = this.requireActor().actorId
    const now = Date.now()
    const last = this.lastGroup
    const adjacent = last && (
      kind === 'text-insert'
        ? start === last.end
        : start <= last.end && end >= last.start - 1
    )
    const groupId = last &&
      last.actorId === actorId &&
      last.sessionId === this.sessionId &&
      last.kind === kind &&
      last.blockId === blockId &&
      adjacent &&
      now - last.at <= GROUP_IDLE_MS
      ? last.groupId
      : generateId()
    this.lastGroup = {
      sessionId: this.sessionId,
      groupId,
      actorId,
      kind,
      blockId,
      start: last?.groupId === groupId ? Math.min(last.start, start) : start,
      end: last?.groupId === groupId ? Math.max(last.end, end) : end,
      at: now,
    }
    return groupId
  }

  private removeRevisionAndDecisions(revisionId: string): void {
    this.yRevisionMap.delete(revisionId)
    for (const [id, decision] of this.yDecisionMap.entries()) {
      if (decision.revisionId === revisionId) this.yDecisionMap.delete(id)
    }
  }

  /**
   * Text-insert targets are boundary-tight so a concurrent insertion at either
   * edge is adjacent rather than silently absorbed. The original author can
   * still resize their pending insertion; that path explicitly rewrites this
   * target after mutating the canonical Y.Text.
   */
  private rewriteTextInsertionTarget(
    revisionId: string,
    blockId: string,
    start: number,
    end: number,
  ): void {
    const record = this.yRevisionMap.get(revisionId)
    if (!record || record.kind !== 'text-insert') return
    this.yRevisionMap.set(revisionId, {
      ...record,
      target: this.createTextTarget(blockId, start, end, 1, -1),
    })
  }

  private materializeBoundaryMerge(target: RevisionBoundaryTarget): void {
    const left = this.tryGetYText(target.leftBlockId)
    const right = this.tryGetYText(target.rightBlockId)
    if (!left || !right || !this.doc.model.exists(target.rightBlockId)) return
    const append = right.toDelta() as DeltaInsert[]
    left.applyDelta([{retain: left.length}, ...append])
    this.doc.crud.deleteBlockById(target.rightBlockId)
  }

  private serializeTarget(target: RevisionTarget): RevisionSnapshotTarget | null {
    if (target.kind !== 'text') return structuredClone(target)
    const range = this.resolveTextRange(target)
    return range ? {kind: 'text', blockId: target.blockId, ...range} : null
  }

  private deserializeTarget(
    target: RevisionSnapshotTarget,
    kind: RevisionKind,
  ): RevisionTarget | null {
    if (target.kind !== 'text') return structuredClone(target)
    const yText = this.tryGetYText(target.blockId)
    if (!yText) return null
    const start = clamp(target.start, 0, yText.length)
    const end = clamp(target.end, start, yText.length)
    return kind === 'text-delete'
      ? this.createTextTarget(target.blockId, start, end, 1, -1)
      : this.createTextTarget(target.blockId, start, end, 1, -1)
  }

  private rebuildBlockIndex(): void {
    this.revisionsByBlock.clear()
    for (const record of this.yRevisionMap.values()) {
      revisionBlockIds(record).forEach(blockId => {
        const ids = this.revisionsByBlock.get(blockId) ?? new Set<string>()
        ids.add(record.id)
        this.revisionsByBlock.set(blockId, ids)
      })
    }
  }

  private rebuildGroupIndex(): void {
    this.revisionsByGroup.clear()
    for (const record of this.yRevisionMap.values()) {
      const ids = this.revisionsByGroup.get(record.groupId) ?? new Set<string>()
      ids.add(record.id)
      this.revisionsByGroup.set(record.groupId, ids)
    }
  }

  private rebuildDecisionIndex(): void {
    this.decisionsByRevision.clear()
    for (const decision of this.yDecisionMap.values()) {
      const ids = this.decisionsByRevision.get(decision.revisionId) ?? new Set<string>()
      ids.add(decision.id)
      this.decisionsByRevision.set(decision.revisionId, ids)
    }
  }

  private rebuildResolvedIndex(): void {
    this.resolvedByRevision.clear()
    for (const record of this.yRevisionMap.values()) {
      this.resolvedByRevision.set(record.id, this.resolveRecord(record))
    }
  }

  private refreshBlocks(blockIds: ReadonlySet<string>): void {
    blockIds.forEach(blockId => {
      const block = this.doc.vm?.get(blockId)?.instance as any
      block?.applyReadonlyViewState?.()
      block?.changeDetectorRef?.markForCheck?.()
      if (typeof block?.rerender === 'function') block.rerender()
    })
  }

  private queueStateEmit(): void {
    if (this.stateEmitQueued) return
    this.stateEmitQueued = true
    queueMicrotask(() => {
      this.stateEmitQueued = false
      this.emitState()
    })
  }

  private emitState(): void {
    if (this.state$.closed) return
    this.state$.next({
      mode: this.mode,
      viewMode: this.viewMode,
      revisions: this.list(),
      conflicts: this.doc.isInitialized ? this.getOverlapConflicts() : [],
      epoch: this.epoch,
    })
  }
}

function deltaInsertLength(delta: DeltaInsert): number {
  return typeof delta.insert === 'string' ? delta.insert.length : 1
}

function insertDeltaAt(yText: Y.Text, index: number, delta: DeltaInsert): void {
  if (typeof delta.insert === 'string') {
    if (delta.insert) yText.insert(index, delta.insert, delta.attributes)
    return
  }
  yText.insertEmbed(index, structuredClone(delta.insert), delta.attributes)
}

/**
 * Returns:
 * - undefined when the delta has no formatting and can use the normal tracked path;
 * - null when formatting is present but must remain an untracked formatting operation;
 * - a plan when every formatted unit is an inline Embed semantic update.
 */
function planTrackedEmbedFormats(
  raw: readonly DeltaInsert[],
  operations: readonly DeltaOperation[],
): EmbedFormatPlan[] | null {
  // Keep compound format/content deltas on the existing untracked path. Embed
  // replacements generated by built-in plugins use a plain delete + insert and
  // are handled by the normal tracked path instead.
  if (operations.some(operation =>
    !!operation.delete || operation.insert !== undefined)) return null

  const plan: EmbedFormatPlan[] = []
  let cursor = 0
  for (const operation of operations) {
    const length = operation.retain ?? 0
    if (length <= 0) continue
    const attributes = operation.attributes
    if (attributes && Object.keys(attributes).length > 0) {
      if (!isSemanticEmbedAttributePatch(attributes)) return null
      const selected = sliceDeltas(raw, cursor, cursor + length)
      if (
        deltaLength(selected) !== length ||
        selected.some(delta => typeof delta.insert === 'string')
      ) return null
      selected.forEach((delta, offset) => plan.push({
        index: cursor + offset,
        delta,
        attributes: structuredClone(attributes),
      }))
    }
    cursor += length
  }
  return plan
}

function hasAttributedRetain(delta: readonly DeltaOperation[]): boolean {
  return delta.some(operation =>
    !!operation.retain &&
    !!operation.attributes &&
    Object.keys(operation.attributes).length > 0)
}

function isSemanticEmbedAttributePatch(
  attributes: NonNullable<DeltaInsert['attributes']>,
): boolean {
  const keys = Object.keys(attributes)
  return keys.length > 0 && keys.every(key =>
    !key.startsWith('a:') &&
    !key.startsWith('d:') &&
    !key.startsWith('s:') &&
    !key.startsWith('t:'))
}

function applyAttributePatch(
  current: DeltaInsert['attributes'] | undefined,
  patch: NonNullable<DeltaInsert['attributes']>,
): DeltaInsert['attributes'] | undefined {
  const next = structuredClone(current ?? {})
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined) delete next[key]
    else next[key] = structuredClone(value)
  })
  return Object.keys(next).length ? next : undefined
}

function sameAttributes(
  left: DeltaInsert['attributes'] | undefined,
  right: DeltaInsert['attributes'] | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {})
  const rightEntries = Object.entries(right ?? {})
  if (leftEntries.length !== rightEntries.length) return false
  return leftEntries.every(([key, value]) =>
    Object.prototype.hasOwnProperty.call(right ?? {}, key) &&
    Object.is(value, right?.[key]))
}

function canTrackInlineContentDelta(delta: readonly DeltaOperation[]): boolean {
  return delta.every(operation =>
    !(operation.retain && operation.attributes &&
      Object.keys(operation.attributes).length > 0),
  )
}

function normalizeActor(actor: RevisionActorSnapshot): RevisionActorSnapshot {
  const actorId = `${actor?.actorId ?? ''}`.trim()
  if (!actorId) throw new RevisionActorRequiredError('actorId 不能为空')
  return {
    actorId,
    ...(actor.displayName?.trim() ? {displayName: actor.displayName.trim()} : {}),
    ...(actor.avatarUrl?.trim() ? {avatarUrl: actor.avatarUrl.trim()} : {}),
    ...(actor.color?.trim() ? {color: actor.color.trim()} : {}),
  }
}

function cloneActor(actor: RevisionActorSnapshot): RevisionActorSnapshot {
  return {...actor}
}

function cloneRecord<T extends RevisionRecord>(record: T): T {
  return structuredClone(record)
}

function cloneResolvedRevision(record: ResolvedRevision): ResolvedRevision {
  return structuredClone(record)
}

function cloneDecision(decision: RevisionDecision): RevisionDecision {
  return structuredClone(decision)
}

function cloneSnapshot(snapshot: IBlockSnapshot): IBlockSnapshot {
  return structuredClone(snapshot)
}

function cloneDelta(delta: DeltaInsert): DeltaInsert {
  return structuredClone(delta)
}

function compareRevision(a: Pick<RevisionRecord, 'createdAt' | 'id'>, b: Pick<RevisionRecord, 'createdAt' | 'id'>): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

function compareDecision(a: RevisionDecision, b: RevisionDecision): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

function revisionBlockIds(record: RevisionRecord): string[] {
  if (record.target.kind === 'text') return [record.target.blockId]
  if (record.target.kind === 'block') return [...record.target.blockIds]
  return [record.target.leftBlockId, record.target.rightBlockId]
}

function isStructural(record: RevisionRecord): boolean {
  return record.target.kind !== 'text'
}

function affectedBlockIds(record: RevisionRecord, doc: BlockCraftDoc): Set<string> {
  const ids = new Set(revisionBlockIds(record))
  if (record.target.kind === 'block') ids.add(record.target.parentId)
  if (record.target.kind === 'block' && record.kind === 'block-delete') {
    record.target.blockIds.forEach(blockId => collectDescendants(blockId, doc, ids))
  }
  return ids
}

function collectDescendants(blockId: string, doc: BlockCraftDoc, out: Set<string>): void {
  doc.model.getChildrenIds(blockId).forEach(childId => {
    if (out.has(childId)) return
    out.add(childId)
    collectDescendants(childId, doc, out)
  })
}

function intersectAffectedBlocks(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter(id => right.has(id)).sort()
}

function mergeStatus(current: RevisionStatus | null, next: RevisionStatus): RevisionStatus {
  if (!current) return next
  if (current === 'conflict' || next === 'conflict') return 'conflict'
  if (current === next) return current
  if (current === 'pending' || next === 'pending') return 'pending'
  return 'conflict'
}

function resolveInlinePresentation(
  revisions: readonly ResolvedRevision[],
  byId: ReadonlyMap<string, ResolvedRevision>,
  viewMode: RevisionViewMode,
): {
  ids: string[]
  kind: 'insert' | 'delete' | null
  state: RevisionStatus | null
  hidden: boolean
} {
  if (!revisions.length) return {ids: [], kind: null, state: null, hidden: false}
  const hiddenByAncestor = revisions.some(record =>
    hasRejectedInsertionAncestor(record, byId))
  const hidden = hiddenByAncestor || revisions.some(record =>
    (record.kind === 'text-insert' && record.status === 'rejected') ||
    (record.kind === 'text-delete' && (
      record.status === 'accepted' ||
      (viewMode === 'final' && record.status === 'pending')
    )))
  const state = revisions.some(record => record.status === 'conflict')
    ? 'conflict'
    : revisions.some(record => record.status === 'pending')
      ? 'pending'
      : revisions.every(record => record.status === 'accepted')
        ? 'accepted'
        : 'rejected'
  const marked = revisions.filter(record =>
    record.status === 'pending' || record.status === 'conflict')
  const kindSource = marked.length ? marked : revisions
  const kind = kindSource.some(record => record.kind === 'text-delete')
    ? 'delete'
    : 'insert'
  return {ids: revisions.map(record => record.id).sort(), kind, state, hidden}
}

function hasRejectedInsertionAncestor(
  record: RevisionRecord,
  byId: ReadonlyMap<string, ResolvedRevision>,
  visited = new Set<string>(),
): boolean {
  if (visited.has(record.id)) return false
  visited.add(record.id)
  return record.dependsOn.some(id => {
    const dependency = byId.get(id)
    if (!dependency) return false
    return (
      dependency.kind === 'text-insert' && dependency.status === 'rejected'
    ) || hasRejectedInsertionAncestor(dependency, byId, visited)
  })
}

function deltaLength(deltas: readonly DeltaInsert[]): number {
  return deltas.reduce((length, delta) =>
    length + (typeof delta.insert === 'string' ? delta.insert.length : 1), 0)
}

function sliceDeltas(deltas: readonly DeltaInsert[], from: number, to: number): DeltaInsert[] {
  const out: DeltaInsert[] = []
  let offset = 0
  for (const delta of deltas) {
    const length = typeof delta.insert === 'string' ? delta.insert.length : 1
    const start = Math.max(from, offset)
    const end = Math.min(to, offset + length)
    if (end > start) {
      if (typeof delta.insert === 'string') {
        out.push({
          insert: delta.insert.slice(start - offset, end - offset),
          ...(delta.attributes ? {attributes: structuredClone(delta.attributes)} : {}),
        })
      } else {
        out.push(cloneDelta(delta))
      }
    }
    offset += length
    if (offset >= to) break
  }
  return out
}

function pushMergedDelta(out: DeltaInsert[], next: DeltaInsert): void {
  const previous = out.at(-1)
  if (
    previous &&
    typeof previous.insert === 'string' &&
    typeof next.insert === 'string' &&
    JSON.stringify(previous.attributes ?? {}) === JSON.stringify(next.attributes ?? {})
  ) {
    previous.insert += next.insert
    return
  }
  out.push(next)
}

function visitSnapshots(snapshot: IBlockSnapshot, visitor: (snapshot: IBlockSnapshot) => void): void {
  visitor(snapshot)
  if (snapshot.nodeType === BlockNodeType.root || snapshot.nodeType === BlockNodeType.block) {
    snapshot.children.forEach(child => visitSnapshots(child, visitor))
  }
}

function filterSnapshotBlocks(snapshot: IBlockSnapshot, remove: ReadonlySet<string>): void {
  if (snapshot.nodeType !== BlockNodeType.root && snapshot.nodeType !== BlockNodeType.block) return
  snapshot.children = snapshot.children.filter(child => !remove.has(child.id))
  snapshot.children.forEach(child => filterSnapshotBlocks(child, remove))
}

function mergeSnapshotBoundary(root: IBlockSnapshot, target: RevisionBoundaryTarget): boolean {
  let merged = false
  visitSnapshots(root, parent => {
    if (merged || parent.id !== target.parentId) return
    if (parent.nodeType !== BlockNodeType.root && parent.nodeType !== BlockNodeType.block) return
    const leftIndex = parent.children.findIndex(child => child.id === target.leftBlockId)
    const rightIndex = parent.children.findIndex(child => child.id === target.rightBlockId)
    if (leftIndex < 0 || rightIndex !== leftIndex + 1) return
    const left = parent.children[leftIndex]
    const right = parent.children[rightIndex]
    if (left.nodeType !== BlockNodeType.editable || right.nodeType !== BlockNodeType.editable) return
    left.children = [...left.children, ...right.children]
    parent.children.splice(rightIndex, 1)
    merged = true
  })
  return merged
}

function removeDeltaRanges(
  deltas: readonly DeltaInsert[],
  ranges: readonly {start: number; end: number}[],
): DeltaInsert[] {
  const total = deltaLength(deltas)
  const out: DeltaInsert[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) out.push(...sliceDeltas(deltas, cursor, range.start))
    cursor = Math.max(cursor, range.end)
  }
  if (cursor < total) out.push(...sliceDeltas(deltas, cursor, total))
  return out
}

function mergeRanges(
  ranges: readonly {start: number; end: number}[],
): Array<{start: number; end: number}> {
  const sorted = ranges
    .filter(range => range.end > range.start)
    .map(range => ({...range}))
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Array<{start: number; end: number}> = []
  for (const range of sorted) {
    const previous = out.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else out.push(range)
  }
  return out
}

function normalizeEpoch(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index])
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
