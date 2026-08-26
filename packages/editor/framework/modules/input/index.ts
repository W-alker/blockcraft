import { ORIGIN_SKIP_SYNC } from "../../doc";
import {
  BindHotKey,
  BlockNodeType,
  DeltaInsert,
  DeltaOperation,
  DocEventRegister,
  EditableBlockComponent,
  EventListen,
  INLINE_ELEMENT_TAG,
  INLINE_END_BREAK_CLASS,
  INLINE_TEXT_NODE_TAG,
  STR_LINE_BREAK,
  UIEventStateContext,
} from "../../block-std";
import {
  BlockSelection,
  IGapSelectionPoint,
  INormalizedEndpoints,
} from "../selection";
import { isSelectionAlive } from "../selection/liveness";
import { normalizeRange as normalizeSelectionRange } from "../selection/normalize";
import {
  resolveSelectionScopePolicyForBlockId,
  SelectionScopePolicy,
} from "../selection/scope";
import {
  focusBlockSelectionEdge,
  moveGapCaretAway,
  restoreSelectionAfterBlockDelete,
} from "../selection/restore";
import { isNativeInputTarget, isZeroSpace } from "../../utils";
import {
  getCommonAttributesFromDeltas,
  nextTick,
  performanceTest,
  sliceDelta,
} from "../../../global";
import {CompositionSession} from "./composition-session";
import {
  planSelectionEdit,
  SelectionEditPlan,
  SelectionEditReader,
  SelectionEditSource,
  SelectionReplaceEdge,
} from "./selection-edit-plan";
import {buildReadonlyWriteFootprint} from "./readonly-write-footprint";
import {focusEditingHostForBlock} from "../selection/focus-editing-host";
import {
  BlockReadonlyError,
  BlockReadonlyOperation,
  BlockReadonlyViolationTrigger,
} from "../../doc/block-readonly.types";
import {
  resolveTableCellSelectionTarget,
  TableCellSelectionModelTarget,
} from "../table";

const ALLOW_INPUT_TYPES = new Set([
  "insertText",
  "deleteContentBackward",
  "deleteContentForward",
  "insertReplacementText",
  "insertCompositionText",
  "deleteByCut",
]);

type BoundarySelectionTarget = {
  host: BlockCraft.BlockComponent;
  from: number;
  to: number;
  count: number;
};

function isElementNode(node: unknown): node is HTMLElement {
  return !!node && typeof (node as Node).nodeType === "number" && (node as Node).nodeType === 1;
}

type ResolvedReplaceEdge =
  | {
    kind: "text";
    blockId: string;
    block: EditableBlockComponent;
    from: number;
    to: number;
  }
  | {
    kind: "block";
    blockId: string;
    block: BlockCraft.BlockComponent;
  };

type ResolvedBlockRange = {
  start: BlockCraft.BlockComponent;
  end: BlockCraft.BlockComponent;
};

type BoundaryEditPlan = Extract<SelectionEditPlan, {kind: "boundary"}>;
type BlockRangeEditPlan = Extract<SelectionEditPlan, {kind: "block-range"}>;
type GapEditPlan = Extract<SelectionEditPlan, {kind: "gap"}>;
type RangeEditPlan = Extract<SelectionEditPlan, {kind: "range"}>;
type TableCellEditPlan = Extract<SelectionEditPlan, {kind: "table-cell"}>;

@DocEventRegister
export class InputTransformer {
  readonly compositionSession: CompositionSession;
  private _compositionUndoGroupActive = false;
  private _nextInsertAttrs: {
    blockId: string;
    index: number;
    attrs?: DeltaInsert["attributes"];
  } | null = null;

  constructor(public readonly doc: BlockCraft.Doc) {
    this.compositionSession = new CompositionSession(doc);
  }

  setNextInsertAttrs(
    attrs: DeltaInsert["attributes"],
    point: { blockId: string; index: number },
  ) {
    this._nextInsertAttrs = {
      blockId: point.blockId,
      index: point.index,
      attrs,
    };
  }

  hasNextInsertAttrs() {
    return this._nextInsertAttrs !== null;
  }

  private matchNextInsertPoint(
    point: { blockId: string; index: number },
    allowNearby = false,
  ) {
    if (!this._nextInsertAttrs) return false;
    if (this._nextInsertAttrs.blockId !== point.blockId) return false;
    return allowNearby
      ? Math.abs(this._nextInsertAttrs.index - point.index) <= 1
      : this._nextInsertAttrs.index === point.index;
  }

  peekNextInsertAttrs(
    point: { blockId: string; index: number },
    options?: { allowNearby?: boolean },
  ) {
    if (!this._nextInsertAttrs) return undefined;
    if (!this.matchNextInsertPoint(point, !!options?.allowNearby))
      return undefined;
    return this._nextInsertAttrs.attrs;
  }

  clearNextInsertAttrs() {
    this._nextInsertAttrs = null;
  }

  /**
   * `beforeinput.getTargetRanges()` may shrink around read-only void/block
   * nodes, so keep trusting the editor model when the current selection
   * includes whole-block endpoints, model-owned structural endpoints, or a
   * text range whose semantic scope policy is model-first.
   */
  private _shouldUseSelectionModelForBeforeInput(
    selection: BlockSelection | null,
  ): selection is BlockSelection {
    return (
      !!selection &&
      (
        this._hasWholeBlockEndpoint(selection) ||
        selection.start.type === "gap" ||
        selection.end.type === "gap" ||
        selection.start.type === "boundary" ||
        selection.end.type === "boundary" ||
        this._hasTableCellSelection(selection) ||
        this._shouldUseModelForTextBeforeInput(selection)
      )
    );
  }

  private _resolveBeforeInputRange(
    selection: BlockSelection | null,
    targetRange: INormalizedEndpoints | null,
  ): SelectionEditSource | null {
    if (this._shouldUseSelectionModelForBeforeInput(selection)) {
      return selection;
    }
    return targetRange;
  }

  private _isPrintableKey(event: KeyboardEvent) {
    return (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    );
  }

  private _textRangeScopePolicy(selection: BlockSelection | null): SelectionScopePolicy | null {
    if (!selection || selection.collapsed || selection.start.type !== "text" || selection.end.type !== "text") {
      return null;
    }
    try {
      return resolveSelectionScopePolicyForBlockId(
        selection.commonParent,
        id => this.doc.getBlockById(id) as any,
      );
    } catch {
      return null;
    }
  }

  private _shouldUseModelForTextBeforeInput(selection: BlockSelection | null): boolean {
    return this._textRangeScopePolicy(selection)?.useModelForTextBeforeInput ?? false;
  }

  private _planSelectionEdit(source: SelectionEditSource): SelectionEditPlan {
    const tailMode = source instanceof BlockSelection &&
      this._textRangeScopePolicy(source)?.textRangeTailMode === "preserve"
      ? "preserve"
      : "merge";

    return planSelectionEdit(source, {
      getParentId: blockId => {
        if (this.doc.model?.exists(blockId)) return this.doc.model.getParentId(blockId);
        const block = this._getLiveBlockById(blockId);
        return block ? block.parentId ?? null : undefined;
      },
      getChildrenIds: blockId => {
        if (this.doc.model?.exists(blockId)) return this.doc.model.getChildrenIds(blockId);
        const block = this._getLiveBlockById(blockId);
        return block ? block.childrenIds ?? [] : null;
      },
      getTextLength: blockId => {
        if (this.doc.model?.exists(blockId)) return this.doc.model.getTextLength(blockId);
        const block = this._getLiveBlockById(blockId);
        return block && this.doc.isEditable(block) ? block.textLength : null;
      },
    }, {tailMode});
  }

  private _readonlyEditReader(): SelectionEditReader {
    return {
      getParentId: blockId => {
        if (this.doc.model?.exists(blockId)) return this.doc.model.getParentId(blockId);
        const block = this._getLiveBlockById(blockId);
        return block ? block.parentId ?? null : undefined;
      },
      getChildrenIds: blockId => {
        if (this.doc.model?.exists(blockId)) return this.doc.model.getChildrenIds(blockId);
        const block = this._getLiveBlockById(blockId);
        return block ? block.childrenIds ?? [] : null;
      },
      getTextLength: blockId => {
        if (this.doc.model?.exists(blockId)) return this.doc.model.getTextLength(blockId);
        const block = this._getLiveBlockById(blockId);
        return block && this.doc.isEditable(block) ? block.textLength : null;
      },
      resolveTableCellIds: (tableId, anchorCellId, headCellId) =>
        resolveTableCellSelectionTarget(this.doc, {
          tableId,
          anchorCellId,
          headCellId,
        })?.visibleCellIds ?? null,
    };
  }

  private _assertPlanWritable(
    plan: SelectionEditPlan,
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger = "input",
  ): void {
    const manager = this.doc.readonlyManager;
    if (!manager) return;
    const footprint = buildReadonlyWriteFootprint(plan, this._readonlyEditReader());
    footprint.textBlockIds.forEach(blockId =>
      manager.assertTextWritable(blockId, operation, trigger));

    const removableIds = plan.kind === "gap" && operation !== BlockReadonlyOperation.Delete
      ? []
      : footprint.removableRootIds;
    if (removableIds.length) {
      manager.assertRemovable(removableIds, operation, trigger);
    }

    const insertParentIds = plan.kind === "gap" && operation === BlockReadonlyOperation.Delete
      ? []
      : footprint.insertParentIds;
    insertParentIds.forEach(parentId =>
      manager.assertInsertable(parentId, operation, trigger));
  }

  assertSelectionWritable(
    selection: BlockCraft.Selection,
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger = "input",
  ): void {
    this._assertPlanWritable(this._planSelectionEdit(selection), operation, trigger);
  }

  private _tryAssertInputPlan(
    context: {preventDefault(): void},
    plan: SelectionEditPlan,
    operation: BlockReadonlyOperation,
  ): boolean {
    try {
      this._assertPlanWritable(plan, operation);
      return true;
    } catch (error) {
      if (!(error instanceof BlockReadonlyError)) throw error;
      context.preventDefault();
      return false;
    }
  }

