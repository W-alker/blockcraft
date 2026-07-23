import * as Y from 'yjs'
import {OneShotCursorAnchor, ITextCursorPoint} from '../../utils/one-shot-selection-anchor'
import {EditableBlockComponent, DeltaOperation} from '../../block-std'

/**
 * Composition session lifecycle phases:
 *
 * ```
 *   idle ──compositionStart──► active ──compositionEnd──► committing ──► idle
 *                                 │                           │
 *                                 └─── (remote delta) ───► deferring
 * ```
 *
 * - `idle`: no IME composition in progress.
 * - `active`: browser is composing; DOM changes are happening natively.
 *   The session holds a collaborative-safe anchor (`OneShotCursorAnchor`)
 *   and shields the active block from unnecessary rerenders.
 * - `committing`: compositionEnd fired; we're writing the final text to Y.Text
 *   and restoring DOM/selection.
 */
export const enum CompositionPhase {
  Idle = 'idle',
  Active = 'active',
  Committing = 'committing',
}

export interface IDeferredPatch {
  blockId: string
  delta: DeltaOperation[]
}

interface CompositionRecoveryTarget {
  blockId: string
  atStart: boolean
}

interface CompositionAbortRecovery {
  target: CompositionRecoveryTarget | null
}

interface CompositionRecoveryLevel {
  parentId: string
  fallbackIndex: number
  position: Y.RelativePosition
}

/**
 * CompositionSession encapsulates all state for a single IME composition lifecycle.
 *
 * It works alongside the existing `CompositionControl` (which manages the raw
 * `compositionstart/end` events) and `InputTransformer` (which handles input semantics).
 *
 * Key responsibilities:
 * - Hold a collaboration-safe anchor (`OneShotCursorAnchor`) for the insertion point.
 * - Track the active composing block to prevent unnecessary rerenders during composition.
 * - Buffer remote delta patches that arrive during composition for deferred replay.
 * - Provide a clean commit path that writes to Y.Text and restores selection.
 *
 * Usage in InputTransformer:
 * ```ts
 *   // compositionStart
 *   session.start(block, anchorIndex)
 *
 *   // remote delta arrives during composition
 *   if (session.isActive && event.blockId === session.activeBlockId) {
 *     session.deferPatch(event.blockId, event.delta)
 *     return // skip immediate applyDeltaToView
 *   }
 *
 *   // compositionEnd
 *   const result = session.commit(finalText, insertAttrs)
 *   // result.block, result.index — where the text was inserted
 *   // then: write to Y.Text, rerender, restore cursor
 *   session.end()
 * ```
 */
export class CompositionSession {
  private _phase = CompositionPhase.Idle
  private _anchor: OneShotCursorAnchor
  private _activeBlockId: string | null = null
  private _deferredPatches: IDeferredPatch[] = []
  private _recoveryLevels: CompositionRecoveryLevel[] = []
  private _abortRecoveryTarget: CompositionRecoveryTarget | null = null
  private _abortRecoveryPending = false
  /** 组合期间宿主块被删除（通常来自远端协同）后置位；compositionEnd 据此丢弃本次提交 */
  private _abortedByBlockRemoval = false

  constructor(private readonly doc: BlockCraft.Doc) {
    this._anchor = new OneShotCursorAnchor(doc)
  }

  get phase(): CompositionPhase {
    return this._phase
  }

  get isActive(): boolean {
    return this._phase === CompositionPhase.Active
  }

  get isIdle(): boolean {
    return this._phase === CompositionPhase.Idle
  }

  get activeBlockId(): string | null {
    return this._activeBlockId
  }

  get anchor(): OneShotCursorAnchor {
    return this._anchor
  }

  get hasDeferredPatches(): boolean {
    return this._deferredPatches.length > 0
  }

  /**
   * Begin a new composition session.
   *
   * Called from `compositionStart` handler after selection normalization
   * and any non-collapsed selection replacement.
   */
  start(block: EditableBlockComponent, anchorIndex: number) {
    this._phase = CompositionPhase.Active
    this._activeBlockId = block.id
    this._deferredPatches = []
    this._abortedByBlockRemoval = false
    this._abortRecoveryTarget = null
    this._abortRecoveryPending = false
    this._recoveryLevels = this._captureRecoveryLevels(block.id)
    this._anchor.capture(block, anchorIndex)
  }

  /**
   * Convenience: capture anchor from current selection.
   */
  startFromSelection(options?: { isComposing?: boolean }): boolean {
    const {value: sel} = this.doc.selection.recalculate(false, options)
    if (!sel || sel.start.type !== 'text') {
      this.reset()
      return false
    }
    this.start(sel.firstBlock as any, sel.start.offset)
    return true
  }

  /**
   * Update the anchor from a `beforeinput` event during composition.
   * This keeps the anchor tracking the latest browser-reported position.
   */
  updateAnchorFromInputEvent(ev: InputEvent, options?: { isComposing?: boolean }) {
    this._anchor.captureFromInputEvent(ev, options)
  }

  /**
   * Buffer a remote delta that arrived while composition is active.
   *
   * These patches target the active block and would normally trigger
   * `applyDeltaToView`. During composition, we defer them to avoid
   * disrupting the browser's native composing UI.
   */
  deferPatch(blockId: string, delta: DeltaOperation[]) {
    this._deferredPatches.push({blockId, delta})
  }

  /**
   * Check whether a remote text change event should be deferred.
   *
   * Returns true if the session is active and the change targets the composing block.
   */
  shouldDeferPatch(blockId: string): boolean {
    return this._phase === CompositionPhase.Active && blockId === this._activeBlockId
  }

