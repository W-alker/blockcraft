import { BehaviorSubject, Observable, Subscription } from "rxjs"
import { IBlockProps } from "../block-std"
import { calcDragLineRect, calcPositionByRect, type DragLineRect, type DragPosition } from "./_dnd-geometry"
import { closetBlockId } from "../utils"

export type InternalDragState = 'idle' | 'armed' | 'dragging' | 'dropping'

export type InternalDragData =
  | { kind: 'origin-block'; blockId: string }
  | { kind: 'new-block'; flavour: BlockCraft.BlockFlavour; initProps?: IBlockProps }

export interface InternalDragOptions {
  /** ghost 文本预览，不传则从源 block textContent 抽取 */
  ghostLabel?: string
  /**
   * 启动拖拽的最小位移阈值（px）。
   * 不传则按 pointerType 自动：mouse/pen = 4，touch = 8
   * 显式传值覆盖自动逻辑
   */
  movementThreshold?: number
}

const DEFAULT_MOUSE_THRESHOLD = 4
const DEFAULT_TOUCH_THRESHOLD = 8

const DRAG_SCROLL_EDGE = 56
const DRAG_SCROLL_MAX_STEP = 24

function calcDragScrollStep(pointer: number, start: number, end: number): number {
  if (pointer < start + DRAG_SCROLL_EDGE) {
    const ratio = (start + DRAG_SCROLL_EDGE - pointer) / DRAG_SCROLL_EDGE
    return -Math.ceil(DRAG_SCROLL_MAX_STEP * Math.min(1, ratio))
  }
  if (pointer > end - DRAG_SCROLL_EDGE) {
    const ratio = (pointer - (end - DRAG_SCROLL_EDGE)) / DRAG_SCROLL_EDGE
    return Math.ceil(DRAG_SCROLL_MAX_STEP * Math.min(1, ratio))
  }
  return 0
}

function isViewportScroller(container: HTMLElement): boolean {
  return container === document.body || container === document.documentElement
}

export class DocInternalDragController {
  private readonly _state$ = new BehaviorSubject<InternalDragState>('idle')

  private _activePointerId: number | null = null
  private _data: InternalDragData | null = null
  private _options: InternalDragOptions = {}
  private _startX = 0
  private _startY = 0
  private _pointerType: string = 'mouse'
  private _ghost: HTMLElement | null = null

  private _dropLine: HTMLElement | null = null
  private _lastDropLineRect: DragLineRect | null = null
  private _prevBlock: BlockCraft.BlockComponent | null = null
  private _prevDragPosition: DragPosition = 'none'
  private _prevTargetEl: Node | null = null
  private _inBlock: BlockCraft.BlockComponent | null = null
  private _lastHitX = -9999
  private _lastHitY = -9999
  private _cachedRootRect: { top: number, left: number } | null = null
  private _scrollFrame: number | null = null
  private _lastX = 0
  private _lastY = 0
  private _sourceMarker: HTMLElement | null = null
  // drag-over chain：从当前 prevBlock 向上到 root 之前的所有 block hostElement。
  // 任意 block 都可通过 SCSS 的 `&.drag-over { ... }` 订阅这个状态做高亮反馈。
  private _dragOverChain: HTMLElement[] = []
  private _globalListenersAttached = false
  private _scrollRedrawScheduled = false
  private _subs = new Subscription()

  constructor(private readonly doc: BlockCraft.Doc) {
    const readonlySwitch$ = (doc as unknown as { readonlySwitch$?: { subscribe(fn: (v: boolean) => void): { unsubscribe(): void } } }).readonlySwitch$
    if (readonlySwitch$) {
      this._subs.add(readonlySwitch$.subscribe(readonly => {
        if (readonly && this._state$.value !== 'idle') this.cancel()
      }))
    }
  }

  /** Safe wrapper: returns null when the block id is unknown. */
  private _safeGetBlockById(id: string | undefined | null): BlockCraft.BlockComponent | null {
    if (!id) return null
    try {
      return this.doc.getBlockById(id)
    } catch {
      return null
    }
  }

  get state$(): Observable<InternalDragState> {
    return this._state$.asObservable()
  }

