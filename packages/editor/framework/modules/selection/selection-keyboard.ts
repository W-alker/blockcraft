import {
  BindHotKey,
  BlockNodeType,
  DocEventRegister,
  EditableBlockComponent,
  EventListen,
  STR_LINE_BREAK,
  UIEventStateContext
} from "../../block-std";
import {IS_MAC} from "../../../global";
import {closetBlockId, isZeroSpace, resolveBlockGapSide} from "../../utils";
import {searchEditableDescendant} from "./index";
import {resolveCommonSelectionScope} from './scope'
import {hasClosedContainerEditingBoundary} from './interaction-policy'
import {IBoundarySelectionPoint, ISelectionPointJSON, ITextSelectionPoint} from "./types";
import type {SelectionSurfaceAdapter} from './surface-adapter';

@DocEventRegister
export class SelectionKeyboard {
  constructor(
    public readonly doc: BlockCraft.Doc,
    private readonly surface: SelectionSurfaceAdapter,
  ) {}

  private _getBlockByIdSafe(blockId: string | null | undefined): BlockCraft.BlockComponent | null {
    if (!blockId) return null
    try {
      return this.doc.getBlockById(blockId)
    } catch {
      return null
    }
  }

  private _selectionHeadBlockSafe(selection: BlockCraft.Selection): BlockCraft.BlockComponent | null {
    try {
      return selection.head?.block ?? null
    } catch {
      return null
    }
  }

  private _getTableForCell(cell: BlockCraft.BlockComponent): BlockCraft.IBlockComponents['table'] | null {
    const row = cell.parentBlock
    if (row?.parentBlock?.flavour === 'table') {
      return row.parentBlock as BlockCraft.IBlockComponents['table']
    }

    const tableId = cell.hostElement
      ?.closest?.('.table-block[data-block-id]')
      ?.getAttribute('data-block-id')
    const table = this._getBlockByIdSafe(tableId)
    return table?.flavour === 'table' ? table as BlockCraft.IBlockComponents['table'] : null
  }

  private _selectTableCell(cell: BlockCraft.BlockComponent | null | undefined, scrollIntoView = true): boolean {
    if (!cell || cell.flavour !== 'table-cell') return false
    const table = this._getTableForCell(cell)
    if (!table) return false
    this.doc.selection.setTableCellSelection(
      table,
      cell as BlockCraft.IBlockComponents['table-cell'],
      cell as BlockCraft.IBlockComponents['table-cell'],
      scrollIntoView,
    )
    return true
  }

  private _selectTableFromTableCellSelection(selection: BlockCraft.Selection): boolean {
    const tableCellSelection = typeof selection.getTableCellSelection === 'function'
      ? selection.getTableCellSelection()
      : null
    if (!tableCellSelection) return false

    const table = this._getBlockByIdSafe(tableCellSelection.tableId)
    if (!table || table.flavour !== 'table') return false

    this.doc.selection.selectBlock(table)
    return true
  }

  private _getTableCellForBlock(block: BlockCraft.BlockComponent | null | undefined): BlockCraft.IBlockComponents['table-cell'] | null {
    let current = block
    while (current && current.nodeType !== BlockNodeType.root) {
      if (current.flavour === 'table-cell') {
        return current as BlockCraft.IBlockComponents['table-cell']
      }
      current = current.parentBlock
    }
    return null
  }

  private _getTableCellCoordinate(
    table: BlockCraft.IBlockComponents['table'],
    cell: BlockCraft.IBlockComponents['table-cell'],
  ): {rowIdx: number; colIdx: number} | null {
    const rowIdx = table.childrenIds.indexOf(cell.parentId!)
    const colIdx = cell.getIndexOfParent()
    return rowIdx >= 0 && colIdx >= 0 ? {rowIdx, colIdx} : null
  }

  private _findNextTableCellByArrow(
    table: BlockCraft.IBlockComponents['table'],
    cell: BlockCraft.IBlockComponents['table-cell'],
    key: string,
  ): BlockCraft.IBlockComponents['table-cell'] | null {
    const coordinate = this._getTableCellCoordinate(table, cell)
    if (!coordinate) return null

    const direction = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }[key] as [number, number] | undefined
    if (!direction) return null

