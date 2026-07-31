import * as Y from "yjs";
import {YBlock} from "../block-std";
import {ORIGIN_SKIP_SYNC} from "./crud";
import {BehaviorSubject} from "rxjs";
import {StackItem, StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {
  captureRelativeSelectionBookmark,
  RelativeSelectionBookmark,
} from "../modules/selection/relative-bookmark";
import {BlockReadonlyError, BlockReadonlyOperation} from "./block-readonly.types";
import {BlockMutationPolicyError} from "./block-mutation-policy";

type UndoManagerEventName = 'stack-item-added' | 'stack-item-updated' | 'stack-item-popped' | 'stack-cleared'

const BLOCK_READONLY_AFFECTED_IDS = Symbol('block-readonly-affected-ids')
const SELECTION_BOOKMARK = Symbol('selection-bookmark')

export class DocUndoManger {
  private _yUndoManager!: Y.UndoManager
  private _trackedOrigins = new Set<any>([ORIGIN_SKIP_SYNC, null])

  private _captureGroupDepth = 0
  private _captureTimeoutBeforeGroup: number | null = null
  readonly undoRedoing$ = new BehaviorSubject(false)

  /**
   * Pre-captured selection snapshot, taken BEFORE a transaction starts.
   * This solves the timing issue where stack-item-added fires AFTER the transaction
   * has already deleted blocks, making the selection endpoints inaccessible.
   */
  private _pendingUndoSnapshot: RelativeSelectionBookmark | null | undefined = undefined
  private _pendingRedoSnapshot: RelativeSelectionBookmark | null | undefined = undefined

  constructor(private doc: BlockCraft.Doc, private readonly yBlockMap: Y.Map<YBlock>, options?: {
    trackedOrigins?: any[]
    captureTimeout?: number
  }) {
    this._yUndoManager = new Y.UndoManager(yBlockMap, {
      captureTimeout: options?.captureTimeout || 500,
      trackedOrigins: new Set<any>(options?.trackedOrigins || [ORIGIN_SKIP_SYNC, null])
    })

    this.on('stack-item-added', (evt) => {
      this._mergeAffectedBlockIds(evt)
      const pending = evt.type === 'undo'
        ? this._pendingUndoSnapshot
        : this._pendingRedoSnapshot
      if (!evt.stackItem.meta.has(SELECTION_BOOKMARK)) {
        evt.stackItem.meta.set(
          SELECTION_BOOKMARK,
          pending !== undefined ? pending : this._captureSelectionSnapshot(),
        )
      }
      if (evt.type === 'undo') {
        this._pendingUndoSnapshot = undefined
        if (this._yUndoManager.undoStack.length > 200) {
          this._yUndoManager.undoStack.shift()
          this._yUndoManager.redoStack.shift()
        }
      } else {
        this._pendingRedoSnapshot = undefined
      }
    })
    this.on('stack-item-updated', (evt) => {
      this._mergeAffectedBlockIds(evt)
      if (evt.type === 'undo') {
        // A pre-captured snapshot belongs only to the next NEW stack item. If
        // Yjs merges the transaction into the previous item, keep that item's
        // original selection and discard the stale pending snapshot so it cannot
        // leak into a later unrelated undo record.
        this._pendingUndoSnapshot = undefined
      } else {
        this._pendingRedoSnapshot = undefined
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
    if (this._pendingUndoSnapshot !== undefined) return
    this._pendingUndoSnapshot = this._captureSelectionSnapshot()
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
    this._pendingUndoSnapshot = undefined
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
    if (!this._isHistoryItemWritable('undo')) return
    this.undoRedoing$.next(true)
    try {
      const fallbackBookmark = this._captureSelectionSnapshot()
      this._pendingRedoSnapshot = fallbackBookmark
      this._clearLiveSelectionBeforeUndoRedo()
      const stackItem = this._yUndoManager.undo()
      this._pendingRedoSnapshot = undefined
      if (stackItem) {
        this.doc.selection.restoreBookmark(this._historyRestoreBookmark(
          this._selectionBookmark(stackItem),
          fallbackBookmark,
        ))
      }
    } finally {
      this._pendingRedoSnapshot = undefined
      // The flag is normally cleared inside crud._syncYEvent during the undo
      // transaction. But if that observer throws before reaching the reset (e.g. a
      // children-sync hiccup while reverting a cross-block paste), it would stick
      // `true` and silently block EVERY subsequent undo/redo. Guarantee it here.
      this.undoRedoing$.next(false)
    }
  }

  redo() {
    if (!this.isCanRedo() || this.undoRedoing$.value) return
    if (!this._isHistoryItemWritable('redo')) return
    this.undoRedoing$.next(true)
    try {
      const fallbackBookmark = this._captureSelectionSnapshot()
      this._pendingUndoSnapshot = fallbackBookmark
      this._clearLiveSelectionBeforeUndoRedo()
      const stackItem = this._yUndoManager.redo()
      this._pendingUndoSnapshot = undefined
      if (stackItem) {
        this.doc.selection.restoreBookmark(this._historyRestoreBookmark(
          this._selectionBookmark(stackItem),
          fallbackBookmark,
        ))
      }
    } finally {
      this._pendingUndoSnapshot = undefined
      this.undoRedoing$.next(false)
    }
  }

  private _clearLiveSelectionBeforeUndoRedo() {
    if (!this.doc.selection.value) return
    this.doc.selection.replay(null)
  }

  private _isHistoryItemWritable(type: 'undo' | 'redo'): boolean {
    const stack = type === 'undo'
      ? this._yUndoManager.undoStack
      : this._yUndoManager.redoStack
    const stackItem = stack.at(-1)
    if (!stackItem) return false

    // Lightweight/model-only consumers created before block readonly existed
    // may embed DocUndoManger without the document permission services.
    if (!this.doc.model || !this.doc.readonlyManager) return true

    const affectedIds = stackItem.meta.get(BLOCK_READONLY_AFFECTED_IDS) as Set<string> | undefined
    const reachableIds = [...(affectedIds ?? [])].filter(blockId => this.doc.model.exists(blockId))
    try {
      this.doc.mutationPolicy?.assert({
        operation: type,
        blockIds: reachableIds,
      })
      this.doc.readonlyManager.assertUndoRedoWritable(
        reachableIds,
        type === 'undo' ? BlockReadonlyOperation.Undo : BlockReadonlyOperation.Redo,
      )
      return true
    } catch (error) {
      if (
        error instanceof BlockReadonlyError ||
        error instanceof BlockMutationPolicyError
      ) {
        return false
      }
      throw error
    }
  }

  private _mergeAffectedBlockIds(event: StackItemEvent): void {
    const affectedIds = event.stackItem.meta.get(BLOCK_READONLY_AFFECTED_IDS) as Set<string> | undefined
    const merged = affectedIds ?? new Set<string>()

    event.changedParentTypes.forEach((events) => {
      for (const yEvent of events) {
        if (yEvent.target === this.yBlockMap && yEvent instanceof Y.YMapEvent) {
          yEvent.changes.keys.forEach((_change, blockId) => merged.add(blockId))
          continue
        }

        // A container's `children` array is an index of child ids. Updating it
        // does not mutate the container subtree itself, so recording the parent
        // would make an unrelated locked descendant block the whole undo item.
        // Inserted ids still matter (notably for moves, where the block map does
        // not change), while deleted blocks are covered by the yBlockMap event.
        if (this._isBlockChildrenArray(yEvent.target)) {
          for (const delta of yEvent.changes.delta) {
            const inserted = 'insert' in delta ? delta.insert : undefined
            if (!Array.isArray(inserted)) continue
            inserted.forEach(value => {
              if (typeof value === 'string') merged.add(value)
            })
          }
          continue
        }

        const targetId = this._findBlockIdForType(yEvent.target)
        if (targetId) {
          merged.add(targetId)
          continue
        }

        // Yjs deep events expose a root-relative path while the event is being
        // dispatched. Keep this fallback for custom AbstractType wrappers.
        const pathBlockId = yEvent.path[0]
        if (typeof pathBlockId === 'string') merged.add(pathBlockId)
      }
    })

    event.stackItem.meta.set(BLOCK_READONLY_AFFECTED_IDS, merged)
  }

  private _isBlockChildrenArray(type: Y.AbstractType<any>): type is Y.Array<string> {
    if (!(type instanceof Y.Array)) return false
    const parentSub = (type as unknown as { _item?: { parentSub?: unknown } })._item?.parentSub
    return parentSub === 'children'
  }

  private _findBlockIdForType(type: Y.AbstractType<any>): string | null {
    let current: Y.AbstractType<any> | null = type
    while (current && current !== this.yBlockMap) {
      const parent: Y.AbstractType<any> | null = current.parent
      if (parent === this.yBlockMap) {
        const parentSub = (current as unknown as { _item?: { parentSub?: unknown } })._item?.parentSub
        return typeof parentSub === 'string' ? parentSub : null
      }
      current = parent
    }
    return null
  }

  private _captureSelectionSnapshot(): RelativeSelectionBookmark | null {
    return captureRelativeSelectionBookmark(this.doc.selection.value, this.doc)
  }

  private _selectionBookmark(stackItem: StackItem): RelativeSelectionBookmark | null {
    return stackItem.meta.has(SELECTION_BOOKMARK)
      ? stackItem.meta.get(SELECTION_BOOKMARK) as RelativeSelectionBookmark | null
      : null
  }

  private _historyRestoreBookmark(
    target: RelativeSelectionBookmark | null,
    fallback: RelativeSelectionBookmark | null,
  ): RelativeSelectionBookmark | null {
    if (!target || !this.doc.model) return target
    const targetIds = new Set<string>([
      target.anchor.blockId,
      target.head.blockId,
    ])
    if (target.anchor.type === 'table-cell') targetIds.add(target.anchor.tableId)
    if (target.head.type === 'table-cell') targetIds.add(target.head.tableId)
    for (const blockId of targetIds) {
      if (!this.doc.model.exists(blockId)) return fallback
    }
    return target
  }

  clearHistory() {
    this._yUndoManager.clear()
    this._pendingUndoSnapshot = undefined
    this._pendingRedoSnapshot = undefined
  }


}
