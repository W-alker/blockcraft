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
  IBlockRange,
  IGapSelectionPoint,
  INormalizedEndpoints,
  INormalizedRange,
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
import { CompositionSession } from "./composition-session";
import {
  planSelectionEdit,
  SelectionEditPlan,
  SelectionEditSource,
  SelectionReplaceEdge,
} from "./selection-edit-plan";

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

type TableCellSelectionTarget = {
  table: BlockCraft.IBlockComponents["table"];
  anchorCell: BlockCraft.IBlockComponents["table-cell"];
  headCell: BlockCraft.IBlockComponents["table-cell"];
  cells: BlockCraft.IBlockComponents["table-cell"][];
};

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
        const block = this._getLiveBlockById(blockId);
        return block ? block.parentId ?? null : undefined;
      },
      getChildrenIds: blockId => {
        const block = this._getLiveBlockById(blockId);
        return block ? block.childrenIds ?? [] : null;
      },
      getTextLength: blockId => {
        const block = this._getLiveBlockById(blockId);
        return block && this.doc.isEditable(block) ? block.textLength : null;
      },
    }, {tailMode});
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
      this.doc.schemas.isValidChildren("paragraph", parent.flavour)
    ) {
      return { host: parent, mode: "sibling" };
    }
    if (
      this.doc.schemas.get(block.flavour)?.metadata.renderUnit &&
      this.doc.schemas.isValidChildren("paragraph", block.flavour)
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

  private _setTextSelectionAndSync(
    base: string | Partial<IBlockRange>,
    index: number,
  ): void {
    const point = typeof base === "string"
      ? {blockId: base}
      : {...base};
    this.doc.selection.setSelection({
      ...point,
      type: "text",
      index,
      length: 0,
    } as any);
    this.doc.selection.recalculate?.();
  }

  private _syncPlannedRangeSelection(
    plan: RangeEditPlan,
    insertedLength = 0,
  ): void {
    if (!plan.insertAt) {
      this.doc.selection.recalculate();
      return;
    }
    this._setTextSelectionAndSync(
      {blockId: plan.insertAt.blockId},
      plan.insertAt.offset + insertedLength,
    );
  }

  private _setCursorAtAndSync(block: EditableBlockComponent, index: number): void {
    this.doc.selection.setCursorAt(block as any, index);
    this.doc.selection.recalculate?.();
  }

  private _focusEditingHostForBlock(
    block: BlockCraft.BlockComponent | null | undefined,
  ): void {
    let host = (this.doc as any).root?.hostElement as HTMLElement | undefined;
    try {
      const blockHost = block?.hostElement;
      host = (blockHost?.closest?.('[contenteditable="true"]') as HTMLElement | null) ||
        host;
    } catch {
      // Fall back to root host below.
    }
    const active = document.activeElement;
    if (host && active !== host && !host.contains(active)) {
      host.focus?.({ preventScroll: true });
    }
  }

  private _setCompositionTextCursor(
    block: EditableBlockComponent,
    offset: number,
  ): boolean {
    const safeOffset = Math.max(0, Math.min(offset, block.textLength ?? offset));
    try {
      this._focusEditingHostForBlock(block);
      this.doc.selection.setCursorAt?.(block as any, safeOffset);
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
    this._focusEditingHostForBlock(block);
    block.setInlineRange(safeIndex);
    const root = (this.doc as any).root?.hostElement as HTMLElement | undefined;
    const active = document.activeElement;
    if (root && root.isConnected && active && active !== root && !root.contains(active)) {
      this._focusEditingHostForBlock(block);
      block.setInlineRange(safeIndex);
    }
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
      this._focusEditingHostForBlock(block);
      const replay = (this.doc.selection as any).replay;
      if (typeof replay === "function") {
        replay.call(this.doc.selection, selection);
      } else {
        this.doc.selection.setCursorAt?.(block as any, safeIndex);
        this.doc.selection.recalculate?.();
      }
    } catch {
      try {
        this._setCompositionTextCursor(block, safeIndex);
        this.doc.selection.recalculate?.();
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
      this.doc.schemas.isValidChildren("paragraph", target.host.flavour)
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

    this.doc.crud.transact(() => {
      if (target.count > 0) {
        this.doc.crud.deleteBlocks(target.host.id, target.from, target.count, true);
      }
      this.doc.crud.insertBlocks(target.host.id, target.from, [paragraph]);
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
    const child = this.doc.getBlockById(childId);
    if (!child) {
      this.doc.selection.recalculate();
      return;
    }
    if (!focusBlockSelectionEdge(this.doc, child, atStart)) {
      this.doc.selection.recalculate();
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
    this._setCursorAtAndSync(block as any, text.length);
    return true;
  }

  private _getLiveBlockById<T extends BlockCraft.BlockComponent = BlockCraft.BlockComponent>(
    id: string,
  ): T | null {
    try {
      return (this.doc.getBlockById(id) as T | null) ?? null;
    } catch {
      return null;
    }
  }

  private _isLiveTable(block: unknown): block is BlockCraft.IBlockComponents["table"] {
    return !!block &&
      (block as BlockCraft.BlockComponent).flavour === "table" &&
      Array.isArray((block as BlockCraft.IBlockComponents["table"]).childrenIds) &&
      typeof (block as BlockCraft.IBlockComponents["table"]).confirmSelection === "function" &&
      typeof (block as BlockCraft.IBlockComponents["table"]).getCellsMatrixByCoordinates === "function";
  }

  private _isLiveTableCell(block: unknown): block is BlockCraft.IBlockComponents["table-cell"] {
    return !!block &&
      (block as BlockCraft.BlockComponent).flavour === "table-cell" &&
      typeof (block as BlockCraft.IBlockComponents["table-cell"]).getIndexOfParent === "function";
  }

  private _resolveTableCellSelection(
    tableCellSelection: TableCellEditPlan,
  ): TableCellSelectionTarget | null {
    const table = this._getLiveBlockById<BlockCraft.IBlockComponents["table"]>(tableCellSelection.tableId);
    const anchorCell = this._getLiveBlockById<BlockCraft.IBlockComponents["table-cell"]>(tableCellSelection.anchorCellId);
    const headCell = this._getLiveBlockById<BlockCraft.IBlockComponents["table-cell"]>(tableCellSelection.headCellId);
    if (!this._isLiveTable(table) || !this._isLiveTableCell(anchorCell) || !this._isLiveTableCell(headCell)) return null;

    let anchor: { rowIdx: number; colIdx: number };
    let head: { rowIdx: number; colIdx: number };
    try {
      anchor = {
        rowIdx: table.childrenIds.indexOf(anchorCell.parentId!),
        colIdx: anchorCell.getIndexOfParent(),
      };
      head = {
        rowIdx: table.childrenIds.indexOf(headCell.parentId!),
        colIdx: headCell.getIndexOfParent(),
      };
    } catch {
      return null;
    }
    if (anchor.rowIdx < 0 || anchor.colIdx < 0 || head.rowIdx < 0 || head.colIdx < 0) {
      return null;
    }

    let cells: BlockCraft.IBlockComponents["table-cell"][];
    try {
      const coordinates = table.confirmSelection(
        [Math.min(anchor.rowIdx, head.rowIdx), Math.min(anchor.colIdx, head.colIdx)],
        [Math.max(anchor.rowIdx, head.rowIdx), Math.max(anchor.colIdx, head.colIdx)],
      );
      cells = table.getCellsMatrixByCoordinates(coordinates.start, coordinates.end)
        .flat(1)
        .filter(cell => this._isLiveTableCell(cell) && cell.props?.display !== "none");
    } catch {
      return null;
    }
    if (!cells.length) return null;

    const effectiveAnchor = cells.some(cell => cell.id === anchorCell.id)
      ? anchorCell
      : cells[0];
    const effectiveHead = cells.some(cell => cell.id === headCell.id)
      ? headCell
      : cells[cells.length - 1];

    return {
      table,
      anchorCell: effectiveAnchor,
      headCell: effectiveHead,
      cells,
    };
  }

  private _hasTableCellSelection(selection: BlockSelection): boolean {
    return typeof selection.getTableCellSelection === "function" &&
      !!selection.getTableCellSelection();
  }

  private _replaceTableCellWithParagraph(
    cell: BlockCraft.IBlockComponents["table-cell"],
    text: string | null,
  ): string | null {
    if (cell.props?.display === "none") return null;

    const oldChildrenLength = cell.childrenLength;
    const paragraph = this.doc.schemas.createSnapshot(
      "paragraph",
      text ? [text] : [],
    );
    this.doc.crud.insertBlocks(cell.id, 0, [paragraph]);
    if (oldChildrenLength > 0) {
      this.doc.crud.deleteBlocks(cell.id, 1, oldChildrenLength, true);
    }
    return paragraph.id;
  }

  private _setTextSelectionWhenReady(blockId: string, index: number): void {
    const apply = () => {
      try {
        (this.doc as any).root?.hostElement?.focus?.({ preventScroll: true });
        this.doc.selection.setSelection({
          blockId,
          type: "text",
          offset: index,
        } as any);
        this.doc.selection.recalculate();
        return true;
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
        this.doc.selection.recalculate();
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
      target.cells.forEach(cell => {
        const blockId = this._replaceTableCellWithParagraph(
          cell,
          cell.id === target.anchorCell.id ? text : null,
        );
        if (cell.id === target.anchorCell.id) {
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
        target.table,
        target.anchorCell,
        target.headCell,
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

    const plan = this._planSelectionEdit(curSel);
    if (plan.kind === "unsupported") {
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
      this.doc.selection.recalculate();
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
      this.doc.selection.recalculate();
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
      this.doc.selection.recalculate();
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

      if (hasBoundaryEndpoint) {
        this.doc.selection.setSelection({
          blockId: anchor.blockId,
          type: "text",
          index: anchor.offset,
          length: 0,
        });
      } else {
        this.doc.selection.setCursorAt(anchorBlock as any, anchor.offset);
      }
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
      this.doc.crud.transact(() => {
        insertBlock.yText.insert(insertIndex, text, insertAttrs);
        insertBlock.rerender();
        // Set cursor synchronously after rerender to avoid selectionchange race.
        // queueMicrotask would leave a gap where selectionchange fires with
        // invalid DOM selection (isComposing is already false), resetting cursor to 0.
        this._setCommittedCompositionCursor(insertBlock as EditableBlockComponent, cursorIndex);
      }, ORIGIN_SKIP_SYNC);

      // Drain deferred patches WITHOUT replaying.
      // rerender() already built the blot tree from the full Y.Text model,
      // which includes all remote changes. Replaying would double-apply them.
      this.compositionSession.drainDeferredPatches();

      // Recalculate selection from the final DOM state (after setInlineRange),
      // not from the stale pre-transaction state captured by compositionState.
      this.doc.selection.recalculate();
    } finally {
      this.compositionSession.end();
      this._endCompositionUndoGroup();
    }
  }

  @EventListen("beforeInput")
  private _handleBeforeInput(context: BlockCraft.EventStateContext): boolean | void {
    const ev = context.get("defaultState").event as InputEvent;
    if (isNativeInputTarget(ev.target)) {
      return;
    }
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

    const isDelete = ev.inputType.startsWith("delete");
    if (
      isDelete &&
      staticRange &&
      staticRange.startContainer === staticRange.endContainer &&
      isZeroSpace(staticRange.startContainer)
    ) {
      plan = this._adjustZeroSpaceDeletePlan(plan);
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
      this._setCursorAtAndSync(editableBlock, plan.offset);
      return true;
    }

    if (!text) return;

    let needsRerender = false;

    // in zero text
    if (staticRange && isZeroSpace(staticRange.startContainer)) {
      ev.preventDefault();
      const zeroTextEle = staticRange.startContainer.parentElement!;
      const textElement: HTMLElement =
        document.createElement(INLINE_TEXT_NODE_TAG);
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
        const cElement = document.createElement(INLINE_ELEMENT_TAG);
        cElement.appendChild(textElement);
        zeroTextEle.after(cElement);
      }
      needsRerender = true;
    }

    // in inline end break
    if (
      staticRange &&
      staticRange.startContainer instanceof HTMLElement &&
      staticRange.startContainer.classList.contains(INLINE_END_BREAK_CLASS)
    ) {
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
        const cElement = document.createElement(INLINE_ELEMENT_TAG);
        const textElement: HTMLElement =
          document.createElement(INLINE_TEXT_NODE_TAG);
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
      this.doc.crud.transact(() => {
        editableBlock.yText.insert(plan.offset, text, pendingInsertAttrs);
      });
      this._setTextSelectionAndSync({blockId: editableBlock.id}, plan.offset + text.length);
      return;
    }

    if (this.hasNextInsertAttrs()) {
      this.clearNextInsertAttrs();
    }

    if (needsRerender) {
      // Zero-space / end-break: DOM was manually patched above, use ORIGIN_SKIP_SYNC + rerender
      this.doc.crud.transact(() => {
        editableBlock.yText.insert(plan.offset, text);
      }, ORIGIN_SKIP_SYNC);
      editableBlock.rerender();
      editableBlock.setInlineRange(plan.offset + text.length);
    } else {
      // Normal input: controlled rendering — preventDefault lets observer sync blot tree
      ev.preventDefault();
      this.doc.crud.transact(() => {
        editableBlock.yText.insert(plan.offset, text);
      });
      this._setTextSelectionAndSync({blockId: editableBlock.id}, plan.offset + text.length);
    }
  }

  @EventListen("keyDown")
  private _handleSelectedStartPrintableFallback(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<KeyboardEvent>();
    if (!this._isPrintableKey(ev)) return;

    const selection = this.doc.selection.value;

    if (!selection) return;
    if (
      !this._hasWholeBlockEndpoint(selection) &&
      !this._hasBoundaryEndpoint(selection) &&
      !this._hasTableCellSelection(selection)
    ) {
      return;
    }

    if (this._handlePrintableModelSelection(selection, ev.key)) {
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
        this.doc.crud.transact(() => {
          editable.yText.insert(0, text);
        });
      }
      this._setTextSelectionAndSync({blockId: editable.id}, text ? text.length : 0);
      return true;
    }

    const paragraph = this.doc.schemas.createSnapshot("paragraph", [text]);
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

    this._setTextSelectionWhenReady(paragraph.id, text.length);
    return true;
  }

  private _hasBoundaryEndpoint(selection: BlockSelection): boolean {
    return selection.start?.type === "boundary" || selection.end?.type === "boundary";
  }

  private _hasWholeBlockEndpoint(selection: BlockSelection): boolean {
    return selection.start?.type === "selected" || selection.end?.type === "selected";
  }

  private _isLegacyWholeBlockPoint(point?: IBlockRange | null): boolean {
    return point?.type === "selected";
  }

  private _isWholeBlockSelectedRange(range: INormalizedRange): boolean {
    return this._isLegacyWholeBlockPoint(range.from) && (!range.to || this._isLegacyWholeBlockPoint(range.to));
  }

  private _resolveWholeBlockRange(
    range: INormalizedRange | BlockSelection | BlockRangeEditPlan,
  ): ResolvedBlockRange | null {
    if (range instanceof BlockSelection || "kind" in range) {
      const plan = range instanceof BlockSelection
        ? this._planSelectionEdit(range)
        : range;
      if (plan.kind !== "block-range") return null;
      const start = this._getLiveBlockById(plan.startBlockId);
      const end = this._getLiveBlockById(plan.endBlockId);
      return start && end ? {start, end} : null;
    }

    if (!this._isWholeBlockSelectedRange(range)) return null;
    const start = range.from.block;
    const end = range.to?.block ?? start;
    return start && end ? {start, end} : null;
  }

  private _handlePrintableModelSelection(
    selection: BlockSelection,
    text: string,
  ): boolean | undefined {
    const plan = this._planSelectionEdit(selection);

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

  private _legacyRangeToEditPlan(range: INormalizedRange): SelectionEditPlan {
    const {from, to, collapsed} = range;

    if (collapsed) {
      return from.type === "text"
        ? {kind: "text-cursor", blockId: this._legacyBlockId(from), offset: from.index}
        : {kind: "unsupported", reason: "unsupported-legacy-range"};
    }

    if (!to) {
      if (from.type === "selected") {
        const blockId = this._legacyBlockId(from);
        return {kind: "block-range", startBlockId: blockId, endBlockId: blockId};
      }
      return {
        kind: "range",
        start: {
          kind: "text",
          blockId: this._legacyBlockId(from),
          from: from.index,
          to: from.index + from.length,
        },
        end: null,
        insertAt: {blockId: this._legacyBlockId(from), offset: from.index},
        stabilizeAt: null,
        tailMode: "merge",
      };
    }

    if (from.type === "selected" && to.type === "selected") {
      return {
        kind: "block-range",
        startBlockId: this._legacyBlockId(from),
        endBlockId: this._legacyBlockId(to),
      };
    }

    const toEdge = (point: IBlockRange): SelectionReplaceEdge => point.type === "text"
      ? {
        kind: "text",
        blockId: this._legacyBlockId(point),
        from: point.index,
        to: point.index + point.length,
      }
      : {kind: "block", blockId: this._legacyBlockId(point)};
    const start = toEdge(from);
    const end = toEdge(to);
    const insertAt = start.kind === "text"
      ? {blockId: start.blockId, offset: start.from}
      : end.kind === "text"
        ? {blockId: end.blockId, offset: end.from}
        : null;

    return {
      kind: "range",
      start,
      end,
      insertAt,
      stabilizeAt: insertAt,
      tailMode: "merge",
    };
  }

  private _legacyBlockId(point: IBlockRange): string {
    return point.blockId || point.block.id || (point.block as any).blockId;
  }

  private _legacyBlocksForRange(
    range: INormalizedRange,
  ): Map<string, BlockCraft.BlockComponent> {
    const blocks = new Map<string, BlockCraft.BlockComponent>();
    blocks.set(this._legacyBlockId(range.from), range.from.block);
    if (range.to) blocks.set(this._legacyBlockId(range.to), range.to.block);
    return blocks;
  }

  private _resolveReplaceEdge(
    edge: SelectionReplaceEdge,
    legacyBlocks?: ReadonlyMap<string, BlockCraft.BlockComponent>,
  ): ResolvedReplaceEdge | null {
    const block = legacyBlocks?.get(edge.blockId) ?? this._getLiveBlockById(edge.blockId);
    if (!block) return null;
    if (edge.kind === "block") return {...edge, block};
    const textLength = typeof (block as EditableBlockComponent).textLength === "number"
      ? (block as EditableBlockComponent).textLength
      : (block as EditableBlockComponent).yText?.length;
    const isEditable = typeof this.doc.isEditable === "function"
      ? this.doc.isEditable(block)
      : legacyBlocks?.has(edge.blockId) && typeof textLength === "number";
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
    legacyBlocks?: ReadonlyMap<string, BlockCraft.BlockComponent>,
  ): boolean {
    const start = this._resolveReplaceEdge(plan.start, legacyBlocks);
    const end = plan.end ? this._resolveReplaceEdge(plan.end, legacyBlocks) : null;
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

    this.doc.crud.transact(() => {
      if (end) {
        const throughPath = this.doc.queryBlocksThroughPathDeeply(start.block, end.block);
        throughPath.forEach(through => {
          this.doc.crud.deleteBlocks(through.parent, through.index, through.length);
        });
      }

      if (start.kind === "text") {
        const deleteLength = start.to - start.from;
        start.block.yText.delete(start.from, deleteLength);
        if (text) start.block.yText.insert(start.from, text, insertAttrs);

        if (end) {
          if (shouldMergeTail) {
            this.doc.crud.deleteBlockById(end.blockId);
          } else if (
            end.kind === "block" ||
            (end.kind === "text" && end.to >= end.block.textLength)
          ) {
            this.doc.crud.deleteBlockById(end.blockId);
          } else if (end.kind === "text" && (end.from > 0 || end.to > end.from)) {
            end.block.yText.delete(end.from, end.to - end.from);
          }
        }
        return;
      }

      this.doc.crud.deleteBlockById(start.blockId);
      insertionEnd!.block.replaceText(
        insertionEnd!.from,
        insertionEnd!.to - insertionEnd!.from,
        text,
        insertAttrs,
      );
    });

    if (remainingDelta?.length && start.kind === "text" && !skipAppend) {
      start.block.applyDeltaOperations([
        {retain: start.block.yText.length},
        ...remainingDelta,
      ]);
    }
    return true;
  }

  private _replaceText(
    range: INormalizedRange,
    text?: string | null,
    merge = false,
    skipAppend = false,
  ) {
    const plan = this._legacyRangeToEditPlan(range);
    if (plan.kind !== "range") return;
    this._replacePlannedRange(
      plan,
      text,
      merge,
      skipAppend,
      this._legacyBlocksForRange(range),
    );
  }

  private _deleteAllSelected(
    range: INormalizedRange | BlockSelection | BlockRangeEditPlan,
  ) {
    const target = this._resolveWholeBlockRange(range);
    if (!target) return false;

    // Pre-capture selection for undo BEFORE deleting blocks
    this.doc.crud.undoManager.captureSelectionBeforeChange();

    const parent = target.start.parentBlock;
    const deletedIndex = this._blockIndexInParent(target.start, parent);
    const prevBlock = this.doc.prevSibling(target.start);
    const nextBlock = this.doc.nextSibling(target.end);
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

  deleteByRange(range: INormalizedRange | BlockSelection, merge = false) {
    if (range instanceof BlockSelection) {
      const plan = this._planSelectionEdit(range);
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
    if (this._isWholeBlockSelectedRange(range)) {
      return this._deleteAllSelected(range);
    }
    return this._replaceText(range, null, merge);
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

    // Gap-after + Backspace deletes the void/container block next to the caret,
    // then recalculates synchronously so the next render does not read a stale
    // selection that still points at the deleted block.
    const modelDeleteResult = this._handleModelDeleteSelection(sel, "after");
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
      this.doc.selection.recalculate();
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

    // Gap-before + Delete mirrors Backspace from gap-after.
    const modelDeleteResult = this._handleModelDeleteSelection(sel, "before");
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
        // 与 Backspace 合并对称：读取、并入、删块放进同一事务，见上方说明。
        block.setInlineRange(block.textLength);
        this.doc.crud.transact(() => {
          const deltas: DeltaOperation[] = nextBlock.textDeltas();
          deltas.unshift({ retain: block.textLength });
          block.applyDeltaOperations(deltas);
          this.doc.crud.deleteBlockById(nextBlock.id);
        });
        this.doc.selection.recalculate();
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
    const plan = this._planSelectionEdit(sel);

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
