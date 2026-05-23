import { ChangeDetectionStrategy, ChangeDetectorRef, ComponentRef, Component, ElementRef, ViewChild, inject } from "@angular/core";
import {
  BaseBlockComponent, getPositionWithOffset
} from "../../framework";
import { TableBlockModel } from "./index";
import { TableCellBlockComponent } from "./table-cell.block";
import { BehaviorSubject, filter, fromEvent, merge, Subject, take, takeUntil } from "rxjs";
import { ColReorderEndEvent, ColReorderMoveEvent, ColReorderStartEvent, TableColBarComponent } from "./widgets/table-col-bar.component";
import { RowReorderEndEvent, RowReorderMoveEvent, RowReorderStartEvent, TableRowBarComponent } from "./widgets/table-row-bar.component";
import { TableStructureToolbarComponent } from "./widgets/table-structure-toolbar.component";
import { resolveTableStructureAnchor } from "./widgets/table-structure-anchor";
import { adjustSelection, adjustSelectionWithMap, buildCellMasterMap, buildCellMasterMapWithSources, CellMasterMap, RectangleSelection } from "./utils";
import { debounce, nextTick, throttle } from "../../global";
import { addTableCol, addTableRow, buildCellMatrix, CellMatrixEntry, deleteTableCols, deleteTableRows } from "./callback";
import { OverlayRef } from "@angular/cdk/overlay";
import { TableCellsSelection } from "./types";
import { BlockSelection } from "../../framework/modules/selection/blockSelection";
import { TableFullscreenController } from "./table-fullscreen-controller";

@Component({
  selector: 'div.table-block',
  templateUrl: './table.block.html',
  standalone: true,
  imports: [TableColBarComponent, TableRowBarComponent, TableStructureToolbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.row-head]': 'props.rowHead',
    '[class.col-head]': 'props.colHead',
    '[class.has-col-handle-hover]': '_hoveredColHandle != null',
    '[class.has-row-handle-hover]': '_hoveredRowHandle != null',
    '[class.has-col-handle-visible]': '_visibleColHandle != null',
    '[class.has-row-handle-visible]': '_visibleRowHandle != null',
    '[class.is-reordering-row]': '_rowReorder != null',
    '[class.is-reordering-col]': '_colReorder != null',
  }
})
export class TableBlockComponent extends BaseBlockComponent<TableBlockModel> {
  protected hoveringCell: TableCellBlockComponent | null = null
  protected resizingCol$ = new BehaviorSubject(false)

  protected _startSelectingCell: TableCellBlockComponent | null = null
  protected _lastSelectingCell: TableCellBlockComponent | null = null
  private _pendingStart: TableCellBlockComponent | null = null

  private _selectedCellSet = new Set<TableCellBlockComponent>()

  private toolbarOvr?: OverlayRef
  private toolbarRef?: ComponentRef<TableStructureToolbarComponent>
  private _closeToolbar$ = new Subject()

  private tableBody!: HTMLElement

  @ViewChild('tableScrollable', { read: ElementRef }) tableScrollable!: ElementRef<HTMLElement>
  @ViewChild('tableWrapper', { read: ElementRef }) tableWrapper!: ElementRef<HTMLElement>
  @ViewChild('tableMenuAnchor', { read: ElementRef }) tableMenuAnchor!: ElementRef<HTMLElement>
  @ViewChild('colResizeBar', { read: ElementRef }) colResizeBar!: ElementRef<HTMLElement>
  @ViewChild('colBarComponent') colBarComponent!: TableColBarComponent
  @ViewChild('rowBarComponent') rowBarComponent!: TableRowBarComponent

  protected _rowHeightsRecord: Record<string, number> = {}

  protected _activeColRange: [number, number] = [-1, -1]
  protected _activeRowRange: [number, number] = [-1, -1]
  protected _hoveredColHandle: number | null = null
  protected _hoveredRowHandle: number | null = null
  protected _visibleColHandle: number | null = null
  protected _visibleRowHandle: number | null = null
  protected _tableMenu = {
    visible: false,
    left: -9999,
    top: -9999,
    width: 0,
    rowIndex: 0,
    rowCount: 1,
    colIndex: 0,
    colCount: 1,
    selectionKind: 'cell' as 'cell' | 'cells' | 'row' | 'col',
  }

  private _prevAdjustedSelection: TableCellsSelection | null = null
  private _activeCellsRange: { start: [number, number], end: [number, number], anchorId: string } | null = null
  private _suppressFocusSync = false
  // Precomputed (row, col) → cell map cached for the duration of one drag
  // session. Building it is O(rows × cols) and we'd otherwise rebuild it on
  // every mouseover crossing — see `_setRectangleSelected` / `confirmSelection`.
  private _dragMasterMap: CellMasterMap | null = null
  // Reverse lookup populated alongside _dragMasterMap: cell → its source
  // (rowIdx, colIdx). Lets us avoid the O(R + C) `childrenIds.indexOf` walks
  // inside `_getSelectedCellsCoordinates` on every mouseover crossing.
  private _dragCellSourceCoord: Map<TableCellBlockComponent, [number, number]> | null = null
  private _dragStartCoord: [number, number] | null = null

  protected _rowReorder: {
    fromIndex: number
    count: number
    targetIndex: number
    dropLineTop: number
    previewTop: number
    previewHeight: number
    previewWidth: number
  } | null = null

  protected _colReorder: {
    fromIndex: number
    count: number
    targetIndex: number
    dropLineLeft: number
    previewLeft: number
    previewWidth: number
    previewHeight: number
  } | null = null

