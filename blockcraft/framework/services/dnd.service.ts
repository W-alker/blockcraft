import {fromEvent, Subscription, take} from "rxjs";
import {UIEventStateContext} from "../block-std";
import {closetBlockId} from "../utils";
import {BlockNodeType, IBlockSnapshot} from "../block-std";
import {DocEventRegister, EventListen, EventNames} from "../block-std";
import {BLOCK_POSITION} from "../doc";
import {DOC_FILE_SERVICE_TOKEN} from "./file.service";
import {ClipboardDataType} from "../modules";
import {BLOCK_CREATOR_SERVICE_TOKEN} from "./block-creator.service";

export enum DocDndDataTypes {
  // 已有的block
  originBlock = 'origin-block',
  // 新的block
  newBlock = 'new-block',
  // 文件
  file = 'Files',
}

export type DocDndDataType = `${DocDndDataTypes}` | string

export enum DocDndStatus {
  start = 'start',
  moving = 'moving',
  end = 'end',
}

const calcPosition = (e: DragEvent, blockWrap: HTMLElement) => {
  const rect = blockWrap.getBoundingClientRect()
  if (e.clientY > rect.top + rect.height / 2) return 'after'
  return 'before'
}

@DocEventRegister
export class DocDndService {
  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
  }

  private dragLine?: HTMLElement

  private createDragLine = () => {
    if(this.dragLine) return
    const dragLine = document.createElement('div')
    dragLine.style.cssText = `
      position: absolute;
      height: 2px;
      background-color: #3a53d9;
      pointer-events: none;
      transition: all 0.08s;
      box-shadow: 0 0 2px var(--bc-active-color-light);
    `
    this.doc.root.hostElement.appendChild(dragLine)
    this.dragLine = dragLine
  }

  private moveDragLine = (host: HTMLElement, position: 'after' | 'before') => {
    if (!this.dragLine) return

    const calcLineRect = (blockWrap: HTMLElement, position: 'after' | 'before') => {
      const rootRect = this.doc.root.hostElement.getBoundingClientRect()
      const rect = blockWrap.getBoundingClientRect()
      if (position === 'after')
        return {top: rect.bottom - rootRect.top + 1, left: rect.left - rootRect.left, width: rect.width}
      return {top: rect.top - rootRect.top - 1, left: rect.left - rootRect.left, width: rect.width}
    }

    const rect = calcLineRect(host, position)
    this.dragLine.style.display = 'block'
    this.dragLine.style.top = rect.top + 'px'
    this.dragLine.style.left = rect.left + 'px'
    this.dragLine.style.width = rect.width + 'px'
  }

  private removeDragLine = () => {
    if (!this.dragLine) return
    this.dragLine.remove()
    this.dragLine = undefined
  }

  private prevDragPosition: 'before' | 'after' | 'none' = 'none'

  private _prevTargetElement: HTMLElement | null = null
  private prevBlock: BlockCraft.BlockComponent | null = null
  private dragPreventListener: Subscription | undefined = undefined

  private dragMoveListener: (() => void) | null = null

  // 外部文件 拖拽响应
  @EventListen(EventNames.dragEnter, {flavour: 'root'})
  onRootDragEnter(ctx: UIEventStateContext) {
    const evt: DragEvent = ctx.getDefaultEvent()
    evt.preventDefault()
    if (!evt.dataTransfer?.types.includes(ClipboardDataType.FILES)) return false
    this._onDragStart(evt)

    return true
  }

  startDrag(evt: DragEvent, dragDataType: DocDndDataType, dragData: string) {
    if(evt.type !== 'dragstart') return
    const dataTransfer = evt.dataTransfer
    if (dataTransfer) {
      dataTransfer.clearData()
      dataTransfer.dropEffect = 'none'
      dataTransfer.setData(dragDataType, dragData)
    }

    this._onDragStart(evt)

    fromEvent<DragEvent>(evt.target!, 'dragend').pipe(take(1))
      .subscribe(evt => {
        this._parseDragData(evt)
        this.clearDrag()
      })
  }

  private _onDragStart(evt: DragEvent) {
    this.createDragLine()
    // 防止释放时会有个返回的动画
    this.dragPreventListener = fromEvent<DragEvent>(document.body, 'dragover')
      .subscribe((e) => {
        e.preventDefault()
        e.stopPropagation()
      })

    this.dragMoveListener = this.doc.event.add(EventNames.dragMove, this.onDragMove)
  }

  private onDragMove = (ctx: UIEventStateContext) => {
    const evt: DragEvent = ctx.getDefaultEvent()
    evt.preventDefault()
    ctx.stopPropagation()

    const evtTarget = evt.target as Node
    if (evtTarget === this._prevTargetElement) return true

    const blockId = closetBlockId(evt.target as Node)
    if (!blockId) return
    if (this.prevBlock?.id !== blockId) {
      const block = this.doc.getBlockById(blockId)
      if (block.nodeType === BlockNodeType.root) return
      const schema = this.doc.schemas.get(block.flavour)
      if (schema.metadata.isLeaf) return;
      this.prevBlock = block
    }

    const position = calcPosition(evt, this.prevBlock.hostElement)
    if (this.prevDragPosition === position) return
    this.moveDragLine(this.prevBlock.hostElement, this.prevDragPosition = position)
    return true
  }

  private clearDrag = () => {
    this.removeDragLine()
    this.dragPreventListener?.unsubscribe()
    this.dragPreventListener = undefined
    this.prevDragPosition = 'none'
    this.dragMoveListener?.()
    this.dragMoveListener = null
  }

  onSortBlock(block: BlockCraft.BlockComponent, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    // @ts-expect-error
    const isDepthEqual = block.props['depth'] === targetBlock.props['depth']
    if (!block || position === 'none' || targetBlock === block) return

    if (block.hostElement.nextElementSibling === targetBlock.hostElement && position === 'before') {
      // @ts-expect-error
      !isDepthEqual && block.updateProps({depth: targetBlock.props['depth']})
      return
    }

    if (block.hostElement.previousElementSibling === targetBlock.hostElement && position === 'after') {
      // @ts-expect-error
      !isDepthEqual && block.updateProps({depth: targetBlock.props['depth']})
      return
    }

    if (!this.doc.schemas.isValidChildren(block.flavour, this.doc.schemas.get(targetBlock.parentBlock!.flavour))) {
      console.log(block.flavour, targetBlock.parentBlock!.flavour)
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

    this.doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1,
      targetBlock.parentId!, targetIdx).then(() => {
      // @ts-expect-error
      !isDepthEqual && block.updateProps({depth: targetBlock.props['depth']})
    })
  }

  // TODO 文件处理应该交由插件
  onInsertFiles(files: FileList, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    if (!files?.length || position === 'none') return
    const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    if (!files.length) return
    if (files.length === 1 && files[0].type.startsWith('image/')) {
      if (!this.doc.schemas.isValidChildren('image', this.doc.schemas.get(targetBlock.parentBlock!.flavour))) {
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

    if (!this.doc.schemas.isValidChildren('attachment', this.doc.schemas.get(targetBlock.parentBlock!.flavour))) {
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
      // @ts-expect-error
      _blocks.forEach(b => b.props.depth = targetBlock.props['depth'])
      this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), _blocks)
    })
  }

  onInsertNewBlock(flavour: BlockCraft.BlockFlavour, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    if (!this.doc.schemas.isValidChildren(flavour, this.doc.schemas.get(targetBlock.parentBlock!.flavour))) {
      this.doc.messageService.warn(`此处不能添加图片`)
      return
    }

    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
    if (!this.doc.schemas.has(flavour)) return
    blockCreator.getParamsByScheme(this.doc.schemas.get(flavour)).then(params => {
      if (!params) return
      const snapshot = this.doc.schemas.createSnapshot(flavour, <any>params)
      this.doc.crud.insertBlocks(targetBlock.parentId!, targetBlock.getIndexOfParent() + (position === 'after' ? 1 : 0), [snapshot]).then(() => {
        this.doc.selection.selectOrSetCursorAtBlock(snapshot.id, true)
      })
    })
  }

  @EventListen(EventNames.drop, {flavour: 'root'})
  onDrop(ctx: UIEventStateContext) {
    ctx.preventDefault()
    const evt: DragEvent = ctx.getDefaultEvent()

    this._parseDragData(evt)
    this.clearDrag()

    return true
  }

  protected _parseDragData(evt: DragEvent) {
    if (!this.prevBlock || !this.prevDragPosition || !evt.dataTransfer) return

    // 从原始块拖拽的
    if (evt.dataTransfer.types.includes(DocDndDataTypes.originBlock)) {
      const bid = evt.dataTransfer.getData(DocDndDataTypes.originBlock)
      if (!bid) return
      this.onSortBlock(this.doc.getBlockById(bid), this.prevBlock, this.prevDragPosition)
    } else if (evt.dataTransfer.types.includes(DocDndDataTypes.newBlock)) {
      const flavour = evt.dataTransfer.getData(DocDndDataTypes.newBlock)
      this.onInsertNewBlock(<any>flavour, this.prevBlock, this.prevDragPosition)
    } else if (evt.dataTransfer.files) {
      this.onInsertFiles(evt.dataTransfer.files!, this.prevBlock!, this.prevDragPosition)
    }
  }
}
