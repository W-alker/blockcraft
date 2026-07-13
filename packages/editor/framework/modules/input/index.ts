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
import { BlockSelection, IBlockRange, IGapSelectionPoint, INormalizedRange } from "../selection";
import { isSelectionAlive } from "../selection/liveness";
import { endpointsToLegacy } from "../selection/normalize";
import {
  resolveSelectionScopePolicyForBlockId,
  SelectionScopePolicy,
} from "../selection/scope";
import { isNativeInputTarget, isZeroSpace } from "../../utils";
import {
  getCommonAttributesFromDeltas,
  nextTick,
  performanceTest,
  sliceDelta,
} from "../../../global";
import { CompositionSession } from "./composition-session";

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

type TextReplacementTarget = {
  block: EditableBlockComponent;
  offset: number;
};

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
        selection.start.type === "boundary" ||
        selection.end.type === "boundary" ||
        this._hasTableCellSelection(selection) ||
        this._shouldUseModelForTextBeforeInput(selection)
      )
    );
  }

  private _resolveBeforeInputRange(
    selection: BlockSelection | null,
    targetRange: INormalizedRange | null,
  ) {
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

  private _shouldMergeTextRangeTail(range: INormalizedRange | BlockSelection): boolean {
    if (!(range instanceof BlockSelection)) return true;
    return this._textRangeScopePolicy(range)?.textRangeTailMode !== "preserve";
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
    gap: IGapSelectionPoint,
    text: string,
  ): EditableBlockComponent {
    const index =
      gap.block.getIndexOfParent() + (gap.side === "after" ? 1 : 0);
    const newParagraph = this.doc.crud.insertNewParagraph(
      gap.block.parentId!,
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
    selection: BlockSelection,
  ): BoundarySelectionTarget | null {
    const start = selection.start;
    const end = selection.end;
    if (start.type !== "boundary" || end.type !== "boundary") return null;
    if (start.blockId !== end.blockId) return null;

    const host = start.block;
    const max = host.childrenLength;
    const from = Math.max(0, Math.min(start.index, end.index, max));
    const to = Math.max(from, Math.min(Math.max(start.index, end.index), max));
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
    selection: BlockSelection,
    text: string,
  ): EditableBlockComponent | null {
    const target = this._resolveBoundarySelection(selection);
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
    this.doc.selection.selectOrSetCursorAtBlock(child, atStart);
  }

  private _deleteBoundarySelection(selection: BlockSelection): boolean {
    const target = this._resolveBoundarySelection(selection);
    if (!target || target.count <= 0) return false;
    if (!this._canBoundaryHostParagraph(target)) return false;

    this.doc.crud.undoManager.captureSelectionBeforeChange();
    this.doc.crud.deleteBlocks(target.host.id, target.from, target.count);
    this._selectAfterBoundaryDelete(target);
    return true;
  }

  private _directChildUnder(
    parent: BlockCraft.BlockComponent,
    block: BlockCraft.BlockComponent,
  ): BlockCraft.BlockComponent | null {
    let current: BlockCraft.BlockComponent | null = block;
    while (current?.parentId && current.parentId !== parent.id) {
      current = current.parentBlock ?? this.doc.getBlockById(current.parentId);
    }
    return current?.parentId === parent.id ? current : null;
  }

  private _childIndex(
    parent: BlockCraft.BlockComponent,
    child: BlockCraft.BlockComponent,
  ): number {
    const index = parent.childrenIds?.indexOf(child.id) ?? -1;
    if (index >= 0) return index;
    return typeof child.getIndexOfParent === "function" ? child.getIndexOfParent() : -1;
  }

  private _legacyRange(
    from: IBlockRange,
    to: IBlockRange | null,
  ): INormalizedRange {
    return {
      from,
      to,
      collapsed: false,
    };
  }

  private _legacyTextPoint(
    block: EditableBlockComponent,
    index: number,
    length: number,
  ): IBlockRange {
    return {
      blockId: block.id,
      type: "text",
      index,
      length,
      block,
    } as IBlockRange;
  }

  private _legacySelectedPoint(
    block: BlockCraft.BlockComponent,
  ): IBlockRange {
    return {
      blockId: block.id,
      type: "selected",
      block,
    } as IBlockRange;
  }

  private _mixedBoundarySelectionToLegacy(
    selection: BlockSelection,
  ): INormalizedRange | null {
    const start = selection.start;
    const end = selection.end;

    if (start.type === "boundary" && end.type === "text") {
      const host = start.block;
      const textBlock = end.block as EditableBlockComponent;
      const textChild = this._directChildUnder(host, textBlock);
      if (!textChild) return null;
      const textChildIndex = this._childIndex(host, textChild);
      if (textChildIndex < 0 || start.index > textChildIndex) return null;

      if (start.index === textChildIndex) {
        if (textChild.id !== textBlock.id) return null;
        return this._legacyRange(
          this._legacyTextPoint(textBlock, 0, end.offset),
          null,
        );
      }

      const fromId = host.childrenIds[start.index];
      if (!fromId) return null;
      const fromBlock = this.doc.getBlockById(fromId);
      return this._legacyRange(
        this._legacySelectedPoint(fromBlock),
        this._legacyTextPoint(textBlock, 0, end.offset),
      );
    }

    if (start.type === "text" && end.type === "boundary") {
      const host = end.block;
      const textBlock = start.block as EditableBlockComponent;
      const textChild = this._directChildUnder(host, textBlock);
      if (!textChild) return null;
      const textChildIndex = this._childIndex(host, textChild);
      if (textChildIndex < 0 || end.index <= textChildIndex) return null;

      const from = this._legacyTextPoint(
        textBlock,
        start.offset,
        textBlock.textLength - start.offset,
      );
      if (end.index === textChildIndex + 1) {
        if (textChild.id !== textBlock.id) return null;
        return this._legacyRange(from, null);
      }

      const toId = host.childrenIds[end.index - 1];
      if (!toId) return null;
      const toBlock = this.doc.getBlockById(toId);
      return this._legacyRange(from, this._legacySelectedPoint(toBlock));
    }

    return null;
  }

  private _legacyTextCursorAfterReplacement(
    range: INormalizedRange,
    textLength: number,
  ): { blockId: string; index: number } | null {
    if (range.from.type === "text") {
      return {
        blockId: range.from.blockId,
        index: range.from.index + textLength,
      };
    }
    if (range.to?.type === "text") {
      return {
        blockId: range.to.blockId,
        index: range.to.index + textLength,
      };
    }
    return null;
  }

  private _replaceMixedBoundarySelectionWithText(
    selection: BlockSelection,
    text: string,
    syncSelection = true,
  ): TextReplacementTarget | null {
    const range = this._mixedBoundarySelectionToLegacy(selection);
    if (!range) return null;

    const cursor = this._legacyTextCursorAfterReplacement(range, text.length);
    if (!cursor) return null;

    const block = this.doc.getBlockById(cursor.blockId);
    if (!this.doc.isEditable(block)) return null;

    this._replaceText(range, text, true);
    if (syncSelection) {
      this._setTextSelectionAndSync({blockId: cursor.blockId}, cursor.index);
    } else {
      this.doc.selection.setSelection({
        blockId: cursor.blockId,
        type: "text",
        index: cursor.index,
        length: 0,
      });
    }
    return {
      block: block as EditableBlockComponent,
      offset: cursor.index,
    };
  }

  private _replaceBoundarySelectionWithText(
    selection: BlockSelection,
    text: string,
  ): boolean {
    const block = this._replaceBoundarySelectionWithParagraph(selection, text);
    if (!block) {
      return !!this._replaceMixedBoundarySelectionWithText(selection, text);
    }
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
    selection: BlockSelection,
  ): TableCellSelectionTarget | null {
    const tableCellSelection = selection.getTableCellSelection();
    if (!tableCellSelection) return null;

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
    selection: BlockSelection,
    text: string | null,
    mode: "text-cursor" | "table-selection" | "anchor-cursor",
  ): string | null {
    const target = this._resolveTableCellSelection(selection);
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

    // Handle gap-cursor IME: the gap sits inside a non-editable void/container
    // block, so we must synchronously materialize a real empty paragraph, move
    // the caret into it, then let composition proceed in that editable block.
    // Use a NORMAL transaction (NOT ORIGIN_SKIP_SYNC) for the structural insert;
    // the OneShotCursorAnchor is captured directly in the NEW paragraph so
    // compositionEnd resolves its insertion point there even if the browser
    // native selection jitters during IME startup. The
    // void/container block is KEPT.
    if (curSel.collapsed && curSel.start.type === "gap") {
      context.preventDefault();
      this._beginCompositionUndoGroup();
      const newParagraph = this._insertParagraphAtGap(curSel.start, "");
      if (!this._startCompositionAtEditableBlock(newParagraph, 0)) {
        this._endCompositionUndoGroup();
      }
      return true;
    }

    if (this._hasTableCellSelection(curSel)) {
      context.preventDefault();
      this._beginCompositionUndoGroup();
      const target = this._replaceTableCellSelection(curSel, null, "anchor-cursor");
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

    if (curSel.isAllSelected) {
      context.preventDefault();
      const resolved = this._resolveBlockSelectionHost(curSel.lastBlock);
      if (!resolved) {
        this.doc.selection.blur();
        return true;
      }
      this._beginCompositionUndoGroup();
      this.doc.crud.undoManager.captureSelectionBeforeChange();
      if (resolved.mode === "sibling") {
        const p = this.doc.schemas.createSnapshot("paragraph", []);
        this.doc.crud.insertBlocksAfter(curSel.lastBlock.id, [p]);
        this._deleteAllSelected(curSel);
        this.doc.selection.setCursorAtBlock(p.id, true);
        const target = this.doc.getBlockById(p.id);
        if (!this._startCompositionAtEditableBlock(target, 0)) {
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
        const target = this._clearContainerToEmptyParagraph(resolved.host);
        if (!target) {
          this.doc.selection.blur();
          this._endCompositionUndoGroup();
          return true;
        }
        this.doc.selection.setCursorAtBlock(target.id, true);
        if (!this._startCompositionAtEditableBlock(target, 0)) {
          this._endCompositionUndoGroup();
          return true;
        }
      }
      this.doc.selection.recalculate();
      return true;
    }

    if (this._hasBoundaryEndpoint(curSel)) {
      context.preventDefault();
      this._beginCompositionUndoGroup();
      const target = this._replaceBoundarySelectionWithParagraph(curSel, "");
      if (!target) {
        const mixedTarget = this._replaceMixedBoundarySelectionWithText(curSel, "", false);
        if (mixedTarget) {
          if (!this._startCompositionAtEditableBlock(mixedTarget.block, mixedTarget.offset)) {
            this._endCompositionUndoGroup();
          }
          return true;
        }
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

    if (curSel.start.type !== "text") {
      if (curSel.isInSameBlock || curSel.end.type !== "text") {
        return this._abortCompositionStart(context);
      }
    }

    if (!curSel.collapsed) {
      const crossesBlocks = !curSel.isInSameBlock;
      const needsMerge = crossesBlocks && this._shouldMergeTextRangeTail(curSel);
      if (this._hasWholeBlockEndpoint(curSel) || crossesBlocks) {
        context.preventDefault();
        this._beginCompositionUndoGroup();
      }
      const anchorBlock =
        curSel.start.type === "text"
          ? curSel.firstBlock
          : !curSel.isInSameBlock && curSel.end.type === "text"
            ? curSel.lastBlock
            : null;
      const anchorIndex =
        curSel.start.type === "text" ? curSel.start.offset : 0;

      if (
        needsMerge &&
        anchorBlock &&
        curSel.start.type === "text" &&
        curSel.end.type === "text"
      ) {
        // Composition-specific merge: separate append from delete so the observer's
        // _applyDeltaToView only handles simple deltas. The append uses ORIGIN_SKIP_SYNC
        // + rerender() to avoid DOM patches that the browser's composition setup overrides.
        const fromBlock = curSel.firstBlock as any;
        const toBlock = curSel.lastBlock as any;
        const remainStart = curSel.end.offset;
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
        this._replaceText(curSel, null, true, true);

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
        this._replaceText(curSel, null, needsMerge);
      }

      if (anchorBlock) {
        this.doc.selection.setCursorAt(anchorBlock as any, anchorIndex);
        if (!this._startCompositionAtEditableBlock(anchorBlock, anchorIndex)) {
          this._endCompositionUndoGroup();
          return true;
        }
      }
    } else {
      if (curSel.start.type === "text") {
        this._startCompositionAtEditableBlock(curSel.firstBlock, curSel.start.offset);
      } else {
        this.compositionSession.startFromSelection({ isComposing: true });
      }
    }
    return true;
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

    // Handle gap-cursor input: insert paragraph at gap, keep the void/container
    // block. The legacy `normalizeRange`/`endpointsToLegacy` path collapses gap
    // into `selected` (lossy), so the gap must be read from the live model
    // selection here, BEFORE that conversion, and take priority over the
    // `selected` replace-block branch below.
    const modelSel = this.doc.selection.value;
    if (
      modelSel &&
      modelSel.collapsed &&
      modelSel.start.type === "gap"
    ) {
      ev.preventDefault();
      const gapText = getPlainTextFromInputEvent(ev);
      if (gapText) {
        this._insertParagraphAtGap(modelSel.start, gapText);
      }
      return;
    }

    const staticRange = ev.getTargetRanges ? ev.getTargetRanges()[0] : null;
    let targetRange: INormalizedRange | null = null;
    if (staticRange) {
      try {
        targetRange = this.doc.selection.normalizeRange(staticRange);
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

    if (effectiveRange instanceof BlockSelection && this._hasBoundaryEndpoint(effectiveRange)) {
      ev.preventDefault();
      const handled = text
        ? this._replaceBoundarySelectionWithText(effectiveRange, text)
        : this._deleteBoundarySelection(effectiveRange) ||
          !!this._replaceMixedBoundarySelectionWithText(effectiveRange, "");
      if (!handled) {
        this.doc.selection.blur();
      }
      return true;
    }

    if (effectiveRange instanceof BlockSelection && this._hasTableCellSelection(effectiveRange)) {
      ev.preventDefault();
      const handled = text
        ? this._replaceTableCellSelection(effectiveRange, text, "text-cursor")
        : this._replaceTableCellSelection(effectiveRange, null, "table-selection");
      if (!handled) {
        this.doc.selection.blur();
      }
      return true;
    }

    const normalizedRange =
      effectiveRange instanceof BlockSelection
        ? endpointsToLegacy({
            start: effectiveRange.start,
            end: effectiveRange.end,
          })
        : effectiveRange;

    const { from, to, collapsed } = normalizedRange;

    if (this._isWholeBlockSelectedRange(normalizedRange)) {
      ev.preventDefault();
      if (text) {
        this._replaceSelectedBlocksWithParagraph(effectiveRange, text) ||
          this.doc.selection.blur();
      } else {
        this._deleteAllSelected(effectiveRange);
      }
      return;
    }

    if (to) {
      ev.preventDefault();
      this._replaceText(effectiveRange, text, this._shouldMergeTextRangeTail(effectiveRange));
      const cursorPos =
        from.type === "text" ? from : to.type === "text" ? to : null;
      if (!cursorPos) {
        this.doc.selection.recalculate();
        return;
      }
      this._setTextSelectionAndSync(cursorPos, cursorPos.index + (text?.length || 0));
      return;
    }

    // delete content
    if (from.type === "text" && ev.inputType.startsWith("delete")) {
      ev.preventDefault();
      let deleteRange: INormalizedRange = normalizedRange;
      // 要删除的可能是embed节点
      if (
        staticRange &&
        staticRange.startContainer === staticRange.endContainer &&
        isZeroSpace(staticRange.startContainer) &&
        normalizedRange.from.type === "text"
      ) {
        deleteRange = {
          ...normalizedRange,
          from: {
            ...normalizedRange.from,
            index: normalizedRange.from.index - 1,
            length: 1,
          },
        };
      }
      this._replaceText(deleteRange);
      if (deleteRange.from.type === "text") {
        this._setCursorAtAndSync(deleteRange.from.block as any, deleteRange.from.index);
      }
      return;
    }

    if (!text) return;

    let needsRerender = false;

    // in zero text
    if (staticRange && collapsed && isZeroSpace(staticRange.startContainer)) {
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
      collapsed &&
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

    if (from.type !== "text") return;
    if (!collapsed) {
      ev.preventDefault();
      this.doc.crud.undoManager.captureSelectionBeforeChange();
      from.block.replaceText(
        from.index,
        from.length,
        text,
        this._inheritedReplaceAttrs(from.block, from.index, from.length),
      );
      this._setTextSelectionAndSync(from, from.index + (text?.length || 0));
      return;
    }

    const pendingInsertAttrs = this.consumeNextInsertAttrs(
      from.block.id,
      from.index,
      { allowNearby: true },
    );

    if (pendingInsertAttrs !== undefined) {
      ev.preventDefault();
      this.doc.crud.transact(() => {
        from.block.yText.insert(from.index, text, pendingInsertAttrs);
      });
      this._setTextSelectionAndSync(from, from.index + text.length);
      return;
    }

    if (this.hasNextInsertAttrs()) {
      this.clearNextInsertAttrs();
    }

    if (needsRerender) {
      // Zero-space / end-break: DOM was manually patched above, use ORIGIN_SKIP_SYNC + rerender
      this.doc.crud.transact(() => {
        from.block.yText.insert(from.index, text);
      }, ORIGIN_SKIP_SYNC);
      from.block.rerender();
      from.block.setInlineRange(from.index + text.length);
    } else {
      // Normal input: controlled rendering — preventDefault lets observer sync blot tree
      ev.preventDefault();
      this.doc.crud.transact(() => {
        from.block.yText.insert(from.index, text);
      });
      this._setTextSelectionAndSync(from, from.index + text.length);
    }
  }

  @EventListen("keyDown")
  private _handleSelectedStartPrintableFallback(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<KeyboardEvent>();
    if (!this._isPrintableKey(ev)) return;

    const selection = this.doc.selection.value;

    if (!selection) return;

    if (this._handlePrintableModelSelection(selection, ev.key)) {
      ev.preventDefault();
      return true;
    }
    return;
  }

  private _replaceSelectedBlocksWithParagraph(
    range: INormalizedRange | BlockSelection,
    text: string,
  ) {
    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({ start: range.start, end: range.end });
    }

    const { from, to } = range;
    const target = to || from;
    const resolved = this._resolveBlockSelectionHost(target.block);
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
      this.doc.crud.insertBlocksAfter((to || from).blockId, [paragraph]);
      if (to) {
        const throughPath = this.doc.queryBlocksThroughPathDeeply(
          from.block,
          to.block,
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
        this.doc.crud.deleteBlockById(to.blockId);
      }
      this.doc.crud.deleteBlockById(from.blockId);
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

  private _legacyRangeHasWholeBlockEndpoint(range: INormalizedRange): boolean {
    return this._isLegacyWholeBlockPoint(range.from) || this._isLegacyWholeBlockPoint(range.to);
  }

  private _selectionTextCursorAfterReplacement(
    selection: BlockSelection,
    textLength: number,
  ): { blockId: string; type: "text"; index: number; length: 0 } | null {
    if (selection.start.type === "text") {
      return {
        blockId: selection.start.blockId,
        type: "text",
        index: selection.start.offset + textLength,
        length: 0,
      };
    }
    if (selection.end.type === "text") {
      return {
        blockId: selection.end.blockId,
        type: "text",
        index: textLength,
        length: 0,
      };
    }
    return null;
  }

  private _handlePrintableModelSelection(
    selection: BlockSelection,
    text: string,
  ): boolean | undefined {
    if (this._hasTableCellSelection(selection)) {
      this._replaceTableCellSelection(selection, text, "text-cursor") ||
        this.doc.selection.blur();
      return true;
    }

    if (this._hasBoundaryEndpoint(selection)) {
      this._replaceBoundarySelectionWithText(selection, text) ||
        this.doc.selection.blur();
      return true;
    }

    if (selection.collapsed) return;

    if (!this._hasWholeBlockEndpoint(selection)) return;

    if (selection.isAllSelected) {
      this._replaceSelectedBlocksWithParagraph(selection, text) ||
        this.doc.selection.blur();
      return true;
    }

    this._replaceText(selection, text, true);
    const cursor = this._selectionTextCursorAfterReplacement(selection, text.length);
    if (cursor) {
      this._setTextSelectionAndSync({blockId: cursor.blockId}, cursor.index);
    } else {
      this.doc.selection.recalculate();
    }
    return true;
  }

  private _replaceText(
    range: INormalizedRange | BlockSelection,
    text?: string | null,
    merge = false,
    skipAppend = false,
  ) {
    if (range instanceof BlockSelection) {
      merge = merge && this._shouldMergeTextRangeTail(range);
      range = endpointsToLegacy({ start: range.start, end: range.end });
    }
    const { from, to, collapsed } = range;
    if (collapsed) return;

    // Pre-capture selection for undo BEFORE the transaction mutates yText
    this.doc.crud.undoManager.captureSelectionBeforeChange();

    // Whole-block endpoints, and cross-block text endpoints with blocks between
    // them, may be deleted by the transaction below. Move the live model/native
    // selection to the stable text endpoint AFTER the undo snapshot is captured,
    // instead of blur()ing: clearing the native range here can make WebKit/Blink
    // abort an IME session immediately.
    const shouldStabilizeTextEndpoint =
      this._legacyRangeHasWholeBlockEndpoint(range) ||
      (from.type === "text" && to?.type === "text" && from.blockId !== to.blockId);
    if (shouldStabilizeTextEndpoint) {
      const stableTextPoint =
        from.type === "text"
          ? { blockId: from.blockId, offset: from.index }
          : to?.type === "text"
            ? { blockId: to.blockId, offset: to.index }
            : null;
      if (stableTextPoint && this.doc.selection?.replay) {
        this.doc.selection.replay({
          anchor: {
            blockId: stableTextPoint.blockId,
            type: "text",
            offset: stableTextPoint.offset,
          },
          head: {
            blockId: stableTextPoint.blockId,
            type: "text",
            offset: stableTextPoint.offset,
          },
          commonParent: stableTextPoint.blockId,
        });
      } else if (this.doc.selection?.blur) {
        this.doc.selection.blur();
      }
    }

    // Capture remaining delta from to block BEFORE the transaction deletes it
    let remainingDelta: DeltaOperation[] | null = null;
    if (merge && to?.type === "text" && from.type === "text") {
      const remainStart = to.index + to.length;
      if (remainStart < to.block.textLength) {
        remainingDelta = [
          ...sliceDelta(
            to.block.textDeltas(),
            remainStart,
            to.block.textLength,
          ),
        ];
      }
    }

    // Inherit the replaced range's shared inline format so typed-over text keeps
    // its formatting (bold/italic/color/…). Read from the block we insert into,
    // BEFORE the transaction deletes the slice.
    let insertAttrs: DeltaInsert["attributes"] | undefined;
    if (text) {
      if (from.type === "text") {
        insertAttrs = this._inheritedReplaceAttrs(
          from.block,
          from.index,
          from.length,
        );
      } else if (to?.type === "text") {
        insertAttrs = this._inheritedReplaceAttrs(to.block, to.index, to.length);
      }
    }

    this.doc.crud.transact(() => {
      if (to) {
        const throughPath = this.doc.queryBlocksThroughPathDeeply(
          from.block,
          to.block,
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
      }

      if (from.type === "text") {
        const yText = from.block.yText;
        yText.delete(from.index, from.length);
        text && yText.insert(from.index, text, insertAttrs);

        if (to) {
          if (merge) {
            // Delete to block entirely; remaining content appended after transaction
            this.doc.crud.deleteBlockById(to.blockId);
          } else if (
            (to.type === "text" && to.length >= to.block.textLength) ||
            this._isLegacyWholeBlockPoint(to)
          ) {
            this.doc.crud.deleteBlockById(to.blockId);
          } else if (to.type === "text" && (to.index > 0 || to.length > 0)) {
            const yText = to.block.yText;
            yText.delete(to.index, to.length);
          }
        }
        return;
      }

      // 无法输入的情况
      if (to?.type !== "text") return;
      this.doc.crud.deleteBlockById(from.blockId);
      to.block.replaceText(to.index, to.length, text, insertAttrs);
    });

    // After transaction: append remaining delta from to block to from block.
    // This is a separate implicit transaction, so the observer gets a simple
    // append delta (retain + insert) instead of a complex combined delta.
    if (remainingDelta?.length && from.type === "text" && !skipAppend) {
      const appendDelta: DeltaOperation[] = [
        { retain: from.block.yText.length },
        ...remainingDelta,
      ];
      from.block.applyDeltaOperations(appendDelta);
    }
  }

  private _deleteAllSelected(range: INormalizedRange | BlockSelection) {
    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({ start: range.start, end: range.end });
    }
    const { from, to } = range;

    // Pre-capture selection for undo BEFORE deleting blocks
    this.doc.crud.undoManager.captureSelectionBeforeChange();

    const prevBlock = this.doc.prevSibling(range.from.block);
    if (prevBlock) {
      this.doc.selection.setCursorAtBlock(prevBlock, false);
    } else {
      const nextBlock = this.doc.nextSibling(
        range.to?.block || range.from.block,
      );
      if (nextBlock) this.doc.selection.setCursorAtBlock(nextBlock, true);
      // else {
      //   const parent = range.from.block.parentBlock
      //   if (parent) {
      //     this.doc.selection.selectAllChildren(parent)
      //   }
      //   return true
      // }
    }
    this.doc.yDoc.transact(() => {
      if (!to) {
        this.doc.crud.deleteBlockById(from.blockId);
        return;
      }
      const throughPath = this.doc.queryBlocksThroughPathDeeply(
        from.block,
        to.block,
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
      this.doc.crud.deleteBlockById(from.blockId);
      this.doc.crud.deleteBlockById(to.blockId);
    });
    return true;
  }

  deleteByRange(range: INormalizedRange | BlockSelection, merge = false) {
    if (range instanceof BlockSelection && this._hasTableCellSelection(range)) {
      return !!this._replaceTableCellSelection(range, null, "table-selection");
    }
    if (range instanceof BlockSelection) {
      range = endpointsToLegacy({ start: range.start, end: range.end });
    }
    if (this._isWholeBlockSelectedRange(range)) {
      return this._deleteAllSelected(range);
    }
    return this._replaceText(range, null, merge);
  }

  private _deleteGapBlockAt(
    sel: BlockSelection,
    side: "before" | "after",
  ): boolean {
    if (
      !sel.collapsed ||
      sel.start.type !== "gap" ||
      sel.start.side !== side
    ) {
      return false;
    }

    const block = sel.start.block;
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
    this._restoreSelectionAfterGapBlockDelete(parent, index, prevBlock, nextBlock);
    return true;
  }

  private _restoreSelectionAfterGapBlockDelete(
    parent: BlockCraft.BlockComponent | null | undefined,
    deletedIndex: number,
    prevBlock: BlockCraft.BlockComponent | null | undefined,
    nextBlock: BlockCraft.BlockComponent | null | undefined,
  ): void {
    if (nextBlock && this._focusBlockEdge(nextBlock, true)) return;
    if (prevBlock && this._focusBlockEdge(prevBlock, false)) return;

    const fallback = this._childAt(parent, deletedIndex);
    if (fallback && this._focusBlockEdge(fallback, true)) return;

    this.doc.selection.blur();
  }

  private _childAt(
    parent: BlockCraft.BlockComponent | null | undefined,
    preferredIndex: number,
  ): BlockCraft.BlockComponent | null {
    if (!parent?.childrenLength) return null;
    const index = Math.max(0, Math.min(preferredIndex, parent.childrenLength - 1));
    const childId = parent.childrenIds?.[index];
    return childId ? this._getLiveBlockById(childId) : null;
  }

  private _focusBlockEdge(
    block: BlockCraft.BlockComponent,
    atStart: boolean,
  ): boolean {
    try {
      if (this.doc.isEditable(block)) {
        const offset = atStart ? 0 : (block as EditableBlockComponent).textLength;
        this.doc.selection.replay({
          anchor: { blockId: block.id, type: "text", offset },
          head: { blockId: block.id, type: "text", offset },
          commonParent: block.id,
        });
        return true;
      }

      if (block.nodeType === BlockNodeType.void || block.nodeType === BlockNodeType.block) {
        this.doc.selection.setGapCursor(block, atStart ? "before" : "after");
        return true;
      }

      this.doc.selection.selectBlock(block);
      return true;
    } catch {
      return false;
    }
  }

  private _moveGapCaretAway(
    sel: BlockSelection,
    side: "before" | "after",
  ): boolean {
    if (
      !sel.collapsed ||
      sel.start.type !== "gap" ||
      sel.start.side !== side
    ) {
      return false;
    }

    const block = sel.start.block;
    const sibling = side === "before"
      ? this.doc.prevSibling(block)
      : this.doc.nextSibling(block);

    if (sibling) {
      this._focusBlockEdge(sibling, side === "after");
    }
    return true;
  }

  private _handleModelDeleteSelection(
    sel: BlockSelection,
    gapSide: "before" | "after",
  ): boolean | null {
    if (sel.isAllSelected) {
      return this._deleteAllSelected(sel);
    }

    if (this._hasBoundaryEndpoint(sel)) {
      this._deleteBoundarySelection(sel) ||
        this._replaceMixedBoundarySelectionWithText(sel, "") ||
        this.doc.selection.blur();
      return true;
    }

    if (this._hasTableCellSelection(sel)) {
      this._replaceTableCellSelection(sel, null, "table-selection") ||
        this.doc.selection.blur();
      return true;
    }

    if (this._deleteGapBlockAt(sel, gapSide)) {
      return true;
    }

    return null;
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

    if (this._moveGapCaretAway(sel, "before")) {
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

    this.doc.selection.selectBlock(prevBlock);
    !block.textLength && this.doc.crud.deleteBlockById(block.id);
    context.preventDefault();
    return true;
  }

  @BindHotKey({ key: "Delete", shiftKey: null, shortKey: null, metaKey: false })
  private _handleDelete(context: UIEventStateContext) {
    const state = context.get("keyboardState");
    const sel = state.selection;

    if (this._moveGapCaretAway(sel, "after")) {
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
        this.doc.selection.selectBlock(nextBlock);
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

    // Handle gap-cursor Enter: insert a new empty paragraph at the gap, keep the
    // void/container block, and move the caret into the new paragraph.
    if (sel.collapsed && sel.start.type === "gap") {
      this._insertParagraphAtGap(sel.start, "");
      return true;
    }

    if (sel.isAllSelected) {
      const p = this.doc.schemas.createSnapshot("paragraph", [
        [],
        sel.firstBlock.props,
      ]);
      await (
        state.raw.ctrlKey
          ? this.doc.chain().insertBeforeSnapshots(sel.firstBlock, [p])
          : this.doc.chain().insertAfterSnapshots(sel.lastBlock, [p])
      )
        .setCursorAtBlock(p.id, true)
        .run();
      return true;
    }

    if (this._hasBoundaryEndpoint(sel)) {
      this._replaceBoundarySelectionWithText(sel, "") ||
        this.doc.selection.blur();
      return true;
    }

    if (this._hasTableCellSelection(sel)) {
      this._replaceTableCellSelection(sel, null, "anchor-cursor") ||
        this.doc.selection.blur();
      return true;
    }

    if (!sel.collapsed) {
      this._replaceText(sel);
      if (sel.start.type === "text") {
        this.doc.selection.setCursorAt(sel.firstBlock as any, sel.start.offset);
      }
      return true;
    }

    if (sel.start.type !== "text") return false;
    const block = sel.firstBlock as any;
    const offset = sel.start.offset;

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
        });
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