  private _consumeReadonlyTextDeleteKey(
    context: {preventDefault(): void},
    selection: BlockCraft.Selection,
  ): boolean {
    if (selection.start.type !== "text" || selection.end.type !== "text") {
      return false;
    }
    const manager = this.doc.readonlyManager;
    const isReadonly = manager
      ? manager.isSelectionReadonly(selection)
      : this.doc.isReadonly;
    if (!isReadonly) return false;

    // WebKit may navigate backward/forward for deletion keys on a protected
    // text range instead of emitting beforeinput. Keep the ordinary writable
    // text path in beforeinput and plan only this rare readonly rejection.
    const plan = this._planSelectionEdit(selection);
    if (!this._tryAssertInputPlan(
      context,
      plan,
      BlockReadonlyOperation.Delete,
    )) {
      return true;
    }
    context.preventDefault();
    return true;
  }

  private _adjustZeroSpaceDeletePlan(
    plan: SelectionEditPlan,
  ): SelectionEditPlan {
    const point = plan.kind === "text-cursor"
      ? {blockId: plan.blockId, offset: plan.offset}
      : plan.kind === "range" && plan.start.kind === "text" && !plan.end
        ? {blockId: plan.start.blockId, offset: plan.start.from}
        : null;
    if (!point || point.offset <= 0) return plan;
    return {
      kind: "range",
      start: {
        kind: "text",
        blockId: point.blockId,
        from: point.offset - 1,
        to: point.offset,
      },
      end: null,
      insertAt: {blockId: point.blockId, offset: point.offset - 1},
      stabilizeAt: null,
      tailMode: "merge",
    };
  }

  /**
   * Resolve where a typed / composed paragraph should go when a BLOCK selection
   * (no text caret) is replaced by input.
   *
   * - `sibling`: the selected block's PARENT is a renderUnit that accepts a
   *   paragraph (callout / root / …). Replace the selected block with a new
   *   sibling paragraph in that parent — the long-standing behaviour. Checked
   *   FIRST so callout etc. keep their current "replace the whole block" UX.
   * - `inside`: the parent can't host a paragraph (table-row / columns / …) but
   *   the SELECTED block is itself a renderUnit container that can (table-cell /
   *   column). Clear that container's content and edit INSIDE it.
   *
   * The `inside` case is the fix for IME / typing over a block-selected cell or
   * column: previously the handler only looked at the parent, found it wasn't a
   * renderUnit, and bailed to `blur()`. Because `compositionstart` can't be
   * cancelled, the native IME then wrote glyphs straight into the still
   * `contenteditable` container — glyphs never persisted to Y.Text (phantom
   * characters in the view; the cell's only paragraph could be stranded).
   *
   * Returns null when neither the block nor its parent can host a paragraph
   * (e.g. a void block) — the caller falls back to `blur()`.
   */
  private _resolveBlockSelectionHost(
    block: BlockCraft.BlockComponent,
  ): { host: BlockCraft.BlockComponent; mode: "sibling" | "inside" } | null {
    const parent = block.parentBlock;
    if (
      parent &&
      this.doc.schemas.get(parent.flavour)?.metadata.renderUnit &&
      ((this.doc as any).canInsertChild?.(parent.id, "paragraph") ?? true)
    ) {
      return { host: parent, mode: "sibling" };
    }
    if (
      this.doc.schemas.get(block.flavour)?.metadata.renderUnit &&
      ((this.doc as any).canInsertChild?.(block.id, "paragraph") ?? true)
    ) {
      return { host: block, mode: "inside" };
    }
    return null;
  }

  /**
   * Clear a renderUnit container down to a single empty paragraph and return
   * that paragraph (so a caret / typed text can land in it). `deleteBlocks` on a
   * renderUnit parent auto-inserts the empty paragraph; we only top it up for
   * the degenerate empty-container case. All mutation goes through Yjs.
   */
  private _clearContainerToEmptyParagraph(
    host: BlockCraft.BlockComponent,
  ): EditableBlockComponent | null {
    if (host.childrenLength > 0) {
      this.doc.crud.deleteBlocks(host.id, 0, host.childrenLength);
    }
    if (host.childrenLength === 0) {
      this.doc.crud.insertBlocks(host.id, 0, [
        this.doc.schemas.createSnapshot("paragraph", []),
      ]);
    }
    const first = host.firstChildren;
    return first && this.doc.isEditable(first) ? first : null;
  }

  private consumeNextInsertAttrs(
    blockId: string,
    index: number,
    options?: { allowNearby?: boolean },
  ) {
    if (!this._nextInsertAttrs) return undefined;
    const hit = this.matchNextInsertPoint(
      {
        blockId,
        index,
      },
      !!options?.allowNearby,
    );
    if (!hit) return undefined;
    const attrs = hit ? this._nextInsertAttrs.attrs : undefined;
    this._nextInsertAttrs = null;
    return attrs;
  }

  private _runRevisionGroup<T>(callback: () => T): T {
    return this.doc.revisions?.isTracking
      ? this.doc.revisions.runInGroup(callback)
      : callback();
  }

  private _insertTextWithRevision(
    block: EditableBlockComponent,
    index: number,
    text: string,
    attributes?: DeltaInsert['attributes'],
    origin: unknown = null,
    preserveUndefinedAttributes = false,
  ): void {
    if (this.doc.revisions?.isTracking) {
      this.doc.revisions.insertText(block.id, index, text, attributes, origin);
      return;
    }
    this.doc.crud.transact(() => {
      if (attributes !== undefined || preserveUndefinedAttributes) {
        block.yText.insert(index, text, attributes);
      }
      else block.yText.insert(index, text);
    }, origin);
  }

  /**
   * Typing over a non-collapsed selection must keep the inline format shared by
   * the replaced text — e.g. selecting two chars inside a bold run and typing
   * should produce bold text, not plain. Returns the attributes common to the
   * deleted slice, or `undefined` when the range is empty or its format is mixed
   * (mirrors how the toolbar reports active formats via
   * `getCommonAttributesFromDeltas`). Must be read BEFORE the delete mutates Y.Text.
   */
  private _inheritedReplaceAttrs(
    block: { textDeltas(): DeltaInsert[] },
    index: number,
    length: number,
  ): DeltaInsert["attributes"] | undefined {
    if (length <= 0) return undefined;
    const common = getCommonAttributesFromDeltas(
      sliceDelta(block.textDeltas(), index, index + length),
    );
    return Object.keys(common).length
      ? (common as DeltaInsert["attributes"])
      : undefined;
  }

  /**
   * Insert a new paragraph adjacent to the void/container block the gap cursor
   * sits beside, then place the caret into it. The void/container block is KEPT
   * (gap input never replaces the block, unlike whole-block `selected` input).
   */
  private _insertParagraphAtGap(
    gap: IGapSelectionPoint | GapEditPlan,
    text: string,
  ): EditableBlockComponent | null {
    const block = "kind" in gap
      ? this._getLiveBlockById(gap.blockId)
      : gap.block;
    if (!block?.parentId || typeof block.getIndexOfParent !== "function") {
      return null;
    }
    const index =
      block.getIndexOfParent() + (gap.side === "after" ? 1 : 0);
    const newParagraph = this.doc.crud.insertNewParagraph(
      block.parentId,
      index,
      text ? [{ insert: text }] : [],
    );
    this.doc.selection.setCursorAt(newParagraph as any, text.length);
    return newParagraph as EditableBlockComponent;
  }

  private _setTextCursor(blockId: string, offset: number): boolean {
    const block = this._getLiveBlockById(blockId);
    if (
      !block ||
      !this.doc.isEditable(block) ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > block.textLength
    ) {
      return false;
    }
    try {
      this.doc.selection.setCursorAt(block as EditableBlockComponent, offset);
      return true;
    } catch {
      return false;
    }
  }

  private _syncPlannedRangeSelection(
    plan: RangeEditPlan,
    insertedLength = 0,
  ): boolean {
    if (!plan.insertAt) {
      this.doc.selection.blur();
      return false;
    }
    const applied = this._setTextCursor(
      plan.insertAt.blockId,
      plan.insertAt.offset + insertedLength,
    );
    if (!applied) this.doc.selection.blur();
    return applied;
  }

  private _setCompositionTextCursor(
    block: EditableBlockComponent,
    offset: number,
  ): boolean {
    const safeOffset = Math.max(0, Math.min(offset, block.textLength ?? offset));
    try {
      focusEditingHostForBlock(this.doc, block);
      this.doc.selection.setCursorAt(block as any, safeOffset);
      const root = (this.doc as any).root?.hostElement as HTMLElement | undefined;
      const active = root?.ownerDocument.activeElement;
      if (root && root.isConnected && active && active !== root && !root.contains(active)) {
        focusEditingHostForBlock(this.doc, block);
        this.doc.selection.setCursorAt(block as any, safeOffset);
      }
      return true;
    } catch {
      return false;
    }
  }

  private _setCommittedCompositionCursor(
    block: EditableBlockComponent,
    index: number,
  ): void {
    const safeIndex = Math.max(0, Math.min(index, block.textLength ?? index));
    if (!this._setCompositionTextCursor(block, safeIndex)) {
      this.doc.selection.blur();
    }
  }

  private _restoreAbortedCompositionSelection(
    target: {blockId: string; atStart: boolean} | null,
  ): void {
    if (target) {
      try {
        this.doc.virtualization?.ensureViewMounted?.([target.blockId]);
        const block = this._getLiveBlockById(target.blockId);
        if (block && focusBlockSelectionEdge(this.doc, block, target.atStart)) {
          return;
        }
      } catch {
        // Fall through to the browser's surviving native boundary.
      }
    }

    try {
      if (this.doc.selection.recalculate().value) return;
    } catch {
      // No valid native fallback remains.
    }
    this.doc.selection.blur();
  }

