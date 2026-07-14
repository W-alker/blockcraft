import * as Y from "yjs";
import {YBlock} from "../block-std";
import {ORIGIN_SKIP_SYNC} from "./crud";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {nextTick} from "../../global";
import type {ISelectionJSON, ISelectionPoint, ISelectionPointJSON} from "../modules/selection/types";

type UndoManagerEventName = 'stack-item-added' | 'stack-item-updated' | 'stack-item-popped' | 'stack-cleared'

type IRelativeSelectionTextPoint = {
  type: 'text'
  blockId: string
  position: Y.RelativePosition
}

// gap point captured for undo: a collapsed cursor beside a void/container block.
// Round-trips the `side` so undo/redo restores "before vs after" exactly instead
// of degrading to a whole-block `selected` snapshot.
type IRelativeSelectionGapPoint = {
  type: 'gap'
  blockId: string
  side: 'before' | 'after'
}

type IRelativeSelectionBoundaryPoint = {
  type: 'boundary'
  blockId: string
  index: number
  position: Y.RelativePosition
}

type IRelativeSelectionTableCellPoint = {
  type: 'table-cell'
  blockId: string
  tableId: string
}

type IRelativeSelectionPoint = {
  type: 'selected'
  blockId: string
} | IRelativeSelectionTextPoint | IRelativeSelectionGapPoint | IRelativeSelectionBoundaryPoint | IRelativeSelectionTableCellPoint

type IRelativeSelectionSnapshot = {
  anchor: IRelativeSelectionPoint
  head: IRelativeSelectionPoint
  commonParent: string
}

export class DocUndoManger {
  private _yUndoManager!: Y.UndoManager
  private _trackedOrigins = new Set<any>([ORIGIN_SKIP_SYNC, null])

  private _undoSelectionStack: Array<IRelativeSelectionSnapshot | null> = []
  private _redoSelectionStack: Array<IRelativeSelectionSnapshot | null> = []
  private _selectionReplayVersion = 0
  private _captureGroupDepth = 0
  private _captureTimeoutBeforeGroup: number | null = null
  readonly undoRedoing$ = new BehaviorSubject(false)

  /**
   * Pre-captured selection snapshot, taken BEFORE a transaction starts.
   * This solves the timing issue where stack-item-added fires AFTER the transaction
   * has already deleted blocks, making the selection endpoints inaccessible.
   */
  private _pendingSnapshot: IRelativeSelectionSnapshot | null | undefined = undefined

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

  private _clampIndex(index: number, min: number, max: number) {
    return Math.max(min, Math.min(index, max))
  }

  private _capturePointSafe(
    blockId: string,
    type: 'text' | 'selected' | 'gap' | 'boundary' | 'table-cell',
    offset: number,
    side?: 'before' | 'after',
    tableId?: string,
  ): IRelativeSelectionPoint | null {
    if (type === 'gap') {
      return {type: 'gap', blockId, side: side ?? 'before'}
    }
    if (type === 'table-cell') {
      if (!tableId) return null
      try {
        this.doc.getBlockById(blockId)
        this.doc.getBlockById(tableId)
      } catch {
        return null
      }
      return {type: 'table-cell', blockId, tableId}
    }
    if (type === 'selected') {
      return {type: 'selected', blockId}
    }
    try {
      const block = this.doc.getBlockById(blockId)
      if (type === 'boundary') {
        if (block.nodeType === 'editable') return null
        const yChildren = block.yBlock.get('children') as Y.Array<string>
        const safeIndex = this._clampIndex(offset, 0, yChildren.length)
        return {
          type: 'boundary',
          blockId,
          index: safeIndex,
          position: Y.createRelativePositionFromTypeIndex(yChildren, safeIndex),
        }
      }
      if (!this.doc.isEditable(block)) return null
      const safeIndex = this._clampIndex(offset, 0, block.textLength)
      return {
        type: 'text',
        blockId,
        position: Y.createRelativePositionFromTypeIndex(block.yText, safeIndex)
      }
    } catch {
      return null
    }
  }