  get state(): InternalDragState {
    return this._state$.value
  }

  get isDragging(): boolean {
    return this._state$.value === 'dragging' || this._state$.value === 'dropping'
  }

  startDrag(evt: PointerEvent, data: InternalDragData, options: InternalDragOptions = {}): void {
    if (this._state$.value !== 'idle') return
    if (this.doc.isReadonly) return
    if (!evt.target) return

    // 不再调 setPointerCapture：
    // (1) 我们所有 pointermove/up/cancel 都挂在 window 上 capture phase，事件传递不依赖 capture
    // (2) 部分 Chrome 版本下，对 <img> / 子树 element 调 setPointerCapture 会阻塞 ancestor 的
    //     wheel/scroll，表现为 "拖拽触发后页面无法滚动"
    //
    // armed 阶段不清 selection：清得太早会破坏"单击不拖"场景下 framework 通过 native
    // selection / selectionchange 推导出 block selection 的链路（比如点击图片想让它进入
    // selected 状态）。selection 的清除推迟到真正进 dragging 的 _enterDragging。
    this._activePointerId = evt.pointerId
    this._data = data
    this._options = { ...options }
    this._startX = evt.clientX
    this._startY = evt.clientY
    this._pointerType = evt.pointerType || 'mouse'
    // 屏蔽 framework selectionchange→recalculate：pointerdown 后浏览器还会发 mousedown，
    // 后续 selectionchange 会让 framework 把 BlockSelection 重算回 null（mousedown 落点
    // 可能在 .img-wrapper 等非 block 边界元素上，recalculate 算不出 BlockSelection）。
    // 我们在 pointerdown 时显式 selectBlock 设好的 selection 不能被这条链路覆盖掉。
    // teardown 时恢复。
    this.doc.selection.setSuppressRecalculate(true)
    this._attachGlobalListeners()
    this._state$.next('armed')
  }

  cancel(): void {
    if (this._state$.value === 'idle') return
    this._teardown()
  }

  private _attachGlobalListeners(): void {
    if (this._globalListenersAttached) return
    this._globalListenersAttached = true
    window.addEventListener('keydown', this._onWindowKeydown, true)
    window.addEventListener('blur', this._onWindowBlur)
    // pointer 事件全部走 window capture phase，不依赖 setPointerCapture。
    // 原因：某些元素（<img>、<svg>、跨 shadow DOM 等）上 setPointerCapture 可能 silent fail，
    // 那 target 上挂的 listener 就收不到任何 pointermove/up，拖拽看上去完全没反应。
    // window capture phase 监听不依赖 target 的特殊性，事件一定能收到。
    window.addEventListener('pointermove', this._onWindowPointerMove, true)
    window.addEventListener('pointerup', this._onWindowPointerUp, true)
    window.addEventListener('pointercancel', this._onWindowPointerCancel, true)
    // 拖拽期间阻止文本选中。这里用 selectstart preventDefault，避免之前用
    // root.style.pointerEvents = 'none' 锁死 capture target 的回归问题。
    document.addEventListener('selectstart', this._onSelectStart, true)
    // 滚动 / 大小变化时让 root rect 缓存失效。capture phase 才能收到内部 scrollContainer 的滚动
    // （scroll 事件默认不冒泡）。passive 因为我们只是失效缓存 + RAF 重排，不阻止默认行为。
    window.addEventListener('scroll', this._onScrollOrResize, { passive: true, capture: true })
    window.addEventListener('resize', this._onScrollOrResize, { passive: true })
  }

  private _detachGlobalListeners(): void {
    if (!this._globalListenersAttached) return
    this._globalListenersAttached = false
    window.removeEventListener('keydown', this._onWindowKeydown, true)
    window.removeEventListener('blur', this._onWindowBlur)
    window.removeEventListener('pointermove', this._onWindowPointerMove, true)
    window.removeEventListener('pointerup', this._onWindowPointerUp, true)
    window.removeEventListener('pointercancel', this._onWindowPointerCancel, true)
    document.removeEventListener('selectstart', this._onSelectStart, true)
    window.removeEventListener('scroll', this._onScrollOrResize, { capture: true } as any)
    window.removeEventListener('resize', this._onScrollOrResize)
  }

