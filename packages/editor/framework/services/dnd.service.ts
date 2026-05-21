import {BehaviorSubject, filter, fromEvent, take, takeUntil} from "rxjs";
import {
  BlockNodeType,
  DocEventRegister,
  EventListen,
  IBlockProps,
  IBlockSnapshot,
  UIEventStateContext
} from "../block-std";
import {closetBlockId} from "../utils";
import {BLOCK_POSITION} from "../doc";
import {DOC_FILE_SERVICE_TOKEN} from "./file.service";
import {BLOCK_CREATOR_SERVICE_TOKEN} from "./block-creator.service";

export enum DocDndDataTypes {
  // 已有的block
  originBlock = 'origin-block',
  // 新的block
  newBlock = 'new-block',
  // 新的block
  newBlockProps = 'new-block-props',
  // 文件
  file = 'Files',
}

export type DocDndDataType = `${DocDndDataTypes}` | string

export enum DocDndStatus {
  start = 'start',
  moving = 'moving',
  end = 'end',
}

type DragPosition = 'before' | 'after' | 'left' | 'right' | 'none'
type DragLineRect = { top: number, left: number, width: number, height: number }

const calcPositionByRect = (e: Pick<DragEvent, 'clientX' | 'clientY'>, rect: Pick<DOMRect, 'top' | 'left' | 'right' | 'width' | 'height'>, leftOrRight = false): DragPosition => {
  // 先判断是否在左右
  const edge = Math.min(Math.max(10, rect.width / 6), 50)
  if (leftOrRight) {
    if (e.clientX < rect.left + edge) return 'left'
    if (e.clientX > rect.right - edge) return 'right'
  }
  if (e.clientY > rect.top + rect.height / 2) return 'after'
  return 'before'
}

const calcLineRect = (
  rootRect: Pick<DOMRect, 'top' | 'left'>,
  rect: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>,
  position: DragPosition
): DragLineRect => {
  switch (position) {
    case 'left':
      return {top: rect.top - rootRect.top, left: rect.left - rootRect.left - 1, width: 2, height: rect.height}
    case 'right':
      return {top: rect.top - rootRect.top, left: rect.right - rootRect.left + 1, width: 2, height: rect.height}
    case 'after':
      return {top: rect.bottom - rootRect.top + 1, left: rect.left - rootRect.left, width: rect.width, height: 2}
    default:
      return {top: rect.top - rootRect.top - 1, left: rect.left - rootRect.left, width: rect.width, height: 2}
  }
}

const DRAG_SCROLL_EDGE = 56
const DRAG_SCROLL_MAX_STEP = 24
const DRAG_WATCHDOG_MS = 500

