import type {RevisionMode, RevisionViewMode} from '../../framework/revision'

export type RevisionToolbarIntent =
  | {type: 'set-mode'; mode: RevisionMode}
  | {type: 'set-view-mode'; viewMode: RevisionViewMode}

export type RevisionReviewIntent =
  | {type: 'activate'; itemId: string}
  | {type: 'keep'; itemId: string}
  | {type: 'revert'; itemId: string}
  | {type: 'keep-all'}
  | {type: 'revert-all'}
  | {type: 'resolve-overlap'; conflictId: string; keepRevisionIds: string[]}
  | {type: 'close'}

export type RevisionReviewPopoverIntent =
  | {type: 'previous'}
  | {type: 'next'}
  | {type: 'keep'; itemId: string}
  | {type: 'revert'; itemId: string}
  | {type: 'close'}

export type RevisionReviewFilter = 'all' | 'pending' | 'resolved'