  private _captureCompositionCommitUndoSelection(
    block: EditableBlockComponent,
    index: number,
  ): void {
    const safeIndex = Math.max(0, Math.min(index, block.textLength ?? index));
    const selection = {
      anchor: {blockId: block.id, type: "text", offset: safeIndex},
      head: {blockId: block.id, type: "text", offset: safeIndex},
      commonParent: block.id,
    };

    try {
      focusEditingHostForBlock(this.doc, block);
      const replay = (this.doc.selection as any).replay;
      if (typeof replay === "function") {
        replay.call(this.doc.selection, selection);
      } else {
        this.doc.selection.setCursorAt?.(block as any, safeIndex);
      }
    } catch {
      try {
        this._setCompositionTextCursor(block, safeIndex);
      } catch {
        // Best effort only; the undo manager will fall back to its current
        // selection if the DOM is already gone.
      }
    }

    (this.doc.crud as any).undoManager?.captureSelectionBeforeChange?.();
  }

  private _startCompositionAtEditableBlock(
    block: BlockCraft.BlockComponent | null | undefined,
    offset = 0,
  ): boolean {
    const isEditable = block ? ((this.doc as any).isEditable?.(block) ?? true) : false;
    if (!block || !isEditable) {
      this.doc.selection.blur();
      return false;
    }
    const editableBlock = block as EditableBlockComponent;
    const safeOffset = Math.max(0, Math.min(offset, editableBlock.textLength ?? offset));
    if (!this._setCompositionTextCursor(editableBlock, safeOffset)) {
      this.doc.selection.blur();
      return false;
    }
    this.compositionSession.start(editableBlock, safeOffset);
    return true;
  }

  private _abortCompositionStart(context: UIEventStateContext) {
    context.preventDefault();
    this.doc.selection.blur();
    this.compositionSession.abortPendingCommit();
    this._endCompositionUndoGroup();
    return true;
  }

  private _beginCompositionUndoGroup() {
    if (this._compositionUndoGroupActive) return;
    this.doc.crud.undoManager?.beginCaptureGroup?.();
    this._compositionUndoGroupActive = true;
  }

  private _endCompositionUndoGroup() {
    if (!this._compositionUndoGroupActive) return;
    this._compositionUndoGroupActive = false;
    this.doc.crud.undoManager?.endCaptureGroup?.();
  }

  private _recoverCompositionSelection(
    context: UIEventStateContext,
  ): BlockSelection | null {
    let curSel = this.doc.selection.value;
    if (!curSel) {
      const compositionState = context.has("compositionState")
        ? context.get("compositionState")
        : null;
      let result: { value: BlockSelection | null; next?: () => void } | null = null;
      try {
        result = compositionState?.selectionResult ?? null;
        result?.next?.();
      } catch {
        return null;
      }
      curSel = result?.value ?? this.doc.selection.value;
    }

    if (!curSel || isSelectionAlive(curSel, this.doc)) {
      return curSel;
    }

    let result: { value: BlockSelection | null; next?: () => void } | null = null;
    try {
      result = this.doc.selection.recalculate?.(false, { isComposing: true }) ?? null;
      result?.next?.();
    } catch {
      return null;
    }
    const recovered = result ? result.value : this.doc.selection.value;
    if (!recovered || !isSelectionAlive(recovered, this.doc)) {
      return null;
    }
    return recovered;
  }

  private _isAbsoluteObjectSelection(
    selection: BlockCraft.Selection | null | undefined,
  ): boolean {
    return this.doc.placement?.isAbsoluteObjectSelection?.(selection) === true;
  }

  private _resolveBoundarySelection(
    plan: BoundaryEditPlan,
  ): BoundarySelectionTarget | null {
    const host = this._getLiveBlockById(plan.hostId);
    if (!host) return null;
    const max = host.childrenLength;
    const from = Math.max(0, Math.min(plan.fromIndex, plan.toIndex, max));
    const to = Math.max(from, Math.min(Math.max(plan.fromIndex, plan.toIndex), max));
    return {
      host,
      from,
      to,
      count: to - from,
    };
  }

  private _canBoundaryHostParagraph(target: BoundarySelectionTarget): boolean {
    const schema = this.doc.schemas.get(target.host.flavour);
    return (
      !!schema?.metadata.renderUnit &&
      ((this.doc as any).canInsertChild?.(target.host.id, "paragraph") ?? true)
    );
  }

  private _replaceBoundarySelectionWithParagraph(
    source: BoundaryEditPlan,
    text: string,
  ): EditableBlockComponent | null {
    const target = this._resolveBoundarySelection(source);
    if (!target || !this._canBoundaryHostParagraph(target)) return null;

    this.doc.crud.undoManager.captureSelectionBeforeChange();
    const paragraph = this.doc.schemas.createSnapshot(
      "paragraph",
      text ? [text] : [],
    );

    this._runRevisionGroup(() => {
      this.doc.crud.transact(() => {
        if (target.count > 0) {
          this.doc.crud.deleteBlocks(target.host.id, target.from, target.count, true);
        }
        this.doc.crud.insertBlocks(target.host.id, target.from, [paragraph]);
      });
    });

    const block = this.doc.getBlockById(paragraph.id);
    return block && this.doc.isEditable(block)
      ? block as EditableBlockComponent
      : null;
  }

  private _selectAfterBoundaryDelete(target: BoundarySelectionTarget) {
    if (!target.host.childrenLength) {
      this.doc.selection.blur();
      return;
    }
    const nextIndex = Math.min(target.from, target.host.childrenLength - 1);
    const atStart = target.from < target.host.childrenLength;
    const childId = target.host.childrenIds[nextIndex];
    const child = this._getLiveBlockById(childId);
    if (!child) {
      this.doc.selection.blur();
      return;
    }
    if (!focusBlockSelectionEdge(this.doc, child, atStart)) {
      this.doc.selection.blur();
    }
  }

  private _deleteBoundarySelection(
    source: BoundaryEditPlan,
  ): boolean {
    const target = this._resolveBoundarySelection(source);
    if (!target || target.count <= 0) return false;
    if (!this._canBoundaryHostParagraph(target)) return false;

    this.doc.crud.undoManager.captureSelectionBeforeChange();
    this.doc.crud.deleteBlocks(target.host.id, target.from, target.count);
    this._selectAfterBoundaryDelete(target);
    return true;
  }

  private _replaceBoundarySelectionWithText(
    source: BoundaryEditPlan,
    text: string,
  ): boolean {
    const block = this._replaceBoundarySelectionWithParagraph(source, text);
    if (!block) return false;
    return this._setTextCursor(block.id, text.length);
  }

  private _getLiveBlockById<T extends BlockCraft.BlockComponent = BlockCraft.BlockComponent>(
    id: string,
  ): T | null {
    const model = this.doc.model as {exists?: (blockId: string) => boolean} | undefined;
    if (model?.exists && !model.exists(id)) return null;
    try {
      const block = (this.doc.getBlockById(id) as T | null) ?? null;
      if (model?.exists && !model.exists(id)) return null;
      return block;
    } catch {
      return null;
    }
  }

  private _resolveTableCellSelection(
    tableCellSelection: TableCellEditPlan,
  ): TableCellSelectionModelTarget | null {
    return resolveTableCellSelectionTarget(this.doc, tableCellSelection);
  }

  private _hasTableCellSelection(selection: BlockSelection): boolean {
    return typeof selection.getTableCellSelection === "function" &&
      !!selection.getTableCellSelection();
  }

  private _replaceTableCellWithParagraph(
    cellId: string,
    text: string | null,
  ): string | null {
    if (
      this.doc.model.getFlavour(cellId) !== "table-cell" ||
      this.doc.model.getProps(cellId)?.["display"] === "none"
    ) {
      return null;
    }

    const oldChildrenLength = this.doc.model.getChildrenIds(cellId).length;
    const paragraph = this.doc.schemas.createSnapshot(
      "paragraph",
      text ? [text] : [],
    );
    const insertedIds = this.doc.crud.insertBlockSnapshots(cellId, 0, [paragraph]);
    if (oldChildrenLength > 0) {
      this.doc.crud.deleteBlocks(cellId, 1, oldChildrenLength, true);
    }
    return insertedIds[0] ?? paragraph.id;
  }

  private _setTextSelectionWhenReady(blockId: string, index: number): void {
    const replayFromModel = () => {
      try {
        this.doc.selection.replay({
          anchor: {blockId, type: "text", offset: index},
          head: {blockId, type: "text", offset: index},
          commonParent: blockId,
        });
        const current = this.doc.selection.value?.toJSON();
        return current?.anchor.blockId === blockId &&
          current.anchor.type === "text" &&
          current.anchor.offset === index &&
          current.head.blockId === blockId &&
          current.head.type === "text" &&
          current.head.offset === index;
      } catch {
        return false;
      }
    };
    const apply = () => {
      try {
        (this.doc as any).root?.hostElement?.focus?.({ preventScroll: true });
        return this._setTextCursor(blockId, index) || replayFromModel();
      } catch {
        return false;
      }
    };

    if (apply()) return;
    void nextTick().then(() => {
      if (!apply()) {
        this.doc.logger.warn(`restore text cursor failed: ${blockId}`);
      }
    });
  }

  private _setCursorAtBlockWhenReady(blockId: string, atStart: boolean): void {
    const apply = () => {
      try {
        (this.doc as any).root?.hostElement?.focus?.({ preventScroll: true });
        this.doc.selection.setCursorAtBlock(blockId, atStart);
        return true;
      } catch {
        return false;
      }
    };

    if (apply()) return;
    void nextTick().then(() => {
      if (!apply()) {
        this.doc.logger.warn(`restore table-cell cursor failed: ${blockId}`);
      }
    });
  }

  private _replaceTableCellSelection(
    source: TableCellEditPlan,
    text: string | null,
    mode: "text-cursor" | "table-selection" | "anchor-cursor",
  ): string | null {
    const target = this._resolveTableCellSelection(source);
    if (!target) return null;

    this.doc.crud.undoManager.captureSelectionBeforeChange();
    const anchorRef: { blockId: string | null } = { blockId: null };

    this.doc.crud.transact(() => {
      target.visibleCellIds.forEach(cellId => {
        const blockId = this._replaceTableCellWithParagraph(
          cellId,
          cellId === target.anchorCellId ? text : null,
        );
        if (cellId === target.anchorCellId) {
          anchorRef.blockId = blockId;
        }
      });
    });

    const anchorBlockId = anchorRef.blockId;
    if (!anchorBlockId) return null;

    if (mode === "text-cursor") {
      this._setTextSelectionWhenReady(anchorBlockId, text?.length ?? 0);
    } else if (mode === "anchor-cursor") {
      this._setCursorAtBlockWhenReady(anchorBlockId, true);
    } else {
      this.doc.selection.setTableCellSelection(
        target.tableId,
        target.anchorCellId,
        target.headCellId,
      );
    }

    return anchorBlockId;
  }