const calcDragScrollStep = (pointer: number, start: number, end: number) => {
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

const isViewportScroller = (container: HTMLElement) => {
  return container === document.body || container === document.documentElement
}

@DocEventRegister
export class DocDndService {
  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
  }

  private prevDragPosition: DragPosition = 'none'

  private _prevTargetElement: Node | null = null
  private prevBlock: BlockCraft.BlockComponent | null = null

  // 当前 drag-over 链：从 prevBlock 向上走到 root 之前的所有 block hostElement。
  // 任意 block 都可通过 `&.drag-over { ... }` 在 SCSS 中订阅这个状态。
  private dragOverChain: HTMLElement[] = []

  dragStatus$ = new BehaviorSubject(DocDndStatus.end)
  dragEnd$ = this.dragStatus$.asObservable().pipe(filter(v => v === DocDndStatus.end))

  private dragLine: HTMLElement | null = null
  private dragScrollFrame: number | null = null
  private dragMoveFrame: number | null = null
  private lastDragEvent: DragEvent | null = null
  private lastDragLineRect: DragLineRect | null = null
  // 兜底：浏览器在拖回 OS / ESC 取消等场景不一定可靠地触发 drop/dragend
  // 每次 dragover/dragMove 仅更新 lastDragActivityTs；watchdog timer 在到点后自检剩余 idle 时间，
  // 不满阈值就续期。避免高频 dragover 反复 clearTimeout/setTimeout（WKWebView 上 RunLoop 调度成本较高）。
  private dragWatchdog: number | null = null
  private lastDragActivityTs = 0
  // 缓存 root.hostElement 在 viewport 中的位置，避免 dragover 每帧 getBoundingClientRect 触发同步 layout
  private cachedRootHostRect: { top: number, left: number } | null = null

  private refreshCachedRootHostRect = () => {
    const rect = this.doc.root.hostElement.getBoundingClientRect()
    const cached = { top: rect.top, left: rect.left }
    this.cachedRootHostRect = cached
    return cached
  }

  private createDragLine = () => {
    if (this.dragLine) return
    const dragLine = document.createElement('div')
    dragLine.style.cssText = `
      z-index: 10;
      position: absolute;
      top: 0;
      left: 0;
      height: 2px;
      background-color: #3a53d9;
      pointer-events: none;
      will-change: transform, width, height;
      box-shadow: 0 0 2px var(--bc-active-color-light);
    `
    this.doc.root.hostElement.appendChild(dragLine)
    this.dragLine = dragLine
  }

  private moveDragLine = (host: HTMLElement, position: DragPosition, hostRect = host.getBoundingClientRect()) => {
    if (!this.dragLine) return
    const rootRect = this.cachedRootHostRect ?? this.refreshCachedRootHostRect()
    const rect = calcLineRect(rootRect, hostRect, position)
    const prevRect = this.lastDragLineRect
    if (!prevRect || prevRect.left !== rect.left || prevRect.top !== rect.top) {
      this.dragLine.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
    }
    if (!prevRect || prevRect.width !== rect.width) {
      this.dragLine.style.width = rect.width + 'px'
    }
    if (!prevRect || prevRect.height !== rect.height) {
      this.dragLine.style.height = rect.height + 'px'
    }
    this.lastDragLineRect = rect
  }

  private removeDragLine = () => {
    if (!this.dragLine) return
    this.dragLine.remove()
    this.dragLine = null
  }

  private queueDragScroll = (evt: DragEvent) => {
    this.lastDragEvent = evt
    if (this.dragScrollFrame !== null) return
    this.dragScrollFrame = requestAnimationFrame(this.runDragScroll)
  }

  private queueDragMove = (evt: DragEvent) => {
    this.lastDragEvent = evt
    if (this.dragMoveFrame !== null) return
    this.dragMoveFrame = requestAnimationFrame(this.runDragMoveFrame)
  }

  private runDragMoveFrame = () => {
    this.dragMoveFrame = null
    if (this.dragStatus$.value === DocDndStatus.end || !this.lastDragEvent) return
    this.processDragMove(this.lastDragEvent)
  }

  private runDragScroll = () => {
    this.dragScrollFrame = null
    if (this.dragStatus$.value === DocDndStatus.end || !this.lastDragEvent) return

    const container = this.doc.scrollContainer
    if (!container) return

    if (isViewportScroller(container)) {
      const scrollElement = document.scrollingElement as HTMLElement | null
      if (!scrollElement) return
      const deltaY = calcDragScrollStep(this.lastDragEvent.clientY, 0, window.innerHeight)
      if (!deltaY) return

      const nextTop = Math.max(0, Math.min(scrollElement.scrollTop + deltaY, scrollElement.scrollHeight - window.innerHeight))
      if (nextTop === scrollElement.scrollTop) return
      scrollElement.scrollTop = nextTop
      this.queueDragMove(this.lastDragEvent)
      this.dragScrollFrame = requestAnimationFrame(this.runDragScroll)
      return
    }

    const rect = container.getBoundingClientRect()
    const deltaY = calcDragScrollStep(this.lastDragEvent.clientY, rect.top, rect.bottom)
    if (!deltaY) return

    const nextTop = Math.max(0, Math.min(container.scrollTop + deltaY, container.scrollHeight - container.clientHeight))
    if (nextTop === container.scrollTop) return
    container.scrollTop = nextTop
    this.queueDragMove(this.lastDragEvent)
    this.dragScrollFrame = requestAnimationFrame(this.runDragScroll)
  }

  private stopDragScroll = () => {
    this.lastDragEvent = null
    if (this.dragScrollFrame === null) return
    cancelAnimationFrame(this.dragScrollFrame)
    this.dragScrollFrame = null
  }

  private stopDragMove = () => {
    if (this.dragMoveFrame !== null) {
      cancelAnimationFrame(this.dragMoveFrame)
      this.dragMoveFrame = null
    }
  }

  private resetDragWatchdog = () => {
    this.lastDragActivityTs = performance.now()
    if (this.dragWatchdog !== null) return
    this.dragWatchdog = window.setTimeout(this._watchdogTick, DRAG_WATCHDOG_MS)
  }

  private _watchdogTick = () => {
    this.dragWatchdog = null
    const idle = performance.now() - this.lastDragActivityTs
    if (idle >= DRAG_WATCHDOG_MS) {
      this.clearDrag()
      return
    }
    this.dragWatchdog = window.setTimeout(this._watchdogTick, DRAG_WATCHDOG_MS - idle)
  }

  private stopDragWatchdog = () => {
    if (this.dragWatchdog === null) return
    clearTimeout(this.dragWatchdog)
    this.dragWatchdog = null
  }

  // 维护 drag-over class 的 ancestor chain：进来的 block + 所有 block 类型祖先（不含 root）。
  // 每次 drop target 变化时增量更新，避免逐次 add/remove 触发 reflow。
  private updateDragOverChain = (target: BlockCraft.BlockComponent | null) => {
    const next: HTMLElement[] = []
    let cursor: BlockCraft.BlockComponent | null = target
    while (cursor && cursor.flavour !== 'root') {
      next.push(cursor.hostElement)
      cursor = cursor.parentBlock ?? null
    }

    const prev = this.dragOverChain
    if (prev.length === next.length && prev.every((el, i) => el === next[i])) return

    const nextSet = new Set(next)
    for (const el of prev) {
      if (!nextSet.has(el)) el.classList.remove('drag-over')
    }
    const prevSet = new Set(prev)
    for (const el of next) {
      if (!prevSet.has(el)) el.classList.add('drag-over')
    }
    this.dragOverChain = next
  }

  private processDragMove = (evt: DragEvent) => {
    if (this.dragStatus$.value !== DocDndStatus.moving) {
      this.dragStatus$.next(DocDndStatus.moving)
    }
    this.resetDragWatchdog()

    // === 阶段 1：识别 activeBlock ===
    // 失败的场景（gap / root / leaf / 已进入的 _inBlock）不再 return，
    // 而是落到阶段 2 用现有 prevBlock + 当前 Y 重新计算拖拽线位置，避免“卡住”。
    const evtTarget = (document.elementFromPoint(evt.clientX, evt.clientY) ?? evt.target) as Node | null
    const validTarget = evtTarget && evtTarget !== this.doc.root.hostElement
    const blockId = validTarget
      ? (evtTarget === this._prevTargetElement
          ? this.prevBlock?.id
          : closetBlockId(evtTarget))
      : null

    let activeBlock: BlockCraft.BlockComponent | null = null
    if (blockId) {
      activeBlock = (blockId === this.prevBlock?.id
        ? this.prevBlock
        : this.doc.getBlockById(blockId)) ?? null
      if (activeBlock?.flavour === 'root') activeBlock = null
    }

    if (activeBlock) {
      this._prevTargetElement = evtTarget

      if (this.prevBlock !== activeBlock && activeBlock !== this._inBlock) {
        const schema = this.doc.schemas.get(activeBlock.flavour)!

        if (schema.metadata.renderUnit) {
          // renderUnit 用父容器中心决定 before/after，并把目标设为对应的首/末子块
          // 这里位置和容器绑定（不是子块自身），保留原有自渲染逻辑后直接返回
          this._inBlock = activeBlock
          const renderBlockRect = activeBlock.hostElement.getBoundingClientRect()
          const position = calcPositionByRect(evt, renderBlockRect)
          const childBlock = position === 'before' ? activeBlock.firstChildren : activeBlock.lastChildren
          if (childBlock) {
            this.prevBlock = childBlock
            this.prevDragPosition = position
            this.moveDragLine(childBlock.hostElement, position)
          }
          this.updateDragOverChain(this.prevBlock)
          return
        }

        if (activeBlock.nodeType === 'block') {
          this._inBlock = null
        }
        // isLeaf：不更新 prevBlock（leaf 不能作为子级容器），但仍落到阶段 2 刷新线位置
        if (!schema.metadata.isLeaf) {
          this.prevBlock = activeBlock
        }
      }
    }

    // === 阶段 2：基于 prevBlock 刷新拖拽线（兜底） ===
    if (!this.prevBlock?.hostElement?.isConnected) return
    const hostRect = this.prevBlock.hostElement.getBoundingClientRect()
    const parentFlavour = this.prevBlock.parentBlock?.flavour
    const allowColumnDrop = !this.prevBlock.flavour.startsWith('column')
      && this.doc.schemas.has('column')
      && parentFlavour != null
      && ['root', 'column'].includes(parentFlavour)
    const position = calcPositionByRect(evt, hostRect, allowColumnDrop)
    this.prevDragPosition = position
    this.moveDragLine(this.prevBlock.hostElement, position, hostRect)
    this.updateDragOverChain(this.prevBlock)
  }

  // 外部文件 拖拽响应
  @EventListen('dragEnter')
  onRootDragEnter(ctx: UIEventStateContext) {
    if (this.dragStatus$.value !== DocDndStatus.end) return
    const evt: DragEvent = ctx.getDefaultEvent()
    if (!evt.dataTransfer?.types.includes(DocDndDataTypes.file)) return false
    // evt.preventDefault()
    this._onDragStart(evt)

    return true
  }

  // 手动触发drag
  startDrag(evt: DragEvent, data: {
    dragDataType: DocDndDataType,
    dragData: string
  }[],) {
    if (evt.type !== 'dragstart') return
    evt.stopPropagation()
    const dataTransfer = evt.dataTransfer
    if (dataTransfer) {
      dataTransfer.clearData()
      dataTransfer.dropEffect = 'move'
      dataTransfer.effectAllowed = 'move';
      data.forEach(d => {
        dataTransfer.setData(d.dragDataType, d.dragData)
      })
    }

    this._onDragStart(evt)
  }

  private _onDragStart(evt: DragEvent) {
    if(this.doc.isReadonly) return
    this.doc.ngZone.runOutsideAngular(() => {
      this.clearDrag()
      this.dragStatus$.next(DocDndStatus.start)
      // this.doc.root.hostElement.classList.add('dragging')
      this.createDragLine()
      this.refreshCachedRootHostRect()
      this.resetDragWatchdog()

      // root.hostElement 在拖拽期间通常不动，缓存其 viewport top/left 避免每帧重测。
      // 但窗口缩放 / 外层容器滚动 / 文档自身滚动可能改变它的视口位置，需要失效缓存。
      // 用 passive 监听，且只清空缓存（下次 moveDragLine 内部再 lazy 刷新），避免在 scroll/resize 风暴中额外做 layout。
      const invalidateRootRect = () => { this.cachedRootHostRect = null }
      window.addEventListener('resize', invalidateRootRect, {passive: true})
      window.addEventListener('scroll', invalidateRootRect, {passive: true, capture: true})
      this.dragEnd$.pipe(take(1)).subscribe(() => {
        window.removeEventListener('resize', invalidateRootRect)
        window.removeEventListener('scroll', invalidateRootRect, {capture: true} as any)
      })
      // 防止释放时会有个返回的动画
      fromEvent<DragEvent>(document, 'dragover').pipe(takeUntil(this.dragEnd$))
        .subscribe((e) => {
          e.preventDefault()
          this.resetDragWatchdog()
          this.queueDragScroll(e)
        })

      fromEvent<DragEvent>(document, 'drop').pipe(takeUntil(this.dragEnd$))
        .subscribe((e) => {
          e.preventDefault()
          e.stopPropagation()
          if (this.prevBlock && this.prevDragPosition) {
            this._parseDragData(e)
          }
          this.clearDrag()
        })

      // 兜底 1：外部文件被拖回 OS（window 的 dragend 不会触发）
      // 注意：Safari 在元素间移动时也会把 relatedTarget 设为 null，
      // 因此只能用坐标判断是否真的越出视口，不能依赖 relatedTarget。
      fromEvent<DragEvent>(document, 'dragleave').pipe(takeUntil(this.dragEnd$))
        .subscribe((e) => {
          const outOfWindow = e.clientX <= 0
            || e.clientY <= 0
            || e.clientX >= window.innerWidth
            || e.clientY >= window.innerHeight
          if (outOfWindow) this.clearDrag()
        })

      // 兜底 2：ESC 取消拖拽（部分浏览器不会可靠触发 dragend）
      fromEvent<KeyboardEvent>(document, 'keydown').pipe(takeUntil(this.dragEnd$))
        .subscribe((e) => {
          if (e.key === 'Escape') this.clearDrag()
        })

      // 兜底 3：document 级 dragend（除了原本 window 上的兜底，再加一层冒泡监听）
      fromEvent<DragEvent>(document, 'dragend').pipe(takeUntil(this.dragEnd$))
        .subscribe(() => this.clearDrag())

      // dragMove处理
      this.doc.event.add('dragMove', this.onDragMove)
      window.addEventListener('dragend', () => {
        this.clearDrag()
      }, {once: true})
    })
  }

  // 所在的nodeType为block的块内部
  private _inBlock: BlockCraft.BlockComponent | null = null

  private onDragMove = (ctx: UIEventStateContext) => {
    this.doc.ngZone.runOutsideAngular(() => {
      const evt: DragEvent = ctx.getDefaultEvent()
      evt.preventDefault()
      ctx.stopPropagation()
      this.queueDragMove(evt)
    })
    return true
  }

  private clearDrag = () => {
    // 幂等：line 和 watchdog 即使在 status === end 的异常路径下也要兜底清理，
    // 防止 dragLine 残留在 DOM（曾出现“拖拽结束蓝线还在”的场景）。
    this.removeDragLine()
    this.stopDragWatchdog()
    this.updateDragOverChain(null)
    if (this.dragStatus$.value === DocDndStatus.end) return
    this.stopDragScroll()
    this.stopDragMove()
    this.dragStatus$.next(DocDndStatus.end)
    this.prevDragPosition = 'none'
    this.prevBlock = null
    this._prevTargetElement = null
    this.lastDragLineRect = null
    this.cachedRootHostRect = null
    this.doc.event.remove('dragMove', this.onDragMove)
    this._inBlock = null
  }

  private _handleSourceParentAfterMove(blockId: string) {
    const sourceParent = this.doc.getBlockById(blockId)
    if (sourceParent?.childrenLength === 0) {
      const schema = this.doc.schemas.get(sourceParent.flavour)!
      if (schema.metadata.renderUnit) {
        this.doc.crud.insertBlocks(sourceParent.id, 0, [this.doc.schemas.createSnapshot('paragraph', [])])
      } else {
        this.doc.crud.deleteBlockById(sourceParent.id)
      }
    }
  }

  onSetColumn(block: BlockCraft.BlockComponent, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    const parent = targetBlock.parentBlock
    const columnSchema = this.doc.schemas.get('column')
    if (!parent || !columnSchema) return
    if (parent.flavour === 'column') {
      if (parent.parentBlock!.childrenLength >= 8) {
        this.doc.messageService.warn(`分栏最多支持8列`)
        return
      }

      const newColumn = this.doc.schemas.createSnapshot('column', [[]])
      const _insertIdx = parent.getIndexOfParent() + (position === 'left' ? 0 : 1)

      const sourceParentId = block.parentId!
      this.doc.crud.insertBlocks(parent.parentId!, _insertIdx, [newColumn])
      this.doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1, newColumn.id, 0)
      this._handleSourceParentAfterMove(sourceParentId)
      return;
    }
    if (!this.doc.schemas.isValidChildren(block.flavour, columnSchema) || !this.doc.schemas.isValidChildren(targetBlock.flavour, columnSchema)) {
      this.doc.messageService.warn(`不允许的分栏内容`)
      return
    }
    const columns = this.doc.schemas.createSnapshot('columns', [2])
    const column1 = columns.children[0] as IBlockSnapshot
    const column2 = columns.children[1] as IBlockSnapshot
    column1.children = []
    column2.children = []
    this.doc.crud.transact(() => {
      this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent(), [columns])
    })
    this.doc.crud.transact(() => {
      const sourceParentId = block.parentId!
      this.doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1, position === 'left' ? column1.id : column2.id, 0)
      this.doc.crud.moveBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent(), 1, position === 'left' ? column2.id : column1.id, 0)
      this._handleSourceParentAfterMove(sourceParentId)
    })
  }

  onSortBlock(block: BlockCraft.BlockComponent, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    const isDepthEqual = block.props['depth'] === targetBlock.props['depth']
    if (!block || position === 'none' || targetBlock === block) return
    if (position === 'left' || position === 'right') {
      this.onSetColumn(block, targetBlock, position)
      return;
    }

    if (block.hostElement.nextElementSibling === targetBlock.hostElement && position === 'before') {
      !isDepthEqual && block.updateProps({depth: targetBlock.props.depth})
      return
    }

    if (block.hostElement.previousElementSibling === targetBlock.hostElement && position === 'after') {
      !isDepthEqual && block.updateProps({depth: targetBlock.props.depth})
      return
    }

    if (!this.doc.schemas.isValidChildren(block.flavour, targetBlock.parentBlock!.flavour)) {
      this.doc.messageService.warn(`不允许的移动`)
      return
    }

    let targetIdx = targetBlock.getIndexOfParent()
    const posRelationship = this.doc.compareBlockPosition(block, targetBlock)
    if (position === 'before' && posRelationship === BLOCK_POSITION.AFTER) {
      targetIdx = Math.max(0, targetIdx - 1)
    }
    if (position === 'after' && (targetBlock.parentId !== block.parentId || posRelationship === BLOCK_POSITION.BEFORE)) {
      targetIdx += 1
    }

    this.doc.crud.transact(() => {
      if (!isDepthEqual) {
        block.updateProps({depth: targetBlock.props['depth']})
      }

      const sourceParentId = block.parentId!
      this.doc.crud.moveBlocks(sourceParentId, block.getIndexOfParent(), 1,
        targetBlock.parentId!, targetIdx)

      this._handleSourceParentAfterMove(sourceParentId)
    })
  }

  // TODO 文件处理应该交由插件
  onInsertFiles(files: FileList, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    if (!files?.length || position === 'none') return
    const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    if (!files.length) return
    if (files.length === 1 && files[0].type.startsWith('image/')) {
      if (!this.doc.schemas.isValidChildren('image', targetBlock.parentBlock!.flavour)) {
        this.doc.messageService.warn(`此处不能添加图片`)
        return
      }

      const url = fileService.createObjectURL(files[0])
      this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0),
        [this.doc.schemas.createSnapshot('image', [url])])
      return
    }

    if (files.length === 1 && files[0].type.startsWith('video/')) {
      if (this.doc.schemas.get('video') && this.doc.schemas.isValidChildren('video', targetBlock.parentBlock!.flavour)) {
        const url = fileService.createObjectURL(files[0])
        const snapshot = this.doc.schemas.createSnapshot('video', [{
          url,
          name: files[0].name,
          size: files[0].size,
          type: files[0].type,
          sourceType: 'local' as const,
        }])
        snapshot.props.depth = targetBlock.props['depth']
        this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot])
        return
      }
    }

    if (files.length === 1 && files[0].type.startsWith('audio/')) {
      if (this.doc.schemas.get('audio') && this.doc.schemas.isValidChildren('audio', targetBlock.parentBlock!.flavour)) {
        const url = fileService.createObjectURL(files[0])
        const snapshot = this.doc.schemas.createSnapshot('audio', [{
          url,
          name: files[0].name,
          size: files[0].size,
          type: files[0].type,
          sourceType: 'local' as const,
        }])
        snapshot.props.depth = targetBlock.props['depth']
        this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot])
        return
      }
    }

    if (!this.doc.schemas.isValidChildren('attachment', targetBlock.parentBlock!.flavour)) {
      this.doc.messageService.warn(`此处不能添加文件`)
      return
    }

    const _files = Array.from(files).filter(v => !v.type.startsWith('image/'))
    const _blocks: IBlockSnapshot[] = _files.map(f => {
      const url = fileService.createObjectURL(f)
      return this.doc.schemas.createSnapshot('attachment', [{
        name: f.name,
        size: f.size,
        type: f.type,
        url,
      }])
    })

    if (!_blocks.length) return
    // TAG: Depth
    _blocks.forEach(b => b.props.depth = targetBlock.props['depth'])
    this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), _blocks)
  }

  onInsertNewBlock(flavour: BlockCraft.BlockFlavour, initProps: IBlockProps, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    if (!this.doc.schemas.isValidChildren(flavour, targetBlock.parentBlock!.flavour)) {
      const newSchema = this.doc.schemas.get(flavour)
      this.doc.messageService.warn(`此处不能添加${newSchema?.metadata.label}`)
      return
    }

    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
    if (!this.doc.schemas.has(flavour)) return
    blockCreator.getParamsByScheme(this.doc.schemas.get(flavour)!).then(params => {
      if (!params) return
      const snapshot = this.doc.schemas.createSnapshot(flavour, <any>params)
      initProps && Object.assign(snapshot.props, initProps)
      void this.doc.chain()
        .insertSnapshots(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot])
        .setCursorAtBlock(snapshot.id, true)
        .run()
    })
  }

  @EventListen('drop')
  onDrop(ctx: UIEventStateContext) {
    ctx.preventDefault()
    const evt: DragEvent = ctx.getDefaultEvent()

    this._parseDragData(evt)
    this.clearDrag()

    return true
  }

  // TODO 代码优化： 应该允许自定义拖拽源类型并且使用服务处理dragEnd或者drop
  protected _parseDragData(evt: DragEvent) {
    if (!this.prevBlock || !this.prevDragPosition || !evt.dataTransfer) return

    // 从原始块拖拽的
    if (evt.dataTransfer.types.includes(DocDndDataTypes.originBlock)) {
      const bid = evt.dataTransfer.getData(DocDndDataTypes.originBlock)
      if (!bid) return
      this.onSortBlock(this.doc.getBlockById(bid), this.prevBlock, this.prevDragPosition)
    } else if (evt.dataTransfer.types.includes(DocDndDataTypes.newBlock)) {
      const flavour = evt.dataTransfer.getData(DocDndDataTypes.newBlock)
      const initPropsStr = evt.dataTransfer.getData(DocDndDataTypes.newBlockProps)
      let initProps: IBlockProps = {}
      if (initPropsStr) {
        initProps = JSON.parse(initPropsStr)
      }
      this.onInsertNewBlock(<any>flavour, initProps, this.prevBlock, this.prevDragPosition)
    } else if (evt.dataTransfer.files) {
      this.onInsertFiles(evt.dataTransfer.files!, this.prevBlock!, this.prevDragPosition)
    }
  }
}