  private _onWindowKeydown = (evt: KeyboardEvent): void => {
    if (evt.key === 'Escape' && this._state$.value !== 'idle') {
      this.cancel()
    }
  }

  private _onWindowBlur = (): void => {
    if (this._state$.value !== 'idle') this.cancel()
  }

  private _onSelectStart = (evt: Event): void => {
    // armed / dragging / dropping 全部期间阻止 native selection 开始。
    // selectstart 只在用户拖选文字时触发（单击/双击不经 selectstart），所以 armed 也安全拦。
    //
    // 关键：必须 stopImmediatePropagation 而不仅仅 preventDefault。
    // root-block 的 SelectionControl 监听 root.hostElement 的 selectstart 触发块级选择 chain
    // （pointer 离开 block 就 selectBlock 向上扩展）。preventDefault 只阻止默认 native 选区，
    // 不阻止其他 listener；不拦的话拖拽期间块级选择 chain 会被同时激活，pointer 经过
    // column / table cell 边界时 selection 反复跳到不同祖先 block。
    // 我们 listener 在 document capture phase，早于 framework 的 root bubble phase listener，
    // stopImmediatePropagation 能成功拦截。
    if (this._state$.value !== 'idle') {
      evt.preventDefault()
      evt.stopImmediatePropagation()
    }
  }

  private _onScrollOrResize = (): void => {
    // 任何容器滚动 / 窗口缩放都让 root rect 缓存失效。
    // 这是修复"滚动时 dropLine 飞走"的关键：之前缓存只在 dragstart 时填一次，
    // 滚动后 prevBlock.getBoundingClientRect() 是新的视口坐标，
    // 与陈旧 cachedRootRect 相减得到错误的相对偏移，dropLine 跑到 viewport 外。
    this._cachedRootRect = null
    if (this._state$.value !== 'dragging') return
    if (this._scrollRedrawScheduled) return
    this._scrollRedrawScheduled = true
    requestAnimationFrame(() => {
      this._scrollRedrawScheduled = false
      if (this._state$.value !== 'dragging') return
      if (!this._prevBlock?.hostElement?.isConnected) return
      this._moveDropLine(this._prevBlock.hostElement, this._prevDragPosition)
    })
  }

  private _onWindowPointerUp = (evt: PointerEvent): void => {
    if (evt.pointerId !== this._activePointerId) return
    const state = this._state$.value
    if (state === 'idle') return
    if (state === 'dragging') this._commitDrop(evt)
    this._teardown()
  }

  private _onWindowPointerCancel = (evt: PointerEvent): void => {
    if (evt.pointerId !== this._activePointerId) return
    if (this._state$.value === 'idle') return
    this._teardown()
  }

  private _teardown(): void {
    this._removeGhost()
    this._removeDropLine()
    this._stopAutoScroll()
    this._clearSourceMarker()
    this._updateDragOverChain(null)
    if (this._state$.value === 'dragging' || this._state$.value === 'dropping') {
      this.doc.dndService.dragStatus$.next('end' as any)
    }
    // 恢复 framework selectionchange→recalculate（startDrag 时屏蔽了）。
    // 注意：保护范围只到 teardown，后续用户操作可以正常更新 BlockSelection。
    try { this.doc.selection.setSuppressRecalculate(false) } catch {}
    this._prevBlock = null
    this._prevDragPosition = 'none'
    this._prevTargetEl = null
    this._inBlock = null
    this._cachedRootRect = null
    this._lastDropLineRect = null
    this._lastHitX = -9999
    this._lastHitY = -9999
    this._activePointerId = null
    this._data = null
    this._options = {}
    this._pointerType = 'mouse'
    this._detachGlobalListeners()
    this._state$.next('idle')
  }

  private _onWindowPointerMove = (evt: PointerEvent): void => {
    if (evt.pointerId !== this._activePointerId) return
    const state = this._state$.value
    if (state === 'idle' || state === 'dropping') return

    if (state === 'armed') {
      const dx = evt.clientX - this._startX
      const dy = evt.clientY - this._startY
      const threshold = this._resolveThreshold()
      if (dx * dx + dy * dy < threshold * threshold) return
      this._enterDragging(evt)
      return
    }

    // dragging
    this._moveGhost(evt.clientX, evt.clientY)
    this._hitTest(evt.clientX, evt.clientY)
    this._queueAutoScroll(evt.clientX, evt.clientY)
  }