  @EventListen("compositionStart")
  private _handleCompositionStart(context: UIEventStateContext) {
    this._endCompositionUndoGroup();
    this.compositionSession.reset();
    const curSel = this._recoverCompositionSelection(context);

    if (!curSel) {
      return this._abortCompositionStart(context);
    }
    if (this._isAbsoluteObjectSelection(curSel)) {
      context.preventDefault();
      return true;
    }

    const plan = this._planSelectionEdit(curSel);
    if (plan.kind === "unsupported") {
      return this._abortCompositionStart(context);
    }
    if (!this._tryAssertInputPlan(context, plan, BlockReadonlyOperation.Replace)) {
      return this._abortCompositionStart(context);
    }

    // Handle gap-cursor IME: the gap sits inside a non-editable void/container
    // block, so we must synchronously materialize a real empty paragraph, move
    // the caret into it, then let composition proceed in that editable block.
    // Use a NORMAL transaction (NOT ORIGIN_SKIP_SYNC) for the structural insert;
    // the OneShotCursorAnchor is captured directly in the NEW paragraph so
    // compositionEnd resolves its insertion point there even if the browser
    // native selection jitters during IME startup. The
    // void/container block is KEPT.
    if (plan.kind === "gap") {
      context.preventDefault();
      this._beginCompositionUndoGroup();
      const newParagraph = this._insertParagraphAtGap(plan, "");
      if (!this._startCompositionAtEditableBlock(newParagraph, 0)) {
        this._endCompositionUndoGroup();
      }
      return true;
    }

    if (plan.kind === "table-cell") {
      context.preventDefault();
      this._beginCompositionUndoGroup();
      const target = this._replaceTableCellSelection(plan, null, "anchor-cursor");
      if (!target) {
        this.doc.selection.blur();
        this._endCompositionUndoGroup();
        return true;
      }
      const block = this.doc.getBlockById(target);
      if (!this._startCompositionAtEditableBlock(block, 0)) {
        this._endCompositionUndoGroup();
      }
      return true;
    }

    if (plan.kind === "block-range") {
      context.preventDefault();
      const rangeTarget = this._resolveWholeBlockRange(plan);
      const resolved = rangeTarget
        ? this._resolveBlockSelectionHost(rangeTarget.end)
        : null;
      if (!rangeTarget || !resolved) {
        this.doc.selection.blur();
        return true;
      }
      this._beginCompositionUndoGroup();
      this.doc.crud.undoManager.captureSelectionBeforeChange();
      if (resolved.mode === "sibling") {
        const p = this.doc.schemas.createSnapshot("paragraph", []);
        this.doc.crud.insertBlocksAfter(rangeTarget.end.id, [p]);
        this._deleteAllSelected(plan);
        this.doc.selection.setCursorAtBlock(p.id, true);
        const compositionTarget = this.doc.getBlockById(p.id);
        if (!this._startCompositionAtEditableBlock(compositionTarget, 0)) {
          this._endCompositionUndoGroup();
          return true;
        }
      } else {
        // `inside`: the selected block is a renderUnit container (table-cell /
        // column) whose parent can't host a paragraph. Clear it and drop the
        // caret into its fresh empty paragraph BEFORE the native IME writes, so
        // composition lands in a real, Y.Text-backed text node instead of an
        // un-modelled container. compositionEnd's rerender() then scrubs any
        // glyph the IME may have raced in. See _resolveBlockSelectionHost.
        const compositionTarget = this._clearContainerToEmptyParagraph(resolved.host);
        if (!compositionTarget) {
          this.doc.selection.blur();
          this._endCompositionUndoGroup();
          return true;
        }
        this.doc.selection.setCursorAtBlock(compositionTarget.id, true);
        if (!this._startCompositionAtEditableBlock(compositionTarget, 0)) {
          this._endCompositionUndoGroup();
          return true;
        }
      }
      return true;
    }

    if (plan.kind === "boundary") {
      context.preventDefault();
      this._beginCompositionUndoGroup();
      const target = this._replaceBoundarySelectionWithParagraph(plan, "");
      if (!target) {
        this.doc.selection.blur();
        this._endCompositionUndoGroup();
        return true;
      }
      this.doc.selection.setCursorAtBlock(target.id, true);
      if (!this._startCompositionAtEditableBlock(target, 0)) {
        this._endCompositionUndoGroup();
      }
      return true;
    }

    if (plan.kind === "range") {
      const crossesBlocks = plan.end !== null;
      const hasStructuralEdge = plan.start.kind === "block" ||
        plan.end?.kind === "block";
      const hasBoundaryEndpoint = this._hasBoundaryEndpoint(curSel);
      const needsMerge = crossesBlocks && plan.tailMode === "merge";
      if (crossesBlocks || hasStructuralEdge || hasBoundaryEndpoint) {
        context.preventDefault();
        this._beginCompositionUndoGroup();
      }

      const anchor = plan.insertAt;
      const anchorBlock = anchor
        ? this._getLiveBlockById(anchor.blockId)
        : null;
      if (!anchor || !anchorBlock || !this.doc.isEditable(anchorBlock)) {
        return this._abortCompositionStart(context);
      }

      if (
        needsMerge &&
        !this.doc.revisions?.isTracking &&
        plan.start.kind === "text" &&
        plan.end?.kind === "text"
      ) {
        // Composition-specific merge: separate append from delete so the observer's
        // _applyDeltaToView only handles simple deltas. The append uses ORIGIN_SKIP_SYNC
        // + rerender() to avoid DOM patches that the browser's composition setup overrides.
        const fromBlock = anchorBlock as EditableBlockComponent;
        const toBlock = this._getLiveBlockById(plan.end.blockId);
        if (!toBlock || !this.doc.isEditable(toBlock)) {
          return this._abortCompositionStart(context);
        }
        const remainStart = plan.end.to;
        const remainingDelta =
          remainStart < toBlock.textLength
            ? [
                ...sliceDelta(
                  toBlock.textDeltas(),
                  remainStart,
                  toBlock.textLength,
                ),
              ]
            : null;

        // Step 1: delete selected content + delete to block (normal observer path, skip append)
        if (!this._replacePlannedRange(plan, null, true, true)) {
          return this._abortCompositionStart(context);
        }

        // Step 2: append remaining with ORIGIN_SKIP_SYNC (observer skips _applyDeltaToView)
        if (remainingDelta?.length) {
          this.doc.crud.transact(() => {
            const appendDelta: DeltaOperation[] = [
              { retain: fromBlock.yText.length },
              ...remainingDelta,
            ];
            fromBlock.yText.applyDelta(appendDelta);
          }, ORIGIN_SKIP_SYNC);
          fromBlock.rerender();
        }
      } else {
        if (!this._replacePlannedRange(plan, null, needsMerge)) {
          return this._abortCompositionStart(context);
        }
      }

      this.doc.selection.setCursorAt(anchorBlock as any, anchor.offset);
      if (!this._startCompositionAtEditableBlock(anchorBlock, anchor.offset)) {
        this._endCompositionUndoGroup();
        return true;
      }
      return true;
    }

    if (plan.kind === "text-cursor") {
      const block = this._getLiveBlockById(plan.blockId);
      if (!this._startCompositionAtEditableBlock(block, plan.offset)) {
        this._endCompositionUndoGroup();
      }
      return true;
    }

    return this._abortCompositionStart(context);
  }

  @EventListen("compositionEnd")
  private _handleCompositionEnd(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<CompositionEvent>();
    ev.preventDefault();
    // 宿主块在组合期间被删除（通常是远端协同删除）时 session 已 abort：
    // 此时提交点只能落在 detached Y.Text 或 DOM fallback 出的无关块上，
    // 两者都会造成静默错写，直接丢弃本次组合提交。
    if (this.compositionSession.consumeAbort()) {
      const recovery = this.compositionSession.consumeAbortRecovery();
      if (recovery) {
        this.doc.virtualization?.settleCompositionView?.();
        this._restoreAbortedCompositionSelection(recovery.target);
      }
      this._endCompositionUndoGroup();
      return;
    }
    if (this.compositionSession.isIdle) {
      this._endCompositionUndoGroup();
      return;
    }
    const compositionState = context.get("compositionState");
    try {
      const text = compositionState.text;
      const anchorPoint =
        this.compositionSession.resolveInsertionPoint(null);
      const fallbackPoint = anchorPoint
        ? null
        : compositionState.getFallbackPoint();
      const commitPoint = compositionState.resolveCommitPoint(
        anchorPoint || fallbackPoint,
      );
      if (!commitPoint) {
        return;
      }

      const { block: insertBlock, index: insertIndex } = commitPoint;
      try {
        this.doc.readonlyManager?.assertTextWritable(
          insertBlock.id,
          BlockReadonlyOperation.Text,
          "input",
        );
      } catch (error) {
        if (!(error instanceof BlockReadonlyError)) throw error;
        return;
      }
      this._captureCompositionCommitUndoSelection(
        insertBlock as EditableBlockComponent,
        insertIndex,
      );

      const insertAttrs = this.consumeNextInsertAttrs(
        insertBlock.id,
        insertIndex,
        { allowNearby: true },
      );
      const cursorIndex = insertIndex + text.length;
      this._runRevisionGroup(() => {
        this._insertTextWithRevision(
          insertBlock as EditableBlockComponent,
          insertIndex,
          text,
          insertAttrs,
          ORIGIN_SKIP_SYNC,
          true,
        );
        insertBlock.rerender();
        this.doc.virtualization?.settleCompositionView?.();
        // Set cursor synchronously after rerender to avoid selectionchange race.
        // queueMicrotask would leave a gap where selectionchange fires with
        // invalid DOM selection (isComposing is already false), resetting cursor to 0.
        this._setCommittedCompositionCursor(insertBlock as EditableBlockComponent, cursorIndex);
      });

      // Drain deferred patches WITHOUT replaying.
      // rerender() already built the blot tree from the full Y.Text model,
      // which includes all remote changes. Replaying would double-apply them.
      this.compositionSession.drainDeferredPatches();

    } finally {
      this.doc.virtualization?.settleCompositionView?.();
      this.compositionSession.end();
      this._endCompositionUndoGroup();
    }
  }