  private _captureSelectionSnapshot(): IRelativeSelectionSnapshot | null {
    const sel = this.doc.selection.value
    if (!sel) return null

    try {
      const capturePoint = (point: ISelectionPoint) => {
        if (point.type === 'gap') {
          return this._capturePointSafe(point.blockId, 'gap', 0, point.side)
        }
        if (point.type === 'boundary') {
          return this._capturePointSafe(point.blockId, 'boundary', point.index)
        }
        if (point.type === 'table-cell') {
          return this._capturePointSafe(point.blockId, 'table-cell', 0, undefined, point.tableId)
        }
        return this._capturePointSafe(
          point.blockId,
          point.type,
          point.type === 'text' ? point.offset : 0,
        )
      }

      const anchor = capturePoint(sel.anchor)
      if (!anchor) return null
      const head = capturePoint(sel.head)
      if (!head) return null

      return {anchor, head, commonParent: sel.commonParent}
    } catch {
      return null
    }
  }

  private _resolveSelectionPoint(point: IRelativeSelectionPoint): ISelectionPointJSON | null {
    if (point.type === 'gap') {
      try {
        this.doc.getBlockById(point.blockId)
      } catch {
        return null
      }
      return {
        type: 'gap',
        blockId: point.blockId,
        side: point.side,
      }
    }

    if (point.type === 'selected') {
      try {
        this.doc.getBlockById(point.blockId)
      } catch {
        return null
      }
      return {
        type: 'selected',
        blockId: point.blockId
      }
    }

    if (point.type === 'boundary') {
      let block: BlockCraft.BlockComponent
      try {
        block = this.doc.getBlockById(point.blockId)
      } catch {
        return null
      }
      if (block.nodeType === 'editable') return null
      const yChildren = block.yBlock.get('children') as Y.Array<string>
      const absPos = Y.createAbsolutePositionFromRelativePosition(point.position, this.doc.yDoc)
      const index = absPos && absPos.type === yChildren
        ? this._clampIndex(absPos.index, 0, yChildren.length)
        : this._clampIndex(point.index, 0, yChildren.length)
      return {
        type: 'boundary',
        blockId: point.blockId,
        index,
      }
    }

    if (point.type === 'table-cell') {
      try {
        this.doc.getBlockById(point.blockId)
        this.doc.getBlockById(point.tableId)
      } catch {
        return null
      }
      return {
        type: 'table-cell',
        blockId: point.blockId,
        tableId: point.tableId,
      }
    }

    let block: BlockCraft.BlockComponent
    try {
      block = this.doc.getBlockById(point.blockId)
    } catch {
      return null
    }

    if (!this.doc.isEditable(block)) return null

    const absPos = Y.createAbsolutePositionFromRelativePosition(point.position, this.doc.yDoc)
    if (!absPos || absPos.type !== block.yText) return null

    const index = this._clampIndex(absPos.index, 0, block.textLength)
    return {
      type: 'text',
      blockId: point.blockId,
      offset: index,
    }
  }

  private _resolveSelectionSnapshot(snapshot: IRelativeSelectionSnapshot | null): ISelectionJSON | null {
    if (!snapshot) return null

    const anchor = this._resolveSelectionPoint(snapshot.anchor)
    if (!anchor) return null
    const head = this._resolveSelectionPoint(snapshot.head)
    if (!head) return null

    return {
      anchor,
      head,
      commonParent: snapshot.commonParent,
    }
  }

  private _nextSelectionReplayVersion() {
    this._selectionReplayVersion += 1
    return this._selectionReplayVersion
  }

  private _isCurrentSelectionReplay(version: number) {
    return version === this._selectionReplayVersion
  }

  private _replaySelectionAfterUndoRedo(snapshot: IRelativeSelectionSnapshot | null, version = this._nextSelectionReplayVersion()) {
    this.undoRedoing$.pipe(take(1)).subscribe(() => {
      nextTick().then(() => {
        if (!this._isCurrentSelectionReplay(version)) return
        this._tryReplaySelectionAfterUndoRedo(snapshot, 3, version)
      })
    })
  }

  private _tryReplaySelectionAfterUndoRedo(snapshot: IRelativeSelectionSnapshot | null, attemptsLeft: number, version: number) {
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

  private _focusEditingHostFromSnapshot(snapshot: IRelativeSelectionSnapshot | null | undefined) {
    this._focusEditingHost(snapshot?.anchor?.blockId)
  }

  clearHistory() {
    this._yUndoManager.clear()
    this._undoSelectionStack = []
    this._redoSelectionStack = []
  }


}
