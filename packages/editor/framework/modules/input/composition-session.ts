import {OneShotCursorAnchor, ITextCursorPoint} from "../../utils/one-shot-selection-anchor";
import {EditableBlockComponent, DeltaOperation} from "../../block-std";

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
    this._anchor.capture(block, anchorIndex)
  }

  /**
   * Convenience: capture anchor from current selection.
   */
  startFromSelection(options?: { isComposing?: boolean }): boolean {
    const {value: sel} = this.doc.selection.recalculate(false, options)
    if (!sel || sel.from.type !== 'text') {
      this.reset()
      return false
    }
    this.start(sel.from.block, sel.from.index)
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
   * End the session and return to idle.
   */
  end() {
    this._phase = CompositionPhase.Idle
    this._activeBlockId = null
    this._deferredPatches = []
    this._anchor.reset()
  }

  /**
   * Force reset (e.g. on error or block deletion during composition).
   */
  reset() {
    this.end()
  }
}