  private _resolveThreshold(): number {
    if (this._options.movementThreshold !== undefined) return this._options.movementThreshold
    return this._pointerType === 'touch' ? DEFAULT_TOUCH_THRESHOLD : DEFAULT_MOUSE_THRESHOLD
  }

  private _enterDragging(evt: PointerEvent): void {
    // Release IME / cursor before entering drag mode.
    // 注意：曾经在这里设过 root.hostElement.style.pointerEvents = 'none'，但那会让
    // 整个 BlockCraft 子树（包括 capture target drag-handle 自身）继承 pointer-events: none，
    // setPointerCapture 也无法绕过 CSS 拦截，导致 pointermove 收不到、hit-test 不跑、dropLine 不出现。
    // 改用 selectstart preventDefault 阻止文本选中，pointer-events 完全不动。
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    // 主动清除现有 selection。Safari 在 pointermove 期间会"延伸"已有 native selection，
    // 跨 contenteditable 块（table cell / column 内段落都是独立 contenteditable）拖动时
    // selection 会乱跳。selectstart preventDefault 拦不住这种延伸，必须清空起点。
    try { document.getSelection()?.removeAllRanges() } catch {}
    this._createGhost()
    this._updateGhostLabel()
    this._moveGhost(evt.clientX, evt.clientY)
    this._createDropLine()
    this._refreshRootRect()
    this._applySourceMarker()
    this._state$.next('dragging')
    this.doc.dndService.dragStatus$.next('moving' as any)
    this._hitTest(evt.clientX, evt.clientY)
  }

  private _commitDrop(_evt: PointerEvent): void {
    this._state$.next('dropping')
    if (!this._data || !this._prevBlock || this._prevDragPosition === 'none') return

    if (this._data.kind === 'origin-block') {
      const source = this._safeGetBlockById(this._data.blockId)
      if (source && source !== this._prevBlock) {
        this.doc.dndService.onSortBlock(source, this._prevBlock, this._prevDragPosition)
      }
    } else if (this._data.kind === 'new-block') {
      this.doc.dndService.onInsertNewBlock(
        this._data.flavour,
        this._data.initProps ?? {},
        this._prevBlock,
        this._prevDragPosition,
      )
    }
  }

  destroy(): void {
    this.cancel()
    this._subs.unsubscribe()
    this._state$.complete()
  }

