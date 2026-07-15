import * as Y from "yjs";
import {YBlock} from "../block-std";
import {ORIGIN_SKIP_SYNC} from "./crud";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {nextTick} from "../../global";
import type {ISelectionJSON, ISelectionPointJSON} from "../modules/selection/types";
import {
  captureRelativeSelectionBookmark,
  RelativeSelectionBookmark,
  resolveRelativeSelectionBookmark,
} from "../modules/selection/relative-bookmark";

type UndoManagerEventName = 'stack-item-added' | 'stack-item-updated' | 'stack-item-popped' | 'stack-cleared'

export class DocUndoManger {
  private _yUndoManager!: Y.UndoManager
  private _trackedOrigins = new Set<any>([ORIGIN_SKIP_SYNC, null])

  private _undoSelectionStack: Array<RelativeSelectionBookmark | null> = []
  private _redoSelectionStack: Array<RelativeSelectionBookmark | null> = []
  private _selectionReplayVersion = 0
  private _captureGroupDepth = 0
  private _captureTimeoutBeforeGroup: number | null = null
  readonly undoRedoing$ = new BehaviorSubject(false)

  /**
   * Pre-captured selection snapshot, taken BEFORE a transaction starts.
   * This solves the timing issue where stack-item-added fires AFTER the transaction
   * has already deleted blocks, making the selection endpoints inaccessible.
   */
  private _pendingSnapshot: RelativeSelectionBookmark | null | undefined = undefined

  constructor(private doc: BlockCraft.Doc, yBlockMap: Y.Map<YBlock>, options?: {
    trackedOrigins?: any[]
    captureTimeout?: number
  }) {
    this._yUndoManager = new Y.UndoManager(yBlockMap, {
      captureTimeout: options?.captureTimeout || 500,
      trackedOrigins: new Set<any>(options?.trackedOrigins || [ORIGIN_SKIP_SYNC, null])
    })

    this.on('stack-item-added', (evt) => {
      if (evt.type === 'undo') {
        // Use pre-captured snapshot if available, otherwise capture now (may fail for deleted blocks)
        const snapshot = this._pendingSnapshot !== undefined
          ? this._pendingSnapshot
          : this._captureSelectionSnapshot()
        this._pendingSnapshot = undefined
        this._undoSelectionStack.push(snapshot)
        if (this._undoSelectionStack.length > 200) {
          this._yUndoManager.undoStack.shift()
          this._yUndoManager.redoStack.shift()
          this._undoSelectionStack.shift()
        }
      }
    })
    this.on('stack-item-updated', (evt) => {
      if (evt.type === 'undo') {
        // A pre-captured snapshot belongs only to the next NEW stack item. If
        // Yjs merges the transaction into the previous item, keep that item's
        // original selection and discard the stale pending snapshot so it cannot
        // leak into a later unrelated undo record.
        this._pendingSnapshot = undefined
      }
    })
  }

  /**
   * Pre-capture the current selection for the undo stack.
   * Call this BEFORE a transaction that may delete blocks referenced by the current selection.
   */
  captureSelectionBeforeChange() {
    // The earliest caller owns the before-selection for the next stack item.
    // Nested mutation paths can capture again after the outer action has blurred
    // or replaced the live selection; allowing that later capture to overwrite
    // this slot would turn a valid snapshot into null (or a mid-action cursor).
    if (this._pendingSnapshot !== undefined) return
    this._pendingSnapshot = this._captureSelectionSnapshot()
  }

  /**
   * Force the next tracked transaction to begin a fresh undo stack item instead of
   * time-merging into the previous one (Yjs merges changes within `captureTimeout`).
   * Use before a discrete user action that must be independently undoable.
   */
  stopCapturing() {
    this._yUndoManager.stopCapturing()
  }

  /**
   * Group several Yjs transactions into one undo item regardless of elapsed wall
   * time. Used by IME flows where compositionStart materializes/deletes blocks and
   * compositionEnd commits text after the user may have spent seconds in the IME.
   */
  beginCaptureGroup() {
    if (this._captureGroupDepth++ > 0) return
    this._captureTimeoutBeforeGroup = this._yUndoManager.captureTimeout
    this._yUndoManager.stopCapturing()
    this._yUndoManager.captureTimeout = Number.MAX_SAFE_INTEGER
  }