  private _resetOrphanedCompositionSession(
    ev: Pick<InputEvent, "isComposing">,
  ) {
    if (
      ev.isComposing ||
      this.doc.event.status.isComposing ||
      this.compositionSession.isIdle
    ) {
      return;
    }
    this.compositionSession.reset();
    this._endCompositionUndoGroup();
  }

  @EventListen("beforeInput")
  private _handleBeforeInput(context: BlockCraft.EventStateContext): boolean | void {
    const ev = context.get("defaultState").event as InputEvent;
    if (isNativeInputTarget(ev.target)) {
      return;
    }
    if (
      this._isAbsoluteObjectSelection(this.doc.selection.value) &&
      !ev.inputType.startsWith("delete")
    ) {
      ev.preventDefault();
      return true;
    }
    this._resetOrphanedCompositionSession(ev);
    // compositionStart captures the accepted model/materialized target. During
    // IME updates, browser target ranges can be transient or stale; do not let
    // them retarget the commit anchor.
    if (!ev.isComposing) {
      this.compositionSession.updateAnchorFromInputEvent(ev, {
        isComposing: true,
      });
    }

    if (!ALLOW_INPUT_TYPES.has(ev.inputType)) {
      ev.preventDefault();
      return;
    }

    // 拦截非打印字符输入（Mac webview 中方向键等非输入按键产生未识别字符的问题）
    if (
      ev.inputType === "insertText" &&
      ev.data && containsNonPrintableChar(ev.data)
    ) {
      ev.preventDefault();
      return;
    }

    if (ev.isComposing || ev.defaultPrevented) {
      if (ev.isComposing && !this.compositionSession.isActive) {
        ev.preventDefault();
      }
      return;
    }

    const staticRange = ev.getTargetRanges ? ev.getTargetRanges()[0] : null;
    let targetRange: INormalizedEndpoints | null = null;
    if (staticRange) {
      try {
        targetRange = normalizeSelectionRange(
          staticRange,
          id => this.doc.getBlockById(id) as any,
        );
      } catch (e) {
        this.doc.logger?.warn?.("beforeInputNormalizeRangeError: ", e);
      }
    }
    const effectiveRange = this._resolveBeforeInputRange(
      this.doc.selection.value,
      targetRange,
    );
    if (!effectiveRange) {
      ev.preventDefault();
      this.doc.selection.blur();
      return true;
    }

    const text = getPlainTextFromInputEvent(ev);
    let plan = this._planSelectionEdit(effectiveRange);
    if (plan.kind === "unsupported") {
      ev.preventDefault();
      this.doc.selection.blur();
      return true;
    }
    if (this.doc.revisions?.isTracking && plan.kind === "table-cell") {
      ev.preventDefault();
      this.doc.messageService.warn("修订模式 v1 暂不支持表格单元格结构修改");
      return true;
    }

    const isDelete = ev.inputType.startsWith("delete");
    if (
      isDelete &&
      staticRange &&
      staticRange.startContainer === staticRange.endContainer &&
      isZeroSpace(staticRange.startContainer)
    ) {
      plan = this._adjustZeroSpaceDeletePlan(plan);
    }
    if (!this._tryAssertInputPlan(
      ev,
      plan,
      text ? BlockReadonlyOperation.Replace : BlockReadonlyOperation.Delete,
    )) {
      return true;
    }

    if (plan.kind === "gap") {
      ev.preventDefault();
      if (text && !this._insertParagraphAtGap(plan, text)) this.doc.selection.blur();
      return true;
    }

    if (plan.kind === "boundary") {
      ev.preventDefault();
      const handled = text
        ? this._replaceBoundarySelectionWithText(plan, text)
        : this._deleteBoundarySelection(plan);
      if (!handled) this.doc.selection.blur();
      return true;
    }

    if (plan.kind === "table-cell") {
      ev.preventDefault();
      const handled = text
        ? this._replaceTableCellSelection(plan, text, "text-cursor")
        : this._replaceTableCellSelection(plan, null, "table-selection");
      if (!handled) this.doc.selection.blur();
      return true;
    }

    if (plan.kind === "block-range") {
      ev.preventDefault();
      const handled = text
        ? this._replaceSelectedBlocksWithParagraph(plan, text)
        : this._deleteAllSelected(plan);
      if (!handled) this.doc.selection.blur();
      return true;
    }

    if (plan.kind === "range") {
      ev.preventDefault();
      if (!this._replacePlannedRange(plan, text, true)) {
        this.doc.selection.blur();
        return true;
      }
      this._syncPlannedRangeSelection(plan, text?.length ?? 0);
      return true;
    }

    if (plan.kind !== "text-cursor") {
      ev.preventDefault();
      this.doc.selection.blur();
      return true;
    }

    const block = this._getLiveBlockById(plan.blockId);
    if (
      !block ||
      !this.doc.isEditable(block) ||
      plan.offset < 0 ||
      plan.offset > block.textLength
    ) {
      ev.preventDefault();
      this.doc.selection.blur();
      return true;
    }
    const editableBlock = block as EditableBlockComponent;

    if (isDelete) {
      ev.preventDefault();
      if (!this._setTextCursor(editableBlock.id, plan.offset)) {
        this.doc.selection.blur();
      }
      return true;
    }

    if (!text) return;

    let needsRerender = false;

    // in zero text
    if (staticRange && isZeroSpace(staticRange.startContainer)) {
      ev.preventDefault();
      const zeroTextEle = staticRange.startContainer.parentElement!;
      const ownerDocument = zeroTextEle.ownerDocument;
      const textElement: HTMLElement =
        ownerDocument.createElement(INLINE_TEXT_NODE_TAG);
      textElement.textContent = text;
      // <c-element><embed></embed><c-zero-text>ZWS;↓</c-zero-text></c-element>
      if (zeroTextEle.parentElement?.localName === INLINE_ELEMENT_TAG) {
        const cloneElement = zeroTextEle.parentElement.cloneNode(
          false,
        ) as HTMLElement;
        cloneElement.appendChild(textElement);
        zeroTextEle.parentElement.after(cloneElement);
      } else {
        // <paragraph><c-zero-text>ZWS;↓</c-zero-text></paragraph>
        const cElement = ownerDocument.createElement(INLINE_ELEMENT_TAG);
        cElement.appendChild(textElement);
        zeroTextEle.after(cElement);
      }
      needsRerender = true;
    }

    // in inline end break
    if (
      staticRange &&
      isElementNode(staticRange.startContainer) &&
      staticRange.startContainer.classList.contains(INLINE_END_BREAK_CLASS)
    ) {
      const ownerDocument = staticRange.startContainer.ownerDocument;
      const prevElement = staticRange.startContainer.previousElementSibling!;
      const child = prevElement.firstElementChild as HTMLElement | null;
      if (
        prevElement.localName === INLINE_ELEMENT_TAG &&
        child?.isContentEditable
      ) {
        const len = child.textContent!.length;
        (child.firstChild as Text).insertData(len, text);
        ev.preventDefault();
      } else {
        const cElement = ownerDocument.createElement(INLINE_ELEMENT_TAG);
        const textElement: HTMLElement =
          ownerDocument.createElement(INLINE_TEXT_NODE_TAG);
        textElement.textContent = text;
        cElement.appendChild(textElement);
        staticRange.startContainer.before(cElement);
        ev.preventDefault();
      }
      needsRerender = true;
    }

    const pendingInsertAttrs = this.consumeNextInsertAttrs(
      editableBlock.id,
      plan.offset,
      { allowNearby: true },
    );

    if (pendingInsertAttrs !== undefined) {
      ev.preventDefault();
      this._insertTextWithRevision(
        editableBlock,
        plan.offset,
        text,
        pendingInsertAttrs,
      );
      if (!this._setTextCursor(editableBlock.id, plan.offset + text.length)) {
        this.doc.selection.blur();
      }
      return;
    }

    if (this.hasNextInsertAttrs()) {
      this.clearNextInsertAttrs();
    }

    if (needsRerender) {
      // Zero-space / end-break: DOM was manually patched above, use ORIGIN_SKIP_SYNC + rerender
      this._insertTextWithRevision(
        editableBlock,
        plan.offset,
        text,
        undefined,
        ORIGIN_SKIP_SYNC,
      );
      editableBlock.rerender();
      editableBlock.setInlineRange(plan.offset + text.length);
    } else {
      // Normal input: controlled rendering — preventDefault lets observer sync blot tree
      ev.preventDefault();
      this._insertTextWithRevision(editableBlock, plan.offset, text);
      if (!this._setTextCursor(editableBlock.id, plan.offset + text.length)) {
        this.doc.selection.blur();
      }
    }
  }

  @EventListen("keyDown")
  private _handleSelectedStartPrintableFallback(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<KeyboardEvent>();
    if (!this._isPrintableKey(ev)) return;

    const selection = this.doc.selection.value;

    if (!selection) return;
    if (this._isAbsoluteObjectSelection(selection)) {
      ev.preventDefault();
      return true;
    }
    if (
      !this._hasWholeBlockEndpoint(selection) &&
      !this._hasBoundaryEndpoint(selection) &&
      !this._hasTableCellSelection(selection)
    ) {
      return;
    }

    try {
      if (this._handlePrintableModelSelection(selection, ev.key)) {
        ev.preventDefault();
        return true;
      }
    } catch (error) {
      if (!(error instanceof BlockReadonlyError)) throw error;
      ev.preventDefault();
      return true;
    }
    return;
  }