  private resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const id = entry.target.getAttribute('data-block-id')
      this._rowHeightsRecord[id!] = entry.borderBoxSize[0].blockSize
      this.rowBarComponent.changeDetectionRef.markForCheck()
    }
  })

  private mutationObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.addedNodes.length) {
        record.addedNodes.forEach(row => {
          this.resizeObserver.observe(row as HTMLElement, { box: "border-box" })
        })
      }
      if (record.removedNodes.length) {
        record.removedNodes.forEach(row => {
          this.resizeObserver.unobserve(row as HTMLElement)
        })
      }
    }
    this.rowBarComponent.changeDetectionRef.markForCheck()
  })

  /**
   * 全屏视图状态控制器。负责本地 CSS class / body 锁滚动 / Esc 退出 / IME 守卫 / 全局单例。
   * 状态不写入 Yjs，不进 Undo 历史。
   */
  private fullscreenController!: TableFullscreenController

  /** ChangeDetectorRef 用于全屏 toolbar 上 zoom 百分比 / disabled 状态的更新。 */
  private readonly cdrLocal = inject(ChangeDetectorRef)

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.fullscreenController = new TableFullscreenController(this.hostElement)
    // 进入/退出全屏：
    //  1. 销毁任何 CDK Overlay 形式的结构工具栏（普通态 → 全屏：切换到模板内联渲染；
    //     全屏 → 普通态：丢弃可能残留的 inline，等 _showTableMenuOverlay 重建 CDK 版）
    //  2. 触发模板 CD 让 @if (isFullscreen) 块显隐切换
    //  3. 根据当前选区重新触发 menu 状态同步，保证切换后 toolbar 立即可见
    this.fullscreenController.state$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(() => {
        this._disposeToolbar()
        this.cdrLocal.markForCheck()
        Promise.resolve().then(() => this.refreshTableMenuFromSelection())
      })
    // 缩放变化时直接写 CSS zoom（OnPush 下绕过 CD），并触发模板 CD（百分比刷新）
    this.fullscreenController.zoom$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(z => {
        if (this.tableWrapper?.nativeElement) {
          this.tableWrapper.nativeElement.style.zoom = String(z)
        }
        this.cdrLocal.markForCheck()
      })
    // 全屏期间 viewport 尺寸变化也需要重新对齐
    fromEvent(window, 'resize')
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(() => {
        if (this.fullscreenController.isFullscreen) {
          this.toolbarOvr?.updatePosition()
        }
      })
    this.tableBody = this.tableScrollable.nativeElement.querySelector('tbody')!
    // 刚初始化的时候对row进行高度记录
    const rows = this.tableBody.querySelectorAll('tr')
    rows.forEach(row => {
      this.resizeObserver.observe(row as HTMLElement, { box: "border-box" })
    })
    this.mutationObserver.observe(this.tableBody, { childList: true })
    nextTick().then(() => {
      this.rowBarComponent.changeDetectionRef.markForCheck()
    })

    // Attach native DOM listeners directly to the table host so routing
    // cannot swallow the events. Capture-phase mousedown guarantees we arm
    // selection state before any other handler runs.
    //
    // The mouseover stream runs OUTSIDE Angular's zone — it fires once per
    // child-element crossing inside cells (potentially dozens per cell visit
    // on rich-text content) and every event would otherwise schedule a CD
    // tick across the entire app. The handler only mutates DOM (classList)
    // and our own internal state, so no CD is required for the hot drag path.
    fromEvent<MouseEvent>(this.hostElement, 'mousedown', { capture: true })
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(e => this._handleNativeMouseDown(e))
    this.doc.ngZone.runOutsideAngular(() => {
      fromEvent<MouseEvent>(this.hostElement, 'mouseover')
        .pipe(takeUntil(this.onDestroy$))
        .subscribe(e => this._handleNativeMouseOver(e))
    })
    // Safari 不会为原生 scrollbar 上的点击发 mousedown，因此用排除法：
    // 记录最近一次 wheel 时间戳，scroll 触发时若没有近期 wheel，就视为非滚轮源（滚动条拖拽 / 键盘 / 触摸）。
    fromEvent<WheelEvent>(this.tableScrollable.nativeElement, 'wheel', { passive: true, capture: true })
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(() => {
        this._lastWheelTime = performance.now()
      })
    this.doc.selection.selectionChange$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(selection => {
        this._syncTableFocusUi(selection)
      })
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.mutationObserver.disconnect()
    this.resizeObserver.disconnect()
    this.fullscreenController?.destroy()
    // 软隐策略下 _hideTableMenu 不再销毁 CDK overlay；组件销毁时必须显式清理，
    // 否则 overlay 仍挂在 body 下监听 scroll/resize，存在内存泄漏。
    this._disposeToolbar()
  }

  /** 当前是否处于全屏视图。模板用。 */
  get isFullscreen(): boolean {
    return this.fullscreenController?.isFullscreen ?? false
  }

  /** 全屏状态可观察流（外部 / 工具栏订阅）。 */
  get isFullscreen$() {
    return this.fullscreenController?.state$
  }

  /** 切换全屏视图。 */
  toggleFullscreen(): void {
    this.fullscreenController?.toggle()
  }

  /** 显式设置全屏视图状态。 */
  setFullscreen(value: boolean): void {
    this.fullscreenController?.set(value)
  }

  /** 全屏视图当前缩放比例（1 = 100%）。普通态恒为 1。 */
  get fullscreenZoom(): number {
    return this.fullscreenController?.zoom$.value ?? 1
  }

  /** 显式设置全屏缩放（会按 [0.5, 3] clamp，普通态调用是 no-op 直到下次进入全屏前被重置）。 */
  setFullscreenZoom(value: number): void {
    this.fullscreenController?.setZoom(value)
  }

  /** 全屏放大一步。 */
  fullscreenZoomIn(): void {
    this.fullscreenController?.zoomIn()
  }

  /** 全屏缩小一步。 */
  fullscreenZoomOut(): void {
    this.fullscreenController?.zoomOut()
  }

  /** 全屏缩放重置到 100%。 */
  resetFullscreenZoom(): void {
    this.fullscreenController?.resetZoom()
  }

  /** 模板用：当前缩放百分比（已 round）。 */
  get zoomPercent(): number {
    return Math.round(this.fullscreenZoom * 100)
  }

  /** 模板用：是否还能继续放大（用于 button[disabled]）。 */
  get canZoomIn(): boolean {
    return this.fullscreenZoom < TableFullscreenController.ZOOM_MAX - 0.001
  }

  /** 模板用：是否还能继续缩小。 */
  get canZoomOut(): boolean {
    return this.fullscreenZoom > TableFullscreenController.ZOOM_MIN + 0.001
  }

  /**
   * 适合宽度：一键让表格视觉宽度填满 viewport（扣除全屏 padding）。
   *
   * 注意：**不**用 `getBoundingClientRect()` 反推原始宽度。
   * 浏览器对 CSS `zoom` 下 BCR 的语义不一致：
   *   - Chrome / Edge：返回 scaled viewport pixels
   *   - Safari：可能返回 unscaled CSS pixels
   *   - Firefox：126+ 才支持 zoom，行为也不完全对齐
   * 反推会在 Safari 下导致每次点击 fit 都以当前 zoom 倍数继续放大（指数爆炸）。
   *
   * 改用数据模型 `props.colWidths` 求和——这是 schema 里的真值，
   * 与 zoom 状态完全无关，跨浏览器恒定。
   * 边框引起的几像素误差忽略不计。
   */
  fullscreenFitToWidth(): void {
    if (!this.isFullscreen) return
    const colWidths = this.props.colWidths
    if (!colWidths || colWidths.length === 0) return
    const tableWidth = colWidths.reduce((sum, w) => sum + w, 0)
    if (tableWidth <= 0) return
    const paddingLeft = parseFloat(getComputedStyle(this.hostElement).paddingLeft) || 24
    const availableWidth = window.innerWidth - paddingLeft * 2
    if (availableWidth <= 0) return
    this.setFullscreenZoom(availableWidth / tableWidth)
  }

  get colLength() {
    return this.props.colWidths.length
  }

  get rowLength() {
    return this.childrenLength
  }

  getCellByCoordinate(rowIdx: number, colIdx: number) {
    return this.getChildrenByIndex(rowIdx).getChildrenByIndex(colIdx) as TableCellBlockComponent
  }

  addColumn(index: number) {
    this.doc.crud.transact(() => {
      addTableCol.call(this, index)
    })
  }

  addRow(index: number) {
    this.doc.crud.transact(() => {
      addTableRow.call(this, index)
    })
  }

  deleteColumns(index: number, count: number = 1) {
    if (index === 0 && this.colLength <= count) {
      this.doc.crud.deleteBlockById(this.id)
      return
    }

    this.doc.crud.transact(() => {
      deleteTableCols.call(this, index, count)

      const _colWidths: number[] = JSON.parse(JSON.stringify(this.props.colWidths))
      _colWidths.splice(index, count)
      this._activeColRange = [-1, -1]
      this.updateProps({
        colWidths: _colWidths
      })
    })
  }

  deleteRows(index: number, count = 1) {
    if (index === 0 && this.rowLength <= count) {
      this.doc.crud.deleteBlockById(this.id)
      return
    }

    this.doc.crud.transact(() => {
      deleteTableRows.call(this, index, count)
    })
  }

  setEqualColumnWidths(minWidth = 50) {
    if (!this.colLength) return

    const containerWidth = (this.tableScrollable?.nativeElement?.clientWidth
      || this.hostElement.clientWidth
      || this.colLength * minWidth) - 6
    const overhead = this._getTableHorizontalOverhead()
    const availableWidth = Math.max(this.colLength * minWidth, containerWidth - overhead)
    const eachWidth = Math.max(minWidth, Math.floor(availableWidth / this.colLength))
    const nextWidths = Array.from({ length: this.colLength }, () => eachWidth)

    this.updateProps({
      colWidths: nextWidths
    })

    // 清理拖拽过程中写入到 <col> 的临时 style.width，避免后续属性宽度被覆盖
    this._clearColInlineWidths()

    // 从超宽表格切换到均分时，重置并钳制滚动位置，避免右侧出现空白区
    this._normalizeHorizontalScroll(true)
  }

  toggleHeaderRow() {
    this.updateProps({
      rowHead: !this.props.rowHead
    })
  }

  toggleHeaderColumn() {
    this.updateProps({
      colHead: !this.props.colHead
    })
  }

  private _clearSelectionUiState() {
    this._startSelectingCell = this._lastSelectingCell = null
    this._prevAdjustedSelection = null
    this._activeCellsRange = null
    this._hoveredRowHandle = null
    this._hoveredColHandle = null
    this._visibleRowHandle = null
    this._visibleColHandle = null
    // Keep the visual lockdown class in sync with `_startSelectingCell`. If we
    // null the state here (e.g. an interleaving second mousedown during an
    // active drag) without removing the class, the table stays in
    // `-webkit-user-modify: read-only` + `pointer-events: none` mode and the
    // user can no longer focus / edit any cell in the table.
    this.hostElement.classList.remove('is-selecting-cell')
    this._dragMasterMap = null
    this._dragCellSourceCoord = null
    this._dragStartCoord = null
    this._clearSelected()
    this._clearActiveRanges()
    // 注意：这里**不调用** _hideTableMenu()。
    // 这个函数在 mousedown 进入新选区时被调用，那时旧的工具栏应该原地保留——
    // 等 selectionchange 触发 _syncTableFocusUi → _showTableMenu，让 reuse 路径
    // 只更新 inputs + 重定位，工具栏视觉上「滑动」到新位置，不重建。
    // 真正的隐藏发生在 _syncTableFocusUi(null)（用户彻底离开表格）等路径。
    this.changeDetectorRef.markForCheck()
  }

  private _closetCell(event: Event) {
    const target = event.target as Node
    const ele = target instanceof HTMLElement ? target : target.parentElement!
    const closetCell = ele.closest('td')
    return closetCell?.getAttribute('data-block-id')
  }

  // Armed at capture-phase native mousedown on the table host. Native
  // listeners (not the framework dispatcher) so routing can't swallow events.
  private _handleNativeMouseDown(evt: MouseEvent) {
    if (this.doc.isReadonly) return
    // Only react to primary (left) button. On Mac WebView / Safari the
    // trackpad's two-finger tap and force-touch can dispatch button=2
    // mousedown during an active left-button drag; on Chrome a stray
    // right-click can do the same. Letting those into `_clearSelectionUiState`
    // would null `_startSelectingCell` while the visual lockdown class stays
    // on the table host — locking the entire table as read-only.
    if (evt.button !== 0) return
    // 列宽 resize bar 现在是 cell 的子节点（CSS-only 定位方案，见
    // `_handleNativeMouseOver`）。bar 自己的 onColResizerMousedown 走 bubble 阶段
    // fire；而本 handler 走 capture 阶段，会**先**于 bar handler 启动 cell 选区流程。
    // 早 bail 一下，让落在 bar 上的 mousedown 只走列宽拖拽，不开启 cell 矩形选择。
    const target = evt.target as Node | null
    if (target && this.colResizeBar?.nativeElement.contains(target)) return
    const id = this._closetCell(evt)
    if (!id) return
    const cell = this.doc.getBlockById(id) as TableCellBlockComponent
    if (!cell) return

    this._clearSelectionUiState()
    this._pendingStart = cell

    // Eagerly precompute the master map during the mousedown idle window.
    // Building it can cost several milliseconds on large tables and would
    // otherwise be billed against the FIRST cell crossing (where the user is
    // expecting instant visual feedback). Doing it here hides the cost
    // inside the click's natural pause — invisible if the user only clicks,
    // and a clean handoff if they drag.
    const built = buildCellMasterMapWithSources(this)
    this._dragMasterMap = built.masterMap
    this._dragCellSourceCoord = built.sourceCoords
    this._dragStartCoord = built.sourceCoords.get(cell) ?? null

    const origin = cell

    // Primary promotion signal: mouseleave on the origin cell itself.
    // This fires the moment the cursor crosses the cell boundary, regardless
    // of pointer capture, native text-selection state, or selectionchange
    // timing. `{ once: true }` so we only promote once; `_handleNativeMouseOver`
    // handles subsequent cell crossings for rectangle expansion.
    const onOriginLeave = () => {
      if (this._startSelectingCell) return
      if (!this._pendingStart) return
      this._startCellSelection(origin)
    }
    origin.hostElement.addEventListener('mouseleave', onOriginLeave, { once: true })

    let finished = false
    const finishSelection = () => {
      if (finished) return
      finished = true
      origin.hostElement.removeEventListener('mouseleave', onOriginLeave)
      releaseSub.unsubscribe()
      this.onEndSelect()
    }

    // Release on primary button only. Right/middle-button up events fired
    // while the user is still holding left would otherwise terminate the
    // drag prematurely. Touchend has no button and always passes through.
    const isPrimaryRelease = (e: PointerEvent | MouseEvent) => e.button === 0
    const releaseSub = merge(
      fromEvent<PointerEvent>(window, 'pointerup', { capture: true }).pipe(filter(isPrimaryRelease)),
      fromEvent<MouseEvent>(window, 'mouseup', { capture: true }).pipe(filter(isPrimaryRelease)),
      fromEvent<TouchEvent>(window, 'touchend', { capture: true }),
    ).pipe(takeUntil(this.onDestroy$)).subscribe(() => finishSelection())
  }

  private _handleNativeMouseOver(evt: MouseEvent) {
    if (this.doc.isReadonly) return
    const id = this._closetCell(evt)
    if (!id || this.hoveringCell?.id === id) return

    // Always refresh `hoveringCell` so the `hoveringCell?.id === id`
    // early-return at the top of this handler keeps short-circuiting
    // same-cell events. If we leave it stale during drag, re-entering a
    // previously crossed cell would falsely match and skip the rectangle
    // update.
    this.hoveringCell = this.doc.getBlockById(id) as TableCellBlockComponent

    // Resize bar 现在用「把 bar 元素 appendChild 进当前 hover 的 cell」的方案：
    // bar 是 cell 的 absolute 子节点，CSS `right: -6px; height: 100%` 让它自动贴
    // 在 cell 右边界。**零 JS 数学** —— 跟 zoom / border-spacing / border-collapse
    // / padding / 任何浏览器 BCR 语义全部解耦。
    //
    // 之前用 BCR / offsetLeft / props.colWidths 累加 + computed border-spacing 的方案
    // 每加一种边界条件就要补一份计算；这套方案靠浏览器自身的 layout 引擎处理，最稳。
    //
    // 唯一权衡：bar 高度 = 当前 cell 高度（不再是全表高度）。这是 Notion / Linear
    // 等产品的常见做法，UX 上更聚焦。
    if (!this.resizingCol$.value && !this._startSelectingCell) {
      const cellEl = this.hoveringCell.hostElement
      const barEl = this.colResizeBar.nativeElement
      if (barEl.parentElement !== cellEl) {
        cellEl.appendChild(barEl)
        // 清掉可能残留的 inline style（旧定位方案的产物 / 拖拽过程的手动 left）
        // —— 否则会覆盖 CSS 里 `right: -6px` 的自动定位。
        barEl.style.left = ''
        barEl.style.right = ''
      }
    }

    // Promote pending on first different-cell crossing (belt + suspenders
    // alongside the document pointermove listener).
    if (!this._startSelectingCell && this._pendingStart && evt.buttons >= 1
      && id !== this._pendingStart.id) {
      this._startCellSelection(this._pendingStart)
    }

    if (!this._startSelectingCell || evt.buttons < 1) return
    if ((!this._lastSelectingCell && id === this._startSelectingCell.id)
      || id === this._lastSelectingCell?.id) return
    this._lastSelectingCell = this.doc.getBlockById(id) as TableCellBlockComponent
    this._setRectangleSelected()
  }

  private _startCellSelection(cell: TableCellBlockComponent) {
    if (this._startSelectingCell) return
    // Apply visual state FIRST so the cell is already highlighted before we
    // touch the native selection. If we blur first, there's a flash where the
    // text cursor disappears but the 'selected' class hasn't painted yet.
    this._startSelectingCell = cell
    this._pendingStart = null
    // Master map + source-coordinate map were precomputed during mousedown
    // (`_handleNativeMouseDown`) so the first cell crossing pays zero build
    // cost. If the precompute path didn't run for some reason (e.g., the
    // promotion fired via a non-standard path), build lazily here.
    if (!this._dragMasterMap) {
      const built = buildCellMasterMapWithSources(this)
      this._dragMasterMap = built.masterMap
      this._dragCellSourceCoord = built.sourceCoords
      this._dragStartCoord = built.sourceCoords.get(cell) ?? null
    }
    this.hostElement.classList.add('is-selecting-cell')
    this.selectCell(cell)
    // Now clear the native selection so Safari doesn't keep extending it
    // across cells. Suppress sync so the transient null selectionchange
    // doesn't wipe the highlight/range state we just set.
    this._suppressFocusSync = true
    try {
      this.doc.selection.blur()
    } finally {
      this._suppressFocusSync = false
    }
  }

  private onEndSelect = () => {
    this._pendingStart = null
    // Defence-in-depth: always clear the lockdown class on drag-end, even if
    // the state machine got desynced. `_clearSelectionUiState` also clears it,
    // but if onEndSelect is reached via a stale releaseSub closure whose
    // `_startSelectingCell` was nulled elsewhere, the early-return below would
    // otherwise leave the class on.
    this.hostElement.classList.remove('is-selecting-cell')
    this._dragMasterMap = null
    this._dragCellSourceCoord = null
    this._dragStartCoord = null
    if (!this._startSelectingCell) return;
    const anchorCell = this._startSelectingCell
    this._startSelectingCell = this._lastSelectingCell = null

    const isMultiCell = this._selectedCellSet.size > 1 && !!this._prevAdjustedSelection
    if (isMultiCell) {
      const sel = this._prevAdjustedSelection!
      this._activeCellsRange = {
        start: [sel.start[0], sel.start[1]],
        end: [sel.end[0], sel.end[1]],
        anchorId: anchorCell.id,
      }
    } else {
      // Single-cell drag-select: drop straight into text editing inside the
      // cell instead of entering framework block-selection. Block-selection
      // would set `contenteditable=false` on the <td>, which in Chrome
      // prevents the next click from positioning the caret (no selectionchange
      // fires, so the contenteditable=false sticks) and in Safari produces a
      // confusing "first click clears, caret lost" two-step. Cursor-placement
      // lets the user type immediately and matches the natural click flow.
      this._activeCellsRange = null
      this._clearSelected()
    }
    this._prevAdjustedSelection = null

    this._suppressFocusSync = true
    try {
      if (isMultiCell) {
        this.doc.selection.selectBlock(anchorCell)
      } else {
        this.doc.selection.setCursorAtBlock(anchorCell, false, false)
      }
    } finally {
      this._suppressFocusSync = false
    }

    const syncSelectionUi = () => {
      this._syncTableFocusUi(this.doc.selection.recalculate().value)
    }

    syncSelectionUi()
    nextTick().then(syncSelectionUi)
  }

  protected selectCell = (cell: TableCellBlockComponent) => {
    if (this._selectedCellSet.has(cell)) return
    this._selectedCellSet.add(cell)
    cell.hostElement.classList.add('selected')
  }

  protected _clearSelected() {
    this._selectedCellSet.forEach(cell => cell.hostElement.classList.remove('selected'))
    this._selectedCellSet.clear()
  }

  // 根据上下坐标设置矩形区间选中
  protected _setRectangleSelected() {
    const coordinates = this._getSelectedCellsCoordinates()
    if (!coordinates) {
      this._clearSelected()
      this._prevAdjustedSelection = null
      return;
    }
    const selection = this.confirmSelection(coordinates.start, coordinates.end)
    const { start, end } = selection
    if (this._prevAdjustedSelection?.start[0] === start[0]
      && this._prevAdjustedSelection?.end[0] === end[0]
      && this._prevAdjustedSelection?.start[1] === start[1]
      && this._prevAdjustedSelection?.end[1] === end[1]) return

    this._prevAdjustedSelection = selection

    // Compute the next selected-cell set. During an active drag we look up
    // cells directly via the cached masterMap (O(R×C) Map.get) instead of
    // walking childrenIds + getBlockById O(R×C) times per mouseover.
    let nextCells: Set<TableCellBlockComponent>
    if (start[0] === end[0] && start[1] === end[1]) {
      nextCells = new Set([this._startSelectingCell!])
    } else if (this._dragMasterMap) {
      nextCells = new Set<TableCellBlockComponent>()
      for (let r = start[0]; r <= end[0]; r++) {
        for (let c = start[1]; c <= end[1]; c++) {
          const cell = this._dragMasterMap.get(`${r},${c}`)
          if (cell) nextCells.add(cell)
        }
      }
    } else {
      nextCells = new Set(this.getCellsMatrixByCoordinates(start, end).flat(1))
    }
    this._applySelectedDiff(nextCells)
  }

  // Apply a new selected-cell set by diff'ing against the current one — only
  // touch classList on cells that actually changed state. The previous
  // implementation cleared every cell and re-added all of them on every
  // mouseover, producing O(prev + curr) DOM writes per cell-boundary crossing.
  private _applySelectedDiff(nextCells: Set<TableCellBlockComponent>) {
    this._selectedCellSet.forEach(cell => {
      if (!nextCells.has(cell)) {
        cell.hostElement.classList.remove('selected')
      }
    })
    nextCells.forEach(cell => {
      if (!this._selectedCellSet.has(cell)) {
        cell.hostElement.classList.add('selected')
      }
    })
    this._selectedCellSet = nextCells
  }

  protected _getSelectedCellsCoordinates() {
    if (!this._startSelectingCell || !this._lastSelectingCell) {
      const docSelection = this.doc.selection.value
      if (!docSelection || docSelection.firstBlock.flavour !== 'table-cell') return null
      this._startSelectingCell = this._lastSelectingCell = docSelection.firstBlock as TableCellBlockComponent
    }
    let startCell = this._startSelectingCell
    let endCell = this._lastSelectingCell

    // Hot path: during an active drag we have a precomputed cell → source
    // coordinate map (built once in `_startCellSelection`). This avoids
    // walking `childrenIds.indexOf(...)` O(R + C) times per mouseover —
    // those toArray()/indexOf walks would otherwise dominate the per-event
    // budget for large tables.
    const sourceMap = this._dragCellSourceCoord
    if (sourceMap && this._dragStartCoord) {
      const startCoordinate = this._dragStartCoord
      if (startCell === endCell) {
        return { start: startCoordinate, end: startCoordinate }
      }
      const endCoordinate = sourceMap.get(endCell)
      if (endCoordinate) {
        return {
          start: [Math.min(startCoordinate[0], endCoordinate[0]), Math.min(startCoordinate[1], endCoordinate[1])],
          end: [Math.max(startCoordinate[0], endCoordinate[0]), Math.max(startCoordinate[1], endCoordinate[1])]
        }
      }
      // Fall through to slow path if the map is stale (e.g., remote mutation).
    }

    const rowIds = this.childrenIds
    const startCoordinate = [rowIds.indexOf(startCell.parentId!), startCell.getIndexOfParent()]

    if (startCell === endCell) {
      return { start: startCoordinate, end: startCoordinate }
    }

    const endCoordinate = [rowIds.indexOf(endCell.parentId!), endCell.getIndexOfParent()]
    return {
      start: [Math.min(startCoordinate[0], endCoordinate[0]), Math.min(startCoordinate[1], endCoordinate[1])],
      end: [Math.max(startCoordinate[0], endCoordinate[0]), Math.max(startCoordinate[1], endCoordinate[1])]
    }
  }

  getCellsMatrixByCoordinates(start: number[], end: number[]) {
    return this.childrenIds.slice(start[0], end[0] + 1)
      .map(rowId => this.doc.getBlockById(rowId).childrenIds.slice(start[1], end[1] + 1).map(cid => this.doc.getBlockById(cid)) as TableCellBlockComponent[])
  }

  confirmSelection(start: number[], end: number[]) {
    const rect = new RectangleSelection(start[0], start[1], end[0], end[1])
    if (this._dragMasterMap) {
      return adjustSelectionWithMap(rect, this._dragMasterMap, this._dragCellSourceCoord ?? undefined)
    }
    return adjustSelection(rect, this)
  }

  getSelectedCoordinates() {
    if (this._activeColRange[0] > -1 && this._activeColRange[1] > -1) {
      return {
        start: [0, this._activeColRange[0]],
        end: [this.rowLength - 1, this._activeColRange[1]]
      }
    }
    if (this._activeRowRange[0] > -1 && this._activeRowRange[1] > -1) {
      return {
        start: [this._activeRowRange[0], 0],
        end: [this._activeRowRange[1], this.colLength - 1]
      }
    }
    if (this._activeCellsRange) {
      return {
        start: [...this._activeCellsRange.start],
        end: [...this._activeCellsRange.end],
      }
    }
    const cellsSelection = this._getSelectedCellsCoordinates()
    if (!cellsSelection) return null
    return this.confirmSelection(cellsSelection.start, cellsSelection.end)
  }

  onColHandleHovered(index: number | null) {
    this._hoveredColHandle = index
    this.changeDetectorRef.markForCheck()
  }

  onRowHandleHovered(index: number | null) {
    this._hoveredRowHandle = index
    this.changeDetectorRef.markForCheck()
  }

  private _getCellCoordinate(cell: TableCellBlockComponent) {
    const rowIdx = this.childrenIds.indexOf(cell.parentId!)
    const colIdx = cell.getIndexOfParent()
    if (rowIdx < 0 || colIdx < 0) return null
    return { rowIdx, colIdx }
  }

  private _resolveCellFromSelection(selection: BlockSelection | null) {
    if (!selection) return null
    const block = selection.firstBlock
    if (!this.hostElement.contains(block.hostElement)) return null
    if (block.flavour === 'table-cell') {
      return block as TableCellBlockComponent
    }

    const cellId = block.hostElement.closest('td[data-block-id]')?.getAttribute('data-block-id')
    if (!cellId) return null
    return this.doc.getBlockById(cellId) as TableCellBlockComponent
  }

  private _showTableMenu(options: {
    rowIndex: number,
    rowCount?: number,
    colIndex: number,
    colCount?: number,
    selectionKind?: 'cell' | 'cells' | 'row' | 'col',
  }) {
    if (this.doc.isReadonly) {
      this._hideTableMenu()
      return
    }

    const tableRect = this.tableWrapper.nativeElement.querySelector('table')?.getBoundingClientRect()
    if (!tableRect) {
      this._hideTableMenu()
      return
    }

    const scrollableRect = this.tableScrollable.nativeElement.getBoundingClientRect()
    // 全屏态下整个 viewport 都属于表格，不要跟 editor root 取交集（root 在遮罩底下、
    // 实际不可见），否则会把工具栏 anchor clamp 到一个用户看不见的小矩形里。
    const viewportRect = this.isFullscreen
      ? scrollableRect
      : (() => {
          const rootRect = this.doc.root.hostElement.getBoundingClientRect()
          return {
            left: Math.max(scrollableRect.left, rootRect.left),
            right: Math.min(scrollableRect.right, rootRect.right),
            top: Math.max(scrollableRect.top, rootRect.top),
            bottom: Math.min(scrollableRect.bottom, rootRect.bottom),
          }
        })()

    const anchor = resolveTableStructureAnchor({
      wrapperRect: this.tableWrapper.nativeElement.getBoundingClientRect(),
      selectionRect: tableRect,
      viewportRect,
      gap: 12,
    })

    this._tableMenu = {
      visible: true,
      left: anchor.left,
      top: anchor.top,
      width: anchor.width,
      rowIndex: options.rowIndex,
      rowCount: options.rowCount ?? 1,
      colIndex: options.colIndex,
      colCount: options.colCount ?? 1,
      selectionKind: options.selectionKind ?? 'cell',
    }
    this.hostElement.classList.add('active')
    this.changeDetectorRef.markForCheck()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._showTableMenuOverlay()
      })
    })
  }

  private _hideTableMenu() {
    // 真正"用户离开了表格"时才走这里：销毁 CDK overlay + 隐藏内联 toolbar。
    // 切换单元格不再触发这里（_clearSelectionUiState 不再 hide），
    // 因此 selection 切换时工具栏只更新位置/内容，不会重建。
    //
    // rowIndex / colIndex 等业务数据保留：全屏内联工具栏 keep-alive 的子组件
    // 如果反复收到 input 变化会走多次无用的 ngOnChanges 流程；只翻 visible 标志。
    this._disposeToolbar()
    this._tableMenu = {
      ...this._tableMenu,
      visible: false,
    }
    this.hostElement.classList.remove('active')
    this.changeDetectorRef.markForCheck()
  }

  private _resetHandleBars() {
    this.rowBarComponent?.resetVisualState()
    this.colBarComponent?.resetVisualState()
  }

  private _clearActiveRanges() {
    if (this._activeColRange[0] !== -1 || this._activeColRange[1] !== -1) {
      this._activeColRange = [-1, -1]
    }
    if (this._activeRowRange[0] !== -1 || this._activeRowRange[1] !== -1) {
      this._activeRowRange = [-1, -1]
    }
    this._resetHandleBars()
  }

  private _syncHandleVisibility(cell: TableCellBlockComponent | null) {
    if (!cell) {
      this._visibleRowHandle = null
      this._visibleColHandle = null
      this._resetHandleBars()
      this.changeDetectorRef.markForCheck()
      return
    }

    const coordinate = this._getCellCoordinate(cell)
    if (!coordinate) return
    this._visibleRowHandle = this._activeRowRange[0] > -1 ? this._activeRowRange[0] : coordinate.rowIdx
    this._visibleColHandle = this._activeColRange[0] > -1 ? this._activeColRange[0] : coordinate.colIdx
    if (this.rowBarComponent) {
      this.rowBarComponent.visibleHandleIndex = this._visibleRowHandle
      this.rowBarComponent.changeDetectionRef.markForCheck()
    }
    if (this.colBarComponent) {
      this.colBarComponent.visibleHandleIndex = this._visibleColHandle
      this.colBarComponent.changeDetectionRef.markForCheck()
    }
    this.changeDetectorRef.markForCheck()
  }

  private _syncTableFocusUi(selection: BlockSelection | null) {
    if (this.doc.isReadonly) {
      this._hideTableMenu()
      this._visibleRowHandle = null
      this._visibleColHandle = null
      this._clearSelected()
      this._activeCellsRange = null
      return
    }

    const cell = this._resolveCellFromSelection(selection)
    if (!cell) {
      // `selectBlock` fires a transient null selectionchange between
      // `removeAllRanges()` and `addRange()`. Skip so we don't wipe the range
      // and highlights we just set in `onEndSelect`.
      if (this._suppressFocusSync) return
      // Also skip while an active cell-drag is in progress: we deliberately
      // blur the native selection inside `_startCellSelection` to stop Safari
      // extending text selection, so a null selection is EXPECTED during drag.
      // Without this guard the async selectionchange dispatched by
      // `removeAllRanges()` would wipe the rectangle we just highlighted.
      if (this._startSelectingCell) return
      this._hideTableMenu()
      this._visibleRowHandle = null
      this._visibleColHandle = null
      this._clearSelected()
      this._clearActiveRanges()
      this._activeCellsRange = null
      return
    }

    if (this._startSelectingCell) return

    const coordinate = this._getCellCoordinate(cell)
    if (!coordinate) return

    const range = this._activeCellsRange
    if (range && range.anchorId === cell.id) {
      this._syncHandleVisibility(cell)
      // Mirror the rectangle's row/col span onto the bar widgets so the
      // visible drag handles know the full multi-row/multi-col extent.
      // Without this, dragging a bar handle inside a cell rectangle would
      // fall back to single-row/col because the bar's _selectedRange is
      // still [-1, -1].
      const colRange: [number, number] = [range.start[1], range.end[1]]
      const rowRange: [number, number] = [range.start[0], range.end[0]]
      if (this.colBarComponent) {
        this.colBarComponent.selectedRange = colRange
        this.colBarComponent.changeDetectionRef.markForCheck()
      }
      if (this.rowBarComponent) {
        this.rowBarComponent.selectedRange = rowRange
        this.rowBarComponent.changeDetectionRef.markForCheck()
      }
      this._showTableMenu({
        rowIndex: range.start[0],
        rowCount: range.end[0] - range.start[0] + 1,
        colIndex: range.start[1],
        colCount: range.end[1] - range.start[1] + 1,
        selectionKind: 'cells',
      })
      return
    }

    if (this._activeColRange[0] > -1 && this._activeColRange[1] > -1
      && coordinate.rowIdx === 0
      && coordinate.colIdx === this._activeColRange[0]) {
      this._visibleColHandle = this._activeColRange[0]
      this._visibleRowHandle = null
      if (this.colBarComponent) {
        this.colBarComponent.visibleHandleIndex = this._visibleColHandle
        this.colBarComponent.selectedRange = this._activeColRange
        this.colBarComponent.changeDetectionRef.markForCheck()
      }
      if (this.rowBarComponent) {
        this.rowBarComponent.visibleHandleIndex = null
        this.rowBarComponent.selectedRange = [-1, -1]
        this.rowBarComponent.changeDetectionRef.markForCheck()
      }
      this.changeDetectorRef.markForCheck()
      this._showTableMenu({
        rowIndex: 0,
        rowCount: this.rowLength,
        colIndex: this._activeColRange[0],
        colCount: this._activeColRange[1] - this._activeColRange[0] + 1,
        selectionKind: 'col',
      })
      return
    }

    if (this._activeRowRange[0] > -1 && this._activeRowRange[1] > -1
      && coordinate.rowIdx === this._activeRowRange[0]
      && coordinate.colIdx === 0) {
      this._visibleRowHandle = this._activeRowRange[0]
      this._visibleColHandle = null
      if (this.rowBarComponent) {
        this.rowBarComponent.visibleHandleIndex = this._visibleRowHandle
        this.rowBarComponent.selectedRange = this._activeRowRange
        this.rowBarComponent.changeDetectionRef.markForCheck()
      }
      if (this.colBarComponent) {
        this.colBarComponent.visibleHandleIndex = null
        this.colBarComponent.selectedRange = [-1, -1]
        this.colBarComponent.changeDetectionRef.markForCheck()
      }
      this.changeDetectorRef.markForCheck()
      this._showTableMenu({
        rowIndex: this._activeRowRange[0],
        rowCount: this._activeRowRange[1] - this._activeRowRange[0] + 1,
        colIndex: 0,
        colCount: this.colLength,
        selectionKind: 'row',
      })
      return
    }

    this._activeCellsRange = null
    this._clearSelected()
    this._clearActiveRanges()
    this._syncHandleVisibility(cell)

    this._showTableMenu({
      rowIndex: coordinate.rowIdx,
      colIndex: coordinate.colIdx,
      selectionKind: 'cell',
    })
  }

  refreshTableMenuFromSelection() {
    this._syncTableFocusUi(this.doc.selection.recalculate().value)
  }

  private _disposeToolbar() {
    if (this.toolbarOvr) {
      this.toolbarOvr.dispose()
      this.toolbarOvr = undefined
      this.toolbarRef = undefined
      this._closeToolbar$.next(true)
    }
  }

  private _showTableMenuOverlay() {
    if (this.doc.isReadonly || !this._tableMenu.visible || !this.tableMenuAnchor) {
      this._disposeToolbar()
      return
    }

    // 全屏态下结构工具栏改为「固定」渲染到 .table-block.is-fullscreen 顶部居中
    // （由 table.block.html 的 @if 块负责），绕开 CDK Overlay 在 zoom + fullscreen
    // 下 clampTo / scrollContainer 引用错位的一系列问题。这里只负责销毁可能残存的 CDK 实例。
    if (this.isFullscreen) {
      this._disposeToolbar()
      return
    }

    // Reuse the existing overlay when possible — we only update inputs and
    // ask CDK to recompute the position against the (already-moved) anchor,
    // instead of tearing down and rebuilding the Angular component tree.
    if (this.toolbarOvr && this.toolbarRef) {
      this._applyToolbarInputs(this.toolbarRef)
      // Flush Angular so the overlay's content reflects the new inputs, then
      // wait one frame for the browser to reflow before asking CDK to
      // reposition.
      this.toolbarRef.changeDetectorRef.detectChanges()
      const overlay = this.toolbarOvr
      requestAnimationFrame(() => {
        if (this.toolbarOvr !== overlay) return
        // Re-apply the position strategy rather than calling updatePosition().
        // CDK's FlexibleConnectedPositionStrategy with `withPush` +
        // `withFlexibleDimensions` accumulates drift when updatePosition is
        // invoked against a live overlay (the overlay progressively shifts
        // left ~140px per re-center). Reassigning the strategy clears its
        // cached origin/bounding-box rects and lands on the intended center.
        const strategy = overlay.getConfig().positionStrategy
        if (strategy) overlay.updatePositionStrategy(strategy)
      })
      return
    }

    const closeCb = () => {
      this.toolbarOvr = undefined
      this.toolbarRef = undefined
    }

    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<TableStructureToolbarComponent>({
      target: this.tableMenuAnchor.nativeElement,
      component: TableStructureToolbarComponent,
      clampTo: this.doc.root.hostElement,
      positions: [
        getPositionWithOffset('bottom-center', 0, 8),
        getPositionWithOffset('top-center', 0, 8),
      ],
      backdrop: false,
    }, this._closeToolbar$, closeCb)

    this.toolbarOvr = overlayRef
    this.toolbarRef = componentRef
    this._applyToolbarInputs(componentRef)
  }

  private _applyToolbarInputs(ref: ComponentRef<TableStructureToolbarComponent>) {
    ref.setInput('table', this)
    ref.setInput('rowIndex', this._tableMenu.rowIndex)
    ref.setInput('rowCount', this._tableMenu.rowCount)
    ref.setInput('colIndex', this._tableMenu.colIndex)
    ref.setInput('colCount', this._tableMenu.colCount)
    ref.setInput('selectionKind', this._tableMenu.selectionKind)
  }

  onColBarSelected(range: [number, number]) {
    const firstCell = this.firstChildren!.getChildrenByIndex(range[0]) as TableCellBlockComponent
    const len = range[1] - range[0] + 1
    const applySelection = () => {
      this._clearSelected()
      this._activeCellsRange = null
      if (this._activeRowRange[0] > -1 || this._activeRowRange[1] > -1) {
        this._activeRowRange = [-1, -1]
        this.rowBarComponent.selectedRange = [-1, -1]
        this.rowBarComponent.changeDetectionRef.markForCheck()
      }
      this._activeColRange = range
      this.colBarComponent.selectedRange = range
      this.colBarComponent.changeDetectionRef.markForCheck()
      const selectedCells = this.getCellsMatrixByCoordinates([0, range[0]], [this.rowLength - 1, range[1]])
        .map(row => row.filter((cell, cellAddIdx) => !cell.props.colspan || cell.props.colspan + cellAddIdx <= len))
        .flat(1)
      selectedCells.forEach(cell => this.selectCell(cell))
      this._hoveredRowHandle = null
      this._hoveredColHandle = null
      this._visibleColHandle = range[0]
      this.colBarComponent.visibleHandleIndex = range[0]
      this.rowBarComponent.visibleHandleIndex = null

      // TODO 监听过程中col增加或减少了，调整选区

      this._showTableMenu({
        rowIndex: 0,
        rowCount: this.rowLength,
        colIndex: range[0],
        colCount: len,
        selectionKind: 'col',
      })
    }

    this.doc.selection.selectBlock(firstCell)
    applySelection()
    nextTick().then(() => {
      this.doc.selection.recalculate()
    })

  }

  onRowBarSelected(range: [number, number]) {
    const firstCell = this.getChildrenByIndex(range[0]).getChildrenByIndex(0) as TableCellBlockComponent

    const len = range[1] - range[0] + 1

    const applySelection = () => {
      this._clearSelected()
      this._activeCellsRange = null
      if (this._activeColRange[0] > -1 || this._activeColRange[1] > -1) {
        this._activeColRange = [-1, -1]
        this.colBarComponent.selectedRange = [-1, -1]
        this.colBarComponent.changeDetectionRef.markForCheck()
      }
      this._activeRowRange = range
      this.rowBarComponent.selectedRange = range
      this.rowBarComponent.changeDetectionRef.markForCheck()
      const selectedCells = this.getCellsMatrixByCoordinates([range[0], 0], [range[1], this.colLength - 1])
        .map(
          (row, rowAddIdx) =>
            row.filter(cell => !cell.props.rowspan || cell.props.rowspan + rowAddIdx <= len)
        ).flat(1)
      selectedCells.forEach(cell => this.selectCell(cell))
      this._hoveredRowHandle = null
      this._hoveredColHandle = null
      this._visibleRowHandle = range[0]
      this.rowBarComponent.visibleHandleIndex = range[0]
      this.colBarComponent.visibleHandleIndex = null

      // TODO 监听过程中row增加或减少了，调整选区或者关闭

      this._showTableMenu({
        rowIndex: range[0],
        rowCount: len,
        colIndex: 0,
        colCount: this.colLength,
        selectionKind: 'row',
      })
    }

    this.doc.selection.selectBlock(firstCell)
    applySelection()
    nextTick().then(() => {
      this.doc.selection.recalculate()
    })
  }

  onRowReorderStart(evt: RowReorderStartEvent) {
    if (this.doc.isReadonly) return
    const rows = this._getRowElements()
    if (!rows.length) return

    // Expand drag range to the smallest merge-closed range so we never split
    // rowspan cells. A user clicking a single row may end up moving several
    // rows when that row is entangled in merges — the preview reflects this.
    const closure = this._computeRowClosure(evt.fromIndex, evt.count)
    const src = rows[closure.start]
    const srcEnd = rows[closure.start + closure.count - 1]
    if (!src || !srcEnd) return

    const wrapperRect = this.tableWrapper.nativeElement.getBoundingClientRect()
    const firstRect = rows[0].getBoundingClientRect()
    const srcRect = src.getBoundingClientRect()
    const srcEndRect = srcEnd.getBoundingClientRect()

    this._rowReorder = {
      fromIndex: closure.start,
      count: closure.count,
      targetIndex: closure.start,
      dropLineTop: firstRect.top - wrapperRect.top,
      previewTop: srcRect.top - wrapperRect.top,
      previewHeight: srcEndRect.bottom - srcRect.top,
      previewWidth: srcRect.width,
    }
    this._hideTableMenu()
    this.changeDetectorRef.markForCheck()
  }

  onRowReorderMove(evt: RowReorderMoveEvent) {
    if (!this._rowReorder) return
    const rows = this._getRowElements()
    if (!rows.length) return

    const wrapperRect = this.tableWrapper.nativeElement.getBoundingClientRect()
    const { fromIndex, count } = this._rowReorder
    const { targetIndex, dropLineTop } = this._computeRowDropTarget(evt.cursorY, rows, wrapperRect, fromIndex, count)
    const previewTop = evt.cursorY - wrapperRect.top - this._rowReorder.previewHeight / 2

    this._rowReorder = {
      ...this._rowReorder,
      targetIndex,
      dropLineTop,
      previewTop,
    }
    this.changeDetectorRef.markForCheck()
  }

  onRowReorderEnd(evt: RowReorderEndEvent) {
    const state = this._rowReorder
    this._rowReorder = null
    this.changeDetectorRef.markForCheck()
    if (!state || !evt.commit) return

    const { fromIndex, count, targetIndex } = state
    // Dropping on or inside the source range is a no-op.
    if (targetIndex >= fromIndex && targetIndex <= fromIndex + count) return
    const adjustedTarget = targetIndex > fromIndex + count ? targetIndex - count : targetIndex
    this.doc.crud.moveBlocks(this.id, fromIndex, count, this.id, adjustedTarget)

    // Reset any lingering row-selection UI — the rows just moved and the
    // previous selection range no longer points at the same data.
    this._activeRowRange = [-1, -1]
    this._clearSelected()
    this._clearActiveRanges()
    this._activeCellsRange = null
    this._hideTableMenu()
  }

  private _getRowElements(): HTMLElement[] {
    if (!this.tableBody) return []
    return Array.from(this.tableBody.querySelectorAll(':scope > tr')) as HTMLElement[]
  }

  /**
   * Expand a row range to the smallest superset that no rowspan crosses.
   * Iterates until stable: if any cell inside the range has its merge source
   * above `start`, pull `start` down; if any source inside the range has
   * rowspan extending past `end`, push `end` down. Works for any count ≥ 1.
   */
  private _computeRowClosure(fromIndex: number, count: number): { start: number, count: number } {
    const rows = this.getChildrenBlocks()
    const rowCount = rows.length
    const colCount = this.colLength
    if (!rowCount || !colCount) return { start: fromIndex, count }

    const matrix = buildCellMatrix(rows, rowCount, colCount)
    let start = Math.max(0, Math.min(fromIndex, rowCount - 1))
    let end = Math.max(start + 1, Math.min(fromIndex + count, rowCount))

    let changed = true
    while (changed) {
      changed = false
      for (let r = start; r < end; r++) {
        for (let c = 0; c < colCount; c++) {
          const info = matrix[r][c]
          if (!info) continue
          if (info.sourceRow < start) {
            start = info.sourceRow
            changed = true
          }
          if (info.sourceRow === r && info.sourceCol === c) {
            const span = info.cell.props.rowspan || 1
            if (r + span > end) {
              end = r + span
              changed = true
            }
          }
        }
      }
    }
    return { start, count: end - start }
  }

  /**
   * Given a raw targetIndex from cursor hit-testing, snap to the nearest
   * boundary that no rowspan crosses. A boundary i is valid iff for every
   * column c, no cell covering (i, c) has sourceRow < i (which would mean a
   * merge straddles i).
   */
  private _snapRowBoundary(targetIndex: number, cursorY: number, rows: HTMLElement[], matrix: CellMatrixEntry[][], colCount: number): number {
    const rowCount = rows.length
    if (targetIndex <= 0) return 0
    if (targetIndex >= rowCount) return rowCount

    const splitsMerge = (idx: number) => {
      if (idx <= 0 || idx >= rowCount) return false
      for (let c = 0; c < colCount; c++) {
        const info = matrix[idx]?.[c]
        if (info && info.sourceRow < idx) return true
      }
      return false
    }

    if (!splitsMerge(targetIndex)) return targetIndex

    // Search up and down for the nearest valid boundary; pick the side the
    // cursor is physically closer to.
    let up = targetIndex
    while (up > 0 && splitsMerge(up)) up--
    let down = targetIndex
    while (down < rowCount && splitsMerge(down)) down++

    const upY = up === 0 ? rows[0].getBoundingClientRect().top : rows[up].getBoundingClientRect().top
    const downY = down === rowCount
      ? rows[rowCount - 1].getBoundingClientRect().bottom
      : rows[down].getBoundingClientRect().top

    return Math.abs(cursorY - upY) <= Math.abs(cursorY - downY) ? up : down
  }

  private _computeRowDropTarget(
    cursorY: number,
    rows: HTMLElement[],
    wrapperRect: DOMRect,
    fromIndex: number,
    count: number,
  ): { targetIndex: number, dropLineTop: number } {
    let targetIndex = rows.length
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect()
      if (cursorY < rect.top + rect.height / 2) {
        targetIndex = i
        break
      }
    }

    // Snap the raw hit to a boundary that doesn't split a rowspan.
    const colCount = this.colLength
    const rowBlocks = this.getChildrenBlocks()
    const matrix = buildCellMatrix(rowBlocks, rowBlocks.length, colCount)
    targetIndex = this._snapRowBoundary(targetIndex, cursorY, rows, matrix, colCount)

    // Snap target inside source range to boundary (no-op position).
    if (targetIndex > fromIndex && targetIndex < fromIndex + count) {
      targetIndex = fromIndex
    }
    const dropLineTop = this._computeDropLineTop(rows, targetIndex) - wrapperRect.top
    return { targetIndex, dropLineTop }
  }

  private _computeDropLineTop(rows: HTMLElement[], targetIndex: number): number {
    if (targetIndex >= rows.length) {
      const last = rows[rows.length - 1].getBoundingClientRect()
      return last.bottom
    }
    return rows[targetIndex].getBoundingClientRect().top
  }

  onColReorderStart(evt: ColReorderStartEvent) {
    if (this.doc.isReadonly) return
    const colCount = this.colLength
    if (!colCount) return

    const closure = this._computeColClosure(evt.fromIndex, evt.count)
    const colWidths = this.props.colWidths || []
    const wrapperRect = this.tableWrapper.nativeElement.getBoundingClientRect()
    const tbodyRect = this.tableBody.getBoundingClientRect()

    const leftOffset = this._colLeftOffset(closure.start, colWidths)
    const previewLeft = tbodyRect.left + leftOffset - wrapperRect.left
    const previewWidth = colWidths.slice(closure.start, closure.start + closure.count).reduce((a, b) => a + b, 0)
    const previewHeight = tbodyRect.height

    this._colReorder = {
      fromIndex: closure.start,
      count: closure.count,
      targetIndex: closure.start,
      dropLineLeft: tbodyRect.left - wrapperRect.left,
      previewLeft,
      previewWidth,
      previewHeight,
    }
    this._hideTableMenu()
    this.changeDetectorRef.markForCheck()
  }

  onColReorderMove(evt: ColReorderMoveEvent) {
    if (!this._colReorder) return
    const wrapperRect = this.tableWrapper.nativeElement.getBoundingClientRect()
    const { fromIndex, count, previewWidth } = this._colReorder
    const { targetIndex, dropLineLeft } = this._computeColDropTarget(evt.cursorX, wrapperRect, fromIndex, count)
    const previewLeft = evt.cursorX - wrapperRect.left - previewWidth / 2

    this._colReorder = {
      ...this._colReorder,
      targetIndex,
      dropLineLeft,
      previewLeft,
    }
    this.changeDetectorRef.markForCheck()
  }

  onColReorderEnd(evt: ColReorderEndEvent) {
    const state = this._colReorder
    this._colReorder = null
    this.changeDetectorRef.markForCheck()
    if (!state || !evt.commit) return

    const { fromIndex, count, targetIndex } = state
    if (targetIndex >= fromIndex && targetIndex <= fromIndex + count) return
    const adjustedTarget = targetIndex > fromIndex + count ? targetIndex - count : targetIndex

    this.doc.crud.transact(() => {
      const rows = this.getChildrenBlocks()
      rows.forEach(row => {
        this.doc.crud.moveBlocks(row.id, fromIndex, count, row.id, adjustedTarget)
      })
      const widths = [...(this.props.colWidths || [])]
      const moving = widths.splice(fromIndex, count)
      widths.splice(adjustedTarget, 0, ...moving)
      this.updateProps({ colWidths: widths })
    })

    this._activeColRange = [-1, -1]
    this._clearSelected()
    this._clearActiveRanges()
    this._activeCellsRange = null
    this._hideTableMenu()
  }

  /** Sum of col widths before `colIdx` — used as x-offset from tbody left edge. */
  private _colLeftOffset(colIdx: number, colWidths: number[]): number {
    let x = 0
    for (let i = 0; i < colIdx; i++) x += colWidths[i] || 0
    return x
  }

  /**
   * Column analog of `_computeRowClosure`. Expands range until no colspan
   * crosses the boundary. Iterates until stable.
   */
  private _computeColClosure(fromIndex: number, count: number): { start: number, count: number } {
    const rows = this.getChildrenBlocks()
    const rowCount = rows.length
    const colCount = this.colLength
    if (!rowCount || !colCount) return { start: fromIndex, count }

    const matrix = buildCellMatrix(rows, rowCount, colCount)
    let start = Math.max(0, Math.min(fromIndex, colCount - 1))
    let end = Math.max(start + 1, Math.min(fromIndex + count, colCount))

    let changed = true
    while (changed) {
      changed = false
      for (let c = start; c < end; c++) {
        for (let r = 0; r < rowCount; r++) {
          const info = matrix[r][c]
          if (!info) continue
          if (info.sourceCol < start) {
            start = info.sourceCol
            changed = true
          }
          if (info.sourceRow === r && info.sourceCol === c) {
            const span = info.cell.props.colspan || 1
            if (c + span > end) {
              end = c + span
              changed = true
            }
          }
        }
      }
    }
    return { start, count: end - start }
  }

  private _snapColBoundary(
    targetIndex: number,
    cursorX: number,
    colWidths: number[],
    matrix: CellMatrixEntry[][],
    rowCount: number,
    tbodyLeft: number,
  ): number {
    const colCount = colWidths.length
    if (targetIndex <= 0) return 0
    if (targetIndex >= colCount) return colCount

    const splitsMerge = (idx: number) => {
      if (idx <= 0 || idx >= colCount) return false
      for (let r = 0; r < rowCount; r++) {
        const info = matrix[r]?.[idx]
        if (info && info.sourceCol < idx) return true
      }
      return false
    }

    if (!splitsMerge(targetIndex)) return targetIndex

    let up = targetIndex
    while (up > 0 && splitsMerge(up)) up--
    let down = targetIndex
    while (down < colCount && splitsMerge(down)) down++

    const upX = tbodyLeft + this._colLeftOffset(up, colWidths)
    const downX = tbodyLeft + this._colLeftOffset(down, colWidths)

    return Math.abs(cursorX - upX) <= Math.abs(cursorX - downX) ? up : down
  }

  private _computeColDropTarget(
    cursorX: number,
    wrapperRect: DOMRect,
    fromIndex: number,
    count: number,
  ): { targetIndex: number, dropLineLeft: number } {
    const colWidths = this.props.colWidths || []
    const colCount = colWidths.length
    const tbodyRect = this.tableBody.getBoundingClientRect()
    const tbodyLeft = tbodyRect.left

    // Walk cumulative widths and find which column mid-point the cursor passed.
    let acc = 0
    let targetIndex = colCount
    for (let i = 0; i < colCount; i++) {
      const w = colWidths[i] || 0
      if (cursorX < tbodyLeft + acc + w / 2) {
        targetIndex = i
        break
      }
      acc += w
    }

    // Snap to merge-safe boundary.
    const rows = this.getChildrenBlocks()
    const matrix = buildCellMatrix(rows, rows.length, colCount)
    targetIndex = this._snapColBoundary(targetIndex, cursorX, colWidths, matrix, rows.length, tbodyLeft)

    if (targetIndex > fromIndex && targetIndex < fromIndex + count) {
      targetIndex = fromIndex
    }

    const dropLineLeft = tbodyLeft + this._colLeftOffset(targetIndex, colWidths) - wrapperRect.left
    return { targetIndex, dropLineLeft }
  }

  onColResizerMousedown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()

    if (!this.hoveringCell) return
    this.resizingCol$.next(true)

    const resizingColIdx = this.hoveringCell.getIndexOfParent() + (this.hoveringCell.props.colspan || 1) - 1
    const curCol = this.hostElement.querySelector(`col:nth-child(${resizingColIdx + 1})`) as HTMLElement

    let newWidth = this.props.colWidths[resizingColIdx]
    let prevClientX = evt.clientX
    const minWidth = 50

    const resizeSub = fromEvent<MouseEvent>(document, 'mousemove', { capture: true })
      .pipe(takeUntil(this.resizingCol$.pipe(filter(v => !v))))
      .subscribe((e) => {
        if (!this.hoveringCell || !this.resizingCol$.value) {
          resizeSub.unsubscribe()
          return
        }

        // 计算鼠标移动的增量
        const deltaX = e.clientX - prevClientX
        prevClientX = e.clientX

        // 应用增量到宽度
        newWidth += deltaX

        // 最小宽度限制
        if (newWidth < minWidth) {
          newWidth = minWidth
          return
        }

        // 更新列宽
        curCol.style.width = newWidth + 'px'
        this.colBarComponent.colWidths[resizingColIdx] = newWidth
        this.colBarComponent.changeDetectionRef.markForCheck()

        // 不再手动定位 resize bar：bar 是当前 hover cell 的子节点，CSS `right: -6px`
        // 让它自动贴在 cell 右边界。cell 宽度跟着 col 宽度变 → bar 自动跟随。
      })

    fromEvent(document, 'mouseup', { capture: true }).pipe(take(1)).subscribe(() => {
      if (!this.resizingCol$.value) return
      this.resizingCol$.next(false)
      const widths = [...this.props.colWidths]
      widths[resizingColIdx] = Math.max(minWidth, newWidth)
      this.updateProps({
        colWidths: widths
      })

      // 拖拽结束后清理临时 inline width，改由模型中的 colWidths 统一控制
      requestAnimationFrame(() => {
        curCol.style.width = ''
      })
      this._normalizeHorizontalScroll()
    })
  }

  private _clearColInlineWidths() {
    const cols = this.hostElement.querySelectorAll('col')
    cols.forEach(col => {
      (col as HTMLElement).style.width = ''
    })
  }

  private _getTableHorizontalOverhead() {
    const table = this.hostElement.querySelector('table') as HTMLElement | null
    if (!table) return 0
    const colEls = table.querySelectorAll('col')
    if (!colEls.length) return 0
    const colsTotal = Array.from(colEls).reduce((sum, col) => {
      return sum + (col as HTMLElement).getBoundingClientRect().width
    }, 0)
    return Math.max(0, Math.ceil(table.getBoundingClientRect().width - colsTotal))
  }

  private _normalizeHorizontalScroll(resetToStart = false) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scroller = this.tableScrollable?.nativeElement
        if (!scroller) return
        if (resetToStart) {
          scroller.scrollLeft = 0
        }
        const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
        if (scroller.scrollLeft > maxScrollLeft) {
          scroller.scrollLeft = maxScrollLeft
        }
      })
    })
  }

  private _prevScrollLeft = 0
  private _isShiftScroll = false
  private _lastWheelTime = 0
  private _isNonWheelScroll = false

  onScrollEnd = debounce(() => {
    const scroller = this.tableScrollable.nativeElement
    if (this._isNonWheelScroll && !this._isShiftScroll && scroller.scrollLeft !== this._prevScrollLeft) {
      this.doc.messageService.info('按住 shift 键加滚轮可快速横向滚动')
      this._prevScrollLeft = scroller.scrollLeft
    }
    if (this._tableMenu.visible) {
      this.refreshTableMenuFromSelection()
    }
    this._isShiftScroll = false
    this._isNonWheelScroll = false
  }, 1000)

  onScroll = throttle((evt: Event) => {
    if (this._tableMenu.visible) {
      this.refreshTableMenuFromSelection()
    } else {
      this.toolbarOvr?.updatePosition()
    }
    if (this.doc.event.status.isShiftKeyPressing) {
      this._isShiftScroll = true
    }
    // wheel 事件先于 scroll 触发，间隔通常 < 50ms；放宽到 200ms 容忍调度抖动
    if (performance.now() - this._lastWheelTime > 200) {
      this._isNonWheelScroll = true
    }
    // Safari < 18.2 不支持原生 scrollend，统一由 debounce 兜底
    this.onScrollEnd()
  }, 50)
}