  private _createGhost(): HTMLElement {
    if (this._ghost) return this._ghost
    const g = document.createElement('div')
    g.setAttribute('aria-hidden', 'true')
    g.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 240px',
      'max-height: 56px',
      'overflow: hidden',
      'padding: 8px 12px',
      'box-sizing: border-box',
      'background: var(--bc-bg-color, #fff)',
      'color: var(--bc-text-color, #1f2329)',
      'border-radius: 6px',
      'box-shadow: 0 6px 24px rgba(0,0,0,0.12)',
      'font-size: 13px',
      'line-height: 20px',
      'white-space: nowrap',
      'text-overflow: ellipsis',
      'pointer-events: none',
      'contain: layout paint',
      'transform: translate3d(-10000px, -10000px, 0)',
      'z-index: 2147483646',
    ].join(';')
    document.body.appendChild(g)
    this._ghost = g
    return g
  }

  private _updateGhostLabel(): void {
    if (!this._ghost) return
    const label = this._options.ghostLabel ?? this._resolveDefaultLabel()
    this._ghost.textContent = label
  }

  private _resolveDefaultLabel(): string {
    if (!this._data) return 'Block'
    if (this._data.kind === 'origin-block') {
      const block = this._safeGetBlockById(this._data.blockId)
      const text = block?.hostElement.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60)
      return text || `${block?.flavour ?? 'Block'}`
    }
    return `${this._data.flavour}`
  }

  private _moveGhost(x: number, y: number): void {
    if (!this._ghost) return
    this._ghost.style.transform = `translate3d(${x + 12}px, ${y + 12}px, 0)`
  }

  private _removeGhost(): void {
    if (!this._ghost) return
    this._ghost.remove()
    this._ghost = null
  }

  private _createDropLine(): void {
    if (this._dropLine) return
    const el = document.createElement('div')
    el.style.cssText = [
      'z-index: 10',
      'position: absolute',
      'top: 0',
      'left: 0',
      'height: 2px',
      'background-color: #3a53d9',
      'pointer-events: none',
      'will-change: transform, width, height',
      'box-shadow: 0 0 2px var(--bc-active-color-light)',
    ].join(';')
    this.doc.root.hostElement.appendChild(el)
    this._dropLine = el
    this._lastDropLineRect = null
  }

  private _removeDropLine(): void {
    if (!this._dropLine) return
    this._dropLine.remove()
    this._dropLine = null
    this._lastDropLineRect = null
  }

  private _refreshRootRect(): { top: number, left: number } {
    const r = this.doc.root.hostElement.getBoundingClientRect()
    this._cachedRootRect = { top: r.top, left: r.left }
    return this._cachedRootRect
  }

  private _moveDropLine(host: HTMLElement, position: DragPosition, hostRect = host.getBoundingClientRect()): void {
    if (!this._dropLine) return
    const rootRect = this._cachedRootRect ?? this._refreshRootRect()
    const rect = calcDragLineRect(rootRect, hostRect, position)
    const prev = this._lastDropLineRect
    if (!prev || prev.left !== rect.left || prev.top !== rect.top) {
      this._dropLine.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
    }
    if (!prev || prev.width !== rect.width) {
      this._dropLine.style.width = rect.width + 'px'
    }
    if (!prev || prev.height !== rect.height) {
      this._dropLine.style.height = rect.height + 'px'
    }
    this._lastDropLineRect = rect
  }

  private _resolveDropPosition(point: { clientX: number, clientY: number }, hostRect: DOMRect): DragPosition {
    if (!this._prevBlock) return 'none'
    const parentFlavour = this._prevBlock.parentBlock?.flavour
    const allowColumnDrop = !this._prevBlock.flavour.startsWith('column')
      && this.doc.schemas.has('column')
      && parentFlavour != null
      && ['root', 'column'].includes(parentFlavour)
    return calcPositionByRect(point, hostRect, allowColumnDrop)
  }

  private _hitTest(x: number, y: number): void {
    // 4px movement threshold: reuse last result when delta is small
    if (Math.abs(x - this._lastHitX) < 4 && Math.abs(y - this._lastHitY) < 4) {
      if (!this._prevBlock?.hostElement?.isConnected) return
      const hostRect = this._prevBlock.hostElement.getBoundingClientRect()
      const position = this._resolveDropPosition({ clientX: x, clientY: y }, hostRect)
      this._prevDragPosition = position
      this._moveDropLine(this._prevBlock.hostElement, position, hostRect)
      this._updateDragOverChain(this._prevBlock)
      return
    }
    this._lastHitX = x
    this._lastHitY = y

    const evtTarget = (document.elementFromPoint(x, y) ?? null) as Node | null
    const validTarget = evtTarget && evtTarget !== this.doc.root.hostElement
    const blockId = validTarget
      ? (evtTarget === this._prevTargetEl ? this._prevBlock?.id : closetBlockId(evtTarget))
      : null

    let active: BlockCraft.BlockComponent | null = null
    if (blockId) {
      active = (blockId === this._prevBlock?.id ? this._prevBlock : this._safeGetBlockById(blockId))
      if (active?.flavour === 'root') active = null
    }

    if (active) {
      this._prevTargetEl = evtTarget
      if (this._prevBlock !== active && active !== this._inBlock) {
        const schema = this.doc.schemas.get(active.flavour)
        if (!schema) {
          if (active.nodeType === 'block') this._inBlock = null
          return
        }
        if (schema.metadata.renderUnit) {
          this._inBlock = active
          const renderBlockRect = active.hostElement.getBoundingClientRect()
          const position = calcPositionByRect({ clientX: x, clientY: y }, renderBlockRect)
          const childBlock = position === 'before' ? active.firstChildren : active.lastChildren
          if (childBlock) {
            this._prevBlock = childBlock
            this._prevDragPosition = position
            this._moveDropLine(childBlock.hostElement, position)
          }
          this._updateDragOverChain(this._prevBlock)
          return
        }
        if (active.nodeType === 'block') this._inBlock = null
        if (!schema.metadata.isLeaf) this._prevBlock = active
      }
    }

    if (!this._prevBlock?.hostElement?.isConnected) return
    const hostRect = this._prevBlock.hostElement.getBoundingClientRect()
    const position = this._resolveDropPosition({ clientX: x, clientY: y }, hostRect)
    this._prevDragPosition = position
    this._moveDropLine(this._prevBlock.hostElement, position, hostRect)
    this._updateDragOverChain(this._prevBlock)
  }

  // 维护 drag-over class 的祖先链：进来的 block + 所有 block 类型祖先（不含 root）。
  // 每次 drop target 变化时增量更新（remove 不再相同的、add 新增的），避免逐次全量
  // add/remove 触发 reflow。SCSS 可通过 `[data-block-id].drag-over { ... }` 订阅。
  private _updateDragOverChain(target: BlockCraft.BlockComponent | null): void {
    const next: HTMLElement[] = []
    let cursor: BlockCraft.BlockComponent | null = target
    while (cursor && cursor.flavour !== 'root') {
      next.push(cursor.hostElement)
      cursor = cursor.parentBlock ?? null
    }

    const prev = this._dragOverChain
    if (prev.length === next.length && prev.every((el, i) => el === next[i])) return

    const nextSet = new Set(next)
    for (const el of prev) {
      if (!nextSet.has(el)) el.classList.remove('drag-over')
    }
    const prevSet = new Set(prev)
    for (const el of next) {
      if (!prevSet.has(el)) el.classList.add('drag-over')
    }
    this._dragOverChain = next
  }

  private _queueAutoScroll(x: number, y: number): void {
    this._lastX = x
    this._lastY = y
    if (this._scrollFrame !== null) return
    this._scrollFrame = requestAnimationFrame(() => this._runAutoScroll())
  }

  private _runAutoScroll(): void {
    this._scrollFrame = null
    if (this._state$.value !== 'dragging') return
    const container = this.doc.scrollContainer
    if (!container) return

    let scrolled = false
    if (isViewportScroller(container)) {
      const scrollEl = document.scrollingElement as HTMLElement | null
      if (scrollEl) {
        const dy = calcDragScrollStep(this._lastY, 0, window.innerHeight)
        if (dy) {
          const nextTop = Math.max(0, Math.min(scrollEl.scrollTop + dy, scrollEl.scrollHeight - window.innerHeight))
          if (nextTop !== scrollEl.scrollTop) {
            scrollEl.scrollTop = nextTop
            scrolled = true
          }
        }
      }
    } else {
      const rect = container.getBoundingClientRect()
      const dy = calcDragScrollStep(this._lastY, rect.top, rect.bottom)
      if (dy) {
        const nextTop = Math.max(0, Math.min(container.scrollTop + dy, container.scrollHeight - container.clientHeight))
        if (nextTop !== container.scrollTop) {
          container.scrollTop = nextTop
          scrolled = true
        }
      }
    }

    if (scrolled) {
      // Scrolling moved the page; hit-test must re-run, and continue scrolling next frame
      this._refreshRootRect()
      this._hitTest(this._lastX, this._lastY)
      this._scrollFrame = requestAnimationFrame(() => this._runAutoScroll())
    }
  }

  private _stopAutoScroll(): void {
    if (this._scrollFrame !== null) {
      cancelAnimationFrame(this._scrollFrame)
      this._scrollFrame = null
    }
  }

  private _applySourceMarker(): void {
    if (this._data?.kind !== 'origin-block') return
    const block = this._safeGetBlockById(this._data.blockId)
    if (!block) return
    block.hostElement.classList.add('bc-drag-source')
    this._sourceMarker = block.hostElement
  }

  private _clearSourceMarker(): void {
    if (!this._sourceMarker) return
    this._sourceMarker.classList.remove('bc-drag-source')
    this._sourceMarker = null
  }
}