  private _replaceSelectedBlocksWithParagraph(
    range: BlockRangeEditPlan,
    text: string,
  ) {
    const target = this._resolveWholeBlockRange(range);
    if (!target) return false;
    const resolved = this._resolveBlockSelectionHost(target.end);
    if (!resolved) {
      return false;
    }

    this.doc.crud.undoManager.captureSelectionBeforeChange();

    if (resolved.mode === "inside") {
      // Typing over a block-selected renderUnit container (table-cell / column):
      // clear it and type into its fresh empty paragraph instead of replacing
      // the container in its (non-renderUnit) parent. Mirrors the
      // compositionStart `inside` path. See _resolveBlockSelectionHost.
      const editable = this._clearContainerToEmptyParagraph(resolved.host);
      if (!editable) return false;
      if (text) {
        this._insertTextWithRevision(editable, 0, text);
      }
      return this._setTextCursor(editable.id, text ? text.length : 0);
    }

    const paragraph = this.doc.schemas.createSnapshot("paragraph", [text]);
    this._runRevisionGroup(() => {
      this.doc.crud.transact(() => {
        this.doc.crud.insertBlocksAfter(target.end.id, [paragraph]);
        if (target.start.id !== target.end.id) {
          const throughPath = this.doc.queryBlocksThroughPathDeeply(
            target.start,
            target.end,
          );
          if (throughPath.length) {
            throughPath.forEach((through) => {
              this.doc.crud.deleteBlocks(
                through.parent,
                through.index,
                through.length,
              );
            });
          }
          this.doc.crud.deleteBlockById(target.end.id);
        }
        this.doc.crud.deleteBlockById(target.start.id);
      });
    });

    this._setTextSelectionWhenReady(paragraph.id, text.length);
    return true;
  }

  private _hasBoundaryEndpoint(selection: BlockSelection): boolean {
    return selection.start?.type === "boundary" || selection.end?.type === "boundary";
  }

  private _hasWholeBlockEndpoint(selection: BlockSelection): boolean {
    return selection.start?.type === "selected" || selection.end?.type === "selected";
  }

  private _resolveWholeBlockRange(
    range: BlockSelection | BlockRangeEditPlan,
  ): ResolvedBlockRange | null {
    const plan = range instanceof BlockSelection
      ? this._planSelectionEdit(range)
      : range;
    if (plan.kind !== "block-range") return null;
    const start = this._getLiveBlockById(plan.startBlockId);
    const end = this._getLiveBlockById(plan.endBlockId);
    return start && end ? {start, end} : null;
  }

  private _handlePrintableModelSelection(
    selection: BlockSelection,
    text: string,
  ): boolean | undefined {
    const plan = this._planSelectionEdit(selection);
    this._assertPlanWritable(plan, BlockReadonlyOperation.Replace);

    switch (plan.kind) {
      case "table-cell":
        this._replaceTableCellSelection(plan, text, "text-cursor") ||
          this.doc.selection.blur();
        return true;
      case "boundary":
        this._replaceBoundarySelectionWithText(plan, text) ||
          this.doc.selection.blur();
        return true;
      case "block-range":
        this._replaceSelectedBlocksWithParagraph(plan, text) ||
          this.doc.selection.blur();
        return true;
      case "range":
        if (!this._replacePlannedRange(plan, text, true)) {
          this.doc.selection.blur();
          return true;
        }
        this._syncPlannedRangeSelection(plan, text.length);
        return true;
      default:
        return;
    }
  }

  private _resolveReplaceEdge(
    edge: SelectionReplaceEdge,
  ): ResolvedReplaceEdge | null {
    const block = this._getLiveBlockById(edge.blockId);
    if (!block) return null;
    if (edge.kind === "block") return {...edge, block};
    const textLength = typeof (block as EditableBlockComponent).textLength === "number"
      ? (block as EditableBlockComponent).textLength
      : (block as EditableBlockComponent).yText?.length;
    const isEditable = typeof this.doc.isEditable === "function" &&
      this.doc.isEditable(block);
    if (!isEditable || typeof textLength !== "number") return null;
    if (
      !Number.isInteger(edge.from) ||
      !Number.isInteger(edge.to) ||
      edge.from < 0 ||
      edge.to < edge.from ||
      edge.to > textLength
    ) {
      return null;
    }
    return {...edge, block: block as EditableBlockComponent};
  }

  private _stabilizePlannedRangeCursor(
    point: {blockId: string; offset: number} | null,
  ): void {
    if (point && this.doc.selection?.replay) {
      this.doc.selection.replay({
        anchor: {blockId: point.blockId, type: "text", offset: point.offset},
        head: {blockId: point.blockId, type: "text", offset: point.offset},
        commonParent: point.blockId,
      });
      return;
    }
    this.doc.selection?.blur?.();
  }

  private _replacePlannedRange(
    plan: Extract<SelectionEditPlan, {kind: "range"}>,
    text?: string | null,
    merge = false,
    skipAppend = false,
  ): boolean {
    if (this.doc.revisions?.isTracking) {
      return this._trackPlannedRange(plan, text, merge);
    }
    const start = this._resolveReplaceEdge(plan.start);
    const end = plan.end ? this._resolveReplaceEdge(plan.end) : null;
    if (!start || (plan.end && !end)) return false;
    const insertionEnd = start.kind === "block" && end?.kind === "text"
      ? end
      : null;
    if (start.kind === "block" && !insertionEnd) return false;

    this.doc.crud.undoManager.captureSelectionBeforeChange();
    if (plan.stabilizeAt) this._stabilizePlannedRangeCursor(plan.stabilizeAt);

    const shouldMergeTail = merge && plan.tailMode === "merge";
    let remainingDelta: DeltaOperation[] | null = null;
    if (shouldMergeTail && start.kind === "text" && end?.kind === "text") {
      if (end.to < end.block.textLength) {
        remainingDelta = [
          ...sliceDelta(end.block.textDeltas(), end.to, end.block.textLength),
        ];
      }
    }

    let insertAttrs: DeltaInsert["attributes"] | undefined;
    if (text) {
      const insertionEdge = start.kind === "text"
        ? start
        : end?.kind === "text"
          ? end
          : null;
      if (insertionEdge) {
        insertAttrs = this._inheritedReplaceAttrs(
          insertionEdge.block,
          insertionEdge.from,
          insertionEdge.to - insertionEdge.from,
        );
      }
    }

    const throughPath = end
      ? this.doc.queryBlocksThroughPathDeeply(start.block, end.block)
        .filter(through => through.length > 0)
      : [];
    if (throughPath.length) {
      // Finish structural deletion first. Yjs deep observers update ModelGraph
      // and component children caches only after this transaction closes; doing
      // endpoint deletion in the same callback would use stale parent indexes.
      this.doc.crud.transact(() => {
        throughPath.forEach(through => {
          this.doc.crud.deleteBlocks(through.parent, through.index, through.length);
        });
      });
    }

    this.doc.crud.transact(() => {
      // A cross-container path may already have removed an endpoint (or one of
      // its ancestors). Resolve liveness after those structural deletions so the
      // endpoint is not deleted/mutated a second time against a stale VM ref.
      const liveStart = this._getLiveBlockById(start.blockId);
      if (!liveStart) return;

      if (start.kind === "text") {
        const liveStartText = liveStart as EditableBlockComponent;
        const deleteLength = start.to - start.from;
        liveStartText.yText.delete(start.from, deleteLength);
        if (text) liveStartText.yText.insert(start.from, text, insertAttrs);

        // Resolve the endpoint only after the structural transaction and its
        // observers have settled; the earlier VM reference may now be stale.
        const liveEnd = end ? this._getLiveBlockById(end.blockId) : null;
        if (end && liveEnd) {
          if (shouldMergeTail) {
            this.doc.crud.deleteBlockById(end.blockId);
          } else if (
            end.kind === "block" ||
            (end.kind === "text" && end.to >= end.block.textLength)
          ) {
            this.doc.crud.deleteBlockById(end.blockId);
          } else if (end.kind === "text" && (end.from > 0 || end.to > end.from)) {
            (liveEnd as EditableBlockComponent).yText.delete(end.from, end.to - end.from);
          }
        }
        return;
      }

      this.doc.crud.deleteBlockById(start.blockId);
      const liveEnd = end ? this._getLiveBlockById(end.blockId) : null;
      if (!liveEnd) return;
      (liveEnd as EditableBlockComponent).replaceText(
        insertionEnd!.from,
        insertionEnd!.to - insertionEnd!.from,
        text,
        insertAttrs,
      );
    });

    if (remainingDelta?.length && start.kind === "text" && !skipAppend) {
      const liveStart = this._getLiveBlockById<EditableBlockComponent>(start.blockId);
      if (!liveStart) return true;
      liveStart.applyDeltaOperations([
        {retain: liveStart.yText.length},
        ...remainingDelta,
      ]);
    }
    return true;
  }

  private _trackPlannedRange(
    plan: RangeEditPlan,
    text?: string | null,
    merge = false,
  ): boolean {
    const start = this._resolveReplaceEdge(plan.start);
    const end = plan.end ? this._resolveReplaceEdge(plan.end) : null;
    if (!start || (plan.end && !end)) return false;

    const shouldMerge = !!end && merge && plan.tailMode === "merge";
    if (
      shouldMerge &&
      start.block.parentId !== end?.block.parentId
    ) {
      this.doc.messageService.warn("修订模式 v1 仅支持同父级文本块合并");
      return false;
    }

    this.doc.crud.undoManager.captureSelectionBeforeChange();
    if (plan.stabilizeAt) this._stabilizePlannedRangeCursor(plan.stabilizeAt);

    this._runRevisionGroup(() => {
      const throughPath = end
        ? this.doc.queryBlocksThroughPathDeeply(start.block, end.block)
          .filter(through => through.length > 0)
        : [];
      throughPath.forEach(through => {
        this.doc.crud.deleteBlocks(through.parent, through.index, through.length);
      });

      if (start.kind === "text") {
        this.doc.revisions.deleteText(
          start.blockId,
          start.from,
          start.to - start.from,
        );
      } else {
        this.doc.crud.deleteBlockById(start.blockId);
      }

      if (end && end.blockId !== start.blockId) {
        if (end.kind === "text") {
          this.doc.revisions.deleteText(
            end.blockId,
            end.from,
            end.to - end.from,
          );
        } else {
          this.doc.crud.deleteBlockById(end.blockId);
        }
      }

      if (shouldMerge && start.kind === "text" && end?.kind === "text") {
        this.doc.revisions.recordBoundary(
          "block-merge",
          start.block.parentId!,
          start.blockId,
          end.blockId,
        );
      }

      if (text && plan.insertAt) {
        const insertBlock = this._getLiveBlockById<EditableBlockComponent>(
          plan.insertAt.blockId,
        );
        if (insertBlock) {
          const attrs = this._inheritedReplaceAttrs(
            insertBlock,
            plan.insertAt.offset,
            start.kind === "text" && start.blockId === insertBlock.id
              ? start.to - start.from
              : 0,
          );
          this.doc.revisions.insertText(
            insertBlock.id,
            plan.insertAt.offset,
            text,
            attrs,
          );
        }
      }
    });
    return true;
  }

