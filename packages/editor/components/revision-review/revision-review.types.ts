import type {
  RevisionDecisionAction,
  RevisionMode,
  RevisionViewMode,
} from '../../framework/revision'

export type RevisionToolbarIntent =
  | {type: 'set-mode'; mode: RevisionMode}
  | {type: 'set-view-mode'; viewMode: RevisionViewMode}

export type RevisionReviewIntent =
  | {type: 'accept-all'}
  | {type: 'reject-all'}
  | {type: 'accept-group'; groupId: string}
  | {type: 'reject-group'; groupId: string}
  | {type: 'redecide'; revisionId: string; action: RevisionDecisionAction}
  | {type: 'navigate'; revisionId: string}
  | {type: 'resolve-overlap'; conflictId: string; keepRevisionIds: string[]}
