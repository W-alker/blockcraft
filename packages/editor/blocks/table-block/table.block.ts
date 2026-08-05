import { ChangeDetectionStrategy, ChangeDetectorRef, ComponentRef, Component, ElementRef, ViewChild, inject } from "@angular/core";
import {
  BaseBlockComponent, EditableBlockComponent, getPositionWithOffset,
  resolveBlockPolicy,
} from "../../framework";
import {
  planTableCellFlow, TableCellFlowAnchor, TableCellFlowInput,
  TableCellFlowPlan, TableCellFlowPlanningError, TableCellFlowPoint,
  TableFlowRowInput,
} from "../../framework/modules/pagination/engine/table-cell-flow";
import {
  applyInlinePaginationGaps,
  clearInlinePaginationGaps,
  measureInlinePaginationLineStarts,
} from "../../framework/block-std/inline/runtime/inline-pagination-access";
import {
  registerTablePaginationAccess,
  TablePaginationGeometry,
  TablePaginationMeasureOptions,
} from "../../framework/modules/pagination/view/table-pagination-access";
import {
  getTableModelProjection,
  resolveTableCellSelectionTarget,
  TableModelGrid,
  TableModelRectangle,
} from "../../framework/modules/table";
import { TableBlockModel } from "./index";
import { TableCellBlockComponent } from "./table-cell.block";
import { BehaviorSubject, filter, fromEvent, merge, Subject, Subscription, take, takeUntil } from "rxjs";
import { ColReorderEndEvent, ColReorderMoveEvent, ColReorderStartEvent, TableColBarComponent } from "./widgets/table-col-bar.component";
import { RowReorderEndEvent, RowReorderMoveEvent, RowReorderStartEvent, TableRowBarComponent } from "./widgets/table-row-bar.component";
import { TableStructureToolbarComponent } from "./widgets/table-structure-toolbar.component";
import { preferTableToolbarAbove, resolveTableStructureAnchor } from "./widgets/table-structure-anchor";
import { adjustSelection, RectangleSelection } from "./utils";
import { debounce, nextTick, throttle } from "../../global";
import { addTableCol, addTableRow, buildCellMatrix, CellMatrixEntry, deleteTableCols, deleteTableRows } from "./callback";
import { attachTableNormalizer } from "./table-normalize";
import { ConnectedPosition, FlexibleConnectedPositionStrategy, OverlayRef } from "@angular/cdk/overlay";
import { TableCellsSelection } from "./types";
import { BlockSelection } from "../../framework/modules/selection/blockSelection";
import { TableFullscreenController } from "./table-fullscreen-controller";

const TABLE_CELL_SELECTED_CLASS = 'bc-table-cell-selected'
const TABLE_COL_RESIZE_PREVIEW_ATTR = 'data-bc-table-col-resize-preview'
const TABLE_MIN_COLUMN_WIDTH = 50
const TABLE_COL_RESIZE_HIT_WIDTH = 12
const TABLE_COL_RESIZE_OUTER_TOLERANCE = 2
const TABLE_COL_RESIZE_ADJACENT_TOLERANCE = 4
const TABLE_PAGINATION_BOUNDARY_TOLERANCE = 2
/**
 * Extreme rich-cell tables must degrade to the existing atomic-row overflow
 * semantics before live pagination can monopolize the main thread. These are
 * view-planning budgets, not document/model limits.
 */
const TABLE_CELL_FLOW_MAX_PAGES_PER_ROW = 256
const TABLE_CELL_FLOW_MAX_CONTINUATIONS = 1024
const TABLE_CELL_FLOW_MAX_SAFE_ANCHORS = 2048
const TABLE_CELL_FLOW_MIN_LINE_SAMPLES = 64
const TABLE_CELL_FLOW_LINE_SAMPLES_PER_PAGE = 8
/**
 * 分页拆分 rowspan 时，续页段借用模型里的隐藏占位 cell 来承载视图。
 * 该属性把续页段的命中重新路由到真正的 master cell；不能使用续页 cell
 * 自身的 data-block-id，否则矩形选区会把模型占位格误当成独立单元格。
 */
const PG_CONTINUATION_MASTER_ATTR = 'data-bc-pagination-master-cell-id'

function cssZoomDeclarationSupported(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true
  return CSS.supports('zoom', '2')
}

/** 分页视图行（占位行 / 续页重复表头克隆）：均为视图层注入、不属于数据模型，观测/选区/行栏一律跳过。 */
function isPaginationViewRow(node: Node): boolean {
  return node instanceof HTMLElement
    && (node.classList.contains('bc-pagination-spacer') || node.classList.contains('bc-pagination-header-clone'))
}

/**
 * 续页重复表头克隆里 data-block-id 改写用的前缀：保留 [data-block-id] CSS 级联、又不与真实块 id 冲突。
 */
const PG_CLONE_ID_PREFIX = '__pgclone__'

/**
 * 构建「续页重复表头」克隆 `<tr>`：跨页拆分的表格在每个续页顶部重复一份表头（rowHead 行）。
 * 克隆当前渲染的表头行，去掉 rowspan（克隆只占一行、不向下跨）、不可编辑/点选。纯视图层，不进数据模型。
 *
 * data-block-id **不能直接删除**：编辑器的块外边距归一化（base.scss `[data-block-id]{margin-bottom}` +
 * `[data-block-id]:last-child{margin-bottom:0}`）依赖它。删掉后克隆里的块会回落到浏览器 UA 默认外边距
 * （`<p>` 1em、标题更大）→ 克隆比原表头高、内容「塌成一坨」。改写成 `__pgclone__` 前缀的非模型 id：
 * 完整保留 [data-block-id] CSS 级联（外边距/定位/caret），又不与真实块 id 冲突、不会被 getBlockById 命中
 * （命中也返回 null，所有 closest('[data-block-id]') 调用方均已判空）。克隆全程 inert（pointer-events/
 * user-select none + contenteditable false + aria-hidden），不会有事件/选区从其内部发起。
 */
function buildPaginationHeaderClone(headerRowEl: HTMLElement): HTMLTableRowElement {
  const clone = headerRowEl.cloneNode(true) as HTMLTableRowElement
  clone.classList.add('bc-pagination-header-clone')
  clone.classList.remove('selected')
  clone.setAttribute('contenteditable', 'false')
  clone.setAttribute('aria-hidden', 'true')
  clone.style.pointerEvents = 'none'
  clone.style.userSelect = 'none'
  const rescopeBlockId = (el: Element) => {
    const id = el.getAttribute('data-block-id')
    if (id != null) el.setAttribute('data-block-id', PG_CLONE_ID_PREFIX + id)
  }
  rescopeBlockId(clone)
  clone.querySelectorAll('[data-block-id]').forEach(rescopeBlockId)
  clone.querySelectorAll('td, th').forEach(cell => {
    const c = cell as HTMLElement
    c.style.pointerEvents = 'none'
    c.style.userSelect = 'none'
    c.classList.remove('selected')
    c.removeAttribute('rowspan') // 克隆表头只占一行，不向下跨（合并表头降级为平表头）
  })
  return clone
}

/**
 * 构建一个无边框、不可编辑、不响应指针的占位 `<tr>`，撑出页缝高度把后续行推到下一页。
 *
 * 关键：表格是 `border-collapse: collapse`，外框 `border-right` 画在 `<table>` 上、左框来自首列 cell。
 * 占位 cell 用 `border:none` 时，`none` 在边框冲突里优先级最低，会被 `<table>` 的 `border-right` 压过 →
 * 右侧出现一条贯穿页缝的竖线。改用 **左右 `border-style: hidden`**（collapse 冲突里 `hidden` 优先级最高、
 * 直接抹掉该段边框），把页缝内的左右竖线都消掉；上下保持 `none`（让相邻数据行的边框赢，
 * 各页表格部分的上/下沿正常闭合）。
 */
function buildPaginationSpacer(gap: number, colspan: number): HTMLTableRowElement {
  const tr = document.createElement('tr')
  tr.className = 'bc-pagination-spacer'
  tr.setAttribute('contenteditable', 'false')
  tr.setAttribute('aria-hidden', 'true')
  tr.style.cssText = `height:${gap}px;`
  const td = document.createElement('td')
  td.setAttribute('colspan', `${Math.max(1, colspan)}`)
  td.style.cssText =
    `height:${gap}px; padding:0; background:transparent; pointer-events:none;` +
    `user-select:none; -webkit-user-select:none;` +
    `border-top:none; border-bottom:none; border-left-style:hidden; border-right-style:hidden;`
  tr.appendChild(td)
  return tr
}

interface TableCellFlowRenderGap {
  cellId: string
  anchor: TableCellFlowAnchor
  gap: number
  backdropOffset: number
  backdropHeight: number
}

type TablePaginationBreak =
  | {beforeRowId: string; gap: number}
  | {
      kind: 'cell-flow'
      rowId: string
      cells: TableCellFlowRenderGap[]
      mask: {
        top: number
        height: number
        backdropOffset: number
        backdropHeight: number
      }
    }

interface TableCellFlowMeasurementBudget {
  continuations: number
  safeAnchors: number
}

function applyPaginationGapStyle(
  element: HTMLElement,
  height: number,
  backdropOffset: number,
  backdropHeight: number,
): void {
  const safeHeight = Math.max(0, height)
  const bandStart = Math.max(0, Math.min(safeHeight, backdropOffset))
  const bandEnd = Math.max(
    bandStart,
    Math.min(safeHeight, bandStart + Math.max(0, backdropHeight)),
  )
  element.style.height = `${safeHeight}px`
  element.style.background = [
    'linear-gradient(to bottom',
    `var(--bc-page-sheet-bg, #fff) 0 ${bandStart}px`,
    `var(--bc-pagination-backdrop-bg, #f3f4f6) ${bandStart}px ${bandEnd}px`,
    `var(--bc-page-sheet-bg, #fff) ${bandEnd}px 100%)`,
  ].join(', ')
}

function buildCellPaginationGap(
  gap: TableCellFlowRenderGap,
): HTMLDivElement {
  const marker = document.createElement('div')
  marker.className = 'bc-pagination-cell-flow-gap'
  marker.setAttribute('contenteditable', 'false')
  marker.setAttribute('aria-hidden', 'true')
  marker.style.margin = '0'
  marker.style.padding = '0'
  marker.style.pointerEvents = 'none'
  marker.style.userSelect = 'none'
  marker.style.webkitUserSelect = 'none'
  applyPaginationGapStyle(
    marker,
    gap.gap,
    gap.backdropOffset,
    gap.backdropHeight,
  )
  return marker
}

function buildTablePaginationMask(
  mask: Extract<TablePaginationBreak, {kind: 'cell-flow'}>['mask'],
  table: HTMLElement,
  localTop: number,
): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'bc-pagination-table-flow-mask'
  element.setAttribute('contenteditable', 'false')
  element.setAttribute('aria-hidden', 'true')
  element.style.position = 'absolute'
  element.style.left = `${table.offsetLeft}px`
  element.style.top = `${localTop}px`
  element.style.width = `${table.offsetWidth}px`
  element.style.pointerEvents = 'none'
  element.style.userSelect = 'none'
  element.style.webkitUserSelect = 'none'
  element.style.zIndex = '90'
  applyPaginationGapStyle(
    element,
    mask.height,
    mask.backdropOffset,
    mask.backdropHeight,
  )
  return element
}

function shallowEqualNumberRecord(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(k => a[k] === b[k])
}

function elementContentWidth(element: HTMLElement): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  const paddingLeft = Number.parseFloat(style?.paddingLeft ?? '') || 0
  const paddingRight = Number.parseFloat(style?.paddingRight ?? '') || 0
  return Math.max(0, element.clientWidth - paddingLeft - paddingRight)
}

