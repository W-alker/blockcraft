import {Observable, Subscription} from 'rxjs'
import {isNativeInputTarget} from '../../utils'
import {IRemoteDocSyncLifecycleEvent} from '../../doc/sync-lifecycle'
import {
  LiveSelectionBookmarkSnapshot,
  LiveSelectionBookmarkTracker,
} from './live-bookmark-tracker'
import {
  remoteChangeAffectsRelativeSelectionBookmark,
  resolveRelativeSelectionBookmark,
} from './relative-bookmark'
import {SelectionSurfaceAdapter} from './surface-adapter'
import {BlockSelection} from './blockSelection'

export class RemoteSelectionReconciler {
  private readonly bookmarkSnapshots = new WeakMap<object, LiveSelectionBookmarkSnapshot>()
  private readonly bookmarkTracker: LiveSelectionBookmarkTracker
  private readonly subscription: Subscription
  private pendingState: LiveSelectionBookmarkSnapshot | null = null
  private reconcileFrame: number | null = null
  private destroyed = false

  constructor(
    private readonly doc: BlockCraft.Doc,
    syncLifecycle$: Observable<IRemoteDocSyncLifecycleEvent>,
    selectionChanges$: Observable<BlockSelection | null>,
    private readonly surface: SelectionSurfaceAdapter,
  ) {
    this.bookmarkTracker = new LiveSelectionBookmarkTracker(doc, selectionChanges$)
    this.subscription = syncLifecycle$.subscribe(event => this.onSyncLifecycle(event))
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.subscription.unsubscribe()
    this.bookmarkTracker.destroy()
    this.pendingState = null
    if (this.reconcileFrame !== null) {
      this.surface.cancelFrame(this.reconcileFrame)
      this.reconcileFrame = null
    }
  }

  private onSyncLifecycle(event: IRemoteDocSyncLifecycleEvent): void {
    if (this.destroyed) return
    if (event.phase === 'before-view-sync') {
      this.bookmarkSnapshots.set(event.transaction, this.bookmarkTracker.snapshot())
      return
    }

    const state = this.bookmarkSnapshots.get(event.transaction) ?? null
    this.bookmarkSnapshots.delete(event.transaction)
    if (!state?.bookmark || !remoteChangeAffectsRelativeSelectionBookmark(
      state.bookmark,
      event.affectedBlockIds,
      this.doc,
    )) return

    this.pendingState = state
    if (this.reconcileFrame !== null) return
    this.reconcileFrame = this.surface.requestFrame(() => {
      this.reconcileFrame = null
      const pending = this.pendingState
      this.pendingState = null
      if (pending) this.reconcile(pending)
    })
  }

  private reconcile(state: LiveSelectionBookmarkSnapshot): void {
    if (this.destroyed || !this.doc.isInitialized || !state.bookmark) return

    // CompositionSession owns the insertion anchor until compositionend. The
    // Y.Text may already include a remote patch while the composing DOM/blot
    // view intentionally still reflects the pre-patch text. Replaying the
    // mapped bookmark here would project a new model offset into that stale DOM
    // and can dismiss the native IME or clear its selection. compositionend
    // resolves the same Yjs-relative anchor and performs one final projection.
    if (this.doc.inputManger?.compositionSession?.isActive) return

    const active = this.surface.getActiveElement()
    if (!this.surface.hasEditorFocus() || isNativeInputTarget(active)) return

    if (!this.bookmarkTracker.isCurrent(state.revision)) {
      // Removing the selected scope can invalidate and publish a null model
      // selection during view sync, while the browser places a new caret in a
      // surviving editing host. Recover that native fallback, but never replace
      // a newer live model selection created by user or programmatic intent.
      if (!this.doc.selection.value && this.surface.ownsNativeSelection()) {
        this.doc.selection.recalculate()
      }
      return
    }

    const mapped = resolveRelativeSelectionBookmark(state.bookmark, this.doc)
    if (mapped) {
      this.doc.selection.replay(mapped)
      return
    }

    if (this.surface.ownsNativeSelection()) {
      this.doc.selection.recalculate()
    } else {
      this.doc.selection.replay(null)
    }
  }
}
