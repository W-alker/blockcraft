import type {IBlockSnapshot} from '../block-std'

export type RevisionMode = 'off' | 'track'
export type RevisionViewMode = 'markup' | 'final'
export type RevisionDecisionAction = 'accept' | 'reject'
export type RevisionStatus = 'pending' | 'accepted' | 'rejected' | 'conflict'

export type RevisionKind =
  | 'text-insert'
  | 'text-delete'
  | 'block-insert'
  | 'block-delete'
  | 'block-split'
  | 'block-merge'

export interface RevisionActorSnapshot {
  actorId: string
  displayName?: string
  avatarUrl?: string
  color?: string
}

/** Encoded `Y.RelativePosition` values. Treat the byte arrays as opaque. */
export interface RevisionTextTarget {
  kind: 'text'
  blockId: string
  start: number[]
  end: number[]
}

export interface RevisionBlockTarget {
  kind: 'block'
  blockIds: string[]
  parentId: string
}

export interface RevisionBoundaryTarget {
  kind: 'boundary'
  parentId: string
  leftBlockId: string
  rightBlockId: string
}

export type RevisionTarget =
  | RevisionTextTarget
  | RevisionBlockTarget
  | RevisionBoundaryTarget

export interface RevisionRecord {
  id: string
  groupId: string
  kind: RevisionKind
  actor: RevisionActorSnapshot
  createdAt: string
  target: RevisionTarget
  dependsOn: string[]
}

export interface RevisionDecision {
  id: string
  revisionId: string
  action: RevisionDecisionAction
  actor: RevisionActorSnapshot
  createdAt: string
  supersedes: string[]
}

export interface ResolvedRevision extends RevisionRecord {
  status: RevisionStatus
  activeDecisionIds: string[]
}

export interface RevisionOverlapConflict {
  id: string
  revisionIds: string[]
  blockIds: string[]
  kind: 'structure-overlap'
}

export interface RevisionListQuery {
  status?: RevisionStatus | readonly RevisionStatus[]
  actorId?: string
  kind?: RevisionKind | readonly RevisionKind[]
}

export interface RevisionCheckpoint {
  epoch: number
  stateVector: Uint8Array | readonly number[]
}

export interface RevisionConfig {
  actor?: RevisionActorSnapshot
  mode?: RevisionMode
}

/** Options for one synchronous, explicitly attributed revision write scope. */
export interface RevisionWriteScopeOptions {
  /** Reuse this review-card group instead of generating one for the scope. */
  groupId?: string
}

export interface RevisionSnapshotTextTarget {
  kind: 'text'
  blockId: string
  start: number
  end: number
}

export type RevisionSnapshotTarget =
  | RevisionSnapshotTextTarget
  | RevisionBlockTarget
  | RevisionBoundaryTarget

export interface RevisionSnapshotRecord extends Omit<RevisionRecord, 'target'> {
  target: RevisionSnapshotTarget
}

export interface BlockCraftDocumentSnapshot {
  version: 1
  root: IBlockSnapshot
  revisions: RevisionSnapshotRecord[]
  decisions: RevisionDecision[]
  revisionEpoch: number
}

export interface RevisionStateSnapshot {
  mode: RevisionMode
  viewMode: RevisionViewMode
  revisions: ResolvedRevision[]
  conflicts: RevisionOverlapConflict[]
  epoch: number
}

export interface RevisionDomainChange {
  kind: 'records' | 'decisions' | 'meta'
  revisionIds: readonly string[]
  groupIds: readonly string[]
  /** Structural conflict projection may need a cold-path refresh. */
  conflictsChanged: boolean
}

export interface RevisionReviewAction {
  type: 'accept' | 'reject' | 'redecide'
  revisionId: string
  action?: RevisionDecisionAction
}
