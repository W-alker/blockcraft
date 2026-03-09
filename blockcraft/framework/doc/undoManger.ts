import * as Y from "yjs";
import {YBlock} from "../block-std";
import {ORIGIN_SKIP_SYNC} from "./crud";
import type {IBlockSelectionJSON} from "../modules";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {nextTick} from "../../global";
import type {IBlockRange} from "../modules/selection/types";
import {getCommonPath} from "../utils";

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
        this._undoSelectionStack.push(this._captureSelectionSnapshot())
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
    this._redoSelectionStack.push(this._captureSelectionSnapshot())

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

  private _clampIndex(index: number, min: number, max: number) {
    return Math.max(min, Math.min(index, max))
  }

  private _captureSelectionPoint(range: IBlockRange): IRelativeSelectionPoint {
    if (range.type === 'selected') {
      return {
        type: 'selected',
        blockId: range.blockId
      }
    }

    const safeIndex = this._clampIndex(range.index, 0, range.block.textLength)
    return {
      type: 'text',
      blockId: range.blockId,
      length: range.length,
      position: Y.createRelativePositionFromTypeIndex(range.block.yText, safeIndex)
    }
  }

  private _captureSelectionSnapshot(): IRelativeSelectionSnapshot | null {
    const selection = this.doc.selection.value
    if (!selection) return null

    return {
      from: this._captureSelectionPoint(selection.from),
      to: selection.to ? this._captureSelectionPoint(selection.to) : null
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

    const kind = (() => {
      const boundaryBlocks = [from.blockId, to?.blockId].filter(Boolean).map(id => this.doc.getBlockById(id!))
      const isTableBoundary = boundaryBlocks.length > 0 && boundaryBlocks.every(block => block.flavour === 'table-cell')
      if (isTableBoundary) return 'table' as const
      if (!to) return from.type === 'selected' ? 'block' as const : 'text' as const
      if (from.type === 'selected' && to.type === 'selected') return 'block' as const
      if (from.type === 'text' && to.type === 'text' && from.blockId === to.blockId) return 'text' as const
      return 'mixed' as const
    })()

    const selectedBlockIds = (() => {
      if (!to) return [from.blockId]
      const uniqueBlocks = new Map<string, string>()
      uniqueBlocks.set(from.blockId, from.blockId)
      uniqueBlocks.set(to.blockId, to.blockId)
      this.doc.queryBlocksThroughPathDeeply(from.blockId, to.blockId).forEach(through => {
        through.group.forEach(id => uniqueBlocks.set(id, id))
      })
      return [...uniqueBlocks.keys()].sort((left, right) => {
        const position = this.doc.getBlockById(left).hostElement.compareDocumentPosition(this.doc.getBlockById(right).hostElement)
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return 0
      })
    })()

    const commonParent = (() => {
      if (!to) return from.blockId
      const commonPath = getCommonPath(this.doc.getBlockPath(from.blockId), this.doc.getBlockPath(to.blockId))
      return commonPath.at(-1) || from.blockId
    })()

    return {
      kind,
      from,
      to,
      collapsed: !to && from.type === 'text' && from.length === 0,
      commonParent,
      selectedBlockIds
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