  endCaptureGroup() {
    if (this._captureGroupDepth <= 0) return
    this._captureGroupDepth -= 1
    if (this._captureGroupDepth > 0) return
    if (this._captureTimeoutBeforeGroup !== null) {
      this._yUndoManager.captureTimeout = this._captureTimeoutBeforeGroup
      this._captureTimeoutBeforeGroup = null
    }
    this._pendingSnapshot = undefined
    this._yUndoManager.stopCapturing()
  }

  on(eventName: UndoManagerEventName, listener: (event: StackItemEvent) => void) {
    this._yUndoManager.on(eventName, listener)
  }

  off(eventName: UndoManagerEventName, listener: (event: StackItemEvent) => void) {
    this._yUndoManager.off(eventName, listener)
  }

  addTrackedOrigin(origin: any) {
    this._trackedOrigins.add(origin)
  }

  removeTrackedOrigin(origin: any) {
    this._trackedOrigins.delete(origin)
  }

  isCanUndo() {
    return this._yUndoManager.canUndo()
  }

  isCanRedo() {
    return this._yUndoManager.canRedo()
  }

  undo() {
    if (!this.isCanUndo() || this.undoRedoing$.value) return
    const replayVersion = this._nextSelectionReplayVersion()
    this.undoRedoing$.next(true)
    try {
      this._redoSelectionStack.push(this._captureSelectionSnapshot())
      this._clearLiveSelectionBeforeUndoRedo()
      this._yUndoManager.undo()
      const last = this._undoSelectionStack.pop()
      this._focusEditingHostFromSnapshot(last)
      if (last !== undefined) this._replaySelectionAfterUndoRedo(last, replayVersion)
    } finally {
      // The flag is normally cleared inside crud._syncYEvent during the undo
      // transaction. But if that observer throws before reaching the reset (e.g. a
      // children-sync hiccup while reverting a cross-block paste), it would stick
      // `true` and silently block EVERY subsequent undo/redo. Guarantee it here.
      this.undoRedoing$.next(false)
    }
  }

  redo() {
    if (!this.isCanRedo() || this.undoRedoing$.value) return
    const replayVersion = this._nextSelectionReplayVersion()
    this.undoRedoing$.next(true)
    try {
      this._clearLiveSelectionBeforeUndoRedo()
      this._yUndoManager.redo()
      const last = this._redoSelectionStack.pop()
      this._focusEditingHostFromSnapshot(last)
      if (last !== undefined) this._replaySelectionAfterUndoRedo(last, replayVersion)
    } finally {
      this.undoRedoing$.next(false)
    }
  }

  private _clearLiveSelectionBeforeUndoRedo() {
    if (!this.doc.selection.value) return
    this.doc.selection.replay(null)
  }

  private _captureSelectionSnapshot(): RelativeSelectionBookmark | null {
    return captureRelativeSelectionBookmark(this.doc.selection.value, this.doc)
  }

  private _resolveSelectionSnapshot(snapshot: RelativeSelectionBookmark | null): ISelectionJSON | null {
    return snapshot ? resolveRelativeSelectionBookmark(snapshot, this.doc) : null
  }

  private _nextSelectionReplayVersion() {
    this._selectionReplayVersion += 1
    return this._selectionReplayVersion
  }

  private _isCurrentSelectionReplay(version: number) {
    return version === this._selectionReplayVersion
  }

  private _replaySelectionAfterUndoRedo(snapshot: RelativeSelectionBookmark | null, version = this._nextSelectionReplayVersion()) {
    this.undoRedoing$.pipe(take(1)).subscribe(() => {
      nextTick().then(() => {
        if (!this._isCurrentSelectionReplay(version)) return
        this._tryReplaySelectionAfterUndoRedo(snapshot, 3, version)
      })
    })
  }

  private _tryReplaySelectionAfterUndoRedo(snapshot: RelativeSelectionBookmark | null, attemptsLeft: number, version: number) {
    if (!this._isCurrentSelectionReplay(version)) return
    try {
      if (snapshot === null) {
        this.doc.selection.replay(null)
        return
      }
      const selection = this._resolveSelectionSnapshot(snapshot)
      if (!selection) {
        if (attemptsLeft > 0) {
          requestAnimationFrame(() => this._tryReplaySelectionAfterUndoRedo(snapshot, attemptsLeft - 1, version))
        } else {
          this.doc.selection.replay(null)
        }
        return
      }
      this._replayResolvedSelectionAfterUndoRedo(selection, attemptsLeft, version)
    } catch (e) {
      if (attemptsLeft > 0) {
        requestAnimationFrame(() => this._tryReplaySelectionAfterUndoRedo(snapshot, attemptsLeft - 1, version))
      } else {
        this.doc.selection.replay(null)
      }
    }
  }

