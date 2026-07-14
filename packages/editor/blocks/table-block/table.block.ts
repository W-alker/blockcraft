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
import { preferTableToolbarAbove, resolveTableStructureAnchor } from "./widgets/table-structure-anchor";
import { adjustSelection, adjustSelectionWithMap, buildCellMasterMap, buildCellMasterMapWithSources, CellMasterMap, RectangleSelection } from "./utils";
import { debounce, nextTick, throttle } from "../../global";
import { addTableCol, addTableRow, buildCellMatrix, CellMatrixEntry, deleteTableCols, deleteTableRows } from "./callback";
import { attachTableNormalizer } from "./table-normalize";
import { ConnectedPosition, FlexibleConnectedPositionStrategy, OverlayRef } from "@angular/cdk/overlay";
import { TableCellsSelection } from "./types";
import { BlockSelection } from "../../framework/modules/selection/blockSelection";
import { TableFullscreenController } from "./table-fullscreen-controller";

const TABLE_CELL_SELECTED_CLASS = 'bc-table-cell-selected'

function cssZoomDeclarationSupported(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true
  return CSS.supports('zoom', '2')
}

/**
 * CSS zoom 下至少有三套坐标语义需要分开探测：
 * 1. BCR 距离是否已经乘过 zoom；
 * 2. absolute 子元素的 style.top/left 渲染时是否乘 zoom；
 * 3. absolute 子元素的 style.width/height 渲染时是否乘 zoom。
 *
 * Chromium 基本是 BCR=visual、position/size 都乘 zoom；WKWebView 的 BCR、
 * absolute position、absolute size 可能各自不同步。若只看 child BCR offset
 * 会把多种组合混在一起，导致 cursor(clientX/Y) 与 BCR 坐标比较时偏移。
 */
let _bcrScalesWithZoomCache: boolean | null = null
function bcrScalesWithZoomInZoomedParent(): boolean {
  if (_bcrScalesWithZoomCache !== null) return _bcrScalesWithZoomCache
  if (typeof document === 'undefined' || !document.body) {
    return true
  }
  if (!cssZoomDeclarationSupported()) {
    _bcrScalesWithZoomCache = false
    return _bcrScalesWithZoomCache
  }
  const parent = document.createElement('div')
  parent.style.cssText = 'position:fixed;left:-99999px;top:-99999px;zoom:2;width:100px;height:100px;visibility:hidden;pointer-events:none;'
  const child = document.createElement('div')
  child.style.cssText = 'margin-left:50px;width:1px;height:1px;'
  parent.appendChild(child)
  document.body.appendChild(parent)
  void parent.offsetWidth
  const ratio = (
    child.getBoundingClientRect().left - parent.getBoundingClientRect().left
  ) / 50
  document.body.removeChild(parent)
  _bcrScalesWithZoomCache = ratio > 1.5
  return _bcrScalesWithZoomCache
}

function hitTestZoomedChild(childStyle: string, x: number, y: number): boolean | null {
  if (typeof document === 'undefined' || !document.body || typeof document.elementFromPoint !== 'function') {
    return null
  }
  if (typeof window !== 'undefined' && (window.innerWidth <= x || window.innerHeight <= y)) {
    return null
  }
  const parent = document.createElement('div')
  parent.style.cssText = 'position:fixed;left:0;top:0;zoom:2;width:200px;height:200px;opacity:0;pointer-events:auto;z-index:2147483647;'
  const child = document.createElement('div')
  child.style.cssText = `${childStyle};background:#000;pointer-events:auto;`
  parent.appendChild(child)
  document.body.appendChild(parent)
  void parent.offsetWidth
  const hit = document.elementFromPoint(x, y)
  document.body.removeChild(parent)
  return hit === child || (!!hit?.parentElement && child.contains(hit))
}

let _styleTopAppliesZoomCache: boolean | null = null
function styleTopAppliesZoomInZoomedParent(): boolean {
  if (_styleTopAppliesZoomCache !== null) return _styleTopAppliesZoomCache
  if (typeof document === 'undefined' || !document.body) {
    return true
  }
  if (!cssZoomDeclarationSupported()) {
    _styleTopAppliesZoomCache = false
    return _styleTopAppliesZoomCache
  }
  const hitZoomedPosition = hitTestZoomedChild(
    'position:absolute;left:50px;top:0;width:10px;height:10px;',
    105,
    5,
  )
  if (hitZoomedPosition !== null) {
    _styleTopAppliesZoomCache = hitZoomedPosition
    return _styleTopAppliesZoomCache
  }
  const parent = document.createElement('div')
  parent.style.cssText = 'position:fixed;left:-99999px;top:-99999px;zoom:2;width:100px;height:100px;visibility:hidden;pointer-events:none;'
  const child = document.createElement('div')
  child.style.cssText = 'position:absolute;top:50px;left:0;width:1px;height:1px;'
  parent.appendChild(child)
  document.body.appendChild(parent)
  void parent.offsetWidth
  const offset = child.getBoundingClientRect().top - parent.getBoundingClientRect().top
  document.body.removeChild(parent)
  const bcrScaleAtZoom2 = bcrScalesWithZoomInZoomedParent() ? 2 : 1
  const visualFactorAtZoom2 = (offset / 50) * (2 / bcrScaleAtZoom2)
  _styleTopAppliesZoomCache = visualFactorAtZoom2 > 1.5
  return _styleTopAppliesZoomCache
}