function equalTableColumnWidths(
  columnCount: number,
  containerWidth: number,
  minWidth: number,
  horizontalOverhead: number,
): number[] {
  const availableWidth = Math.max(
    columnCount * minWidth,
    Math.floor(containerWidth - Math.max(0, horizontalOverhead)),
  )
  const eachWidth = Math.floor(availableWidth / columnCount)
  const remainder = availableWidth - eachWidth * columnCount

  return Array.from(
    {length: columnCount},
    (_, index) => eachWidth + (index < remainder ? 1 : 0),
  )
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
  private _colResizeGesture: {
    anchorCellId: string
    startClientX: number
    startWidth: number
    width: number
    actualZoom: number
    boundaryClientX: number
    previewLine: HTMLElement
  } | null = null
  private _colResizeSubscriptions = new Subscription()
  /** 当前 overlay 手柄所代表的模型 cell 与实际分页 DOM 投影。 */
  private _columnResizeHandleAnchor: {
    cellId: string
    boundaryCell: HTMLTableCellElement
  } | null = null

  protected _startSelectingCell: TableCellBlockComponent | null = null
  protected _lastSelectingCell: TableCellBlockComponent | null = null
  private _pendingStart: TableCellBlockComponent | null = null

  private _selectedCellSet = new Set<TableCellBlockComponent>()

  private toolbarOvr?: OverlayRef
  private toolbarRef?: ComponentRef<TableStructureToolbarComponent>
  private _closeToolbar$ = new Subject()
  private readonly _tableMenuFrameIds = new Set<number>()

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
  // Drag intent is resolved against the cached model grid. Pointer hit-testing
  // still starts from a mounted <td>, but rectangle semantics never depend on
  // a complete table of row/cell ComponentRefs.
  private _dragModelGrid: TableModelGrid | null = null
  private _dragStartCoord: [number, number] | null = null
  /** 高频 pointermove 只保留本帧最后一个目标，避免跨过富文本子节点时重复投影矩形。 */
  private _pendingDragCell: TableCellBlockComponent | null = null
  private _dragSelectionFrame: number | null = null

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
    let rowsChanged = false
    for (const entry of entries) {
      // 分页占位行无 data-block-id，不进高度记录、不参与行栏对齐。
      if (isPaginationViewRow(entry.target)) continue
      const id = entry.target.getAttribute('data-block-id')
      if (!id) continue
      this._rowHeightsRecord[id] = entry.borderBoxSize[0].blockSize
      rowsChanged = true
      if (this._columnResizeHandleAnchor?.boundaryCell.closest('tr') === entry.target) {
        this._invalidateColumnResizeHandle()
      }
    }
    // A column insertion can resize every row in one observer delivery. One
    // OnPush invalidation covers the whole row bar; repeating it per entry only
    // amplifies large-table structural edits.
    if (rowsChanged) this.rowBarComponent.changeDetectionRef.markForCheck()
  })

  private mutationObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.addedNodes.length) {
        record.addedNodes.forEach(row => {
          if (isPaginationViewRow(row)) return // 占位行/表头克隆不观测（高度由分页层管理）
          this.resizeObserver.observe(row as HTMLElement, { box: "border-box" })
        })
      }
      if (record.removedNodes.length) {
        record.removedNodes.forEach(row => {
          if (isPaginationViewRow(row)) return
          this.resizeObserver.unobserve(row as HTMLElement)
        })
      }
    }
    if (this._columnResizeHandleAnchor?.boundaryCell.isConnected === false) {
      this._invalidateColumnResizeHandle()
    }
    this.rowBarComponent.changeDetectionRef.markForCheck()
  })

  /** 视图层分页断点：rowId → 该行上方需插入的页缝高度（px）。不写 Yjs、不进 Undo。 */
  protected _pageBreakGaps: Record<string, number> = {}
  /**
   * 上次重建占位行/续页表头克隆时的「视图结构签名」（列数 + 表头行 DOM）。占位行 colspan 和表头克隆是
   * **快照**，依赖列数与表头内容；这些变化不改页缝 gap，若只看 gapsChanged 重建会漏掉——加列后克隆/占位行
   * 仍是旧列数 → 错位。签名变化时强制重建。
   */
  private _pageBreakSig = ''
  /** 当前超高单元格投影；全部是可逆的零模型长度 DOM。 */
  private _cellFlowSig = ''
  private _cellFlowMarkers = new Set<HTMLElement>()
  private _cellFlowMasks = new Set<HTMLElement>()
  private _cellFlowRuntimes = new Set<object>()
  private _lastPaginationBreaks: TablePaginationBreak[] = []
  private _appliedPaginationBreakSig = ''
  private _appliedPaginationGrid: TableModelGrid | null = null
  private _nestedAtomicLocks = new Set<HTMLElement>()
  /** rowspan 结构只随 TableModelGrid 冷路径失效；分页重算不再反复构建 Component 矩阵。 */
  private _paginationRowspanCache: {
    grid: TableModelGrid
    spans: Array<{cellId: string; startRow: number; endRow: number}>
  } | null = null
  /**
   * 全屏是纯视图 overlay，不能让 fixed/padding/zoom 后的 DOM 尺寸污染分页 GeometryIndex。
   * 进入前保留最后一份普通流自然几何；全屏期间所有分页测量复用该快照。
   */
  private _normalFlowPaginationGeometry: TablePaginationGeometry | null = null
  private _releaseTablePaginationAccess = registerTablePaginationAccess(this, {
    measure: options => this._getPaginationGeometry(options),
    apply: breaks => this._applyPaginationBreaks(breaks),
    clear: () => this._applyPaginationBreaks([]),
  })
  /** 当前被分页拆分（视图层覆盖 rowspan/display）的单元格，供下一轮整体还原。 */
  private _splitCells = new Set<TableCellBlockComponent>()
  /**
   * 合并源单元格 → 其被 un-hide 的「续段」单元格（视图层跨页拆分产物）。
   * 用于把 `.selected` 高亮镜像到续段上：否则一个被拆到两页的合并单元格只有上半段
   * 高亮、下半段（续段）不亮，看起来「半选中」——违反「同一数据同一视觉」。纯视图态，
   * 每次 applyPaginationBreaks 重建。
   */
  private _continuationsOf = new Map<TableCellBlockComponent, TableCellBlockComponent[]>()


  /**
   * 全屏视图状态控制器。负责本地 CSS class / body 锁滚动 / Esc 退出 / IME 守卫 / 全局单例。
   * 状态不写入 Yjs，不进 Undo 历史。
   */
  private fullscreenController!: TableFullscreenController

  /** ChangeDetectorRef 用于全屏 toolbar 上 zoom 百分比 / disabled 状态的更新。 */
  private readonly cdrLocal = inject(ChangeDetectorRef)

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.fullscreenController = new TableFullscreenController(
      this.hostElement,
      () => this.doc.scrollContainer,
      () => this.doc.viewScale?.value ?? 1,
    )
    // 进入/退出全屏：
    //  1. 销毁任何 CDK Overlay 形式的结构工具栏（普通态 → 全屏：切换到模板内联渲染；
    //     全屏 → 普通态：丢弃可能残留的 inline，等 _showTableMenuOverlay 重建 CDK 版）
    //  2. 触发模板 CD 让 @if (isFullscreen) 块显隐切换
    //  3. 根据当前选区重新触发 menu 状态同步，保证切换后 toolbar 立即可见
    this.fullscreenController.state$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(isFullscreen => {
        // state$ 在 controller 完成 class/zoom 切换后发出。退出时立即放开快照，
        // 后续 ResizeObserver 只需提交一次真实普通流几何。
        if (!isFullscreen) this._normalFlowPaginationGeometry = null
        this._disposeToolbar()
        this.cdrLocal.markForCheck()
        Promise.resolve().then(() => this.refreshTableMenuFromSelection())
      })
    // 缩放变化时直接写 CSS zoom（OnPush 下绕过 CD），并触发模板 CD（百分比刷新）
    this.fullscreenController.zoom$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(z => {
        if (this._colResizeGesture) this._finishColumnResize(false)
        if (this.tableWrapper?.nativeElement) {
          this.tableWrapper.nativeElement.style.zoom = String(z)
        }
        this._invalidateColumnResizeHandle()
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
    // The idle mousemove stream runs OUTSIDE Angular's zone. `mouseover` is not
    // reliable after pagination projection/reparenting: the pointer can already
    // be over the same hit target when the table view is rebuilt, so no new
    // enter/over event is emitted and the template-owned resize handle remains
    // orphaned on the table host. Mouse movement repairs that ownership. The
    // fast path below performs only closest()/identity checks and no layout read.
    fromEvent<MouseEvent>(this.hostElement, 'mousedown', { capture: true })
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(e => this._handleNativeMouseDown(e))
    this.doc.ngZone.runOutsideAngular(() => {
      fromEvent<MouseEvent>(this.hostElement, 'mousemove')
        .pipe(takeUntil(this.onDestroy$))
        .subscribe(e => this._handleIdleCellMouseMove(e))
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
    this._finishColumnResize(false)
    this._cancelPendingDragSelection()
    this._releaseTablePaginationAccess()
    this._releaseTablePaginationAccess = () => undefined
    this._cancelTableMenuFrames()
    this._clearCellFlowProjection()
    this._clearNestedAtomicLocks()
    this.tableBody?.querySelectorAll(':scope > tr.bc-pagination-spacer, :scope > tr.bc-pagination-header-clone').forEach(el => el.remove())
    this._clearCellOverrides()
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
    if (!this.isFullscreen) this._captureNormalFlowPaginationGeometry()
    this.fullscreenController?.toggle()
  }

  /** 显式设置全屏视图状态。 */
  setFullscreen(value: boolean): void {
    if (value && !this.isFullscreen) this._captureNormalFlowPaginationGeometry()
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

    const normalizedMinWidth = Math.max(1, Math.ceil(minWidth))
    const containerWidth = this._getParentContentWidth()
      || this.tableScrollable?.nativeElement?.clientWidth
      || this.hostElement.clientWidth
      || this.colLength * normalizedMinWidth
    const overhead = this._getTableHorizontalOverhead()
    const nextWidths = equalTableColumnWidths(
      this.colLength,
      containerWidth,
      normalizedMinWidth,
      overhead,
    )

    this.updateProps({
      colWidths: nextWidths
    })

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
    this._cancelPendingDragSelection()
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
    this._dragModelGrid = null
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

  private _closestCellElement(event: Event): HTMLTableCellElement | undefined {
    const target = event.target
    if (!(target instanceof Node)) return undefined
    const ele = target instanceof HTMLElement ? target : target.parentElement
    if (!ele) return undefined
    return ele.closest<HTMLTableCellElement>('td') ?? undefined
  }

  private _closetCell(event: Event) {
    const closestCell = this._closestCellElement(event)
    return this._modelCellIdFromElement(closestCell)
  }

  /**
   * 分页续段使用 master cell ID；普通单元格使用自己的 block ID。
   * 这里只解析 DOM 投影身份，不要求对应组件仍挂载。
   */
  private _modelCellIdFromElement(cell: Element | null | undefined): string | undefined {
    return cell?.getAttribute(PG_CONTINUATION_MASTER_ATTR)
      ?? cell?.getAttribute('data-block-id')
      ?? undefined
  }

  // Armed at capture-phase native mousedown on the table host. Native
  // listeners (not the framework dispatcher) so routing can't swallow events.
  private _handleNativeMouseDown(evt: MouseEvent) {
    // Only react to primary (left) button. On Mac WebView / Safari the
    // trackpad's two-finger tap and force-touch can dispatch button=2
    // mousedown during an active left-button drag; on Chrome a stray
    // right-click can do the same. Letting those into `_clearSelectionUiState`
    // would null `_startSelectingCell` while the visual lockdown class stays
    // on the table host — locking the entire table as read-only.
    if (evt.button !== 0) return

    // Resize owns the gesture at the table's capture boundary. This check must
    // run before pagination masks and rectangle-selection arming: the handle is
    // rendered inside a cell and can overlap a cell-flow mask, while its target
    // phase is too late to stop root/table capture listeners that already ran.
    const resizeAnchor = this._resolveColumnResizePointerAnchor(evt)
    if (resizeAnchor) {
      this.onColResizerMousedown(evt, resizeAnchor)
      evt.stopImmediatePropagation()
      return
    }

    if (this._isInsideCellFlowMask(evt.clientX, evt.clientY)) {
      evt.preventDefault()
      evt.stopImmediatePropagation()
      return
    }
    const hitCell = this._closestCellElement(evt)
    const continuationMasterId = hitCell?.getAttribute(PG_CONTINUATION_MASTER_ATTR)
    const id = continuationMasterId ?? hitCell?.getAttribute('data-block-id')
    if (!id) return
    const cell = this.doc.getBlockById(id) as TableCellBlockComponent
    if (!cell) return

    // 续页片段没有独立的可编辑模型内容，只是 master cell 的视觉接续。
    // 让它参与 hit-test，并在 table capture 阶段阻止事件进入占位 cell 的
    // contenteditable 子树；否则 pointer-events:none 会让 mousedown 落到 tr/table，
    // 整条表格手势未被武装，浏览器随后的拖动就会创建原生文本 Range。
    const startsFromContinuation = continuationMasterId !== null
      && continuationMasterId !== undefined
    if (startsFromContinuation) {
      evt.preventDefault()
      evt.stopPropagation()
    }

    this._clearSelectionUiState()
    this._pendingStart = cell

    // Resolve the model projection once for this gesture. Subsequent pointer
    // crossings are Map/array lookups and do not rebuild a Component matrix.
    this._dragModelGrid = this._getTableModelGrid()
    const startCoordinate = this._dragModelGrid?.getCellCoordinate(cell.id)
    this._dragStartCoord = startCoordinate
      ? [startCoordinate[0], startCoordinate[1]]
      : null

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

    // Native text selection can suppress/retarget mouseover + mouseleave in
    // WebKit (and in Chromium when the drag crosses pagination projection
    // nodes). Keep one window-level move listener for this gesture only. It
    // runs outside Angular, promotes the pending cell drag on the first real
    // cell crossing, and is removed synchronously on release.
    const dragMoveEvent = typeof PointerEvent === 'undefined'
      ? 'mousemove'
      : 'pointermove'
    const ownerWindow = this.hostElement.ownerDocument.defaultView ?? window
    const dragMoveSub = this.doc.ngZone.runOutsideAngular(() =>
      fromEvent<MouseEvent>(ownerWindow, dragMoveEvent, {
        capture: true,
        passive: false,
      }).pipe(takeUntil(this.onDestroy$)).subscribe(event => {
        this._handleNativeCellDragMove(event)
      }))

    // Safari may publish another native Range after the initial blur while
    // the primary button is still down. Guard selectionchange only for the
    // lifetime of this gesture; idle tables pay no document-listener cost.
    const nativeSelectionSub = this.doc.ngZone.runOutsideAngular(() =>
      fromEvent(
        this.hostElement.ownerDocument,
        'selectionchange',
      ).pipe(takeUntil(this.onDestroy$)).subscribe(() => {
        this._clearNativeSelectionWhileCellDragging()
      }))

    // selectionchange 是事后通知；WebKit 有时会先扩展并绘制一帧 Range。
    // 跨格拖拽一旦晋升为模型选区，就在 capture 阶段直接阻止后续 selectstart。
    const nativeSelectStartSub = this.doc.ngZone.runOutsideAngular(() =>
      fromEvent<Event>(
        this.hostElement.ownerDocument,
        'selectstart',
        {capture: true, passive: false},
      ).pipe(takeUntil(this.onDestroy$)).subscribe(event => {
        if (!this._startSelectingCell) return
        if (event.cancelable) event.preventDefault()
        this._clearNativeSelectionWhileCellDragging()
      }))

    let finished = false
    const finishSelection = () => {
      if (finished) return
      finished = true
      origin.hostElement.removeEventListener('mouseleave', onOriginLeave)
      dragMoveSub.unsubscribe()
      nativeSelectionSub.unsubscribe()
      nativeSelectStartSub.unsubscribe()
      releaseSub.unsubscribe()
      this.onEndSelect()
    }

    // Release on primary button only. Right/middle-button up events fired
    // while the user is still holding left would otherwise terminate the
    // drag prematurely. Touchend has no button and always passes through.
    const isPrimaryRelease = (e: PointerEvent | MouseEvent) => e.button === 0
    const releaseSub = merge(
      // 手势由 mousedown 启动，鼠标路径必须等兼容 mouseup 才能撤销守卫。
      // pointerup 更早到达；若在那时结束，随后的 mouseup 默认动作仍可重建文本 Range。
      fromEvent<MouseEvent>(ownerWindow, 'mouseup', { capture: true }).pipe(filter(isPrimaryRelease)),
      fromEvent<TouchEvent>(ownerWindow, 'touchend', { capture: true }),
      fromEvent<PointerEvent>(ownerWindow, 'pointercancel', { capture: true }),
    ).pipe(takeUntil(this.onDestroy$)).subscribe(event => {
      // Prevent the browser's release default from restoring the text Range
      // after `onEndSelect` commits the model-owned table-cell selection.
      if (this._startSelectingCell) {
        if (event.cancelable) event.preventDefault()
        // 必须在 onEndSelect 把 `_startSelectingCell` 置空前清理，并同步消费
        // 本帧最后一个目标，避免快速甩动时 head 落后一格。
        this._clearNativeSelectionWhileCellDragging()
        this._flushPendingDragSelection()
      }
      finishSelection()
    })

    // 普通 cell 仍允许同格内的原生文本选择，跨格后再晋升为矩形选区；
    // 续页片段本身不可编辑，因此按下时立即由模型选区接管，彻底关闭原生 Range 窗口。
    if (startsFromContinuation) this._startCellSelection(origin)
  }

  private _handleNativeCellDragMove(evt: MouseEvent): void {
    if ((evt.buttons & 1) !== 1) return

    // 同一 cell 内的 pointermove 占绝大多数。先做无布局的 id 判断，避免每帧
    // 进入 `_isInsideCellFlowMask()` 读取所有分页 mask 的 BCR。
    const id = this._closetCell(evt)
    if (!id || id !== this.hoveringCell?.id) this._handleNativeMouseOver(evt)
    if (!this._startSelectingCell) return

    // Once the gesture has crossed a cell boundary, the table model owns the
    // selection. Cancel native Range growth before the browser's default
    // action and clear any Range that WebKit created earlier in the gesture.
    if (evt.cancelable) evt.preventDefault()
    this._clearNativeSelectionWhileCellDragging()
  }

  private _clearNativeSelectionWhileCellDragging(): void {
    if (!this._startSelectingCell) return
    const nativeSelection = this.hostElement.ownerDocument.getSelection()
    if (!nativeSelection?.rangeCount) return

    const wasSuppressingFocusSync = this._suppressFocusSync
    this._suppressFocusSync = true
    try {
      this.doc.selection.blur()
    } finally {
      this._suppressFocusSync = wasSuppressingFocusSync
    }
  }

  private _handleIdleCellMouseMove(evt: MouseEvent): void {
    // Active primary-button gestures have their own document-level move path:
    // resize updates the guide, rectangle selection updates its model head.
    if ((evt.buttons & 1) === 1 || this.resizingCol$.value) return
    const hitCellElement = this._closestCellElement(evt)
    const id = this._modelCellIdFromElement(hitCellElement)
    const barCellElement = this._columnResizeHandleAnchor?.boundaryCell
    if (id && hitCellElement && this.hoveringCell?.id === id
      && barCellElement === hitCellElement) {
      return
    }
    this._handleNativeMouseOver(evt)
  }

  private _handleNativeMouseOver(evt: MouseEvent) {
    if (this._isInsideCellFlowMask(evt.clientX, evt.clientY)) return
    // 列宽拖拽期间命中目标固定在手势起点；mousemove 只移动预览线。
    // 不更新 hoveringCell，避免松手后 resize bar 的 DOM 归属与内部状态错位。
    if (this.resizingCol$.value) return
    const rawHitCellElement = this._closestCellElement(evt)
    const hitCellElement = rawHitCellElement
      ? this._resolveCellLeftOfBoundaryHit(evt, rawHitCellElement)
        ?? rawHitCellElement
      : undefined
    const id = this._modelCellIdFromElement(hitCellElement)
    if (!id || !hitCellElement) return
    const barElement = this.colResizeBar.nativeElement
    const barCellElement = this._columnResizeHandleAnchor?.boundaryCell

    // 同一个 model cell 可能有多个分页 DOM 投影（master + continuation）。
    // 只有模型身份和实际 DOM 归属都相同才短路；否则分页重绘把 bar 放回
    // table host 后，旧 hoveringCell 会让这里永远无法重新挂载手柄。
    if (this.hoveringCell?.id === id && barCellElement === hitCellElement) return

    // 模型目标变化时再解析组件；同一模型 cell 的分页投影切换只需移动 bar，
    // 不重复执行 getBlockById。
    if (this.hoveringCell?.id !== id) {
      const hoveringCell = this.doc.getBlockById(id) as TableCellBlockComponent | null
      if (!hoveringCell) return
      this.hoveringCell = hoveringCell
    }

    // 手柄必须是 table-wrapper 的独立 overlay，不能 append 到 td。WebKit 的
    // collapsed-border painting layer 会让相邻 td 覆盖 cell 内的绝对定位子元素，
    // 造成视觉线存在、事件 target 却落在右侧 cell。这里只在 hover 投影变化时
    // 读取一次 BCR，并复用现有 zoom 语义换算；mousemove 同格快路径不读布局。
    if (!this.resizingCol$.value && !this._startSelectingCell) {
      this._positionColumnResizeHandle(id, hitCellElement)
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
    this._queueDragSelection(this.hoveringCell)
  }

  private _queueDragSelection(cell: TableCellBlockComponent): void {
    this._pendingDragCell = cell
    if (this._dragSelectionFrame !== null) return
    const view = this.hostElement.ownerDocument.defaultView
    const callback = () => {
      this._dragSelectionFrame = null
      this._flushPendingDragSelection()
    }
    this._dragSelectionFrame = view
      ? view.requestAnimationFrame(callback)
      : requestAnimationFrame(callback)
  }

  private _flushPendingDragSelection(): void {
    if (this._dragSelectionFrame !== null) {
      const view = this.hostElement.ownerDocument.defaultView
      if (view) view.cancelAnimationFrame(this._dragSelectionFrame)
      else cancelAnimationFrame(this._dragSelectionFrame)
      this._dragSelectionFrame = null
    }
    const cell = this._pendingDragCell
    this._pendingDragCell = null
    if (!this._startSelectingCell || !cell) return
    if ((!this._lastSelectingCell && cell.id === this._startSelectingCell.id)
      || cell.id === this._lastSelectingCell?.id) return
    this._lastSelectingCell = cell
    this._setRectangleSelected()
  }

  private _cancelPendingDragSelection(): void {
    if (this._dragSelectionFrame !== null) {
      const view = this.hostElement?.ownerDocument?.defaultView
      if (view) view.cancelAnimationFrame(this._dragSelectionFrame)
      else cancelAnimationFrame(this._dragSelectionFrame)
    }
    this._dragSelectionFrame = null
    this._pendingDragCell = null
  }

  private _isInsideCellFlowMask(clientX: number, clientY: number): boolean {
    for (const mask of this._cellFlowMasks) {
      const rect = mask.getBoundingClientRect()
      if (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      ) {
        return true
      }
    }
    return false
  }

  private _startCellSelection(cell: TableCellBlockComponent) {
    if (this._startSelectingCell) return
    // Apply visual state FIRST so the cell is already highlighted before we
    // touch the native selection. If we blur first, there's a flash where the
    // text cursor disappears but the 'selected' class hasn't painted yet.
    this._startSelectingCell = cell
    this._pendingStart = null
    // The normal mousedown path preloads the model grid. Non-standard
    // promotion paths rebuild it lazily without reading row/cell components.
    if (!this._dragModelGrid) {
      this._dragModelGrid = this._getTableModelGrid()
      const coordinate = this._dragModelGrid?.getCellCoordinate(cell.id)
      this._dragStartCoord = coordinate
        ? [coordinate[0], coordinate[1]]
        : null
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
    this._flushPendingDragSelection()
    this._pendingStart = null
    // Defence-in-depth: always clear the lockdown class on drag-end, even if
    // the state machine got desynced. `_clearSelectionUiState` also clears it,
    // but if onEndSelect is reached via a stale releaseSub closure whose
    // `_startSelectingCell` was nulled elsewhere, the early-return below would
    // otherwise leave the class on.
    this.hostElement.classList.remove('is-selecting-cell')
    this._dragModelGrid = null
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
    this._toggleCellSelected(cell, true)
  }

  protected _clearSelected() {
    this._selectedCellSet.forEach(cell => this._toggleCellSelected(cell, false))
    this._selectedCellSet.clear()
  }

  /**
   * 给单元格加/去 `.selected`，并把同样状态镜像到它的分页续段单元格上。
   * 续段是模型里 display:none、被分页 un-hide 的视觉接续；若不镜像，跨页合并单元格
   * 只会高亮上半段。选区坐标仍只认模型（master cell），续段纯做视觉同步。
   */
  private _toggleCellSelected(cell: TableCellBlockComponent, on: boolean): void {
    cell.hostElement?.classList.toggle(TABLE_CELL_SELECTED_CLASS, on)
    const conts = this._continuationsOf?.get(cell)
    if (conts) {
      for (const continuation of conts) {
        continuation.hostElement?.classList.toggle(TABLE_CELL_SELECTED_CLASS, on)
      }
    }
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

    const previous = this._prevAdjustedSelection
    this._prevAdjustedSelection = selection
    const nextRectangle: TableModelRectangle = {
      start: [start[0], start[1]],
      end: [end[0], end[1]],
    }
    const grid = this._dragModelGrid ?? this._getTableModelGrid()
    if (previous && grid) {
      this._applyRectangleSelectionDiff(
        grid,
        {start: [previous.start[0], previous.start[1]], end: [previous.end[0], previous.end[1]]},
        nextRectangle,
      )
      return
    }
    this._applySelectedDiff(this._getMountedCellsByRectangle(nextRectangle))
  }

  // Apply a new selected-cell set by diff'ing against the current one — only
  // touch classList on cells that actually changed state. The previous
  // implementation cleared every cell and re-added all of them on every
  // mouseover, producing O(prev + curr) DOM writes per cell-boundary crossing.
  private _applySelectedDiff(nextCells: Set<TableCellBlockComponent>) {
    this._selectedCellSet.forEach(cell => {
      if (!nextCells.has(cell)) {
        this._toggleCellSelected(cell, false)
      }
    })
    nextCells.forEach(cell => {
      if (!this._selectedCellSet.has(cell)) {
        this._toggleCellSelected(cell, true)
      }
    })
    this._selectedCellSet = nextCells
  }

  /**
   * 两个闭包安全矩形之间只处理变化的边条。向 100×100 选区再扩一列时，
   * 从重新扫描 10,000 个坐标降为只访问新增的 100 个坐标。
   */
  private _applyRectangleSelectionDiff(
    grid: TableModelGrid,
    previous: TableModelRectangle,
    next: TableModelRectangle,
  ): void {
    const removedIds = this._masterIdsInRectangleDifference(grid, previous, next)
    const addedIds = this._masterIdsInRectangleDifference(grid, next, previous)

    for (const cellId of removedIds) {
      const cell = this._getLiveBlockById<TableCellBlockComponent>(cellId)
      if (!this._isTableCellBlock(cell) || !this._selectedCellSet.delete(cell)) continue
      this._toggleCellSelected(cell, false)
    }
    for (const cellId of addedIds) {
      if (typeof this.doc.vm?.isMounted === 'function' && !this.doc.vm.isMounted(cellId)) continue
      const cell = this._getLiveBlockById<TableCellBlockComponent>(cellId)
      if (!this._isTableCellBlock(cell) || this._selectedCellSet.has(cell)) continue
      this._selectedCellSet.add(cell)
      this._toggleCellSelected(cell, true)
    }
  }

  private _masterIdsInRectangleDifference(
    grid: TableModelGrid,
    source: TableModelRectangle,
    subtract: TableModelRectangle,
  ): Set<string> {
    const result = new Set<string>()
    const visit = (startRow: number, endRow: number, startCol: number, endCol: number) => {
      if (startRow > endRow || startCol > endCol) return
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cellId = grid.getMasterCellIdAt(row, col)
          if (cellId) result.add(cellId)
        }
      }
    }

    const top = Math.max(source.start[0], subtract.start[0])
    const left = Math.max(source.start[1], subtract.start[1])
    const bottom = Math.min(source.end[0], subtract.end[0])
    const right = Math.min(source.end[1], subtract.end[1])
    if (top > bottom || left > right) {
      visit(source.start[0], source.end[0], source.start[1], source.end[1])
      return result
    }

    visit(source.start[0], top - 1, source.start[1], source.end[1])
    visit(bottom + 1, source.end[0], source.start[1], source.end[1])
    visit(top, bottom, source.start[1], left - 1)
    visit(top, bottom, right + 1, source.end[1])
    return result
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

    // Hot path: model coordinates are stable-ID lookups and remain valid even
    // when future row virtualization leaves intermediate rows unmounted.
    const grid = this._dragModelGrid ?? this._getTableModelGrid()
    if (grid && this._dragStartCoord) {
      const startCoordinate = this._dragStartCoord
      if (startCell === endCell) {
        return { start: startCoordinate, end: startCoordinate }
      }
      const endCoordinate = grid.getCellCoordinate(endCell.id)
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
    const grid = this._dragModelGrid ?? this._getTableModelGrid()
    const adjusted = grid?.adjustSelection(
      [start[0], start[1]],
      [end[0], end[1]],
    )
    if (adjusted) {
      return {
        start: [...adjusted.start],
        end: [...adjusted.end],
      }
    }
    const rect = new RectangleSelection(start[0], start[1], end[0], end[1])
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

  private _getTableModelGrid(): TableModelGrid | null {
    try {
      const grid = getTableModelProjection(this.doc, this.id).grid
      return grid.isValid ? grid : null
    } catch {
      return null
    }
  }

  /**
   * 列宽手势只需要目标 cell 当前覆盖的右边界。直接从 model graph 读取它所在
   * 的 row、物理下标与 colspan，复杂度只与列数有关；不能为了拖一条边界同步
   * 构建整张长表的严格投影。严格投影不可用时（例如协同历史表里有其他位置的
   * 孤立 hidden cell）也不应阻断当前这个合法边界。
   */
  private _resolveColumnResizeIndex(cellId: string): number | null {
    const widths = this.props.colWidths ?? []
    if (!widths.length) return null

    try {
      const model = this.doc.model
      if (
        typeof model?.getParentId === 'function'
        && typeof model.getChildrenIds === 'function'
        && typeof model.getFlavour === 'function'
        && typeof model.getProps === 'function'
      ) {
        const rowId = model.getParentId(cellId)
        const tableId = rowId ? model.getParentId(rowId) : null
        if (
          rowId
          && tableId === this.id
          && model.getFlavour(rowId) === 'table-row'
          && model.getFlavour(cellId) === 'table-cell'
        ) {
          const physicalIndex = model.getChildrenIds(rowId).indexOf(cellId)
          if (physicalIndex >= 0) {
            const rawColspan = model.getProps(cellId)?.['colspan']
            const colspan = typeof rawColspan === 'number'
              && Number.isInteger(rawColspan)
              && rawColspan > 0
              ? rawColspan
              : 1
            const boundaryIndex = physicalIndex + colspan - 1
            return boundaryIndex >= 0 && boundaryIndex < widths.length
              ? boundaryIndex
              : null
          }
        }
      }
    } catch {
      // Continue with the projection fallback below. Parent ownership can be
      // briefly unavailable while a remote structure transaction is settling.
    }

    // A legacy/corrupted parent edge can make the O(columns) lookup fail while
    // the table's row order still projects this cell unambiguously. Use the
    // diagnostic grid's conservative span even when some unrelated cell makes
    // the whole grid invalid. This is a cold recovery path, not the normal
    // mousedown path.
    try {
      const boundaryIndex = getTableModelProjection(this.doc, this.id)
        .grid
        .getSpan(cellId)
        ?.end[1]
      if (
        boundaryIndex !== undefined
        && boundaryIndex >= 0
        && boundaryIndex < widths.length
      ) {
        return boundaryIndex
      }
    } catch {
      // Compatibility for minimal test Docs without BlockModelGraph.
    }
    return this._getTableModelGrid()?.getSpan(cellId)?.end[1] ?? null
  }

  private _getMountedCellsByRectangle(
    rectangle: TableModelRectangle,
  ): Set<TableCellBlockComponent> {
    const grid = this._dragModelGrid ?? this._getTableModelGrid()
    if (!grid) {
      return new Set(this.getCellsMatrixByCoordinates(
        [...rectangle.start],
        [...rectangle.end],
      ).flat(1))
    }

    const cells = new Set<TableCellBlockComponent>()
    for (const cellId of grid.getMasterCellIds(rectangle)) {
      if (typeof this.doc.vm?.isMounted === 'function' && !this.doc.vm.isMounted(cellId)) {
        continue
      }
      const cell = this._getLiveBlockById<TableCellBlockComponent>(cellId)
      if (this._isTableCellBlock(cell)) cells.add(cell)
    }
    return cells
  }

  private _isTableCellBlock(block: unknown): block is TableCellBlockComponent {
    return !!block
      && (block as BlockCraft.BlockComponent).flavour === 'table-cell'
      && typeof (block as TableCellBlockComponent).getIndexOfParent === 'function'
  }

  private _getCellCoordinate(cell: TableCellBlockComponent | null | undefined) {
    if (!this._isTableCellBlock(cell)) return null
    const coordinate = this._getTableModelGrid()?.getCellCoordinate(cell.id)
    if (coordinate) return {rowIdx: coordinate[0], colIdx: coordinate[1]}
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

    const grid = this._getTableModelGrid()
    if (grid) {
      const target = resolveTableCellSelectionTarget(this.doc, tableCellSelection)
      if (!target) return false
      const adjusted = target.rectangle
      const anchorCell = this._getLiveBlockById<TableCellBlockComponent>(target.anchorCellId)

      this._clearActiveRanges()
      this._activeCellsRange = {
        start: [adjusted.start[0], adjusted.start[1]],
        end: [adjusted.end[0], adjusted.end[1]],
        anchorId: target.anchorCellId,
      }
      this._applySelectedDiff(this._getMountedCellsByRectangle(adjusted))
      this._syncHandleVisibility(this._isTableCellBlock(anchorCell) ? anchorCell : null)

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
    if (!this._isTableUiLive()) {
      this._disposeToolbar()
      return
    }
    if (this.isReadonly) {
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
    this._cancelTableMenuFrames()
    this._scheduleTableMenuFrame(() => {
      this._scheduleTableMenuFrame(() => {
        this._showTableMenuOverlay()
      })
    })
  }

  private _hideTableMenu() {
    this._cancelTableMenuFrames()
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
    if (this.isReadonly) {
      this._hideTableMenu()
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
    if (this._isGone()) return
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
    if (!this._isTableUiLive()) {
      this._disposeToolbar()
      return
    }
    if (this.isReadonly || !this._tableMenu.visible || !this.tableMenuAnchor) {
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
      this._scheduleTableMenuFrame(() => {
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

  private _isTableUiLive(): boolean {
    return this.hostElement.isConnected && this.doc.model.exists(this.id)
  }

  private _scheduleTableMenuFrame(callback: () => void): void {
    const frameId = requestAnimationFrame(() => {
      this._tableMenuFrameIds.delete(frameId)
      callback()
    })
    this._tableMenuFrameIds.add(frameId)
  }

  private _cancelTableMenuFrames(): void {
    this._tableMenuFrameIds.forEach(frameId => cancelAnimationFrame(frameId))
    this._tableMenuFrameIds.clear()
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
    const fullscreenZoom = this.fullscreenController?.zoom$.value ?? 1
    const documentZoom = this.doc.viewScale?.value ?? 1
    // FullscreenController cancels the host document zoom on the fixed table host,
    // so only the table-local zoom remains in the visual coordinate system.
    return this.fullscreenController?.isFullscreen
      ? fullscreenZoom
      : documentZoom
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
    if (this.isReadonly) return
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
    // 排除分页占位行——行 reorder / 选区 / 几何只认真实数据行。
    return Array.from(this.tableBody.querySelectorAll(':scope > tr:not(.bc-pagination-spacer):not(.bc-pagination-header-clone)')) as HTMLElement[]
  }

  // ───────── 分页协作 API（仅屏幕分页子系统调用；普通态 _pageBreakGaps 为空、零行为变化）─────────

  /**
   * 返回表格的「自然」几何（排除已施加的分页占位行高度），供分页引擎测量与定位行切点。
   * - `naturalHeight`：host border-box 高度减去所有占位行高度。
   * - `rows`：每行 host 相对 table host 顶的自然 top/bottom（已扣除其上方累计占位高度）。
   *
   * **测量反馈环防护**：占位行（spacer/clone）的影响由 accGap 扣掉，但**合并单元格跨页拆分**的视图覆盖
   * （`_splitMergedCellsAtBreaks` 把 master rowspan 缩小、un-hide 续段）会真实改变**行高分配**——被拆合并
   * 单元格的内容塞进首段、首段那几行被撑高，于是测到的行几何**依赖当前拆分结果** → 拆分→行高变→引擎选
   * 不同切点→重拆→…… 疯狂重算抖动（content 高过行 span 时尤甚）。因此当存在 active 拆分覆盖（`_splitCells`）
   * 时，先把分页视图态整体清掉、量「真·自然几何」（合并单元格完整、无占位行），量完**恢复原拆分态**
   * （pure，无净副作用，打印测量路径同样安全）——使引擎输入与当前拆分无关、稳定收敛。
   */
  getPaginationGeometry(): {
    naturalHeight: number
    headerHeight: number
    rows: Array<{ id: string; top: number; bottom: number; coveredFromAbove: boolean; coveredByContentMerge: boolean }>
  } {
    const geometry = this._getPaginationGeometry()
    return {
      naturalHeight: geometry.naturalHeight,
      headerHeight: geometry.headerHeight,
      rows: geometry.rows.map(row => ({
        ...row,
        coveredByContentMerge: row.coveredByContentMerge ?? false,
      })),
    }
  }

  private _getPaginationGeometry(
    options?: TablePaginationMeasureOptions,
  ): TablePaginationGeometry {
    // 全屏 DOM 的 fixed box、64px padding 和用户 zoom 都不是文档流几何。
    // 若把它们送进分页引擎，退出时会先恢复分页投影、再恢复 viewport anchor，
    // 与虚拟化自己的 anchor transaction 形成多帧互相修正。
    if (this.fullscreenController?.isFullscreen && this._normalFlowPaginationGeometry) {
      return this._normalFlowPaginationGeometry
    }

    const geometry = this._measurePaginationGeometryWithoutFullscreen(options)
    if (!this.fullscreenController?.isFullscreen) {
      this._normalFlowPaginationGeometry = geometry
    }
    return geometry
  }

  private _captureNormalFlowPaginationGeometry(): void {
    if (this._normalFlowPaginationGeometry || !this.hostElement?.isConnected) return
    this._normalFlowPaginationGeometry = this._measurePaginationGeometryWithoutFullscreen()
  }

  private _measurePaginationGeometryWithoutFullscreen(
    options?: TablePaginationMeasureOptions,
  ): TablePaginationGeometry {
    if (
      this._splitCells.size > 0
      || this._cellFlowMarkers.size > 0
      || this._cellFlowMasks.size > 0
    ) {
      const snapshot = [...this._lastPaginationBreaks]
      this._applyPaginationBreaks([]) // 清空：合并单元格还原成整体、移除占位行/续页表头克隆
      try {
        return this._measureNaturalGeometry(options)
      } finally {
        this._applyPaginationBreaks(snapshot) // 恢复拆分态（含 spacer/clone/续段高亮镜像）
      }
    }
    return this._measureNaturalGeometry(options)
  }

  private _measureNaturalGeometry(options?: {
    contentHeight: number
    widowOrphanLines: number
  }, nestedLocksSettled = false): {
    naturalHeight: number
    headerHeight: number
    rows: Array<{ id: string; top: number; bottom: number; coveredFromAbove: boolean; coveredByContentMerge: boolean }>
    cellFlowPlan?: TableCellFlowPlan
  } {
    const host = this.hostElement
    const hostTop = host.getBoundingClientRect().top
    const rowBlocks = this.getChildrenBlocks()

    // 逐行判定「是否被上方 rowspan 覆盖」：边界被合并单元格跨越则不可在此切（否则会腰斩合并单元格）。
    // 并区分覆盖它的合并单元格**有没有内容**：带内容的合并单元格无法跨页拆（内容流不进空续段、必溢出），
    // 这类边界连 splitOffsets 都不收 → keep-together；空合并单元格仍可拆。
    const {covered, coveredByContent} = this._getPaginationRowCoverage(rowBlocks)

    // 表头高（rowHead 时 = 首行自然 border-box 高）；无表头为 0。供引擎预留续页重复表头空间。
    const rowHead = this.props.rowHead && rowBlocks.length > 0
    const headerHeight = rowHead ? (rowBlocks[0]?.hostElement?.offsetHeight ?? 0) : 0

    // 按 DOM 顺序遍历 tbody 的 <tr>：累计「视图行」（占位行 + 续页表头克隆）的**实际**高度作为 accGap，
    // 数据行的自然 top/bottom = DOM 位置 − accGap。用实际渲染高（而非估算）保证自然几何稳定、不形成测量反馈环
    // （估算与克隆实际高有几像素差时，切点会漂移 → computeTableBreaks 的 2px 匹配失败 → 断点反复加/删抖动）。
    const rows: Array<{ id: string; top: number; bottom: number; coveredFromAbove: boolean; coveredByContentMerge: boolean }> = []
    let accGap = 0
    let dataIdx = 0
    const trList = this.tableBody
      ? Array.from(this.tableBody.querySelectorAll(':scope > tr')) as HTMLElement[]
      : []
    for (const tr of trList) {
      if (isPaginationViewRow(tr)) { accGap += tr.offsetHeight; continue }
      const r = tr.getBoundingClientRect()
      rows.push({
        id: rowBlocks[dataIdx]?.id ?? (tr.getAttribute('data-block-id') ?? ''),
        top: r.top - hostTop - accGap,
        bottom: r.bottom - hostTop - accGap,
        coveredFromAbove: covered[dataIdx] ?? false,
        coveredByContentMerge: coveredByContent[dataIdx] ?? false,
      })
      dataIdx++
    }
    const refinedContentCoverage = this._refinePaginationContentMergeCoverage(
      rows,
      coveredByContent,
      hostTop,
    )
    rows.forEach((row, index) => {
      row.coveredByContentMerge = refinedContentCoverage[index] ?? false
    })
    const naturalHeight = host.offsetHeight - accGap
    if (options && naturalHeight > options.contentHeight) {
      const oversizedRows: BlockCraft.BlockComponent[] = []
      let previousBottom = 0
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]
        if (row.bottom - previousBottom > options.contentHeight && rowBlocks[index]) {
          oversizedRows.push(rowBlocks[index])
        }
        previousBottom = row.bottom
      }
      // 普通大表的每一行都远小于一页，不应为了极少见的巨大媒体/原子子块
      // 扫描所有 cell 并触发布局读取。只有已经超页的候选行才需要做局部锁高。
      // 若锁高改变了行几何，只额外测量一次稳定后的自然布局。
      const locksChanged = this._syncNestedAtomicLocks(
        options.contentHeight,
        oversizedRows,
      )
      if (locksChanged && !nestedLocksSettled) {
        return this._measureNaturalGeometry(options, true)
      }
    }
    const cellFlowPlan = options && naturalHeight > options.contentHeight
      ? this._buildCellFlowPlan(
          rows,
          rowBlocks,
          naturalHeight,
          hostTop,
          options,
        )
      : undefined
    return { naturalHeight, headerHeight, rows, cellFlowPlan }
  }

  private _getPaginationRowCoverage(rowBlocks: BlockCraft.BlockComponent[]): {
    covered: boolean[]
    coveredByContent: boolean[]
  } {
    const rowCount = rowBlocks.length
    const covered = new Array<boolean>(rowCount).fill(false)
    const coveredByContent = new Array<boolean>(rowCount).fill(false)
    const grid = this._getTableModelGrid()
    if (!grid) {
      const colCount = this.colLength
      if (colCount <= 0) return {covered, coveredByContent}
      const matrix = buildCellMatrix(rowBlocks, rowCount, colCount)
      for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < colCount; col++) {
          const info = matrix[row]?.[col]
          if (!info || info.sourceRow >= row) continue
          covered[row] = true
          if ((info.cell as TableCellBlockComponent)?.hasContent) coveredByContent[row] = true
        }
      }
      return {covered, coveredByContent}
    }

    let spans = this._paginationRowspanCache?.grid === grid
      ? this._paginationRowspanCache.spans
      : null
    if (!spans) {
      spans = []
      for (let row = 0; row < grid.rowCount; row++) {
        const rowId = grid.rowIds[row]
        for (const cellId of this.doc.model.getChildrenIds(rowId)) {
          if (grid.getMasterCellId(cellId) !== cellId) continue
          const span = grid.getSpan(cellId)
          // 只收 master source，避免 rowspan/colspan 的隐藏 continuation 重复计入。
          if (!span || span.start[0] !== row || span.end[0] <= row) continue
          spans.push({cellId, startRow: row, endRow: span.end[0]})
        }
      }
      this._paginationRowspanCache = {grid, spans}
    }

    for (const span of spans) {
      const cell = this._getLiveBlockById<TableCellBlockComponent>(span.cellId)
      const hasContent = this._isTableCellBlock(cell) && cell.hasContent
      const end = Math.min(rowCount - 1, span.endRow)
      for (let row = span.startRow + 1; row <= end; row++) {
        covered[row] = true
        if (hasContent) coveredByContent[row] = true
      }
    }
    return {covered, coveredByContent}
  }

  /**
   * `rowspan` 有内容不代表它跨过的每个行边界都不可分页。典型分类列只在合并
   * 单元格顶部放一个短标题，后续几十行仍可在标题之后安全拆开。若把整段都标成
   * content-covered，分页引擎找不到行切点，只能让整段穿过纸张页缝。
   *
   * 这里只收紧 model-grid 路径：边界仍处于 rowspan 内，但仅当 master cell 的
   * 实际内容底边越过该边界时才禁止拆分。视图拆分会把原内容留在首段、后续段用
   * 隐藏 continuation cell 承接，因此内容已经结束的边界无需 cell-flow。
   */
  private _refinePaginationContentMergeCoverage(
    rows: Array<{top: number}>,
    conservative: readonly boolean[],
    hostTop: number,
  ): boolean[] {
    const grid = this._getTableModelGrid()
    const spans = this._paginationRowspanCache?.grid === grid
      ? this._paginationRowspanCache.spans
      : null
    if (!grid || !spans) return [...conservative]

    const refined = new Array<boolean>(rows.length).fill(false)
    for (const span of spans) {
      const cell = this._getLiveBlockById<TableCellBlockComponent>(span.cellId)
      if (!this._isTableCellBlock(cell) || !cell.hasContent) continue

      const children = cell.getChildrenBlocks()
      let contentBottom = Number.NEGATIVE_INFINITY
      for (const child of children) {
        const element = child.hostElement
        if (!element) continue
        const rect = element.getBoundingClientRect()
        if (!Number.isFinite(rect.bottom)) continue
        contentBottom = Math.max(contentBottom, rect.bottom - hostTop)
      }

      // 缺失/断连 DOM 时保持旧的保守语义，不能凭空允许一个可能腰斩内容的切点。
      if (!Number.isFinite(contentBottom)) {
        for (let row = span.startRow + 1; row <= span.endRow; row++) {
          if (row < refined.length) refined[row] = true
        }
        continue
      }

      const end = Math.min(rows.length - 1, span.endRow)
      for (let row = span.startRow + 1; row <= end; row++) {
        if (contentBottom > rows[row].top + TABLE_PAGINATION_BOUNDARY_TOLERANCE) {
          refined[row] = true
        }
      }
    }
    return refined
  }

  private _buildCellFlowPlan(
    rows: Array<{id: string; top: number; bottom: number}>,
    rowBlocks: BlockCraft.BlockComponent[],
    naturalHeight: number,
    hostTop: number,
    options: {contentHeight: number; widowOrphanLines: number},
  ): TableCellFlowPlan | undefined {
    const inputs: TableFlowRowInput[] = []
    const budget: TableCellFlowMeasurementBudget = {
      continuations: 0,
      safeAnchors: 0,
    }
    let previousBottom = 0
    let hasOversizedRow = false

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const stride = Math.max(0, row.bottom - previousBottom)
      if (stride > options.contentHeight) {
        hasOversizedRow = true
        const cells = this._measureCellFlowInputs(
          rowBlocks[index],
          previousBottom,
          row.bottom,
          hostTop,
          options.contentHeight,
          options.widowOrphanLines,
          budget,
        )
        if (!cells.length) return undefined
        inputs.push({kind: 'cell-flow', rowId: row.id, cells})
      } else {
        inputs.push({kind: 'atomic', rowId: row.id, height: stride})
      }
      previousBottom = row.bottom
    }
    if (!hasOversizedRow) return undefined

    try {
      const plan = planTableCellFlow(inputs, options.contentHeight)
      // table host 可能在最后一行之后还有 collapsed border / padding；把它留在末片段，
      // 但不制造一个无法映射回真实 rowId 的伪行断点。
      const trailing = Math.max(0, naturalHeight - previousBottom)
      if (trailing > 0 && plan.segments.length) {
        const last = plan.segments[plan.segments.length - 1]
        last.height += trailing
        last.toOffset += trailing
        plan.paginationHeight += trailing
      }
      return plan
    } catch (error) {
      // 不可拆的巨大原子内容没有安全锚点：保留旧的整行溢出语义，后续由局部锁高降级接管。
      if (error instanceof TableCellFlowPlanningError) return undefined
      return undefined
    }
  }

  private _measureCellFlowInputs(
    rowBlock: BlockCraft.BlockComponent | undefined,
    rowOrigin: number,
    rowBottom: number,
    hostTop: number,
    contentHeight: number,
    widowOrphanLines: number,
    budget: TableCellFlowMeasurementBudget,
  ): TableCellFlowInput[] {
    if (!rowBlock) return []
    const rowStride = Math.max(0, rowBottom - rowOrigin)
    const cells: TableCellBlockComponent[] = []
    for (const candidate of rowBlock.getChildrenBlocks()) {
      if (
        candidate instanceof TableCellBlockComponent
        && candidate.props.display !== 'none'
        && candidate.hostElement?.style.display !== 'none'
      ) {
        cells.push(candidate as unknown as TableCellBlockComponent)
      }
    }
    const pageCount = Math.max(1, Math.ceil(rowStride / contentHeight))
    const continuationCost = pageCount * cells.length
    if (
      pageCount > TABLE_CELL_FLOW_MAX_PAGES_PER_ROW
      || budget.continuations + continuationCost > TABLE_CELL_FLOW_MAX_CONTINUATIONS
    ) {
      return []
    }
    budget.continuations += continuationCost

    const measured: TableCellFlowInput[] = []
    for (const cell of cells) {
      const input = this._measureSingleCellFlow(
        cell,
        rowOrigin,
        rowStride,
        hostTop,
        contentHeight,
        widowOrphanLines,
        budget,
      )
      if (!input) return []
      measured.push(input)
    }
    if (!measured.length) return []

    // collapsed table border 会让内容底与行底差少量像素。只把自然最低的那列延长到真实行底，
    // 其余短列仍可提前结束，不会被空白高度误判成“未完成内容”。
    let tallestIndex = 0
    for (let index = 1; index < measured.length; index++) {
      if (
        measured[index].points[measured[index].points.length - 1].offset
        > measured[tallestIndex].points[measured[tallestIndex].points.length - 1].offset
      ) {
        tallestIndex = index
      }
    }
    return measured.map((cell, index) => {
      if (index !== tallestIndex) return cell
      return {
        ...cell,
        points: [
          ...cell.points.slice(0, -1),
          {offset: rowStride, anchor: {kind: 'cell-end'} as const},
        ],
      }
    })
  }

  private _measureSingleCellFlow(
    cell: TableCellBlockComponent,
    rowOrigin: number,
    rowStride: number,
    hostTop: number,
    contentHeight: number,
    widowOrphanLines: number,
    budget: TableCellFlowMeasurementBudget,
  ): TableCellFlowInput | null {
    const points: TableCellFlowPoint[] = []
    const children = cell.getChildrenBlocks()

    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      const child = children[childIndex]
      const childRect = child.hostElement.getBoundingClientRect()
      if (childIndex > 0) {
        if (budget.safeAnchors >= TABLE_CELL_FLOW_MAX_SAFE_ANCHORS) return null
        budget.safeAnchors++
        points.push({
          offset: childRect.top - hostTop - rowOrigin,
          anchor: {kind: 'block', blockId: child.id},
        })
      }

      if (child instanceof EditableBlockComponent) {
        const requestedLineSamples = Math.max(
          TABLE_CELL_FLOW_MIN_LINE_SAMPLES,
          Math.ceil(Math.max(0, childRect.height) / contentHeight)
            * TABLE_CELL_FLOW_LINE_SAMPLES_PER_PAGE,
        )
        const availableLineSamples = Math.min(
          requestedLineSamples,
          TABLE_CELL_FLOW_MAX_SAFE_ANCHORS - budget.safeAnchors,
        )
        if (availableLineSamples <= 0) return null
        const lines = measureInlinePaginationLineStarts(
          child.runtime,
          availableLineSamples,
        )
        budget.safeAnchors += lines.length
        const totalLines = lines.length + 1
        const minimum = Math.max(1, widowOrphanLines)
        const widowSafe = lines.filter((_line, lineIndex) => {
          const boundaryLine = lineIndex + 1
          return !(
            boundaryLine < minimum
            || totalLines - boundaryLine < minimum
          )
        })
        // 若严格 widow/orphan 后一个点都不剩，优先放宽排版美观约束，不能退回整行溢出。
        const usableLines = widowSafe.length ? widowSafe : lines
        const containerTop = child.containerElement.getBoundingClientRect().top
        usableLines.forEach(line => {
          points.push({
            offset: containerTop + line.top - hostTop - rowOrigin,
            anchor: {kind: 'text', blockId: child.id, offset: line.offset},
          })
        })
      }
    }

    if (budget.safeAnchors >= TABLE_CELL_FLOW_MAX_SAFE_ANCHORS) return null
    budget.safeAnchors++
    let contentEnd = Math.min(rowStride, Math.max(0, rowStride))
    const lastChild = children[children.length - 1]
    if (lastChild?.hostElement) {
      const style = getComputedStyle(lastChild.hostElement)
      const marginBottom = Number.parseFloat(style.marginBottom) || 0
      contentEnd = Math.max(
        0.01,
        Math.min(
          rowStride,
          lastChild.hostElement.getBoundingClientRect().bottom
            + marginBottom
            - hostTop
            - rowOrigin,
        ),
      )
    }

    const normalized: TableCellFlowPoint[] = []
    for (const point of points
      .filter(point => point.offset > 0.01 && point.offset < contentEnd - 0.01)
      .sort((left, right) => left.offset - right.offset)) {
      const previous = normalized[normalized.length - 1]
      if (previous && Math.abs(previous.offset - point.offset) <= 0.5) {
        // 块边界比同行文字边界稳定，优先用块 id 锚定。
        if (point.anchor.kind === 'block') normalized[normalized.length - 1] = point
        continue
      }
      normalized.push(point)
    }
    normalized.push({offset: contentEnd, anchor: {kind: 'cell-end'}})
    return {cellId: cell.id, points: normalized}
  }

  /**
   * 施加/更新/清除分页断点（视图层占位行 + 行栏对齐间隙）。幂等：与当前一致则不动 DOM。
   * 传 `[]` 清除全部。占位行无边框、无 data-block-id、不可编辑、不响应指针，纯撑高把后续行推到下一页。
   */
  applyPaginationBreaks(breaks: Array<{beforeRowId: string; gap: number}>): void {
    this._applyPaginationBreaks(breaks)
  }

  private _applyPaginationBreaks(breaks: TablePaginationBreak[]): void {
    if (!this.tableBody) return
    const breakSig = JSON.stringify(breaks)
    const modelGrid = this._getTableModelGrid()
    // 同一模型投影 + 同一断点的 ResizeObserver 反馈轮次无需再构建 row map、
    // 拆分矩阵或触碰 DOM。表头克隆目前禁用；若恢复，则 rowHead 仍走完整签名校验。
    if (
      !this.props.rowHead
      && breakSig === this._appliedPaginationBreakSig
      && modelGrid !== null
      && modelGrid === this._appliedPaginationGrid
    ) {
      this._lastPaginationBreaks = [...breaks]
      return
    }
    this._invalidateColumnResizeHandle()
    this._lastPaginationBreaks = [...breaks]
    const rowBreaks = breaks.filter(
      (value): value is {beforeRowId: string; gap: number} =>
        !('kind' in value),
    )
    const cellFlowBreaks = breaks.filter(
      (value): value is Extract<TablePaginationBreak, {kind: 'cell-flow'}> =>
        'kind' in value && value.kind === 'cell-flow',
    )
    const next: Record<string, number> = {}
    for (const b of rowBreaks) {
      if (b.gap > 0) next[b.beforeRowId] = b.gap
    }
    const gapsChanged = !shallowEqualNumberRecord(this._pageBreakGaps, next)

    const rowBlocks = this.getChildrenBlocks()
    const rowElById = new Map<string, HTMLElement>()
    const indexById = new Map<string, number>()
    rowBlocks.forEach((rowBlock, i) => {
      if (rowBlock.hostElement) rowElById.set(rowBlock.id, rowBlock.hostElement)
      indexById.set(rowBlock.id, i)
    })

    const breakIndices: number[] = []
    for (const rowId of Object.keys(next)) {
      const idx = indexById.get(rowId)
      if (idx !== undefined && idx > 0) breakIndices.push(idx)
    }
    breakIndices.sort((a, b) => a - b)

    // 合并单元格拆分：每次都按「当前合并结构」重算还原——合并/取消合并可能改了 rowspan 结构
    // 却没改页缝 gap（不触发 spacer 重建），故不能放进下面的 gap 早退里。开销仅落在真正被拆的表格上。
    this._clearCellOverrides()
    const cachedRowspans = this._paginationRowspanCache?.grid === modelGrid
      ? this._paginationRowspanCache.spans
      : null
    if (breakIndices.length > 0 && cachedRowspans?.length !== 0) {
      this._splitMergedCellsAtBreaks(rowBlocks, breakIndices)
    }

    // 占位行 + 续页重复表头 DOM：在断点集合（gap）变化时重建——避免每次重算都删/插造成滚动抖动。
    // 但占位行 colspan / 表头克隆是快照、依赖**列数 + 表头内容**，这些变化不改 gap；故再加一道「视图结构签名」
    // （列数 + 表头行 innerHTML）：签名变化（加/删列、改表头）时也强制重建，否则克隆/占位行停留在旧列数 → 错位。
    const headerRowEl = this.props.rowHead ? rowBlocks[0]?.hostElement ?? null : null
    const viewSig = `${this.colLength}|${headerRowEl ? headerRowEl.innerHTML : ''}`
    if (gapsChanged || viewSig !== this._pageBreakSig) {
      this.tableBody.querySelectorAll(':scope > tr.bc-pagination-spacer, :scope > tr.bc-pagination-header-clone')
        .forEach(el => el.remove())
      // 带表头（rowHead）的表格：每个续页顶部（占位行之后、断点行之前）重复一份表头克隆。
      for (const [rowId, gap] of Object.entries(next)) {
        const rowEl = rowElById.get(rowId)
        if (!rowEl) continue
        this.tableBody.insertBefore(buildPaginationSpacer(gap, this.colLength), rowEl)
        // [临时禁用 2026-06-30] 续页重复表头复制 bug 较多，先关掉。恢复：取消下面三行注释。
        // if (headerRowEl && headerRowEl !== rowEl) {
        //   this.tableBody.insertBefore(buildPaginationHeaderClone(headerRowEl), rowEl)
        // }
      }
      this._pageBreakGaps = next
      this._pageBreakSig = viewSig
    }

    this._applyCellFlowProjection(cellFlowBreaks)
    this.rowBarComponent?.changeDetectionRef.markForCheck()
    this._appliedPaginationBreakSig = breakSig
    this._appliedPaginationGrid = modelGrid
  }

  private _applyCellFlowProjection(
    breaks: Array<Extract<TablePaginationBreak, {kind: 'cell-flow'}>>,
  ): void {
    const signature = JSON.stringify(breaks)
    if (signature === this._cellFlowSig) return
    this._clearCellFlowProjection()
    if (!breaks.length) return

    const cells = new Map<string, TableCellBlockComponent>()
    for (const row of this.getChildrenBlocks()) {
      for (const block of row.getChildrenBlocks()) {
        if (block instanceof TableCellBlockComponent) cells.set(block.id, block)
      }
    }
    const runtimeGaps = new Map<object, Array<{
      offset: number
      height: number
      backdropOffset: number
      backdropHeight: number
    }>>()

    for (const pageBreak of breaks) {
      for (const gap of pageBreak.cells) {
        const cell = cells.get(gap.cellId)
        if (!cell) continue
        const children = cell.getChildrenBlocks()
        const anchor = gap.anchor

        if (anchor.kind === 'text') {
          const editable = children.find(child => child.id === anchor.blockId)
          if (!(editable instanceof EditableBlockComponent)) continue
          const runtime = editable.runtime
          const list = runtimeGaps.get(runtime) ?? []
          list.push({
            offset: anchor.offset,
            height: gap.gap,
            backdropOffset: gap.backdropOffset,
            backdropHeight: gap.backdropHeight,
          })
          runtimeGaps.set(runtime, list)
          continue
        }

        if (anchor.kind === 'cell-end') continue
        const wrapper = cell.hostElement.querySelector<HTMLElement>(
          ':scope > .table-cell__children-wrapper',
        )
        if (!wrapper) continue
        const target = anchor.kind === 'block'
          ? children.find(child => child.id === anchor.blockId)?.hostElement ?? null
          : children[0]?.hostElement ?? wrapper.firstChild
        const marker = buildCellPaginationGap(gap)
        wrapper.insertBefore(marker, target)
        this._cellFlowMarkers.add(marker)
      }
    }

    for (const [runtime, gaps] of runtimeGaps) {
      if (!applyInlinePaginationGaps(runtime, gaps)) {
        this._clearCellFlowProjection()
        return
      }
      this._cellFlowRuntimes.add(runtime)
    }

    const table = this.tableWrapper.nativeElement.querySelector<HTMLElement>('table')
    if (table) {
      const tableTopFromHost = this._stylePositionFromBcrDistance(
        table.getBoundingClientRect().top
          - this.hostElement.getBoundingClientRect().top,
      )
      for (const pageBreak of breaks) {
        const mask = buildTablePaginationMask(
          pageBreak.mask,
          table,
          table.offsetTop + pageBreak.mask.top - tableTopFromHost,
        )
        this.tableWrapper.nativeElement.appendChild(mask)
        this._cellFlowMasks.add(mask)
      }
    }
    this._cellFlowSig = signature
  }

  private _clearCellFlowProjection(): void {
    for (const runtime of this._cellFlowRuntimes) clearInlinePaginationGaps(runtime)
    this._cellFlowRuntimes.clear()
    for (const marker of this._cellFlowMarkers) marker.remove()
    this._cellFlowMarkers.clear()
    for (const mask of this._cellFlowMasks) mask.remove()
    this._cellFlowMasks.clear()
    this._cellFlowSig = ''
  }

  /**
   * 对每个被 `breakIndices` 跨越的竖向合并单元格做视图层拆分（Word 式）：
   * 源单元格 rowspan 缩到第一个断点，之后每段在断点行 un-hide 一个续段单元格（空、接续合并）。
   * 续段单元格 = 该断点行在源列的占位（display:none）单元格——矩形网格里它一定存在。
   */
  private _splitMergedCellsAtBreaks(rowBlocks: BlockCraft.BlockComponent[], breakIndices: number[]): void {
    if (!breakIndices.length) return
    const colCount = this.colLength
    if (!colCount) return
    const matrix = buildCellMatrix(rowBlocks, rowBlocks.length, colCount)

    for (let s = 0; s < rowBlocks.length; s++) {
      for (let c = 0; c < colCount; c++) {
        const info = matrix[s]?.[c]
        if (!info || info.sourceRow !== s || info.sourceCol !== c) continue // 只在合并源处理一次
        const span = info.cell.props.rowspan || 1
        if (span <= 1) continue
        const crossing = breakIndices.filter(b => b > s && b < s + span)
        if (!crossing.length) continue

        const colspan = info.cell.props.colspan || 1
        const segStarts = [s, ...crossing]
        const segEnds = [...crossing, s + span]
        const master = info.cell as TableCellBlockComponent
        // 段0：源单元格，rowspan 缩到第一个断点（仍带内容、本页）。缩到 1 行时置 null（移除 rowspan 属性，对齐模型约定）。
        const srcRowspan = segEnds[0] - s
        this._setCellOverride(master, { rowspan: srcRowspan > 1 ? srcRowspan : null })
        // 段1..：每个断点行的占位单元格 un-hide 成续段（空、接续下页）。
        // 续段是模型里 display:none 的「被覆盖」单元格，纯视觉接续。它保持可命中，
        // 但通过 master-id 代理 + contenteditable=false 只参与矩形选区，不允许编辑占位模型。
        const conts: TableCellBlockComponent[] = []
        for (let i = 1; i < segStarts.length; i++) {
          const contCell = rowBlocks[segStarts[i]]?.getChildrenByIndex(c) as TableCellBlockComponent | undefined
          if (!contCell) continue
          this._setCellOverride(
            contCell,
            { display: '', rowspan: segEnds[i] - segStarts[i], colspan },
            master.id,
          )
          conts.push(contCell)
        }
        if (conts.length) {
          this._continuationsOf.set(master, conts)
          // 若该合并源此刻正被选中，把高亮镜像到刚生成的续段上（分页在选区存活期间重算时）。
          if (this._selectedCellSet.has(master)) {
            for (const c2 of conts) c2.hostElement?.classList.add('selected')
          }
        }
      }
    }
  }

  private _setCellOverride(
    cell: TableCellBlockComponent,
    render: { rowspan?: number | null; colspan?: number | null; display?: string | null },
    continuationMasterId?: string,
  ): void {
    cell.setPaginationRender(render)
    if (continuationMasterId && cell.hostElement) {
      // 必须可命中，table capture 才能把手势代理回 master；contenteditable=false
      // 与 user-select:none 保证代理 cell 本身不会被编辑或产生浏览器文本选区。
      cell.hostElement.style.pointerEvents = 'auto'
      cell.hostElement.style.userSelect = 'none'
      cell.hostElement.style.webkitUserSelect = 'none'
      cell.hostElement.setAttribute('contenteditable', 'false')
      cell.hostElement.setAttribute(PG_CONTINUATION_MASTER_ATTR, continuationMasterId)
    }
    this._splitCells.add(cell)
  }

  private _clearCellOverrides(): void {
    for (const cell of this._splitCells) {
      const host = cell.hostElement
      const wasContinuationProxy = host?.hasAttribute(PG_CONTINUATION_MASTER_ATTR) ?? false
      cell.setPaginationRender(null)
      if (host && wasContinuationProxy) {
        host.style.pointerEvents = ''
        host.style.userSelect = ''
        host.style.webkitUserSelect = ''
        host.removeAttribute('contenteditable')
        host.removeAttribute(PG_CONTINUATION_MASTER_ATTR)
      }
    }
    // 续段重新隐藏（display:none），去掉镜像上去的 `.selected`，避免残留到下次 un-merge。
    for (const conts of this._continuationsOf.values()) {
      for (const c of conts) c.hostElement?.classList.remove('selected')
    }
    this._continuationsOf.clear()
    this._splitCells.clear()
  }

  /** 清除全部分页占位行 + 还原拆分的合并单元格（分页关闭 / 组件销毁时调用）。 */
  clearPaginationBreaks(): void {
    this._applyPaginationBreaks([])
    this._clearNestedAtomicLocks()
  }

  private _syncNestedAtomicLocks(
    contentHeight: number,
    candidateRows: readonly BlockCraft.BlockComponent[],
  ): boolean {
    let changed = false
    if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
      changed = this._nestedAtomicLocks.size > 0
      this._clearNestedAtomicLocks()
      return changed
    }

    // 已锁元素数量通常为 0 或个位数；只维护这部分，不重新扫描完整表格。
    for (const element of [...this._nestedAtomicLocks]) {
      if (element.isConnected && element.scrollHeight > contentHeight) continue
      element.classList.remove('bc-page-nested-height-locked')
      this._nestedAtomicLocks.delete(element)
      changed = true
    }

    for (const row of candidateRows) {
      for (const rawCell of row.getChildrenBlocks()) {
        if (!(rawCell instanceof TableCellBlockComponent)) continue
        for (const child of rawCell.getChildrenBlocks()) {
          const policy = resolveBlockPolicy({
            flavour: child.flavour,
            nodeType: child.nodeType,
          })
          const element = child.hostElement
          const natural = Math.max(element.offsetHeight, element.scrollHeight)
          if (natural <= contentHeight) continue
          const lineHeight = child instanceof EditableBlockComponent
            ? Number.parseFloat(getComputedStyle(child.containerElement).lineHeight)
            : 0
          const isIrreducibleEditable = Number.isFinite(lineHeight)
            && lineHeight > contentHeight
          if (!policy.capHeight && !isIrreducibleEditable) continue
          if (this._nestedAtomicLocks.has(element)) continue
          element.classList.add('bc-page-nested-height-locked')
          this._nestedAtomicLocks.add(element)
          changed = true
        }
      }
    }
    return changed
  }

  private _clearNestedAtomicLocks(): void {
    for (const element of this._nestedAtomicLocks) {
      element.classList.remove('bc-page-nested-height-locked')
    }
    this._nestedAtomicLocks.clear()
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
    if (this.isReadonly) return
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

  onColResizerMousedown(
    evt: MouseEvent,
    resolvedAnchor = this._resolveColumnResizeAnchor(),
  ) {
    if (evt.button !== 0) return
    evt.preventDefault()
    evt.stopPropagation()

    if (this.isReadonly) return
    if (!resolvedAnchor) return
    const resizingColIdx = this._resolveColumnResizeIndex(resolvedAnchor.cellId)
    if (resizingColIdx === null) return
    const startWidth = Number(this.props.colWidths?.[resizingColIdx])
    if (!Number.isFinite(startWidth) || startWidth <= 0) return

    const wrapper = this.tableWrapper?.nativeElement
    if (!wrapper) return
    this._finishColumnResize(false)
    const wrapperRect = wrapper.getBoundingClientRect()
    const boundaryRect = resolvedAnchor.boundaryCell.getBoundingClientRect()
    const ownerDocument = this.hostElement.ownerDocument
    const ownerWindow = ownerDocument.defaultView ?? window
    const previewLine = this._createColumnResizePreview(
      ownerDocument,
      ownerWindow,
      wrapperRect,
      boundaryRect,
    )
    const gesture = {
      anchorCellId: resolvedAnchor.cellId,
      startClientX: evt.clientX,
      startWidth,
      width: startWidth,
      actualZoom: this._actualCssZoom(),
      boundaryClientX: boundaryRect.right,
      previewLine,
    }
    this._colResizeGesture = gesture
    this.resizingCol$.next(true)
    this.hostElement.classList.add('is-resizing-col')
    this._renderColumnResizePreview()

    const subscriptions = new Subscription()
    this._colResizeSubscriptions = subscriptions
    this.doc.ngZone.runOutsideAngular(() => {
      subscriptions.add(
        fromEvent<MouseEvent>(ownerDocument, 'mousemove', {
          capture: true,
          passive: false,
        }).pipe(
          takeUntil(this.onDestroy$),
        ).subscribe(event => {
          if (event.cancelable) event.preventDefault()
          this._updateColumnResizePreview(event.clientX)
        }),
      )
      subscriptions.add(
        fromEvent<MouseEvent>(ownerDocument, 'mouseup', {capture: true})
          .pipe(
            filter(event => event.button === 0),
            takeUntil(this.onDestroy$),
          )
          .subscribe(event => {
            if (event.cancelable) event.preventDefault()
            this._updateColumnResizePreview(event.clientX)
            this._finishColumnResize(true)
          }),
      )
      subscriptions.add(
        fromEvent<FocusEvent>(ownerWindow, 'blur', {capture: true})
          .pipe(takeUntil(this.onDestroy$))
          .subscribe(() => this._finishColumnResize(false)),
      )
      subscriptions.add(
        fromEvent<KeyboardEvent>(ownerWindow, 'keydown', {capture: true})
          .pipe(
            filter(event => event.key === 'Escape'),
            takeUntil(this.onDestroy$),
          )
          .subscribe(event => {
            event.preventDefault()
            this._finishColumnResize(false)
          }),
      )
      subscriptions.add(
        fromEvent<Event>(ownerDocument, 'selectstart', {
          capture: true,
          passive: false,
        }).pipe(takeUntil(this.onDestroy$)).subscribe(event => {
          if (!this._colResizeGesture) return
          event.preventDefault()
        }),
      )
    })
  }

  /**
   * 列宽手势以手柄当前所在的真实 cell DOM 为起点，再把分页 continuation
   * 映射回稳定的 model cell ID。不能依赖 hoveringCell：Angular/分页重绘可把
   * 手柄恢复到模板声明位置，而 hover 状态仍保留旧值。
   */
  private _resolveColumnResizeAnchor(): {
    cellId: string
    boundaryCell: HTMLTableCellElement
  } | null {
    const overlayAnchor = this._columnResizeHandleAnchor
    if (
      overlayAnchor
      && overlayAnchor.boundaryCell.isConnected
      && this.hostElement.contains(overlayAnchor.boundaryCell)
    ) {
      return overlayAnchor
    }

    // Compatibility for tests and hosts that project an older template while
    // Angular completes a hot-reload pass.
    const boundaryCell = this.colResizeBar?.nativeElement.parentElement
      ?.closest<HTMLTableCellElement>('td[data-block-id]')
    if (!boundaryCell || !this.hostElement.contains(boundaryCell)) return null
    const cellId = this._modelCellIdFromElement(boundaryCell)
    if (!cellId || cellId.startsWith(PG_CLONE_ID_PREFIX)) return null
    return {cellId, boundaryCell}
  }

  private _positionColumnResizeHandle(
    cellId: string,
    boundaryCell: HTMLTableCellElement,
  ): void {
    const wrapper = this.tableWrapper?.nativeElement
    const bar = this.colResizeBar?.nativeElement
    if (!wrapper || !bar) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const cellRect = boundaryCell.getBoundingClientRect()
    if (cellRect.width <= 0 || cellRect.height <= 0) return

    const boundaryVisual = this._visualDistanceFromBcr(
      cellRect.right - wrapperRect.left,
    )
    const handleVisualWidth = TABLE_COL_RESIZE_HIT_WIDTH
      * this._zoomFactorForVisualSize()
    const wrapperVisualWidth = this._visualDistanceFromBcr(wrapperRect.width)
    // The hit target is normally centred on the column boundary. At the last
    // column that would leave half of its 12px box outside the wrapper, and an
    // absolutely positioned descendant still expands the ancestor's
    // scrollable overflow area. Clamp the whole hit target into the wrapper so
    // a table that already fits does not gain a 6px horizontal scrollbar.
    // Geometry-based capture still accepts the pointer just outside the visual
    // boundary, so this does not narrow Safari's resize ownership seam.
    const handleVisualLeft = Math.min(
      Math.max(0, boundaryVisual - handleVisualWidth / 2),
      Math.max(0, wrapperVisualWidth - handleVisualWidth),
    )
    const handleLeft = this._stylePositionFromVisualDistance(
      handleVisualLeft,
    )
    bar.style.left = `${handleLeft}px`
    bar.style.right = 'auto'
    bar.style.top = `${this._stylePositionFromBcrDistance(
      cellRect.top - wrapperRect.top,
    )}px`
    bar.style.height = `${this._styleSizeFromBcrDistance(cellRect.height)}px`
    bar.classList.add('is-visible')
    this._columnResizeHandleAnchor = {cellId, boundaryCell}
  }

  private _invalidateColumnResizeHandle(): void {
    this._columnResizeHandleAnchor = null
    this.colResizeBar?.nativeElement.classList.remove('is-visible')
  }

  /**
   * Safari/WebKit can paint an absolutely positioned resize handle inside a
   * collapsed-border table cell yet hit-test the same point as the td/content
   * below it (especially with overflow clipping and pagination projection).
   * Resolve the gesture by geometry at the table capture boundary so resize
   * ownership does not depend on the browser choosing the handle as target.
   * This runs only on primary mousedown, never on the move hot path.
   */
  private _resolveColumnResizePointerAnchor(evt: MouseEvent): {
    cellId: string
    boundaryCell: HTMLTableCellElement
  } | null {
    // Fail closed until the resize UI is mounted. Besides protecting early
    // lifecycle/test paths, this prevents any ordinary cell edge from stealing
    // rectangle-selection ownership when pagination temporarily detaches the
    // template-owned handle or wrapper.
    if (!this.colResizeBar?.nativeElement || !this.tableWrapper?.nativeElement) {
      return null
    }

    const isNearRightBoundary = (cell: HTMLTableCellElement) => {
      const rect = cell.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const right = rect.right
      return evt.clientY >= rect.top - TABLE_COL_RESIZE_OUTER_TOLERANCE
        && evt.clientY <= rect.bottom + TABLE_COL_RESIZE_OUTER_TOLERANCE
        && evt.clientX >= right - TABLE_COL_RESIZE_HIT_WIDTH
        && evt.clientX <= right + TABLE_COL_RESIZE_OUTER_TOLERANCE
    }

    // Prefer the visual handle's current owner. On WebKit the event target may
    // be the adjacent td even though the pointer is still over this boundary.
    const handleAnchor = this._resolveColumnResizeAnchor()
    const target = evt.target as Node | null
    if (handleAnchor && target
      && this.colResizeBar.nativeElement.contains(target)) {
      return handleAnchor
    }
    if (handleAnchor && isNearRightBoundary(handleAnchor.boundaryCell)) {
      return handleAnchor
    }

    const hitCell = this._closestCellElement(evt)
    if (!hitCell || !this.hostElement.contains(hitCell)) {
      return null
    }
    const boundaryCell = isNearRightBoundary(hitCell)
      ? hitCell
      : this._resolveCellLeftOfBoundaryHit(evt, hitCell)
    if (!boundaryCell || !isNearRightBoundary(boundaryCell)) return null
    const cellId = this._modelCellIdFromElement(boundaryCell)
    if (!cellId || cellId.startsWith(PG_CLONE_ID_PREFIX)) return null
    return {cellId, boundaryCell}
  }

  /**
   * WebKit assigns an exact collapsed-border pixel to the cell on the right.
   * Probe a few pixels to the left so the resize boundary keeps its left-cell
   * ownership even when mousemove/mousedown target the adjacent cell. The
   * probe is cold (hover/begin only), bounded, and also works for rowspan and
   * paginated continuation projections because elementFromPoint returns the
   * cell that actually paints at that y coordinate.
   */
  private _resolveCellLeftOfBoundaryHit(
    evt: MouseEvent,
    hitCell: HTMLTableCellElement,
  ): HTMLTableCellElement | null {
    const hitRect = hitCell.getBoundingClientRect()
    if (hitRect.width <= 0 || hitRect.height <= 0) return null
    if (
      evt.clientX < hitRect.left - TABLE_COL_RESIZE_OUTER_TOLERANCE
      || evt.clientX > hitRect.left + TABLE_COL_RESIZE_ADJACENT_TOLERANCE
    ) {
      return null
    }

    const ownerDocument = this.hostElement.ownerDocument
    const probeX = Math.min(
      evt.clientX - 1,
      hitRect.left - TABLE_COL_RESIZE_ADJACENT_TOLERANCE,
    )
    const probeTarget = ownerDocument.elementFromPoint(probeX, evt.clientY)
    const leftCell = probeTarget?.closest<HTMLTableCellElement>('td') ?? null
    if (
      !leftCell
      || leftCell === hitCell
      || !this.hostElement.contains(leftCell)
    ) {
      return null
    }
    const leftRect = leftCell.getBoundingClientRect()
    return Math.abs(leftRect.right - hitRect.left)
      <= TABLE_COL_RESIZE_ADJACENT_TOLERANCE
      ? leftCell
      : null
  }

  private _createColumnResizePreview(
    ownerDocument: Document,
    ownerWindow: Window,
    wrapperRect: DOMRect,
    boundaryRect: DOMRect,
  ): HTMLElement {
    const line = ownerDocument.createElement('div')
    line.setAttribute(TABLE_COL_RESIZE_PREVIEW_ATTR, '')
    line.setAttribute('aria-hidden', 'true')
    line.setAttribute('role', 'presentation')
    line.setAttribute('inert', '')

    // The preview lives at body level so a rightward drag can cross the current
    // table/wrapper width. Keeping it inside `.table-wrapper` lets the host's
    // overflow clipping hide the guide exactly when the last column grows.
    const viewportHeight = ownerWindow.innerHeight
    let top = Math.max(0, wrapperRect.top)
    let bottom = Math.min(viewportHeight, wrapperRect.bottom)
    if (bottom <= top) {
      top = Math.max(0, boundaryRect.top)
      bottom = Math.min(viewportHeight, boundaryRect.bottom)
    }
    const activeColor = ownerWindow.getComputedStyle(this.hostElement)
      .getPropertyValue('--bc-active-color')
      .trim()

    line.style.position = 'fixed'
    line.style.top = `${top}px`
    line.style.left = '0'
    line.style.width = '2px'
    line.style.height = `${Math.max(1, bottom - top)}px`
    line.style.zIndex = '2147483646'
    line.style.pointerEvents = 'none'
    line.style.userSelect = 'none'
    line.style.borderRadius = '1px'
    line.style.background = activeColor || '#4857e2'
    line.style.willChange = 'transform'
    ownerDocument.body.appendChild(line)
    return line
  }

  private _updateColumnResizePreview(clientX: number): void {
    const state = this._colResizeGesture
    if (!state) return
    const delta = (clientX - state.startClientX)
      / Math.max(state.actualZoom, Number.EPSILON)
    state.width = Math.max(TABLE_MIN_COLUMN_WIDTH, state.startWidth + delta)
    this._renderColumnResizePreview()
  }

  private _renderColumnResizePreview(): void {
    const state = this._colResizeGesture
    if (!state) return
    const widthDeltaVisual = (state.width - state.startWidth) * state.actualZoom
    const clientX = state.boundaryClientX + widthDeltaVisual
    state.previewLine.style.transform = `translate3d(${clientX - 1}px, 0, 0)`
  }

  private _finishColumnResize(commit: boolean): void {
    const state = this._colResizeGesture
    if (!state) return
    this._colResizeGesture = null
    this._colResizeSubscriptions.unsubscribe()
    this._colResizeSubscriptions = new Subscription()
    this.resizingCol$.next(false)
    this.hostElement.classList.remove('is-resizing-col')
    this._invalidateColumnResizeHandle()
    state.previewLine.remove()
    if (!commit || this.isReadonly) return

    // 拖动期间可能收到远端列重排。提交时从稳定 cell ID 重新解析它当前覆盖的
    // 右边界，避免按手势开始时的旧索引修改另一列；锚点失效则安全取消。
    const liveColumnIndex = this._resolveColumnResizeIndex(state.anchorCellId)
    const widths = [...(this.props.colWidths ?? [])]
    if (
      liveColumnIndex == null
      || liveColumnIndex < 0
      || liveColumnIndex >= widths.length
    ) {
      return
    }
    widths[liveColumnIndex] = state.width
    this.updateProps({colWidths: widths})
    this._normalizeHorizontalScroll()
  }

  private _getTableHorizontalOverhead() {
    const table = this.hostElement.querySelector('table') as HTMLElement | null
    if (!table) return 0
    const colsTotal = this.props.colWidths.reduce((sum, width) => sum + width, 0)
    if (!colsTotal) return 0
    return Math.max(
      0,
      Math.ceil(this._layoutDistanceFromBcr(table.getBoundingClientRect().width) - colsTotal),
    )
  }

  private _getParentContentWidth() {
    const parent = this.parentBlock
    const container = parent?.childrenRenderRef?.containerElement ?? parent?.hostElement
    return container ? elementContentWidth(container) : 0
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
