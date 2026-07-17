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
    const version = ++this.restoreVersion
    this.surface.focusEditingHost(bookmark?.anchor.blockId)
    void nextTick().then(() => {
      if (!this.isCurrent(version)) return
      this.tryResolveAndReplay(bookmark, 3, version)
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.restoreVersion += 1
    this.frames.forEach(frame => this.surface.cancelFrame(frame))
    this.frames.clear()
  }

  private tryResolveAndReplay(
    bookmark: RelativeSelectionBookmark | null,
    attemptsLeft: number,
    version: number,
  ): void {
    if (!this.isCurrent(version)) return
    if (!bookmark) {
      this.host.replay(null)
      return
    }

    let selection: ISelectionJSON | null = null
    try {
      selection = resolveRelativeSelectionBookmark(bookmark, this.doc)
    } catch {
      // A restored block may not be mounted in the component tree yet.
    }
    if (!selection) {
      if (attemptsLeft > 0) {
        this.scheduleFrame(() => this.tryResolveAndReplay(bookmark, attemptsLeft - 1, version))
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
  ): void {
    if (!this.isCurrent(version)) return
    try {
      this.surface.focusEditingHost(selection.anchor.blockId)
      this.host.replay(selection)
    } catch {
      if (attemptsLeft > 0) {
        this.scheduleFrame(() => this.replayResolved(selection, attemptsLeft - 1, version))
      } else {
        this.host.replay(null)
      }
      return
    }

    if (attemptsLeft <= 0) return
    this.scheduleFrame(() => {
      if (!this.isCurrent(version)) return
      if (!this.hasRestoredSelection(selection)) {
        this.replayResolved(selection, attemptsLeft - 1, version)
      }
    })
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
}

function isModelOnlySelection(selection: ISelectionJSON): boolean {
  return selection.anchor.type === 'table-cell' && selection.head.type === 'table-cell'
}
