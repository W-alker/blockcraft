import {BehaviorSubject, filter, fromEvent, takeUntil} from "rxjs";
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

  dragStatus$ = new BehaviorSubject(DocDndStatus.end)
  dragEnd$ = this.dragStatus$.asObservable().pipe(filter(v => v === DocDndStatus.end))

  private dragLine: HTMLElement | null = null
  private dragScrollFrame: number | null = null
  private dragMoveFrame: number | null = null
  private lastDragEvent: DragEvent | null = null
  private lastDragLineRect: DragLineRect | null = null
  // private rootRect: Pick<DOMRect, 'top' | 'left' | 'width' | 'height'> = {top: 0, left: 0, width: 0, height: 0}

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
    const rect = calcLineRect(this.doc.root.hostElement.getBoundingClientRect(), hostRect, position)
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

  private processDragMove = (evt: DragEvent) => {
    this.dragStatus$.next(DocDndStatus.moving)

    const evtTarget = (document.elementFromPoint(evt.clientX, evt.clientY) ?? evt.target) as Node | null
    if (!evtTarget || evtTarget === this.doc.root.hostElement) return

    const blockId = evtTarget === this._prevTargetElement
      ? this.prevBlock?.id
      : closetBlockId(evtTarget)
    if (!blockId) return

    let activeBlock = blockId === this.prevBlock?.id
      ? this.prevBlock
      : this.doc.getBlockById(blockId)
    if (!activeBlock || activeBlock.flavour === 'root') return
    this._prevTargetElement = evtTarget

    if (this.prevBlock !== activeBlock) {
      if (activeBlock === this._inBlock) return
      const schema = this.doc.schemas.get(activeBlock.flavour)!

      if (schema.metadata.renderUnit) {
        this._inBlock = activeBlock
        const renderBlockRect = activeBlock.hostElement.getBoundingClientRect()
        const position = calcPositionByRect(evt, renderBlockRect)
        activeBlock = position === 'before' ? this._inBlock!.firstChildren! : this._inBlock!.lastChildren!
        this.prevBlock = activeBlock
        this.prevDragPosition = position
        this.moveDragLine(this.prevBlock.hostElement, position)
        return
      }

      if (activeBlock.nodeType === 'block') {
        this._inBlock = null
      }
      if (schema.metadata.isLeaf) return
      this.prevBlock = activeBlock
    }

    const hostRect = this.prevBlock.hostElement.getBoundingClientRect()
    const allowColumnDrop = !activeBlock.flavour.startsWith('column')
      && this.doc.schemas.has('column')
      && ['root', 'column'].includes(this.prevBlock.parentBlock!.flavour)
    const position = calcPositionByRect(evt, hostRect, allowColumnDrop)
    this.prevDragPosition = position
    this.moveDragLine(this.prevBlock.hostElement, position, hostRect)
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
    this.doc.ngZone.runOutsideAngular(() => {
      this.clearDrag()
      this.dragStatus$.next(DocDndStatus.start)
      // this.doc.root.hostElement.classList.add('dragging')
      this.createDragLine()
      // 防止释放时会有个返回的动画
      fromEvent<DragEvent>(document, 'dragover').pipe(takeUntil(this.dragEnd$))
        .subscribe((e) => {
          e.preventDefault()
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
    // this.doc.root.hostElement.classList.remove('dragging')
    if (this.dragStatus$.value === DocDndStatus.end) return
    // this.virtualScroller?.forEach(e => e.remove())
    // this.virtualScroller = null
    this.stopDragScroll()
    this.stopDragMove()
    this.removeDragLine()
    this.dragStatus$.next(DocDndStatus.end)
    this.prevDragPosition = 'none'
    this.prevBlock = null
    this._prevTargetElement = null
    this.lastDragLineRect = null
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

      fileService.uploadImg(files[0]).then(v => {
        this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0),
          [this.doc.schemas.createSnapshot('image', [v])])
      }).catch(err => {
        this.doc.messageService.error(`上传失败: ${err.message}`)
      })
      return
    }

    if (!this.doc.schemas.isValidChildren('attachment', targetBlock.parentBlock!.flavour)) {
      this.doc.messageService.warn(`此处不能添加文件`)
      return
    }

    const _files = Array.from(files).filter(v => !v.type.startsWith('image/'))
    Promise.allSettled(_files.map(v => fileService.uploadAttachment(v))).then(v => {
      const _blocks: IBlockSnapshot[] = []
      v.forEach((r, i) => {
        if (r.status !== 'fulfilled') {
          this.doc.messageService.error(`${r.reason}`)
          return
        }
        _blocks.push(this.doc.schemas.createSnapshot('attachment', [(r.value as any)]))
      })

      if (!_blocks.length) return
      // TAG: Depth
      _blocks.forEach(b => b.props.depth = targetBlock.props['depth'])
      this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), _blocks)
    })
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