  private _deleteAllSelected(
    range: BlockSelection | BlockRangeEditPlan,
  ) {
    const target = this._resolveWholeBlockRange(range);
    if (!target) return false;

    // Pre-capture selection for undo BEFORE deleting blocks
    this.doc.crud.undoManager.captureSelectionBeforeChange();

    const parent = target.start.parentBlock;
    const deletedIndex = this._blockIndexInParent(target.start, parent);
    const prevBlock = this.doc.prevSibling(target.start);
    const nextBlock = this.doc.nextSibling(target.end);
    this._runRevisionGroup(() => {
      this.doc.yDoc.transact(() => {
        if (target.start.id === target.end.id) {
          this.doc.crud.deleteBlockById(target.start.id);
          return;
        }
        const throughPath = this.doc.queryBlocksThroughPathDeeply(
          target.start,
          target.end,
        );
        if (throughPath.length) {
          throughPath.forEach((through) => {
            this.doc.crud.deleteBlocks(
              through.parent,
              through.index,
              through.length,
            );
          });
        }
        this.doc.crud.deleteBlockById(target.start.id);
        this.doc.crud.deleteBlockById(target.end.id);
      });
    });
    restoreSelectionAfterBlockDelete(this.doc, parent, deletedIndex, prevBlock, nextBlock, "previous");
    return true;
  }

  private _blockIndexInParent(
    block: BlockCraft.BlockComponent,
    parent: BlockCraft.BlockComponent | null | undefined,
  ): number {
    const index = parent?.childrenIds?.indexOf(block.id) ?? -1;
    if (index >= 0) return index;
    return typeof block.getIndexOfParent === "function"
      ? block.getIndexOfParent()
      : 0;
  }

  deleteByRange(range: BlockSelection, merge = false) {
    const plan = this._planSelectionEdit(range);
    this._assertPlanWritable(plan, BlockReadonlyOperation.Delete);
    switch (plan.kind) {
      case "range":
        return this._replacePlannedRange(plan, null, merge);
      case "block-range":
        return this._deleteAllSelected(plan);
      case "boundary":
        return this._deleteBoundarySelection(plan);
      case "table-cell":
        return !!this._replaceTableCellSelection(plan, null, "table-selection");
      case "gap":
        return this._deleteGapBlockAt(plan, plan.side);
      default:
        return false;
    }
  }

  private _deleteGapBlockAt(
    source: GapEditPlan,
    side: "before" | "after",
  ): boolean {
    const block = source.side === side
      ? this._getLiveBlockById(source.blockId)
      : null;
    if (!block) return false;
    if (
      block.nodeType !== BlockNodeType.void &&
      block.nodeType !== BlockNodeType.block
    ) {
      return false;
    }

    const parent = block.parentBlock;
    const index = block.getIndexOfParent();
    const prevBlock = this.doc.prevSibling(block);
    const nextBlock = this.doc.nextSibling(block);

    this.doc.crud.undoManager?.captureSelectionBeforeChange?.();
    this.doc.crud.deleteBlockById(block.id);
    restoreSelectionAfterBlockDelete(this.doc, parent, index, prevBlock, nextBlock);
    return true;
  }

  private _handleModelDeleteSelection(
    sel: BlockSelection,
    gapSide: "before" | "after",
  ): boolean | null {
    if (
      !this._hasWholeBlockEndpoint(sel) &&
      !this._hasBoundaryEndpoint(sel) &&
      !this._hasTableCellSelection(sel) &&
      sel.start.type !== "gap" &&
      sel.end.type !== "gap"
    ) {
      return null;
    }
    const plan = this._planSelectionEdit(sel);
    this._assertPlanWritable(plan, BlockReadonlyOperation.Delete);
    switch (plan.kind) {
      case "block-range":
        return this._deleteAllSelected(plan);
      case "boundary":
        this._deleteBoundarySelection(plan) || this.doc.selection.blur();
        return true;
      case "range":
        if (!this._hasBoundaryEndpoint(sel)) return null;
        if (!this._replacePlannedRange(plan, null, true)) {
          this.doc.selection.blur();
          return true;
        }
        this._syncPlannedRangeSelection(plan);
        return true;
      case "table-cell":
        this._replaceTableCellSelection(plan, null, "table-selection") ||
          this.doc.selection.blur();
        return true;
      case "gap":
        return this._deleteGapBlockAt(plan, gapSide) ? true : null;
      default:
        return null;
    }
  }

  @BindHotKey({
    key: "Backspace",
    shiftKey: null,
    shortKey: null,
    metaKey: false,
  })
  private _handleBackspace(context: UIEventStateContext) {
    const state = context.get("keyboardState");
    const sel = state.selection;

    if (moveGapCaretAway(this.doc, sel, "before")) {
      context.preventDefault();
      return true;
    }
    if (this._consumeReadonlyTextDeleteKey(context, sel)) return true;

    // Gap-after + Backspace deletes the void/container block next to the caret,
    // then recalculates synchronously so the next render does not read a stale
    // selection that still points at the deleted block.
    let modelDeleteResult: boolean | null;
    try {
      modelDeleteResult = this._handleModelDeleteSelection(sel, "after");
    } catch (error) {
      if (!(error instanceof BlockReadonlyError)) throw error;
      context.preventDefault();
      return true;
    }
    if (modelDeleteResult !== null) {
      context.preventDefault();
      return modelDeleteResult;
    }

    if (!sel.collapsed || sel.start.type !== "text" || sel.start.offset !== 0)
      return false;
    const block = sel.firstBlock as any;
    // 非paragraph块转化
    if (block.flavour !== "paragraph") {
      context.preventDefault();
      const schema = this.doc.schemas.get(block.flavour)!;
      if (schema.metadata.isLeaf) return true;
      const deltas = block.textDeltas();
      const np = this.doc.schemas.createSnapshot("paragraph", [
        deltas,
        block.props,
      ]);
      void this.doc
        .chain()
        .replaceWithSnapshots(block.id, [np])
        .setSelection({
          index: 0,
          length: 0,
          type: "text",
          blockId: np.id,
        })
        .run();
      return true;
    }

    // 每一段的最前面
    if (block.props["heading"]) {
      context.preventDefault();
      block.updateProps({
        heading: null,
      });
      return true;
    }

    if (block.props.depth) {
      context.preventDefault();
      block.updateProps({
        depth: block.props.depth - 1,
      });
      return true;
    }

    // paragraph块
    const prevBlock = this.doc.prevSibling(block);
    // 最前的block
    if (!prevBlock) {
      const parent = block.parentBlock;

      if (parent) {
        context.preventDefault();

        // 如果是第一个空白的文本块，直接删除
        if (!block.textLength && parent.childrenLength > 1) {
          this.doc.selection.selectOrSetCursorAtBlock(
            parent.getChildrenByIndex(1),
            true,
          );
          this.doc.crud.deleteBlockById(block.id);
          return true;
        }

        if (parent.nodeType !== BlockNodeType.root) {
          // 选中父级
          this.doc.selection.selectBlock(parent);
        }
      }

      return true;
    }

    // 有前一个兄弟块
    // 如果前一个兄弟块是可编辑块
    if (this.doc.isEditable(prevBlock)) {
      context.preventDefault();
      try {
        this.doc.readonlyManager?.assertTextWritable(
          prevBlock.id,
          BlockReadonlyOperation.Text,
          "input",
        );
        this.doc.readonlyManager?.assertRemovable(
          [block.id],
          BlockReadonlyOperation.Delete,
          "input",
        );
      } catch (error) {
        if (!(error instanceof BlockReadonlyError)) throw error;
        return true;
      }
      if (this.doc.revisions?.isTracking) {
        prevBlock.setInlineRange(prevBlock.textLength);
        this._runRevisionGroup(() => {
          this.doc.revisions.recordBoundary(
            "block-merge",
            block.parentId!,
            prevBlock.id,
            block.id,
          );
        });
        return true;
      }
      // 「读取本块文本 → 并入前块 → 删除本块」必须是同一个 Yjs 事务：
      // 拆开时协同方会观察到文本已并入但本块仍存在的中间态。选区设置是
      // 纯本地副作用，放在事务外，避免 selectionChange$ 订阅者在事务中途执行。
      prevBlock.setInlineRange(prevBlock.textLength);
      this.doc.crud.transact(() => {
        const deltas: DeltaOperation[] = block.textDeltas();
        deltas.unshift({ retain: prevBlock.textLength });
        prevBlock.applyDeltaOperations(deltas);
        this.doc.crud.deleteBlockById(block.id);
      });
      return true;
    }

    if (!focusBlockSelectionEdge(this.doc, prevBlock, false)) {
      this.doc.selection.selectBlock(prevBlock);
    }
    !block.textLength && this.doc.crud.deleteBlockById(block.id);
    context.preventDefault();
    return true;
  }