  /**
   * Resolve the composition anchor to get the current insertion point.
   *
   * This accounts for any collaborative changes that may have shifted
   * the insertion position since `start()`.
   */
  resolveInsertionPoint(fallback?: ITextCursorPoint | null): ITextCursorPoint | null {
    return this._anchor.resolve(fallback)
  }

  /**
   * Transition to committing phase and return the resolved insertion point.
   *
   * After calling this, the caller should:
   * 1. Write the final text to Y.Text
   * 2. Rerender the block (or minimal patch)
   * 3. Restore cursor
   * 4. Call `end()` to finalize
   */
  prepareCommit(fallback?: ITextCursorPoint | null): ITextCursorPoint | null {
    this._phase = CompositionPhase.Committing
    return this._anchor.resolve(fallback)
  }

  /**
   * Drain and return all deferred patches, then clear the buffer.
   *
   * Call this after committing to Y.Text / rerendering, so that
   * any remote changes that arrived during composition can be replayed.
   */
  drainDeferredPatches(): IDeferredPatch[] {
    const patches = this._deferredPatches
    this._deferredPatches = []
    return patches
  }

  /**
   * Notify the session that blocks were removed from the document
   * (local or remote). If the composing host block is among them, the
   * session aborts: writing the pending composition to a detached Y.Text
   * would silently lose the input (or fall back onto an unrelated block).
   *
   * Called from DocCRUD's children sync path — O(1) per deletion batch.
   */
  handleBlocksDeleted(deletedIds: ReadonlySet<string>) {
    if (this._phase !== CompositionPhase.Active) return
    if (!this._activeBlockId || !deletedIds.has(this._activeBlockId)) return
    const recoveryTarget = this._resolveRecoveryTarget()
    this.end()
    this._abortRecoveryTarget = recoveryTarget
    this._abortRecoveryPending = true
    // end() 之后置位：abort 标记要存活到 compositionEnd 事件被消费为止
    this._abortedByBlockRemoval = true
  }

  /**
   * @internal
   *
   * Abort the current composition before commit. Used when compositionstart
   * cannot resolve a valid model-backed insertion point; the matching
   * compositionend should then be consumed without writing text.
   */
  abortPendingCommit() {
    this.end()
    this._abortRecoveryTarget = null
    this._abortRecoveryPending = false
    this._abortedByBlockRemoval = true
  }

  /**
   * One-shot check for the abort flag. compositionEnd handler calls this
   * first and discards the commit when it returns true.
   */
  consumeAbort(): boolean {
    const aborted = this._abortedByBlockRemoval
    this._abortedByBlockRemoval = false
    return aborted
  }

  consumeAbortRecovery(): CompositionAbortRecovery | null {
    if (!this._abortRecoveryPending) return null
    const recovery = {target: this._abortRecoveryTarget}
    this._abortRecoveryPending = false
    this._abortRecoveryTarget = null
    return recovery
  }

  /**
   * End the session and return to idle.
   */
  end() {
    this._phase = CompositionPhase.Idle
    this._activeBlockId = null
    this._deferredPatches = []
    this._recoveryLevels = []
    this._anchor.reset()
  }

  /**
   * Force reset (e.g. on error or a new composition starting).
   * Also clears a stale abort flag from a previous aborted composition
   * whose compositionend never fired (detached DOM may swallow it).
   */
  reset() {
    this.end()
    this._abortedByBlockRemoval = false
    this._abortRecoveryTarget = null
    this._abortRecoveryPending = false
  }

  private _captureRecoveryLevels(blockId: string): CompositionRecoveryLevel[] {
    const levels: CompositionRecoveryLevel[] = []
    const visited = new Set<string>()
    let currentId: string | null = blockId

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      let parentId: string | null
      try {
        parentId = this.doc.model?.getParentId?.(currentId) ?? null
      } catch {
        break
      }
      if (!parentId) break

      try {
        const siblings = this.doc.model.getChildrenIds(parentId)
        const index = siblings.indexOf(currentId)
        const children = this.doc.model.getYBlock(parentId)?.get('children')
        if (index >= 0 && children instanceof Y.Array) {
          levels.push({
            parentId,
            fallbackIndex: index,
            position: Y.createRelativePositionFromTypeIndex(children, index),
          })
        }
      } catch {
        // The next ancestor may still provide a usable structural fallback.
      }
      currentId = parentId
    }
    return levels
  }

  private _resolveRecoveryTarget(): CompositionRecoveryTarget | null {
    for (const level of this._recoveryLevels) {
      try {
        if (!this.doc.model.exists(level.parentId)) continue
        const children = this.doc.model.getYBlock(level.parentId)?.get('children')
        if (!(children instanceof Y.Array)) continue
        const absolute = Y.createAbsolutePositionFromRelativePosition(
          level.position,
          this.doc.yDoc,
        )
        const siblings = this.doc.model.getChildrenIds(level.parentId)
        const index = Math.max(0, Math.min(
          absolute?.type === children ? absolute.index : level.fallbackIndex,
          siblings.length,
        ))
        const nextId = siblings[index]
        if (nextId && this.doc.model.exists(nextId)) {
          return {blockId: nextId, atStart: true}
        }
        const previousId = index > 0 ? siblings[index - 1] : null
        if (previousId && this.doc.model.exists(previousId)) {
          return {blockId: previousId, atStart: false}
        }
      } catch {
        // Continue outward when this parent was concurrently removed/repaired.
      }
    }
    return null
  }
}
