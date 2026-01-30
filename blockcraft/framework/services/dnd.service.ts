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
import {throttle} from "../../global";

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

const calcPosition = (e: DragEvent, blockWrap: HTMLElement, leftOrRight = false): DragPosition => {
  const rect = blockWrap.getBoundingClientRect()
  // 先判断是否在左右
  const edge = Math.min(Math.max(10, rect.width / 6), 50)
  if (leftOrRight) {
    if (e.clientX < rect.left + edge) return 'left'
    if (e.clientX > rect.right - edge) return 'right'
  }
  if (e.clientY > rect.top + rect.height / 2) return 'after'
  return 'before'
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
      box-shadow: 0 0 2px var(--bc-active-color-light);
    `
    this.doc.root.hostElement.appendChild(dragLine)
    this.dragLine = dragLine
  }

  private moveDragLine = (host: HTMLElement, position: DragPosition) => {
    if (!this.dragLine) return

    const calcLineRect = (blockWrap: HTMLElement, position: DragPosition) => {
      const rootRect = this.doc.root.hostElement.getBoundingClientRect()
      const rect = blockWrap.getBoundingClientRect()
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

    const rect = calcLineRect(host, position)
    this.dragLine.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    if (!this.dragLine.style.transition) {
      requestAnimationFrame(() => {
        if (!this.dragLine) return
        this.dragLine.style.transition = 'transform .08s'
      })
    }
    this.dragLine.style.width = rect.width + 'px';
    this.dragLine.style.height = rect.height + 'px';
  }

  private removeDragLine = () => {
    if (!this.dragLine) return
    this.dragLine.remove()
    this.dragLine = null
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

  private onDragMove = throttle((ctx: UIEventStateContext) => {
    this.doc.ngZone.runOutsideAngular(() => {
      const evt: DragEvent = ctx.getDefaultEvent()
      evt.preventDefault()
      ctx.stopPropagation()
      this.dragStatus$.next(DocDndStatus.moving)

      const evtTarget = evt.target as Node
      if (evtTarget === this.doc.root.hostElement) return
      let activeBlock = null
      if (evtTarget === this._prevTargetElement) activeBlock = this.prevBlock
      else {
        const blockId = closetBlockId(evt.target as Node)
        if (!blockId) return
        activeBlock = this.doc.getBlockById(blockId)
      }
      if (!activeBlock || activeBlock.flavour === 'root') return
      if (this.prevBlock !== activeBlock) {
        if (activeBlock === this._inBlock) return
        const schema = this.doc.schemas.get(activeBlock.flavour)!

        // 对于在特殊block块内部特殊处理
        if (schema.metadata.renderUnit) {
          this._inBlock = activeBlock
          const position = calcPosition(evt, activeBlock.hostElement)
          if (position === 'before') {
            activeBlock = this._inBlock!.firstChildren!
          } else {
            activeBlock = this._inBlock!.lastChildren!
          }
          this.prevBlock = activeBlock
          this.moveDragLine(this.prevBlock.hostElement, this.prevDragPosition = position)
          return
        }

        // 跳出所在的特殊block块后，清除所在block块记录
        if (activeBlock.nodeType === 'block') {
          this._inBlock = null
        }
        if (schema.metadata.isLeaf) return;
        this.prevBlock = activeBlock
      }

      // const position = calcPosition(evt, this.prevBlock.hostElement)
      const position = calcPosition(evt, this.prevBlock.hostElement, !activeBlock.flavour.startsWith('column') && this.doc.schemas.has('column') && ['root', 'column'].includes(this.prevBlock.parentBlock!.flavour))
      if (this.prevDragPosition === position) return
      this.moveDragLine(this.prevBlock.hostElement, this.prevDragPosition = position)
    })
    return true
  }, 32)

  private clearDrag = () => {
    // this.doc.root.hostElement.classList.remove('dragging')
    if (this.dragStatus$.value === DocDndStatus.end) return
    // this.virtualScroller?.forEach(e => e.remove())
    // this.virtualScroller = null
    this.removeDragLine()
    this.dragStatus$.next(DocDndStatus.end)
    this.prevDragPosition = 'none'
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
      this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot]).then(() => {
        this.doc.selection.setCursorAtBlock(snapshot.id, true)
      })
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
