import * as Y from "yjs";
import {YBlock} from "../block-std";
import {ORIGIN_SKIP_SYNC} from "./crud";
import type {IBlockSelectionJSON} from "../modules";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {nextTick} from "../../global";
import type {ISelectionPoint} from "../modules/selection/types";

type UndoManagerEventName = 'stack-item-added' | 'stack-item-updated' | 'stack-item-popped' | 'stack-cleared'

type IRelativeSelectionTextPoint = {
  type: 'text'
  blockId: string
  length: number
  position: Y.RelativePosition
}

type IRelativeSelectionPoint = {
  type: 'selected'
  blockId: string
} | IRelativeSelectionTextPoint

type IRelativeSelectionSnapshot = {
  from: IRelativeSelectionPoint
  to: IRelativeSelectionPoint | null
}

export class DocUndoManger {
  private _yUndoManager!: Y.UndoManager
  private _trackedOrigins = new Set<any>([ORIGIN_SKIP_SYNC, null])

  private _undoSelectionStack: Array<IRelativeSelectionSnapshot | null> = []
  private _redoSelectionStack: Array<IRelativeSelectionSnapshot | null> = []
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
  }

  /**
   * Pre-capture the current selection for the undo stack.
   * Call this BEFORE a transaction that may delete blocks referenced by the current selection.
   */
  captureSelectionBeforeChange() {
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
    this.undoRedoing$.next(true)
    try {
      this._redoSelectionStack.push(this._captureSelectionSnapshot())
      this._yUndoManager.undo()
      const last = this._undoSelectionStack.pop()
      if (last !== undefined) this._replaySelectionAfterUndoRedo(last)
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
    this.undoRedoing$.next(true)
    try {
      this._yUndoManager.redo()
      const last = this._redoSelectionStack.pop()
      if (last !== undefined) this._replaySelectionAfterUndoRedo(last)
    } finally {
      this.undoRedoing$.next(false)
    }
  }

  private _clampIndex(index: number, min: number, max: number) {
    return Math.max(min, Math.min(index, max))
  }

  private _capturePointSafe(blockId: string, type: 'text' | 'selected', offset: number, length: number): IRelativeSelectionPoint | null {
    if (type === 'selected') {
      return {type: 'selected', blockId}
    }
    try {
      const block = this.doc.getBlockById(blockId)
      if (!this.doc.isEditable(block)) return null
      const safeIndex = this._clampIndex(offset, 0, block.textLength)
      return {
        type: 'text',
        blockId,
        length,
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
      const s = sel.start, e = sel.end

      // Same-block: from captures [start.offset, end.offset)
      if (sel.isInSameBlock) {
        const len = s.type === 'text' && e.type === 'text' ? e.offset - s.offset : 0
        const from = this._capturePointSafe(s.blockId, s.type, s.type === 'text' ? s.offset : 0, len)
        return from ? {from, to: null} : null
      }

      // Cross-block:
      // - from captures [start.offset, end of start block)
      // - to captures [0, end.offset) in the end block
      //   Note: to range always starts at offset 0 in the end block
      const fromPoint = this._capturePointSafe(
        s.blockId, s.type, s.type === 'text' ? s.offset : 0,
        s.type === 'text' ? (s.block as any).textLength - s.offset : 0
      )
      if (!fromPoint) return null

      const endLen = e.type === 'text' ? e.offset : 0
      const toPoint = this._capturePointSafe(e.blockId, e.type, 0, endLen)

      return {from: fromPoint, to: toPoint}
    } catch {
      return null
    }
  }

  private _resolveSelectionPoint(point: IRelativeSelectionPoint): IBlockSelectionJSON['from'] | null {
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
    const maxLength = Math.max(0, block.textLength - index)
    const length = this._clampIndex(point.length, 0, maxLength)

    return {
      type: 'text',
      blockId: point.blockId,
      index,
      length
    }
  }

  private _resolveSelectionSnapshot(snapshot: IRelativeSelectionSnapshot | null): IBlockSelectionJSON | null {
    if (!snapshot) return null

    const from = this._resolveSelectionPoint(snapshot.from)
    if (!from) return null

    const to = snapshot.to ? this._resolveSelectionPoint(snapshot.to) : null
    if (snapshot.to && !to) return null

    return {
      from,
      to,
      collapsed: !to && from.type === 'text' && from.length === 0,
      commonParent: from.blockId
    }
  }

  private _replaySelectionAfterUndoRedo(snapshot: IRelativeSelectionSnapshot | null) {
    this.undoRedoing$.pipe(take(1)).subscribe(() => {
      nextTick().then(() => {
        try {
          if (snapshot === null) {
            this.doc.selection.replay(null)
            return
          }
          const selection = this._resolveSelectionSnapshot(snapshot)
          if (!selection) throw new Error('invalid undo selection')
          // Undo/redo swaps content; when the removed nodes held the caret, the browser
          // drops focus out of the contenteditable host. Since Ctrl+Z is bound to the
          // root block, an unfocused editor makes the NEXT undo silently no-op. Re-focus
          // the host before restoring the selection so keyboard undo keeps working.
          this._focusEditingHost(selection.from?.blockId)
          this.doc.selection.replay(selection)
        } catch (e) {
          this.doc.selection.recalculate()
          this.doc.logger.warn('UNDO时选区出现问题')
        }
      })
    })
  }

  /** Restore DOM focus to the editing host for a block, if it isn't already focused. */
  private _focusEditingHost(blockId?: string) {
    if (!blockId) return
    try {
      const block = this.doc.getBlockById(blockId)
      const host = (block.hostElement.closest('[contenteditable="true"]') as HTMLElement | null)
        ?? this.doc.root.hostElement
      if (host && document.activeElement !== host) {
        host.focus({preventScroll: true})
      }
    } catch {
      // block no longer exists — nothing to focus
    }
  }

  clearHistory() {
    this._yUndoManager.clear()
    this._undoSelectionStack = []
    this._redoSelectionStack = []
  }


}
