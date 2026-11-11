import {nextTick} from '../../../global'
import {ISelectionJSON} from './types'
import {
  RelativeSelectionBookmark,
  resolveRelativeSelectionBookmark,
  sameSelectionJSON,
} from './relative-bookmark'
import {SelectionSurfaceAdapter} from './surface-adapter'

export interface SelectionHistoryRestoreHost {
  replay(selection: ISelectionJSON | null): void
  readModelSelection(): ISelectionJSON | null
  readDomSelection(): ISelectionJSON | null
  isProjectionPending(selection: ISelectionJSON): boolean
  isSelectionVisible(selection: ISelectionJSON): boolean
  ensureViewMounted(blockIds: readonly string[]): void
  scrollToBlock(blockId: string): boolean
  scrollSelectionIntoView(): void
}

export class SelectionHistoryRestorer {
  private restoreVersion = 0
  private readonly frames = new Set<number>()
  private destroyed = false

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly host: SelectionHistoryRestoreHost,
    private readonly surface: SelectionSurfaceAdapter,
  ) {}

  restore(bookmark: RelativeSelectionBookmark | null): void {
    if (this.destroyed) return
    const version = ++this.restoreVersion
    this.cancelFrames()
    this.surface.focusEditingHost(bookmark?.anchor.blockId)
    if (!bookmark) {
      this.host.replay(null)
      return
    }

    // A following Undo/Redo must capture this restored model selection, not
    // the temporary null used while the preceding transaction updates views.
    // Existing mounted targets can use the ordinary projection/retry boundary.
    const selection = resolveRelativeSelectionBookmark(bookmark, this.doc)
    if (selection) {
      this.replayResolved(selection, 3, version)
      return
    }

    const pendingSelection = this.host.readModelSelection()
    void nextTick().then(() => {
      if (!this.isPendingIntentCurrent(version, pendingSelection)) return
      this.tryResolveAndReplay(bookmark, 3, version, pendingSelection)
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.restoreVersion += 1
    this.cancelFrames()
  }

  private tryResolveAndReplay(
    bookmark: RelativeSelectionBookmark,
    attemptsLeft: number,
    version: number,
    pendingSelection: ISelectionJSON | null,
  ): void {
    if (!this.isPendingIntentCurrent(version, pendingSelection)) return

    let selection: ISelectionJSON | null = null
    try {
      this.host.ensureViewMounted(bookmarkTargetIds(bookmark))
      selection = resolveRelativeSelectionBookmark(bookmark, this.doc)
    } catch {
      // A restored block may not be mounted in the component tree yet.
    }
    if (!this.isPendingIntentCurrent(version, pendingSelection)) return
    if (!selection) {
      if (attemptsLeft > 0) {
        this.scheduleFrame(() => this.tryResolveAndReplay(bookmark, attemptsLeft - 1, version, pendingSelection))
      } else {
        this.host.replay(null)
      }
      return
    }
    this.replayResolved(selection, attemptsLeft, version)
  }

  private replayResolved(
    selection: ISelectionJSON,
    attemptsLeft: number,
    version: number,
    reveal = true,
  ): void {
    if (!this.isCurrent(version)) return
    const beforeReplay = this.host.readModelSelection()
    try {
      const wasVisible = reveal && this.host.isSelectionVisible(selection)
      this.surface.focusEditingHost(selection.anchor.blockId)
      this.host.replay(selection)
      if (!this.isCurrent(version) || !sameSelectionJSON(this.host.readModelSelection(), selection)) return
      if (reveal && !wasVisible && !this.host.scrollToBlock(selection.head.blockId)) {
        this.host.scrollSelectionIntoView()
      }
    } catch {
      if (!this.isCurrent(version)) return
      const pendingSelection = this.host.readModelSelection()
      if (!sameSelectionJSON(pendingSelection, beforeReplay) &&
        !sameSelectionJSON(pendingSelection, selection)) return
      if (attemptsLeft > 0) {
        this.scheduleFrame(() => {
          if (!this.isPendingIntentCurrent(version, pendingSelection)) return
          this.replayResolved(selection, attemptsLeft - 1, version, reveal)
        })
      } else {
        this.host.replay(null)
      }
      return
    }

    if (attemptsLeft <= 0) return
    this.scheduleFrame(() => this.verifyRestoredSelection(selection, attemptsLeft, version))
  }

  private verifyRestoredSelection(
    selection: ISelectionJSON,
    attemptsLeft: number,
    version: number,
  ): void {
    if (!this.isCurrent(version)) return
    if (this.host.isProjectionPending(selection)) {
      this.scheduleFrame(() => this.verifyRestoredSelection(selection, attemptsLeft, version))
      return
    }
    // A newer user/programmatic selection supersedes this history restore.
    // Retry only when the canonical model still matches and the DOM projection
    // is the part that failed; otherwise an old Undo frame can steal the next
    // caret or IME session under load.
    if (!sameSelectionJSON(this.host.readModelSelection(), selection)) return
    if (!this.hasRestoredSelection(selection)) {
      this.replayResolved(selection, attemptsLeft - 1, version, false)
    }
  }

  private hasRestoredSelection(expected: ISelectionJSON): boolean {
    if (!sameSelectionJSON(this.host.readModelSelection(), expected)) return false
    if (isModelOnlySelection(expected)) return true
    if (!this.surface.isRootConnected()) return true
    if (!this.surface.hasEditorFocus()) return false
    try {
      return sameSelectionJSON(this.host.readDomSelection(), expected)
    } catch {
      return false
    }
  }

  private scheduleFrame(callback: () => void): void {
    const frame = this.surface.requestFrame(() => {
      this.frames.delete(frame)
      callback()
    })
    this.frames.add(frame)
  }

  private isCurrent(version: number): boolean {
    return !this.destroyed && version === this.restoreVersion
  }

  private isPendingIntentCurrent(version: number, expected: ISelectionJSON | null): boolean {
    return this.isCurrent(version) && sameSelectionJSON(this.host.readModelSelection(), expected)
  }

  private cancelFrames(): void {
    this.frames.forEach(frame => this.surface.cancelFrame(frame))
    this.frames.clear()
  }
}

function isModelOnlySelection(selection: ISelectionJSON): boolean {
  return selection.anchor.type === 'table-cell' && selection.head.type === 'table-cell'
}

function bookmarkTargetIds(bookmark: RelativeSelectionBookmark): string[] {
  const ids = new Set<string>([
    bookmark.anchor.blockId,
    bookmark.head.blockId,
  ])
  if (bookmark.anchor.type === 'table-cell') ids.add(bookmark.anchor.tableId)
  if (bookmark.head.type === 'table-cell') ids.add(bookmark.head.tableId)
  return [...ids]
}
