import * as Y from 'yjs'

export type RemoteDocSyncPhase = 'before-view-sync' | 'after-view-sync'

/**
 * Model-level notification around one remote Yjs transaction being projected
 * into the mounted block tree. Consumers must not mutate the transaction.
 */
export interface IRemoteDocSyncLifecycleEvent {
  readonly phase: RemoteDocSyncPhase
  readonly transaction: Y.Transaction
  readonly origin: unknown
  readonly isUndoRedo: boolean
  readonly affectedBlockIds: ReadonlySet<string>
}