    let rowIdx = coordinate.rowIdx + direction[0]
    let colIdx = coordinate.colIdx + direction[1]
    while (
      rowIdx >= 0 &&
      rowIdx < table.rowLength &&
      colIdx >= 0 &&
      colIdx < table.colLength
    ) {
      const nextCell = table.getCellByCoordinate(rowIdx, colIdx)
      if (nextCell && nextCell.props?.display !== 'none') return nextCell
      rowIdx += direction[0]
      colIdx += direction[1]
    }
    return null
  }

  private _promoteTableTextShiftArrow(
    focusBlock: BlockCraft.BlockComponent | null | undefined,
    key: string,
  ): boolean {
    const anchorCell = this._getTableCellForBlock(focusBlock)
    if (!anchorCell) return false

    const table = this._getTableForCell(anchorCell)
    if (!table) return false

    const headCell = this._findNextTableCellByArrow(table, anchorCell, key) || anchorCell
    this.doc.selection.setTableCellSelection(table, anchorCell, headCell, true)
    return true
  }

  private _isLeavingTableCell(
    focusBlock: BlockCraft.BlockComponent | null | undefined,
    nextBlock: BlockCraft.BlockComponent | null | undefined,
  ): boolean {
    const focusCell = this._getTableCellForBlock(focusBlock)
    if (!focusCell) return false
    if (!nextBlock) return true
    const nextCell = this._getTableCellForBlock(nextBlock)
    return nextCell?.id !== focusCell.id
  }

  private _parentBlock(block: BlockCraft.BlockComponent): BlockCraft.BlockComponent | null {
    if (block.parentBlock) return block.parentBlock
    if (!block.parentId) return null
    return this._getBlockByIdSafe(block.parentId)
  }

  private _childrenLength(block: BlockCraft.BlockComponent): number {
    if (typeof block.childrenLength === 'number') return block.childrenLength
    return block.childrenIds?.length ?? 0
  }

  private _schemaMetadata(block: BlockCraft.BlockComponent) {
    return this.doc.schemas?.get(block.flavour)?.metadata
  }

  private _supportsBlockGap(block: BlockCraft.BlockComponent): boolean {
    const metadata = this._schemaMetadata(block)
    return (
      (block.nodeType === BlockNodeType.void || block.nodeType === BlockNodeType.block) &&
      !metadata?.isLeaf &&
      this.doc.placement?.allowsGapCursor?.(block) !== false
    )
  }

  private _isRenderUnit(block: BlockCraft.BlockComponent): boolean {
    return !!this._schemaMetadata(block)?.renderUnit
  }

  private _childAt(block: BlockCraft.BlockComponent, index: number): BlockCraft.BlockComponent | null {
    const childId = block.childrenIds?.[index]
    if (!childId) return null
    return this._getBlockByIdSafe(childId)
  }

  private _setBoundaryCursor(block: BlockCraft.BlockComponent, atStart: boolean): void {
    const index = atStart ? 0 : this._childrenLength(block)
    const point: ISelectionPointJSON = {
      blockId: block.id,
      type: 'boundary',
      index,
    }
    this.doc.selection.replay({
      anchor: point,
      head: point,
      commonParent: block.id,
    })
  }

  private _isFullTextSelection(
    selection: BlockCraft.Selection,
    block: EditableBlockComponent,
  ): boolean {
    if (!selection.isInSameBlock) return false
    if (selection.start.type !== 'text' || selection.end.type !== 'text') return false
    return selection.start.blockId === block.id &&
      selection.end.blockId === block.id &&
      selection.start.offset === 0 &&
      selection.end.offset === block.textLength
  }

  private _isFullBoundarySelection(
    selection: BlockCraft.Selection,
    block: BlockCraft.BlockComponent,
  ): boolean {
    const childrenLength = this._childrenLength(block)
    if (childrenLength <= 0) return false
    if (selection.start.type !== 'boundary' || selection.end.type !== 'boundary') return false
    return selection.start.blockId === block.id &&
      selection.end.blockId === block.id &&
      selection.start.index === 0 &&
      selection.end.index === childrenLength
  }

  private _isWholeBlockSelection(
    selection: BlockCraft.Selection,
    block: BlockCraft.BlockComponent,
  ): boolean {
    if (selection.start.type !== 'selected' || selection.end.type !== 'selected') return false
    return selection.start.blockId === block.id && selection.end.blockId === block.id
  }

  private _selectParentChildren(block: BlockCraft.BlockComponent): boolean {
    const parent = this._parentBlock(block)
    if (!parent) return false
    this.doc.selection.selectAllChildren(parent)
    return true
  }

  /**
   * A closed container owns one editing domain even when its content is split
   * across several paragraph Blocks. Resolve that semantic domain through the
   * schema contract instead of hard-coding text-box/callout flavours here.
   */
  private _containerScopeForSelection(
    selection: BlockCraft.Selection,
  ): BlockCraft.BlockComponent | null {
    try {
      const scope = resolveCommonSelectionScope(
        selection.anchor,
        selection.head,
        id => this.doc.getBlockById(id) as any,
      )
      return scope?.kind === 'container'
        ? this._getBlockByIdSafe(scope.blockId)
        : null
    } catch {
      // Stale/lazy endpoint access already fails closed elsewhere in the
      // keyboard path. Ctrl+A must not turn it into a destructive guess.
      return null
    }
  }

  /**
   * Select-all is capped only by an absolute object boundary. A normal-flow
   * container remains part of the document ladder, even though its semantic
   * selection scope still guards pointer/input ranges from crossing outside.
   */
  private _isInsideAbsoluteObject(
    block: BlockCraft.BlockComponent,
  ): boolean {
    let current: BlockCraft.BlockComponent | null = block
    while (current && current.nodeType !== BlockNodeType.root) {
      if (this.doc.placement?.isInAbsoluteLayout?.(current) === true) {
        return true
      }
      current = this._parentBlock(current)
    }
    return false
  }

  private _isSameOrAncestor(
    maybeAncestor: BlockCraft.BlockComponent,
    block: BlockCraft.BlockComponent,
  ) {
    let cursor: BlockCraft.BlockComponent | null = block
    while (cursor) {
      if (cursor.id === maybeAncestor.id) return true
      cursor = this._parentBlock(cursor)
    }
    return false
  }

  private _commonParentForSelectionHead(
    selection: BlockCraft.Selection,
    headBlock: BlockCraft.BlockComponent,
  ) {
    const anchor = selection.toJSON().anchor as ISelectionPointJSON
    if (anchor.blockId === headBlock.id) return headBlock.id

    const anchorBlock = selection.anchor.block
    if (this._isSameOrAncestor(headBlock, anchorBlock)) return headBlock.id
    if (this._isSameOrAncestor(anchorBlock, headBlock)) return anchorBlock.id

    return headBlock.parentId ?? selection.commonParent
  }

  private _replaySelectionHead(
    selection: BlockCraft.Selection,
    head: ISelectionPointJSON,
    headBlock: BlockCraft.BlockComponent,
  ) {
    this.doc.selection.replay({
      anchor: selection.toJSON().anchor as ISelectionPointJSON,
      head,
      commonParent: this._commonParentForSelectionHead(selection, headBlock),
    })
  }

  /**
   * Last-resort fallback for legacy/orphan blocks whose parent boundary cannot
   * be resolved. Normal Shift+Arrow structure extension should replay a
   * boundary endpoint instead.
   */
  private _extendSelectionToWholeBlockFallback(
    selection: BlockCraft.Selection,
    block: BlockCraft.BlockComponent,
  ) {
    this._replaySelectionHead(
      selection,
      {blockId: block.id, type: 'selected'},
      block,
    )
  }

  private _extendSelectionToTextOffset(
    selection: BlockCraft.Selection,
    block: EditableBlockComponent,
    offset: number,
  ) {
    const safeOffset = Math.max(0, Math.min(offset, block.textLength))
    this._replaySelectionHead(
      selection,
      {blockId: block.id, type: 'text', offset: safeOffset},
      block,
    )
  }

  private _extendSelectionToTextEdge(
    selection: BlockCraft.Selection,
    block: EditableBlockComponent,
    isStart: boolean,
  ) {
    this._extendSelectionToTextOffset(selection, block, isStart ? 0 : block.textLength)
  }

  private _focusBlockForShiftSelection(
    sel: BlockCraft.Selection,
    nativeSelection: globalThis.Selection | null,
  ): BlockCraft.BlockComponent | null {
    if (!sel.collapsed && sel.head && sel.head.type !== 'gap' && sel.head.type !== 'boundary') {
      const headBlock = this._selectionHeadBlockSafe(sel)
      if (headBlock) return headBlock
    }
    const focusBlockId = nativeSelection?.focusNode ? closetBlockId(nativeSelection.focusNode) : null
    const focusBlock = this._getBlockByIdSafe(focusBlockId)
    if (focusBlock) return focusBlock
    return this._selectionHeadBlockSafe(sel)
  }

  private _boundaryPointForBlock(
    block: BlockCraft.BlockComponent,
    side: 'before' | 'after',
  ): ISelectionPointJSON | null {
    if (!block.parentId) return null

    const parent = block.parentBlock ?? this._getBlockByIdSafe(block.parentId)
    if (!parent) return null

    const childrenIds = parent.childrenIds ?? []
    let index = childrenIds.indexOf(block.id)
    if (index < 0 && typeof block.getIndexOfParent === 'function') {
      index = block.getIndexOfParent()
    }
    if (index < 0) return null

    return {
      blockId: parent.id,
      type: 'boundary',
      index: side === 'before' ? index : index + 1,
    }
  }

  private _directChildUnder(
    parentId: string,
    block: BlockCraft.BlockComponent,
  ): BlockCraft.BlockComponent | null {
    let current: BlockCraft.BlockComponent | null = block
    while (current?.parentId && current.parentId !== parentId) {
      current = current.parentBlock ?? this._getBlockByIdSafe(current.parentId)
    }
    return current?.parentId === parentId ? current : null
  }

  private _boundaryPointForSelectionAnchor(
    selection: BlockCraft.Selection,
    parentId: string,
    extendingSide: 'before' | 'after',
  ): ISelectionPointJSON | null {
    const anchor = selection.anchor
    if (anchor.type === 'text' && !selection.collapsed) {
      return null
    }

    if (anchor.type === 'boundary') {
      return anchor.blockId === parentId
        ? selection.toJSON().anchor as ISelectionPointJSON
        : null
    }

    const anchorBlock = this._directChildUnder(parentId, anchor.block)
    if (!anchorBlock) return null

    let side: 'before' | 'after' = extendingSide
    if (anchor.type === 'text') {
      const textLength = (anchor.block as EditableBlockComponent).textLength
      side = extendingSide === 'before'
        ? (anchor.offset <= 0 ? 'before' : 'after')
        : (anchor.offset >= textLength ? 'after' : 'before')
    } else if (anchor.type === 'gap') {
      side = anchor.side
    } else if (anchor.type === 'selected') {
      side = extendingSide === 'before' ? 'after' : 'before'
    }

    return this._boundaryPointForBlock(anchorBlock, side)
  }

  private _extendSelectionToBlockBoundary(
    selection: BlockCraft.Selection,
    block: BlockCraft.BlockComponent,
    side: 'before' | 'after',
  ) {
    const head = this._boundaryPointForBlock(block, side)
    if (!head) {
      this._extendSelectionToWholeBlockFallback(selection, block)
      return
    }
    let anchor = selection.toJSON().anchor as ISelectionPointJSON
    anchor = this._boundaryPointForSelectionAnchor(selection, head.blockId, side) ?? anchor
    this.doc.selection.replay({
      anchor,
      head,
      commonParent: head.blockId,
    })
  }

  private _extendSelectionOutOfParentBoundary(
    selection: BlockCraft.Selection,
    parent: BlockCraft.BlockComponent,
    side: 'before' | 'after',
  ): boolean {
    const head = this._boundaryPointForBlock(parent, side)
    if (!head) return false

    this.doc.selection.replay({
      anchor: selection.toJSON().anchor as ISelectionPointJSON,
      head,
      commonParent: head.blockId,
    })
    return true
  }

  private _selectBoundaryRangeFromGap(
    gap: {block: BlockCraft.BlockComponent; side: 'before' | 'after'},
  ): boolean {
    const anchor = this._boundaryPointForBlock(gap.block, gap.side)
    const head = this._boundaryPointForBlock(gap.block, gap.side === 'before' ? 'after' : 'before')
    if (!anchor || !head) return false

    this.doc.selection.replay({
      anchor,
      head,
      commonParent: anchor.blockId,
    })
    return true
  }

  private _extendBoundaryHeadVertically(
    selection: BlockCraft.Selection,
    isBackward: boolean,
  ): boolean {
    const head = selection.head
    if (!head) return false
    if (head.type !== 'boundary') return false

    const host = head.block
    const childIndex = isBackward ? head.index - 1 : head.index
    const childId = host.childrenIds?.[childIndex]
    if (!childId) return false

    const child = this._getBlockByIdSafe(childId)
    if (!child) return false
    if (this.doc.isEditable(child)) {
      this._extendSelectionToTextEdge(selection, child as EditableBlockComponent, isBackward)
      return true
    }

    const nextHead = this._boundaryPointForBlock(child, isBackward ? 'before' : 'after')
    if (!nextHead) return false
    this.doc.selection.replay({
      anchor: selection.toJSON().anchor as ISelectionPointJSON,
      head: nextHead,
      commonParent: nextHead.blockId,
    })
    return true
  }

  @BindHotKey({key: ['ArrowUp', "ArrowDown"], shiftKey: false})
  private _handlerUpOrDown(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    const {isAllSelected, collapsed, isStartOfBlock, isEndOfBlock} = sel
    const isBack = state.raw.key === 'ArrowUp'

    if (!isAllSelected) {
      // Collapsed caret crossing into a void/container sibling lands on the
      // NEAR-side gap (gap-before when moving down into it, gap-after when
      // moving up). A plain text→text crossing falls through to the browser
      // (no goal-column tracking — that is deferred to P5).
      if (collapsed && sel.start.type === 'text') {
        if ((isBack && isStartOfBlock) || (!isBack && isEndOfBlock)) {
          const sibling = isBack ? this.doc.prevSibling(sel.firstBlock) : this.doc.nextSibling(sel.firstBlock)
          if (sibling && (sibling.nodeType === BlockNodeType.void || sibling.nodeType === BlockNodeType.block)) {
            ctx.preventDefault()
            this._enterBlockFromSide(sibling, isBack)
            return true
          }
          if (!sibling) {
            const handled = this._enterSiblingOrExitParent(sel.firstBlock, isBack)
            if (handled) {
              ctx.preventDefault()
              return true
            }
          }
        }
      } else if (collapsed && sel.start.type === 'gap') {
        // Up/Down stepping out of a gap caret: move to the adjacent sibling and
        // land on its near-side gap (void/container) or text edge (editable).
        ctx.preventDefault()
        this._stepOutOfGap(sel.firstBlock, sel.start.side, isBack)
        return true
      }
      return
    }
    ctx.preventDefault()

    const modelHeadBlock = this._selectionHeadBlockSafe(sel)
    const docSelection = this.surface.getNativeSelection()
    const focusBlockId = docSelection?.focusNode ? closetBlockId(docSelection.focusNode) : null
    const focusBlock = modelHeadBlock ?? this._getBlockByIdSafe(focusBlockId)
    if (!focusBlock) return true

    // head is the focus endpoint
    const headBlock = modelHeadBlock ?? focusBlock

    const focusSibling = () => {
      const opBlock = isBack ? this.doc.prevSibling(focusBlock) : this.doc.nextSibling(focusBlock)
      if (!opBlock) return false
      this._enterBlockFromSide(opBlock, isBack)
      return true
    }

    if (headBlock.nodeType === BlockNodeType.void) {
      focusSibling()
      return true
    }

    if (headBlock.nodeType === BlockNodeType.block) {
      const res = focusSibling()
      if (!res) {
        this.doc.selection.setCursorAtBlock(focusBlock, isBack)
      }
    }
    return true
  }

  @BindHotKey({key: ['ArrowLeft', "ArrowRight"], shiftKey: false})
  private _handlerLeftOrRight(ctx: UIEventStateContext) {
    const handled = this._handleLeftRightArrow(ctx)
    if (handled) {
      // Suppress the native caret move; we have repositioned the selection
      // ourselves (stopPropagation alone does not preventDefault).
      ctx.preventDefault()
      return true
    }
    return
  }

  /**
   * Left/Right cross-block gap navigation state machine.
   *
   * Stops, left→right:
   *   …text-end │ gap-before(void) │ gap-after(void) │ text-start…
   *   …text-end │ gap-before(container) │ <descendants…> │ gap-after(container) │ text-start…
   *
   * Returns `true` (consuming the event) when it programmatically moves the
   * caret; returns `undefined` to let the browser handle in-block movement.
   *
   * NOTE (cross-browser): we intercept and reposition the collapsed caret
   * explicitly because the gap span carries a single ZWS — native arrow keys
   * would drift the caret within the span without changing the model gap side.
   */
  private _handleLeftRightArrow(ctx: UIEventStateContext): true | undefined {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    const {isAllSelected, collapsed} = sel
    const isLeft = state.raw.key === 'ArrowLeft'

    // Plain arrows do not reinterpret an explicit whole-block selection.
    // Shift+Arrow uses the boundary-first paths below.
    if (isAllSelected) return

    if (collapsed && sel.start.type === 'text') {
      const block = sel.firstBlock as EditableBlockComponent
      const atStart = isLeft && sel.start.offset === 0
      const atEnd = !isLeft && sel.start.offset === block.textLength
      if (atStart || atEnd) {
        return this._enterSiblingOrExitParent(block, isLeft)
      }
      return
    }

    if (collapsed && sel.start.type === 'gap') {
      return this._moveFromGap(sel.firstBlock, sel.start.side, isLeft)
    }

    if (collapsed && sel.start.type === 'boundary') {
      return this._moveFromBoundary(sel.start, isLeft)
    }

    return
  }

  /**
   * From a text edge, move into the adjacent sibling. If there is no sibling and
   * the parent is a container block, exit the container by landing on the
   * parent's far-side gap (so the next arrow press leaves the container).
   */
  private _enterSiblingOrExitParent(block: BlockCraft.BlockComponent, isLeft: boolean): true | undefined {
    const sibling = isLeft ? this.doc.prevSibling(block) : this.doc.nextSibling(block)
    if (sibling) {
      this._enterBlockFromSide(sibling, isLeft)
      return true
    }
    // No sibling: bubble up to exit an enclosing container block.
    const parent = block.parentBlock
    if (parent && parent.nodeType === BlockNodeType.block) {
      // An absolute placement object is its own navigation plane. Keep the
      // canonical caret at its outer content edge; Escape owns the explicit
      // transition back to whole-frame selection. Relative containers still
      // take the ordinary gap/parent path below.
      if (this.doc.placement?.isInAbsoluteLayout?.(parent) === true) {
        return true
      }
      if (this._supportsBlockGap(parent)) {
        this.doc.selection.setGapCursor(parent, isLeft ? 'before' : 'after')
      } else {
        return this._enterSiblingOrExitParent(parent, isLeft)
      }
      this.doc.selection.scrollSelectionIntoView()
      return true
    }
    return
  }

  /**
   * Enter `block` arriving from the given direction. `isLeft` true means the
   * caret is travelling right→left (ArrowLeft), so it enters at the block's
   * trailing edge; false means left→right, entering at the leading edge.
   *  - void:      near-side gap (gap-before when entering from the left)
   *  - container: near-side gap first (then a subsequent arrow steps inside)
   *  - editable:  text edge
   */
  private _enterBlockFromSide(block: BlockCraft.BlockComponent, isLeft: boolean) {
    if (this._supportsBlockGap(block)) {
      this.doc.selection.setGapCursor(block, isLeft ? 'after' : 'before')
    } else if (this.doc.isEditable(block)) {
      this.doc.selection.selectOrSetCursorAtBlock(block, !isLeft)
    } else {
      const editable = searchEditableDescendant(block, !isLeft)
      if (editable) {
        this.doc.selection.selectOrSetCursorAtBlock(editable, !isLeft)
      } else if (this._isRenderUnit(block)) {
        this._setBoundaryCursor(block, !isLeft)
      } else {
        this._enterSiblingOrExitParent(block, isLeft)
      }
    }
    this.doc.selection.scrollSelectionIntoView()
  }

  private _moveFromBoundary(boundary: IBoundarySelectionPoint, isLeft: boolean): true | undefined {
    const host = boundary.block
    const child = isLeft
      ? this._childAt(host, boundary.index - 1)
      : this._childAt(host, boundary.index)

    if (child) {
      this._enterBlockFromSide(child, isLeft)
      return true
    }

    return this._enterSiblingOrExitParent(host, isLeft)
  }

  /** Left/Right movement when the caret currently sits on a gap point. */
  private _moveFromGap(gapBlock: BlockCraft.BlockComponent, side: 'before' | 'after', isLeft: boolean): true | undefined {
    // Moving toward the block's interior (Right at gap-before / Left at gap-after).
    const movingInward = isLeft ? side === 'after' : side === 'before'

    if (movingInward) {
      if (!this._supportsBlockGap(gapBlock)) {
        this._enterBlockFromSide(gapBlock, isLeft)
        return true
      }
      if (gapBlock.nodeType === BlockNodeType.void) {
        // Void: step across to the opposite gap side (two-stop block).
        this.doc.selection.setGapCursor(gapBlock, isLeft ? 'before' : 'after')
        this.doc.selection.scrollSelectionIntoView()
        return true
      }
      if (gapBlock.nodeType === BlockNodeType.block) {
        // Container: enter the first/last editable descendant; if none, step to
        // the opposite gap side so the block still has two reachable stops.
        const editable = searchEditableDescendant(gapBlock, !isLeft)
        if (editable) {
          this.doc.selection.selectOrSetCursorAtBlock(editable, !isLeft)
        } else {
          this.doc.selection.setGapCursor(gapBlock, isLeft ? 'before' : 'after')
        }
        this.doc.selection.scrollSelectionIntoView()
        return true
      }
    }

    // Moving away from the block: leave for the adjacent sibling (or exit parent).
    return this._enterSiblingOrExitParent(gapBlock, isLeft)
  }

  /** Up/Down stepping out of a gap caret onto the adjacent sibling. */
  private _stepOutOfGap(gapBlock: BlockCraft.BlockComponent, side: 'before' | 'after', isBack: boolean) {
    // For void/container the two gap stops also act as Up/Down stops: pressing
    // Down at gap-before steps to gap-after within the same block, and vice versa.
    const steppingInward = isBack ? side === 'after' : side === 'before'
    if (steppingInward) {
      if (this._supportsBlockGap(gapBlock)) {
        this.doc.selection.setGapCursor(gapBlock, isBack ? 'before' : 'after')
        this.doc.selection.scrollSelectionIntoView()
      } else {
        this._enterBlockFromSide(gapBlock, isBack)
      }
      return
    }
    const res = this._enterSiblingOrExitParent(gapBlock, isBack)
    if (!res) {
      // No adjacent target: keep the caret on the current gap stop.
      if (this._supportsBlockGap(gapBlock)) {
        this.doc.selection.setGapCursor(gapBlock, side)
      } else {
        this._enterBlockFromSide(gapBlock, isBack)
      }
    }
  }

  @BindHotKey({key: ['ArrowUp', "ArrowDown"], shiftKey: true})
  private _handleShiftUpOrDown(ctx: UIEventStateContext) {
    ctx.preventDefault()
    const state = ctx.get('keyboardState')
    const isBackward = state.raw.key === "ArrowUp"
    if (
      !state.selection.collapsed &&
      this._extendBoundaryHeadVertically(state.selection, isBackward)
    ) {
      this.doc.selection.scrollSelectionIntoView()
      return true
    }

    const docSelection = this.surface.getNativeSelection()
    const focusBlock = this._focusBlockForShiftSelection(state.selection, docSelection)
    if (!focusBlock) {
      return true
    }

    if ((docSelection?.isCollapsed ?? state.selection.collapsed) && this.doc.isEditable(focusBlock) &&
      (isBackward ? !state.selection.isStartOfBlock : !state.selection.isEndOfBlock)
    ) {
      this._extendSelectionToTextEdge(state.selection, focusBlock as EditableBlockComponent, isBackward)
      this.doc.selection.scrollSelectionIntoView()
      return true
    }

    const opBlock = isBackward ? this.doc.prevSibling(focusBlock.id) : this.doc.nextSibling(focusBlock.id)
    if (
      this._isLeavingTableCell(focusBlock, opBlock) &&
      this._promoteTableTextShiftArrow(focusBlock, state.raw.key)
    ) {
      return true
    }

    if (!opBlock) {
      const parent = this._parentBlock(focusBlock)
      if (parent && parent.nodeType !== BlockNodeType.root) {
        if (!this._extendSelectionOutOfParentBoundary(state.selection, parent, isBackward ? 'before' : 'after')) {
          this._extendSelectionToWholeBlockFallback(state.selection, parent)
        }
        this.doc.selection.scrollSelectionIntoView()
      }
      return true
    }

    if (this.doc.isEditable(opBlock)) {
      this._extendSelectionToTextEdge(state.selection, opBlock as EditableBlockComponent, isBackward)
    } else {
      this._extendSelectionToBlockBoundary(state.selection, opBlock, isBackward ? 'before' : 'after')
    }
    this.doc.selection.scrollSelectionIntoView()
    return true
  }

  @BindHotKey({key: ['ArrowLeft', "ArrowRight"], shiftKey: true})
  private _handleShiftLeftOrRight(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    const isBackward = state.raw.key === "ArrowLeft"

    if (sel.collapsed && sel.start.type === 'gap') {
      const movingInward = isBackward
        ? sel.start.side === 'after'
        : sel.start.side === 'before'
      if (movingInward) {
        ctx.preventDefault()
        if (!this._selectBoundaryRangeFromGap(sel.start)) {
          // Missing parent/index metadata: preserve the user's intent as an
          // explicit whole-block selection instead of manufacturing a boundary.
          this.doc.selection.selectBlock(sel.start.block)
        }
        this.doc.selection.scrollSelectionIntoView()
        return true
      }
    }

    // Single block, not at boundary — let browser handle
    if (sel.collapsed && sel.isInSameBlock && ((isBackward && !sel.isStartOfBlock) || (!isBackward && !sel.isEndOfBlock))) {
      return true
    }

    // Collapsed text carets keep native character movement. Non-collapsed
    // ranges use the model head so replayed backward selections keep extending
    // from the intended endpoint instead of the browser's current focus node.
    const head = sel.head
    if (head.type === 'text') {
      const headBlock = head.block as EditableBlockComponent
      if (sel.collapsed) {
        if (isBackward && head.offset > 0) return true
        if (!isBackward && head.offset < headBlock.textLength) return true
      } else {
        const nextOffset = head.offset + (isBackward ? -1 : 1)
        if (nextOffset >= 0 && nextOffset <= headBlock.textLength) {
          ctx.preventDefault()
          this._extendSelectionToTextOffset(sel, headBlock, nextOffset)
          this.doc.selection.scrollSelectionIntoView()
          return true
        }
      }
    }

    const docSelection = this.surface.getNativeSelection()
    const focusBlock = this._focusBlockForShiftSelection(sel, docSelection)
    if (!focusBlock) {
      ctx.preventDefault()
      return true
    }

    const opBlock = isBackward ? this.doc.prevSibling(focusBlock.id) : this.doc.nextSibling(focusBlock.id)
    if (
      this._isLeavingTableCell(focusBlock, opBlock) &&
      this._promoteTableTextShiftArrow(focusBlock, state.raw.key)
    ) {
      ctx.preventDefault()
      return true
    }

    if (!opBlock) {
      ctx.preventDefault()
      const parent = this._parentBlock(focusBlock)
      if (parent && parent.nodeType !== BlockNodeType.root) {
        if (!this._extendSelectionOutOfParentBoundary(sel, parent, isBackward ? 'before' : 'after')) {
          this._extendSelectionToWholeBlockFallback(sel, parent)
        }
        this.doc.selection.scrollSelectionIntoView()
      }
      return true
    }

    ctx.preventDefault()

    this.doc.isEditable(opBlock)
      ? this._extendSelectionToTextEdge(sel, opBlock as EditableBlockComponent, !isBackward)
      : this._extendSelectionToBlockBoundary(sel, opBlock, isBackward ? 'before' : 'after')
    this.doc.selection.scrollSelectionIntoView()
    return true
  }

  @BindHotKey({key: ['a', 'A'], shortKey: true})
  handleCtrlA(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {raw: evt, selection: sel} = state
    evt.preventDefault()
    evt.stopPropagation()
    if (this._selectTableFromTableCellSelection(sel)) return true

    const containerScope = this._containerScopeForSelection(sel)
    if (containerScope) {
      // The first press treats a multi-paragraph container as one editing
      // surface. A repeated press is capped only when that surface belongs to
      // an absolute object; normal-flow callouts/highlights continue to root.
      if (!this._isFullBoundarySelection(sel, containerScope)) {
        this.doc.selection.selectAllChildren(containerScope)
        return true
      }
      if (this._isInsideAbsoluteObject(containerScope)) return true
    }

    const common = this._getBlockByIdSafe(sel.commonParent)
    if (!common) return true
    if (this.doc.isEditable(common)) {
      if (sel.start.type !== 'text') return true
      if (this._isFullTextSelection(sel, common as EditableBlockComponent)) {
        if (this._selectTableCell(this._parentBlock(common))) return true
        this._selectParentChildren(common)
      } else {
        this.doc.selection.selectAllChildren(common)
        this.doc.messageService.info(`连续按下${IS_MAC ? '⌘' : 'ctrl'} + A以选中全文`)
      }
      return true
    }
    if (this._selectTableCell(common)) return true
    if (
      this._isFullBoundarySelection(sel, common) ||
      this._isWholeBlockSelection(sel, common)
    ) {
      if (!this._selectParentChildren(common)) {
        this.doc.selection.selectAllChildren(common)
      }
      return true
    }

    this.doc.selection.selectAllChildren(common)
    return true
  }

  @BindHotKey({key: 'Enter'})
  private _handleClosedContainerEnter(ctx: UIEventStateContext) {
    const selection = ctx.get('keyboardState').selection
    if (
      !selection.isInSameBlock ||
      selection.anchor.type !== 'selected' ||
      selection.head.type !== 'selected'
    ) {
      return
    }

    const block = selection.firstBlock
    if (!hasClosedContainerEditingBoundary(this.doc, block)) return
    if (
      this.doc.isReadonly ||
      this.doc.readonlyManager?.isReadonly?.(block)
    ) {
      return
    }

    ctx.preventDefault()
    this.doc.selection.setCursorAtBlock(block, true)
    return true
  }

  @BindHotKey({key: 'Home', shortKey: null, shiftKey: false})
  handleHome(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (!sel.collapsed || sel.start.type !== 'text') return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent
    const offset = sel.start.offset

    if (block.plainTextOnly) {
      const index = block.textContent().slice(0, offset).lastIndexOf(STR_LINE_BREAK)
      if (index === -1) block.setInlineRange(0)
      else block.setInlineRange(index + 1)
      return true
    }

    block.setInlineRange(0)
    return true
  }

  @BindHotKey({key: 'End', shortKey: null, shiftKey: false})
  handleEnd(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (!sel.collapsed || sel.start.type !== 'text') return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent
    const offset = sel.start.offset

    if (block.plainTextOnly) {
      const linBreakIndex = block.textContent().slice(offset, block.textLength).indexOf(STR_LINE_BREAK)
      if (linBreakIndex === -1) block.setInlineRange(block.textLength)
      else block.setInlineRange(offset + linBreakIndex)
      return true
    }

    block.setInlineRange(block.textLength)
    return true
  }

  @BindHotKey({key: 'Escape'})
  private _handleEscape(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    if (
      sel.collapsed &&
      sel.isInSameBlock &&
      sel.anchor.type === 'text' &&
      sel.head.type === 'text'
    ) {
      const parent = this._parentBlock(sel.firstBlock)
      if (hasClosedContainerEditingBoundary(this.doc, parent)) {
        ctx.preventDefault()
        this.doc.selection.selectBlock(parent)
        return true
      }
    }
    if (sel.collapsed) return
    if (sel.start.type !== 'text' && sel.isInSameBlock) return
    ctx.preventDefault()

    const isForward = sel.direction === 'forward'
    if (sel.isInSameBlock && sel.start.type === 'text') {
      // Collapse to the end the user was extending toward
      const index = isForward ? (sel.end as ITextSelectionPoint).offset : sel.start.offset
      ;(sel.firstBlock as EditableBlockComponent).setInlineRange(index)
    } else {
      const block = isForward ? sel.lastBlock : sel.firstBlock
      this.doc.selection.selectOrSetCursorAtBlock(block, !isForward)
    }
    return true
  }

  @BindHotKey({key: 'Home', shortKey: null, shiftKey: true})
  handleShiftHome(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (sel.start.type !== 'text' || !sel.isInSameBlock) return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent

    if (block.plainTextOnly) {
      // head IS the focus — use it directly
      const focusOffset = sel.head.type === 'text' ? sel.head.offset : 0
      const lineStart = block.textContent().slice(0, focusOffset).lastIndexOf(STR_LINE_BREAK)
      this.doc.selection.extendTo(block, lineStart === -1 ? 0 : lineStart + 1)
      return true
    }

    this.doc.selection.extendTo(block, 0)
    return true
  }

  @BindHotKey({key: 'End', shortKey: null, shiftKey: true})
  handleShiftEnd(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (sel.start.type !== 'text' || !sel.isInSameBlock) return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent

    if (block.plainTextOnly) {
      const focusOffset = sel.head.type === 'text' ? sel.head.offset : 0
      const lineEnd = block.textContent().indexOf(STR_LINE_BREAK, focusOffset)
      this.doc.selection.extendTo(block, lineEnd === -1 ? block.textLength : lineEnd)
      return true
    }

    this.doc.selection.extendTo(block, block.textLength)
    return true
  }

  @EventListen('keyDown')
  private _handlerNoEditable(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const selection = this.surface.getNativeSelection()
    if (!selection) return
    if (state.composing || !selection.isCollapsed) return;

    const activeNode = selection.focusNode
    if (!activeNode) return;
    const zero = isZeroSpace(activeNode)
    if (zero) {
      // Block-level gap caret (leading/trailing block gap span): cross-block
      // arrow navigation is owned by the gap-aware @BindHotKey handlers above,
      // which run first and consume the event. Bail out here so the two paths
      // never fight. Non-block zero-spaces (e.g. inline embed boundaries) still
      // use the native char-step fallback below.
      if (resolveBlockGapSide(activeNode!) !== null) return
      switch (state.raw.key) {
        case 'Backspace':
        case 'ArrowLeft':
          if (selection.anchorOffset > 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'character')
            return;
          }
          break
        case 'ArrowRight':
        case 'Delete':
          if (selection.anchorOffset === 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'character')
            return;
          }
          break
        case 'ArrowDown':
          break
        case 'ArrowUp':
          break
      }
      return
    }
  }
}