let _styleSizeAppliesZoomCache: boolean | null = null
function styleSizeAppliesZoomInZoomedParent(): boolean {
  if (_styleSizeAppliesZoomCache !== null) return _styleSizeAppliesZoomCache
  if (typeof document === 'undefined' || !document.body) {
    return true
  }
  if (!cssZoomDeclarationSupported()) {
    _styleSizeAppliesZoomCache = false
    return _styleSizeAppliesZoomCache
  }
  const hitZoomedSize = hitTestZoomedChild(
    'width:50px;height:50px;',
    75,
    25,
  )
  if (hitZoomedSize !== null) {
    _styleSizeAppliesZoomCache = hitZoomedSize
    return _styleSizeAppliesZoomCache
  }
  const parent = document.createElement('div')
  parent.style.cssText = 'position:fixed;left:-99999px;top:-99999px;zoom:2;width:100px;height:100px;visibility:hidden;pointer-events:none;'
  const child = document.createElement('div')
  child.style.cssText = 'width:50px;height:50px;'
  parent.appendChild(child)
  document.body.appendChild(parent)
  void parent.offsetWidth
  const h = child.getBoundingClientRect().height
  document.body.removeChild(parent)
  const bcrScaleAtZoom2 = bcrScalesWithZoomInZoomedParent() ? 2 : 1
  const visualFactorAtZoom2 = (h / 50) * (2 / bcrScaleAtZoom2)
  _styleSizeAppliesZoomCache = visualFactorAtZoom2 > 1.5
  return _styleSizeAppliesZoomCache
}

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
    height: 0,
    rowIndex: 0,
    rowCount: 1,
    colIndex: 0,
    colCount: 1,
    selectionKind: 'cell' as 'cell' | 'cells' | 'row' | 'col',
  }

  /** 协同兜底：_showTableMenu 时抓拍的锚点 ID。菜单动作执行瞬间据此重定位
   *  行/列 span（indexOf + 连续性校验），远端增删让快照索引漂移时仍命中正确
   *  目标，锚点失效则安全放弃——绝不按错位索引执行破坏性操作。
   *  与 _tableMenu 一样在 hide 时保留（keep-alive 内联工具栏），每次 show 重抓。 */
  private _tableMenuAnchor: { rowIds: string[], colCellIds: string[] } | null = null

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
    /** style.height 实际值（按 size factor 折算后） */
    previewHeight: number
    previewWidth: number
    /** 源行 visual height（不经 size factor 折算），用于 cursor centering 数学。
     *  WebKit 上 position 和 size 可能用不同 factor，centering 必须用 visual。 */
    previewVisualHeight: number
    /** 协同兜底：drag start 时锁定的源行 ID 数组（按拖拽顺序）。drag end 时
     *  在 crud.transact 内用 indexOf 重算真实 fromIndex 并逐项校验，远端
     *  在拖拽期间增删行也能正确定位（或安全 abort）。 */
    anchorIds: string[]
  } | null = null

  protected _colReorder: {
    fromIndex: number
    count: number
    targetIndex: number
    dropLineLeft: number
    previewLeft: number
    /** style.width 实际值（按 size factor 折算后） */
    previewWidth: number
    previewHeight: number
    /** 源列 visual width（不经 size factor 折算），用于 cursor centering 数学。 */
    previewVisualWidth: number
    /** 协同兜底：drag start 时锁定的「每行独立的源 cell ID 数组」。drag end
     *  在 crud.transact 内逐行 indexOf 重算每行 fromIndex，并要求所有行漂移
     *  量一致（否则视为表格列结构已损坏，abort）。 */
    anchorCellIdsByRow: string[][]
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

    // 在表格内进行文本编辑（普通打字 / IME 提交）时折叠行/列多选高亮。
    // Model-owned table-cell 选区切换到文本光标时会由 _syncTableFocusUi 同步清理；
    // 这里保留为本地文本更新的兜底路径，覆盖旧的显式行/列选择和异步渲染交错。
    this.doc.crud.onTextUpdate$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(e => {
        if (!e.local || this._startSelectingCell) return
        const hasRectSelection = !!this._activeCellsRange
          || this._selectedCellSet.size > 0
          || this._activeColRange[0] > -1
          || this._activeRowRange[0] > -1
        if (!hasRectSelection) return
        const editedInThisTable = e.transactions.some(t =>
          this.hostElement.contains(t.block.hostElement))
        if (!editedInThisTable) return
        this._activeCellsRange = null
        this._clearSelected()
        this._clearActiveRanges()
        this.changeDetectorRef.markForCheck()
      })

    // 协同兜底：远端结构事务后校验矩形不变量与 colWidths 对齐。
    // 仅远端事务触发 + O(rows) 预检，本地编辑路径零开销，见 table-normalize.ts
    attachTableNormalizer(this)
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

  // ── 结构工具栏菜单动作（协同安全入口）─────────────────────────
  // 工具栏持有的 rowIndex/colIndex 是菜单展示时的快照，远端增删行列后会漂移。
  // 这些入口在点击瞬间用 _tableMenuAnchor 重定位；「解析 → 执行」在同一同步
  // 调用栈内完成（远端更新只能以宏任务到达），无需再进事务内二次校验。

  /** 用锚点重算 span；锚点被远端删除/打散返回 null */
  private _resolveAnchoredSpan(anchorIds: string[], liveIds: string[]): { index: number, count: number } | null {
    if (!anchorIds.length) return null
    const index = liveIds.indexOf(anchorIds[0])
    if (index < 0) return null
    for (let i = 1; i < anchorIds.length; i++) {
      if (liveIds[index + i] !== anchorIds[i]) return null
    }
    return { index, count: anchorIds.length }
  }

  private _resolveMenuRowSpan() {
    const anchor = this._tableMenuAnchor
    return anchor ? this._resolveAnchoredSpan(anchor.rowIds, this.childrenIds) : null
  }

  private _resolveMenuColSpan() {
    const anchor = this._tableMenuAnchor
    const firstRowCellIds = this.firstChildren?.childrenIds
    // 注：列锚点以「抓拍时的首行 cell」为基准。若远端在首行上方插入了新行，
    // 首行身份改变，列锚点会失配并放弃操作（假阳性 abort）——保守设计，
    // 用户重新唤起菜单即可刷新锚点；绝不冒按错位列索引删错列的风险。
    return anchor && firstRowCellIds ? this._resolveAnchoredSpan(anchor.colCellIds, firstRowCellIds) : null
  }

  private _abortMenuAction(kind: 'row' | 'col') {
    this.doc.logger.warn(`table menu: anchored ${kind} span no longer exists (remote change), action skipped`)
    this._hideTableMenu()
  }

  menuAddRowAbove() {
    const span = this._resolveMenuRowSpan()
    if (!span) return this._abortMenuAction('row')
    this.addRow(span.index)
  }

  menuAddRowBelow() {
    const span = this._resolveMenuRowSpan()
    if (!span) return this._abortMenuAction('row')
    this.addRow(span.index + span.count)
  }

  /** @returns 实际执行删除的起始行索引；锚点失效返回 null（未执行任何删除） */
  menuDeleteRows(): number | null {
    const span = this._resolveMenuRowSpan()
    if (!span) {
      this._abortMenuAction('row')
      return null
    }
    this.deleteRows(span.index, span.count)
    return span.index
  }

  menuAddColumnLeft() {
    const span = this._resolveMenuColSpan()
    if (!span) return this._abortMenuAction('col')
    this.addColumn(span.index)
  }

  menuAddColumnRight() {
    const span = this._resolveMenuColSpan()
    if (!span) return this._abortMenuAction('col')
    this.addColumn(span.index + span.count)
  }

  /** @returns 实际执行删除的起始列索引；锚点失效返回 null（未执行任何删除） */
  menuDeleteColumns(): number | null {
    const span = this._resolveMenuColSpan()
    if (!span) {
      this._abortMenuAction('col')
      return null
    }
    this.deleteColumns(span.index, span.count)
    return span.index
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
    const headCell = this._lastSelectingCell ?? anchorCell
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
        this.doc.selection.setTableCellSelection(this, anchorCell, headCell)
      } else {
        this.doc.selection.setCursorAtBlock(anchorCell, false, false)
      }
    } finally {
      this._suppressFocusSync = false
    }

    this._syncTableFocusUi(this.doc.selection.value)
  }

  protected selectCell = (cell: TableCellBlockComponent) => {
    if (this._selectedCellSet.has(cell)) return
    this._selectedCellSet.add(cell)
    cell.hostElement.classList.add(TABLE_CELL_SELECTED_CLASS)
  }

  protected _clearSelected() {
    this._selectedCellSet.forEach(cell => cell.hostElement.classList.remove(TABLE_CELL_SELECTED_CLASS))
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
        cell.hostElement.classList.remove(TABLE_CELL_SELECTED_CLASS)
      }
    })
    nextCells.forEach(cell => {
      if (!this._selectedCellSet.has(cell)) {
        cell.hostElement.classList.add(TABLE_CELL_SELECTED_CLASS)
      }
    })
    this._selectedCellSet = nextCells
  }

  protected _getSelectedCellsCoordinates() {
    if (!this._startSelectingCell || !this._lastSelectingCell) {
      const docSelection = this.doc.selection.value
      let firstBlock: BlockCraft.BlockComponent | null = null
      try {
        firstBlock = docSelection?.firstBlock ?? null
      } catch {
        return null
      }
      if (!firstBlock || firstBlock.flavour !== 'table-cell') return null
      const liveCell = this._getLiveBlockById<TableCellBlockComponent>(firstBlock.id)
      if (!this._isTableCellBlock(liveCell) || !this.hostElement.contains(liveCell.hostElement)) return null
      this._startSelectingCell = this._lastSelectingCell = liveCell
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

  /**
   * Return only an explicit table-structure selection (dragged cells, row
   * range, or column range). Unlike getSelectedCoordinates(), this never falls
   * back to the current text/block selection's first cell.
   */
  getExplicitSelectedCoordinates(): TableCellsSelection | null {
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
    if (this._selectedCellSet.size <= 1) return null

    const coordinates = [...this._selectedCellSet]
      .map(cell => this._getCellCoordinate(cell))
      .filter((coordinate): coordinate is { rowIdx: number, colIdx: number } => !!coordinate)
    if (coordinates.length <= 1) return null

    const rows = coordinates.map(coordinate => coordinate.rowIdx)
    const cols = coordinates.map(coordinate => coordinate.colIdx)
    return this.confirmSelection(
      [Math.min(...rows), Math.min(...cols)],
      [Math.max(...rows), Math.max(...cols)],
    )
  }

  onColHandleHovered(index: number | null) {
    this._hoveredColHandle = index
    this.changeDetectorRef.markForCheck()
  }

  onRowHandleHovered(index: number | null) {
    this._hoveredRowHandle = index
    this.changeDetectorRef.markForCheck()
  }

  private _getLiveBlockById<T extends BlockCraft.BlockComponent = BlockCraft.BlockComponent>(id: string): T | null {
    try {
      return (this.doc.getBlockById(id) as T | null) ?? null
    } catch {
      return null
    }
  }

  private _isTableCellBlock(block: unknown): block is TableCellBlockComponent {
    return !!block
      && (block as BlockCraft.BlockComponent).flavour === 'table-cell'
      && typeof (block as TableCellBlockComponent).getIndexOfParent === 'function'
  }

  private _getCellCoordinate(cell: TableCellBlockComponent | null | undefined) {
    if (!this._isTableCellBlock(cell)) return null
    const rowIdx = this.childrenIds.indexOf(cell.parentId!)
    const colIdx = cell.getIndexOfParent()
    if (rowIdx < 0 || colIdx < 0) return null
    return { rowIdx, colIdx }
  }

  private _resolveCellFromSelection(selection: BlockSelection | null) {
    if (!selection) return null
    let block: BlockCraft.BlockComponent
    try {
      block = selection.firstBlock
    } catch {
      return null
    }
    const liveBlock = this._getLiveBlockById(block.id)
    if (!liveBlock?.hostElement) return null
    block = liveBlock
    if (!this.hostElement.contains(block.hostElement)) return null
    if (this._isTableCellBlock(block)) {
      return block as TableCellBlockComponent
    }

    const cellId = block.hostElement.closest('td[data-block-id]')?.getAttribute('data-block-id')
    if (!cellId) return null
    const cell = this._getLiveBlockById<TableCellBlockComponent>(cellId)
    return this._isTableCellBlock(cell) ? cell : null
  }

  private _syncFromTableCellSelection(selection: BlockSelection | null) {
    const tableCellSelection = selection?.getTableCellSelection()
    if (!tableCellSelection || tableCellSelection.tableId !== this.id) return false

    const anchorCell = this._getLiveBlockById<TableCellBlockComponent>(tableCellSelection.anchorCellId)
    const headCell = this._getLiveBlockById<TableCellBlockComponent>(tableCellSelection.headCellId)
    if (!this._isTableCellBlock(anchorCell) || !this._isTableCellBlock(headCell)) return false

    const anchorCoordinate = this._getCellCoordinate(anchorCell)
    const headCoordinate = this._getCellCoordinate(headCell)
    if (!anchorCoordinate || !headCoordinate) return false

    this._clearActiveRanges()
    const adjusted = this.confirmSelection(
      [
        Math.min(anchorCoordinate.rowIdx, headCoordinate.rowIdx),
        Math.min(anchorCoordinate.colIdx, headCoordinate.colIdx),
      ],
      [
        Math.max(anchorCoordinate.rowIdx, headCoordinate.rowIdx),
        Math.max(anchorCoordinate.colIdx, headCoordinate.colIdx),
      ],
    )
    this._activeCellsRange = {
      start: [adjusted.start[0], adjusted.start[1]],
      end: [adjusted.end[0], adjusted.end[1]],
      anchorId: anchorCell.id,
    }
    this._applySelectedDiff(new Set(this.getCellsMatrixByCoordinates(adjusted.start, adjusted.end).flat(1)))
    this._syncHandleVisibility(anchorCell)

    const colRange: [number, number] = [adjusted.start[1], adjusted.end[1]]
    const rowRange: [number, number] = [adjusted.start[0], adjusted.end[0]]
    if (this.colBarComponent) {
      this.colBarComponent.selectedRange = colRange
      this.colBarComponent.changeDetectionRef.markForCheck()
    }
    if (this.rowBarComponent) {
      this.rowBarComponent.selectedRange = rowRange
      this.rowBarComponent.changeDetectionRef.markForCheck()
    }

    this._showTableMenu({
      rowIndex: adjusted.start[0],
      rowCount: adjusted.end[0] - adjusted.start[0] + 1,
      colIndex: adjusted.start[1],
      colCount: adjusted.end[1] - adjusted.start[1] + 1,
      selectionKind: 'cells',
    })
    return true
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
    })

    const liveRowIds = this.childrenIds
    const liveFirstRowCellIds = this.firstChildren?.childrenIds ?? []
    this._tableMenuAnchor = {
      rowIds: liveRowIds.slice(options.rowIndex, options.rowIndex + (options.rowCount ?? 1)),
      colCellIds: liveFirstRowCellIds.slice(options.colIndex, options.colIndex + (options.colCount ?? 1)),
    }

    this._tableMenu = {
      visible: true,
      left: anchor.left,
      top: anchor.top,
      width: anchor.width,
      height: anchor.height,
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

    if (this._syncFromTableCellSelection(selection)) return

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
    this._syncTableFocusUi(this.doc.selection.value)
  }

  private _disposeToolbar() {
    if (this.toolbarOvr) {
      this.toolbarOvr.dispose()
      this.toolbarOvr = undefined
      this.toolbarRef = undefined
      this._closeToolbar$.next(true)
    }
  }

  /**
   * Order the structure toolbar's connect positions (below-first vs above-first).
   *
   * CDK's own flip uses the browser window as its viewport, but the toolbar is
   * clamped to the editor's scroll container, which can be shorter than the
   * window. When the table sits near the bottom of that scroll viewport there is
   * no room below it *inside the editor*, so we must flip above the table — else
   * `_clampConnectedOverlay` drags the toolbar back up over the last rows.
   * Measuring against the scroll viewport keeps this decision in sync with the
   * clamp (which also clamps to the scroll container now that `clampTo` is unset).
   */
  private _resolveToolbarPositions(): ConnectedPosition[] {
    const gap = 8
    const below = getPositionWithOffset('bottom-center', 0, gap)
    const above = getPositionWithOffset('top-center', 0, gap)
    const scroller = this.doc.scrollContainer
    const tableEl = this.tableWrapper?.nativeElement.querySelector('table')
    if (!scroller || !tableEl) return [below, above]
    const flipAbove = preferTableToolbarAbove({
      tableRect: tableEl.getBoundingClientRect(),
      viewportRect: scroller.getBoundingClientRect(),
      gap,
    })
    return flipAbove ? [above, below] : [below, above]
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
        const strategy = overlay.getConfig().positionStrategy as FlexibleConnectedPositionStrategy | undefined
        if (strategy) {
          // Re-decide below/above against the (possibly scrolled) table so the
          // toolbar flips sides when the table nears the scroll-viewport edge,
          // instead of being clamped over its own rows.
          strategy.withPositions(this._resolveToolbarPositions())
          overlay.updatePosition()
        }
      })
      return
    }

    const closeCb = () => {
      this.toolbarOvr = undefined
      this.toolbarRef = undefined
    }

    // No `clampTo: root` — the root block wraps the content, so when the table
    // is the last/only block root.bottom ≈ table.bottom and the clamp would drag
    // the toolbar up over the table. Clamping to the scroll viewport (default)
    // gives the toolbar the editor's full visible height to sit in.
    //
    // `flexibleDimensions: false` — with flexible dimensions CDK builds a wide
    // flex bounding box and left-aligns the toolbar in it (it drifts off-center
    // on scroll). This toolbar is fixed-size and must stay centered on the
    // anchor, so force CDK's exact-position path instead.
    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<TableStructureToolbarComponent>({
      target: this.tableMenuAnchor.nativeElement,
      component: TableStructureToolbarComponent,
      positions: this._resolveToolbarPositions(),
      flexibleDimensions: false,
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
  }

  /**
   * BCR-derived 距离换算到 inline style 时的除数。Chromium 通常是 zoom，
   * WKWebView 在部分版本里 BCR 不乘 zoom，但 absolute style 会乘 zoom，此时除数是 1。
   */
  private _zoomFactorForBcr(): number {
    const zoom = this._actualCssZoom()
    if (!cssZoomDeclarationSupported() || zoom === 0) return 1
    return this._zoomFactorForBcrMeasure() * this._zoomFactorForVisualPosition() / zoom
  }

  /**
   * BCR-derived 尺寸换算到 style.height / style.width 时的除数。
   * position 和 size 在 WebKit 上可能不对称，所以不能复用 position factor。
   */
  private _zoomFactorForBcrSize(): number {
    const zoom = this._actualCssZoom()
    if (!cssZoomDeclarationSupported() || zoom === 0) return 1
    return this._zoomFactorForBcrMeasure() * this._zoomFactorForVisualSize() / zoom
  }

  private _actualCssZoom(): number {
    if (!cssZoomDeclarationSupported()) return 1
    return this.fullscreenController?.zoom$.value ?? 1
  }

  private _zoomFactorForBcrMeasure(): number {
    return bcrScalesWithZoomInZoomedParent() ? this._actualCssZoom() : 1
  }

  private _zoomFactorForVisualPosition(): number {
    return styleTopAppliesZoomInZoomedParent() ? this._actualCssZoom() : 1
  }

  private _zoomFactorForVisualSize(): number {
    return styleSizeAppliesZoomInZoomedParent() ? this._actualCssZoom() : 1
  }

  private _stylePositionFromBcrDistance(distance: number): number {
    return distance / this._zoomFactorForBcr()
  }

  private _stylePositionFromVisualDistance(distance: number): number {
    return distance / this._zoomFactorForVisualPosition()
  }

  private _styleSizeFromBcrDistance(distance: number): number {
    return distance / this._zoomFactorForBcrSize()
  }

  private _styleSizeFromVisualDistance(distance: number): number {
    return distance / this._zoomFactorForVisualSize()
  }

  private _visualDistanceFromBcr(distance: number): number {
    return distance * this._actualCssZoom() / this._zoomFactorForBcrMeasure()
  }

  private _layoutDistanceFromBcr(distance: number): number {
    return distance / this._zoomFactorForBcrMeasure()
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
    // position 跟 size 用独立的 zoom factor：WebKit 上两者可能不对称（top 当 visual，
    // height 仍 × zoom）。`previewVisualHeight` 存原始 visual 值，move 时用于 cursor
    // centering，避免 size factor 跟 position factor 不一致时中心算错位。
    const bcrH = srcEndRect.bottom - srcRect.top
    const bcrW = srcRect.width
    const visualH = this._visualDistanceFromBcr(srcEndRect.bottom - srcRect.top)

    // 抓拍源行的 block ID 数组，drag end 时用作协同兜底锚点。
    const rowBlocks = this.getChildrenBlocks()
    const anchorIds = rowBlocks
      .slice(closure.start, closure.start + closure.count)
      .map(b => b.id)
    if (anchorIds.length !== closure.count) return

    this._rowReorder = {
      fromIndex: closure.start,
      count: closure.count,
      targetIndex: closure.start,
      dropLineTop: this._stylePositionFromBcrDistance(firstRect.top - wrapperRect.top),
      previewTop: this._stylePositionFromBcrDistance(srcRect.top - wrapperRect.top),
      previewHeight: this._styleSizeFromBcrDistance(bcrH),
      previewWidth: this._styleSizeFromBcrDistance(bcrW),
      previewVisualHeight: visualH,
      anchorIds,
    }
    this._hideTableMenu()
    this.changeDetectorRef.markForCheck()
  }

  onRowReorderMove(evt: RowReorderMoveEvent) {
    if (!this._rowReorder) return
    const rows = this._getRowElements()
    if (!rows.length) return

    const wrapperRect = this.tableWrapper.nativeElement.getBoundingClientRect()
    const { fromIndex, count, previewVisualHeight } = this._rowReorder
    const { targetIndex, dropLineTop } = this._computeRowDropTarget(evt.cursorY, rows, wrapperRect, fromIndex, count)
    const cursorDistance = evt.cursorY - wrapperRect.top
    // 用 visualH（不是 previewHeight，后者按 size factor 已折算）做 centering：
    // 把 cursor 在 visual viewport 里的位置先减去 visualH/2，再 / posZ 折算回 style.top 单位。
    // 这样无论 position 和 size factor 是否一致，preview 渲染后的中心始终落在 cursor。
    const previewTop = this._stylePositionFromVisualDistance(cursorDistance - previewVisualHeight / 2)

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

    const { fromIndex, count, targetIndex, anchorIds } = state
    // Dropping on or inside the source range is a no-op.
    if (targetIndex >= fromIndex && targetIndex <= fromIndex + count) return

    // 协同兜底：把「定位 + 校验 + 实际移动」放进同一个 transact，确保 indexOf
    // 看到的 childrenIds 和 moveBlocks 操作的 Y.Array 在同一原子区间内。
    this.doc.crud.transact(() => {
      const liveChildren = this.childrenIds
      const liveFromIndex = liveChildren.indexOf(anchorIds[0])
      if (liveFromIndex < 0) return // 源行被远端删除
      for (let i = 0; i < anchorIds.length; i++) {
        if (liveChildren[liveFromIndex + i] !== anchorIds[i]) return // 源段被远端打散
      }
      // 用源段漂移补偿 targetIndex（假设远端的增删主要发生在 fromIndex 之前）。
      const drift = liveFromIndex - fromIndex
      const liveTargetIndex = targetIndex + drift
      if (liveTargetIndex < 0 || liveTargetIndex > liveChildren.length) return
      if (liveTargetIndex >= liveFromIndex && liveTargetIndex <= liveFromIndex + count) return
      const adjustedTarget = liveTargetIndex > liveFromIndex + count
        ? liveTargetIndex - count
        : liveTargetIndex
      this.doc.crud.moveBlocks(this.id, liveFromIndex, count, this.id, adjustedTarget)
    })

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

    const wrapperTop = this.tableWrapper.nativeElement.getBoundingClientRect().top
    const cursorYInBcr = wrapperTop + this._stylePositionFromVisualDistance(cursorY - wrapperTop) * this._zoomFactorForBcr()
    return Math.abs(cursorYInBcr - upY) <= Math.abs(cursorYInBcr - downY) ? up : down
  }

  private _computeRowDropTarget(
    cursorY: number,
    rows: HTMLElement[],
    wrapperRect: DOMRect,
    fromIndex: number,
    count: number,
  ): { targetIndex: number, dropLineTop: number } {
    const cursorYInBcr = wrapperRect.top + this._stylePositionFromVisualDistance(cursorY - wrapperRect.top) * this._zoomFactorForBcr()
    let targetIndex = rows.length
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect()
      if (cursorYInBcr < rect.top + rect.height / 2) {
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
    const dropLineTop = this._stylePositionFromBcrDistance(this._computeDropLineTop(rows, targetIndex) - wrapperRect.top)
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
    // 全程用 visual 坐标算位置/尺寸，最后才 / posZ 折成 style 单位——这样跨浏览器统一：
    // Chromium (posZ=actualZoom) 和 WebKit (posZ=1) 都自动得到正确的 style.left。
    // sizeZ 单独应用到 style.width / style.height（WebKit 上可能跟 posZ 不一致）。
    // colWidths 是 layout 值，需要 × actualZoom 折成 visual 才能跟 BCR (visual) 相加。
    const actualZoom = this.fullscreenController?.zoom$.value ?? 1

    const layoutLeftOffset = this._colLeftOffset(closure.start, colWidths)
    const layoutWidth = colWidths.slice(closure.start, closure.start + closure.count).reduce((a, b) => a + b, 0)
    const visualLeftOffset = layoutLeftOffset * actualZoom
    const visualW = layoutWidth * actualZoom
    const visualH = this._visualDistanceFromBcr(tbodyRect.height)
    const visualDistanceToTbody = this._visualDistanceFromBcr(tbodyRect.left - wrapperRect.left)

    // 抓拍每行的源 cell ID 数组，drag end 时用作协同兜底锚点。
    const rowBlocks = this.getChildrenBlocks()
    const anchorCellIdsByRow = rowBlocks.map(row =>
      row.childrenIds.slice(closure.start, closure.start + closure.count)
    )
    if (anchorCellIdsByRow.some(ids => ids.length !== closure.count)) return

    this._colReorder = {
      fromIndex: closure.start,
      count: closure.count,
      targetIndex: closure.start,
      dropLineLeft: this._stylePositionFromVisualDistance(visualDistanceToTbody),
      previewLeft: this._stylePositionFromVisualDistance(visualDistanceToTbody + visualLeftOffset),
      previewWidth: this._styleSizeFromVisualDistance(visualW),
      previewHeight: this._styleSizeFromVisualDistance(visualH),
      previewVisualWidth: visualW,
      anchorCellIdsByRow,
    }
    this._hideTableMenu()
    this.changeDetectorRef.markForCheck()
  }

  onColReorderMove(evt: ColReorderMoveEvent) {
    if (!this._colReorder) return
    const wrapperRect = this.tableWrapper.nativeElement.getBoundingClientRect()
    const actualZoom = this.fullscreenController?.zoom$.value ?? 1
    const { fromIndex, count, previewVisualWidth } = this._colReorder
    const { targetIndex, dropLineLeft } = this._computeColDropTarget(evt.cursorX, wrapperRect, fromIndex, count, actualZoom)
    // 用 visualW 做 cursor centering，跟 row reorder 同理（避免 sizeZ ≠ posZ 时中心偏移）。
    const cursorDistance = evt.cursorX - wrapperRect.left
    const previewLeft = this._stylePositionFromVisualDistance(cursorDistance - previewVisualWidth / 2)

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

    const { fromIndex, count, targetIndex, anchorCellIdsByRow } = state
    if (targetIndex >= fromIndex && targetIndex <= fromIndex + count) return

    // 协同兜底：在 transact 内逐行用 anchorCellIdsByRow 重算 fromIndex 并校验。
    // 要求所有行的漂移量一致（列结构必须对齐），否则视为表格已损坏，整段 abort。
    this.doc.crud.transact(() => {
      const rows = this.getChildrenBlocks()
      if (rows.length !== anchorCellIdsByRow.length) return // 行数被远端改了

      const liveFromIndices: number[] = []
      for (let r = 0; r < rows.length; r++) {
        const anchors = anchorCellIdsByRow[r]
        const cellIds = rows[r].childrenIds
        const liveFrom = cellIds.indexOf(anchors[0])
        if (liveFrom < 0) return // 该行的源段被远端删除
        for (let c = 0; c < anchors.length; c++) {
          if (cellIds[liveFrom + c] !== anchors[c]) return // 该行源段被打散
        }
        liveFromIndices.push(liveFrom)
      }

      const baseDrift = liveFromIndices[0] - fromIndex
      // 所有行漂移量必须一致——否则各行列数不齐，整张表已经不是合法的矩形。
      if (liveFromIndices.some(f => f - fromIndex !== baseDrift)) return

      const liveFromIndex = liveFromIndices[0]
      const liveTargetIndex = targetIndex + baseDrift
      const liveColCount = rows[0]?.childrenIds.length ?? 0
      if (liveTargetIndex < 0 || liveTargetIndex > liveColCount) return
      if (liveTargetIndex >= liveFromIndex && liveTargetIndex <= liveFromIndex + count) return
      const adjustedTarget = liveTargetIndex > liveFromIndex + count
        ? liveTargetIndex - count
        : liveTargetIndex

      // 先校验 colWidths（与 cell 段长度一致）；不通过则在改任何块之前 abort，
      // 避免「cells 已移动但 widths 没动」的半应用。
      const widths = [...(this.props.colWidths || [])]
      if (liveFromIndex + count > widths.length) return

      rows.forEach((row, r) => {
        this.doc.crud.moveBlocks(row.id, liveFromIndices[r], count, row.id, adjustedTarget)
      })
      const moving = widths.splice(liveFromIndex, count)
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
    wrapperRect: DOMRect,
    tbodyLeft: number,
    actualZoom: number = 1,
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

    // 比较 cursor 跟两个候选边界哪个更近，要统一到同一坐标系。
    // clientX 是 visual viewport 坐标；部分 WKWebView 下 BCR 距离可能是 layout 坐标，
    // 所以先转成 BCR 坐标差，再折成 colWidths 使用的 layout 坐标。
    const cursorLayoutFromWrapper = (cursorX - wrapperRect.left) / actualZoom
    const tbodyLayoutFromWrapper = this._layoutDistanceFromBcr(tbodyLeft - wrapperRect.left)
    const cursorInLocal = cursorLayoutFromWrapper - tbodyLayoutFromWrapper
    const upLocal = this._colLeftOffset(up, colWidths)
    const downLocal = this._colLeftOffset(down, colWidths)

    return Math.abs(cursorInLocal - upLocal) <= Math.abs(cursorInLocal - downLocal) ? up : down
  }

  /**
   * @param actualZoom 当前 CSS zoom 实际值（不是 posZ）；用于 visual ↔ layout 互转。
   *                   dropLineLeft 的 / posZ 折算单独在末尾应用。
   */
  private _computeColDropTarget(
    cursorX: number,
    wrapperRect: DOMRect,
    fromIndex: number,
    count: number,
    actualZoom: number = 1,
  ): { targetIndex: number, dropLineLeft: number } {
    const colWidths = this.props.colWidths || []
    const colCount = colWidths.length
    const tbodyRect = this.tableBody.getBoundingClientRect()
    const tbodyLeft = tbodyRect.left

    // 把 cursor 从 viewport visual 坐标折算成 tbody 内部 layout 坐标（colWidths 累加单位）。
    // 部分 WKWebView 下 BCR 自身不乘 zoom，直接用 visual/BCR 差值会把坐标放大一倍。
    const cursorLayoutFromWrapper = (cursorX - wrapperRect.left) / actualZoom
    const tbodyLayoutFromWrapper = this._layoutDistanceFromBcr(tbodyLeft - wrapperRect.left)
    const cursorInLocal = cursorLayoutFromWrapper - tbodyLayoutFromWrapper

    // Walk cumulative widths and find which column mid-point the cursor passed.
    let acc = 0
    let targetIndex = colCount
    for (let i = 0; i < colCount; i++) {
      const w = colWidths[i] || 0
      if (cursorInLocal < acc + w / 2) {
        targetIndex = i
        break
      }
      acc += w
    }

    // Snap to merge-safe boundary.
    const rows = this.getChildrenBlocks()
    const matrix = buildCellMatrix(rows, rows.length, colCount)
    targetIndex = this._snapColBoundary(targetIndex, cursorX, colWidths, matrix, rows.length, wrapperRect, tbodyLeft, actualZoom)

    if (targetIndex > fromIndex && targetIndex < fromIndex + count) {
      targetIndex = fromIndex
    }

    // dropLineLeft 给 inline style 用：先在 visual 坐标算出列边界相对 wrapper 的偏移，
    // 再按实际 position 渲染语义折成 style.left 单位。
    const layoutOffset = this._colLeftOffset(targetIndex, colWidths)
    const visualOffset = layoutOffset * actualZoom
    const visualDistance = this._visualDistanceFromBcr(tbodyLeft - wrapperRect.left)
    const dropLineLeft = this._stylePositionFromVisualDistance(visualDistance + visualOffset)
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
