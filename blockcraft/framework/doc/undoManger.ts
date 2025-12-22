import * as Y from "yjs";
import {YBlock} from "../block-std";
import {ORIGIN_SKIP_SYNC} from "./crud";
import {IBlockSelectionJSON} from "../modules";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {nextTick} from "../../global";

type UndoManagerEventName = 'stack-item-added' | 'stack-item-updated' | 'stack-item-popped' | 'stack-cleared'

export class DocUndoManger {
  private _yUndoManager!: Y.UndoManager
  private _trackedOrigins = new Set<any>([ORIGIN_SKIP_SYNC, null])

  private _undoSelectionStack: Array<IBlockSelectionJSON | null> = []
  private _redoSelectionStack: Array<IBlockSelectionJSON | null> = []
  readonly undoRedoing$ = new BehaviorSubject(false)

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
        // console.log('%cundo stack', 'background: #444;', this.yUndoManager.undoStack, this.doc.selection)
        this._undoSelectionStack.push(this.doc.selection.value ? this.doc.selection.value.toJSON() : null)
        if (this._undoSelectionStack.length > 200) {
          this._yUndoManager.undoStack.shift()
          this._yUndoManager.redoStack.shift()
          this._undoSelectionStack.shift()
        }
      }
    })
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
    this._redoSelectionStack.push(this.doc.selection.value)

    this._yUndoManager.undo()
    const last = this._undoSelectionStack.pop()
    if (last === undefined) return
    this._replaySelectionAfterUndoRedo(last)
  }

  redo() {
    if (!this.isCanRedo() || this.undoRedoing$.value) return
    this.undoRedoing$.next(true)

    this._yUndoManager.redo()
    const last = this._redoSelectionStack.pop()
    if (last === undefined) return
    this._replaySelectionAfterUndoRedo(last)
  }

  private _replaySelectionAfterUndoRedo(selection: IBlockSelectionJSON | null) {
    this.undoRedoing$.pipe(take(1)).subscribe(() => {
      nextTick().then(() => {
        try {
          this.doc.selection.replay(selection)
        } catch (e) {
          this.doc.selection.recalculate()
          this.doc.logger.warn('UNDO时选区出现问题')
        }
      })
    })
  }

  clearHistory() {
    this._yUndoManager.clear()
    this._undoSelectionStack = []
    this._redoSelectionStack = []
  }


}