  private _replayResolvedSelectionAfterUndoRedo(selection: ISelectionJSON, attemptsLeft: number, version: number) {
    if (!this._isCurrentSelectionReplay(version)) return
    try {
      // Undo/redo swaps content; when the removed nodes held the caret, the browser
      // can drop focus out of the contenteditable host. Since Ctrl+Z is bound to the
      // root block, an unfocused editor makes the NEXT undo silently no-op.
      this._focusEditingHost(selection.anchor?.blockId)
      this.doc.selection.replay(selection)
    } catch {
      if (attemptsLeft > 0) {
        requestAnimationFrame(() => this._replayResolvedSelectionAfterUndoRedo(selection, attemptsLeft - 1, version))
      } else {
        this.doc.selection.replay(null)
      }
      return
    }

    if (attemptsLeft <= 0) return
    requestAnimationFrame(() => {
      if (!this._isCurrentSelectionReplay(version)) return
      if (!this._hasRestoredSelection(selection)) {
        this._replayResolvedSelectionAfterUndoRedo(selection, attemptsLeft - 1, version)
      }
    })
  }

  private _hasRestoredSelection(expected: ISelectionJSON) {
    const root = this.doc.root.hostElement
    if (!this._hasExpectedModelSelection(expected)) return false
    if (this._isModelOnlySelection(expected)) return true
    if (!root.isConnected) return true

    const active = document.activeElement
    const hasEditorFocus = !!active && (active === root || root.contains(active))
    if (!hasEditorFocus) return false

    try {
      const result = this.doc.selection.recalculate(false)
      if (!result || !('value' in result)) return true
      const domSelection = this._selectionValueToJSON(result.value)
      return !!domSelection && this._sameSelectionJSON(domSelection, expected)
    } catch {
      return false
    }
  }

  private _hasExpectedModelSelection(expected: ISelectionJSON) {
    const liveSelection = this._selectionValueToJSON(this.doc.selection.value)
    return !!liveSelection && this._sameSelectionJSON(liveSelection, expected)
  }

  private _isModelOnlySelection(selection: ISelectionJSON) {
    return selection.anchor.type === 'table-cell' && selection.head.type === 'table-cell'
  }

  private _selectionValueToJSON(value: unknown): ISelectionJSON | null {
    if (!value || typeof value !== 'object') return null
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      return value.toJSON() as ISelectionJSON
    }
    if ('anchor' in value && 'head' in value && 'commonParent' in value) {
      return value as ISelectionJSON
    }
    return null
  }

  private _sameSelectionJSON(a: ISelectionJSON, b: ISelectionJSON) {
    return a.commonParent === b.commonParent &&
      this._samePointJSON(a.anchor, b.anchor) &&
      this._samePointJSON(a.head, b.head)
  }

  private _samePointJSON(a: ISelectionPointJSON, b: ISelectionPointJSON) {
    return a.blockId === b.blockId &&
      a.type === b.type &&
      (a.offset ?? null) === (b.offset ?? null) &&
      (a.side ?? null) === (b.side ?? null) &&
      (a.index ?? null) === (b.index ?? null) &&
      (a.tableId ?? null) === (b.tableId ?? null)
  }

  /** Restore DOM focus to the editing host for a block, if it isn't already focused. */
  private _focusEditingHost(blockId?: string) {
    let host = this.doc.root.hostElement
    try {
      if (blockId) {
        const block = this.doc.getBlockById(blockId)
        host = (block.hostElement.closest('[contenteditable="true"]') as HTMLElement | null)
          ?? this.doc.root.hostElement
      }
    } catch {
      host = this.doc.root.hostElement
    }

    const active = document.activeElement
    if (host && active !== host && !host.contains(active)) {
      host.focus({preventScroll: true})
    }
  }

  private _focusEditingHostFromSnapshot(snapshot: RelativeSelectionBookmark | null | undefined) {
    this._focusEditingHost(snapshot?.anchor?.blockId)
  }

  clearHistory() {
    this._yUndoManager.clear()
    this._undoSelectionStack = []
    this._redoSelectionStack = []
  }


}