  @BindHotKey({ key: "Delete", shiftKey: null, shortKey: null, metaKey: false })
  private _handleDelete(context: UIEventStateContext) {
    const state = context.get("keyboardState");
    const sel = state.selection;

    if (moveGapCaretAway(this.doc, sel, "after")) {
      context.preventDefault();
      return true;
    }
    if (this._consumeReadonlyTextDeleteKey(context, sel)) return true;

    // Gap-before + Delete mirrors Backspace from gap-after.
    let modelDeleteResult: boolean | null;
    try {
      modelDeleteResult = this._handleModelDeleteSelection(sel, "before");
    } catch (error) {
      if (!(error instanceof BlockReadonlyError)) throw error;
      context.preventDefault();
      return true;
    }
    if (modelDeleteResult !== null) {
      context.preventDefault();
      return modelDeleteResult;
    }

    const block = sel.firstBlock as any;
    if (
      !sel.collapsed ||
      sel.start.type !== "text" ||
      sel.start.offset !== block.textLength
    )
      return false;

    const nextBlock = this.doc.nextSibling(block);
    if (nextBlock) {
      if (this.doc.isEditable(nextBlock)) {
        context.preventDefault();
        try {
          this.doc.readonlyManager?.assertTextWritable(
            block.id,
            BlockReadonlyOperation.Text,
            "input",
          );
          this.doc.readonlyManager?.assertRemovable(
            [nextBlock.id],
            BlockReadonlyOperation.Delete,
            "input",
          );
        } catch (error) {
          if (!(error instanceof BlockReadonlyError)) throw error;
          return true;
        }
        if (this.doc.revisions?.isTracking) {
          block.setInlineRange(block.textLength);
          this._runRevisionGroup(() => {
            this.doc.revisions.recordBoundary(
              "block-merge",
              block.parentId!,
              block.id,
              nextBlock.id,
            );
          });
          return true;
        }
        // 与 Backspace 合并对称：读取、并入、删块放进同一事务，见上方说明。
        block.setInlineRange(block.textLength);
        this.doc.crud.transact(() => {
          const deltas: DeltaOperation[] = nextBlock.textDeltas();
          deltas.unshift({ retain: block.textLength });
          block.applyDeltaOperations(deltas);
          this.doc.crud.deleteBlockById(nextBlock.id);
        });
        return true;
      } else {
        if (!focusBlockSelectionEdge(this.doc, nextBlock, true)) {
          this.doc.selection.selectBlock(nextBlock);
        }
        context.preventDefault();
        return true;
      }
    }

    const parent = block.parentBlock;
    if (parent && parent.nodeType !== BlockNodeType.root) {
      this.doc.selection.selectBlock(parent);
      context.preventDefault();
      return true;
    }
    return false;
  }

  @BindHotKey({ key: "Tab", shiftKey: null })
  private _handlerTab(context: UIEventStateContext) {
    const state = context.get("keyboardState");

    context.preventDefault();
    const sel = state.selection;
    if (this._isAbsoluteObjectSelection(sel)) return true;
    const firstBlock = sel.firstBlock;

    const prevBlock = this.doc.prevSibling(firstBlock);
    const _prevDepth = prevBlock ? (prevBlock.props.depth ?? 0) : 0;
    const _newDepth =
      (firstBlock.props.depth || 0) + (state.raw.shiftKey ? -1 : 1);
    if (_newDepth < 0) {
      this.doc.messageService.warn("当前内容块已到最小缩进层级");
      return true;
    }

    if (!state.raw.shiftKey && _newDepth > _prevDepth + 1) {
      this.doc.messageService.warn("当前内容块已到最大缩进层级");
      return true;
    }

    if (!sel.isInSameBlock) {
      const blocks = this.doc.queryBlocksBetween(
        firstBlock,
        sel.lastBlock,
        true,
      );
      this.doc.crud.transact(() => {
        for (const id of blocks) {
          const b = this.doc.getBlockById(id);
          if (
            !b
            // || !this.doc.isEditable(b)
          )
            return;
          // @ts-ignore
          const old = (b.props["depth"] || 0) as number;
          if (state.raw.shiftKey && old === 0) return;
          b.updateProps({
            depth: old + (state.raw.shiftKey ? -1 : 1),
          });
        }
      });
    } else {
      firstBlock.updateProps({
        depth: _newDepth,
      });
    }
    return true;
  }

  @BindHotKey({ key: "Enter", shiftKey: null, ctrlKey: null })
  private async _handlerEnter(context: UIEventStateContext) {
    const state = context.get("keyboardState");
    const sel = state.selection;

    context.preventDefault();
    if (this._isAbsoluteObjectSelection(sel)) return true;
    const plan = this._planSelectionEdit(sel);
    if (!this._tryAssertInputPlan(context, plan, BlockReadonlyOperation.Insert)) {
      return true;
    }

    // Handle gap-cursor Enter: insert a new empty paragraph at the gap, keep the
    // void/container block, and move the caret into the new paragraph.
    if (plan.kind === "gap") {
      if (!this._insertParagraphAtGap(plan, "")) this.doc.selection.blur();
      return true;
    }

    if (plan.kind === "block-range") {
      const target = this._resolveWholeBlockRange(plan);
      if (!target) {
        this.doc.selection.blur();
        return true;
      }
      const p = this.doc.schemas.createSnapshot("paragraph", [
        [],
        target.start.props,
      ]);
      await (
        state.raw.ctrlKey
          ? this.doc.chain().insertBeforeSnapshots(target.start, [p])
          : this.doc.chain().insertAfterSnapshots(target.end, [p])
      )
        .setCursorAtBlock(p.id, true)
        .run();
      return true;
    }

    if (plan.kind === "boundary") {
      this._replaceBoundarySelectionWithText(plan, "") ||
        this.doc.selection.blur();
      return true;
    }

    if (plan.kind === "table-cell") {
      this._replaceTableCellSelection(plan, null, "anchor-cursor") ||
        this.doc.selection.blur();
      return true;
    }

    if (plan.kind === "range") {
      if (!this._replacePlannedRange(plan)) {
        this.doc.selection.blur();
        return true;
      }
      this._syncPlannedRangeSelection(plan);
      return true;
    }

    if (plan.kind !== "text-cursor") {
      this.doc.selection.blur();
      return true;
    }
    const block: any = this._getLiveBlockById(plan.blockId);
    if (!block || !this.doc.isEditable(block)) {
      this.doc.selection.blur();
      return true;
    }
    const offset = plan.offset;

    // 强制同段换行
    if (state.raw.shiftKey) {
      block.insertText(offset, STR_LINE_BREAK);
      block.setInlineRange(offset + 1);
      return true;
    }

    if (this.doc.revisions?.isTracking) {
      return this._trackParagraphSplit(block, offset);
    }

    // 空段落
    if (!block.textLength) {
      if (block.props.heading) {
        block.updateProps({
          heading: null,
        } as any);
        return true;
      }

      if (block.props.depth > 0) {
        block.updateProps({
          depth: block.props.depth - 1,
        });
        return true;
      }

      const p = this.doc.schemas.createSnapshot("paragraph", [[], block.props]);
      await (
        block.flavour !== "paragraph"
          ? this.doc.chain().replaceWithSnapshots(block.id, [p])
          : this.doc.chain().insertAfterSnapshots(block, [p])
      )
        .selectOrSetCursorAtBlock(p.id, true)
        .run();
      return true;
    }

    // 在前面换行
    if (offset === 0) {
      const p = this.doc.schemas.createSnapshot(block.flavour, [
        [],
        {
          ...block.props,
          heading: null,
        },
      ]);
      this.doc.crud.insertBlocksBefore(block, [p]);
      return true;
    }

    const deltas = sliceDelta(block.textDeltas(), offset);
    const p = this.doc.schemas.createSnapshot(
      block.textLength && !block.heading && block.flavour !== "blockquote"
        ? block.flavour
        : "paragraph",
      [
        deltas,
        {
          ...block.props,
          heading: null,
        },
      ],
    );
    void this.doc
      .chain()
      .transact(() => {
        block.deleteText(offset);
        this.doc.crud.insertBlocksAfter(block, [p]);
      })
      .selectOrSetCursorAtBlock(p.id, true)
      .run();
    return true;
  }

  private _trackParagraphSplit(
    block: EditableBlockComponent,
    offset: number,
  ): true {
    const parentId = block.parentId;
    if (!parentId) {
      this.doc.selection.blur();
      return true;
    }

    const tail = sliceDelta(block.textDeltas(), offset);
    const right = offset === 0
      ? block
      : null;
    const paragraph = this.doc.schemas.createSnapshot(
      offset === 0 ? block.flavour : (
        block.textLength && !block.heading && block.flavour !== "blockquote"
          ? block.flavour
          : "paragraph"
      ),
      [
        offset === 0 ? [] : tail,
        {
          ...block.props,
          heading: offset === 0 ? null : block.props.heading ?? null,
        },
      ],
    );

    this.doc.crud.undoManager.captureSelectionBeforeChange();
    this._runRevisionGroup(() => {
      this.doc.crud.transact(() => {
        this.doc.revisions.runWithoutTracking(() => {
          if (offset === 0) {
            this.doc.crud.insertBlocksBefore(block, [paragraph]);
          } else {
            block.yText.delete(offset, block.textLength - offset);
            this.doc.crud.insertBlocksAfter(block, [paragraph]);
          }
        });
        this.doc.revisions.recordBoundary(
          "block-split",
          parentId,
          offset === 0 ? paragraph.id : block.id,
          right?.id ?? paragraph.id,
        );
      });
    });
    this._setTextSelectionWhenReady(
      offset === 0 ? block.id : paragraph.id,
      0,
    );
    return true;
  }
}

function getPlainTextFromInputEvent(event: InputEvent) {
  // When `inputType` is "insertText":
  // - `event.data` should be string (Safari uses `event.dataTransfer`).
  // - `event.dataTransfer` should be null.
  // When `inputType` is "insertReplacementText":
  // - `event.data` should be null.
  // - `event.dataTransfer` should contain "text/plain" data.

  if (typeof event.data === "string") {
    return event.data;
  }
  if (event.dataTransfer?.types.includes("text/plain")) {
    return event.dataTransfer.getData("text/plain");
  }
  return null;
}

function containsNonPrintableChar(data: string): boolean {
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    // 控制字符 (0x00-0x1F)、DEL (0x7F)、macOS 功能键 PUA 区域 (0xF700-0xF8FF)
    if (code < 0x20 || code === 0x7f || (code >= 0xf700 && code <= 0xf8ff)) {
      return true;
    }
  }
  return false;
}
