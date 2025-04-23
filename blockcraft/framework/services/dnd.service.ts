import {fromEvent, Subscription, throttleTime} from "rxjs";
import {UIEventStateContext} from "../event/base";
import {closetBlockId} from "../utils";
import {BlockNodeType} from "../types";
import {DocEventRegister} from "../event";

export enum DocDndDataTypes {
  // 已有的block
  originBlock = 'originBlock',
  // 新的block
  newBlock = 'newBlock',
  // 文件
  file = 'Files',
}

const calcPosition = (e: DragEvent, blockWrap: HTMLElement) => {
  const rect = blockWrap.getBoundingClientRect()
  if (e.clientY > rect.top + rect.height / 2) return 'after'
  return 'before'
}

@DocEventRegister
export interface DocDndEventDataTransfer {
  getData<T extends DocDndDataTypes>(type: T): string

  types: DocDndDataTypes[]
}

export class DocDndService {
  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
  }

  private dragLine?: HTMLElement

  private createDragLine = () => {
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
  private prevBlock: BlockCraft.BlockComponent | null = null
  private dragMoveSub: Subscription | undefined = undefined
  private dragPreventListener: Subscription | undefined = undefined

  private onDragStart = (evt: DragEvent) => {
    const dataTransfer = evt.dataTransfer
    if (dataTransfer) {
      dataTransfer.clearData()
      dataTransfer.dropEffect = 'none'
    }

    this.createDragLine()
    // 防止释放时会有个返回的动画
    this.dragPreventListener = fromEvent<DragEvent>(document.body, 'dragover')
      .subscribe((e) => {
        e.preventDefault()
        e.stopPropagation()
      })
  }

  startDrag(evt: DragEvent, dragDataType: DocDndDataTypes, dragData: string) {
    const dataTransfer = evt.dataTransfer
    if (dataTransfer) {
      dataTransfer.clearData()
      dataTransfer.dropEffect = 'none'
      dataTransfer.setData(dragDataType, dragData)
    }

    this.createDragLine()
    // 防止释放时会有个返回的动画
    this.dragPreventListener = fromEvent<DragEvent>(document.body, 'dragover')
      .subscribe((e) => {
        e.preventDefault()
        e.stopPropagation()
      })
  }

  private onDragMove = (ctx: UIEventStateContext) => {
    const evt: DragEvent = ctx.getDefaultEvent()
    evt.preventDefault()
    ctx.stopPropagation()

    const blockId = closetBlockId(evt.target as Node)
    if (!blockId || this.prevBlock?.id === blockId) return
    const block = this.doc.getBlockById(blockId)
    if (block.nodeType === BlockNodeType.root) return
    const schema = this.doc.schemas.get(block.flavour)
    if (schema.metadata.isLeaf) return;

    this.prevBlock = block
    this.dragMoveSub?.unsubscribe()
    this.dragMoveSub = undefined

    this.dragMoveSub = fromEvent<DragEvent>(block.hostElement, 'dragover').pipe(throttleTime(30))
      .subscribe((e) => {
        e.preventDefault()
        e.stopPropagation()
        const position = calcPosition(e, block.hostElement)
        if (this.prevDragPosition === position) return
        this.moveDragLine(block.hostElement, this.prevDragPosition = position)
      })
  }

  private onDragEnd = () => {
    this.removeDragLine()
    this.dragMoveSub?.unsubscribe()
    this.dragPreventListener?.unsubscribe()
    this.dragPreventListener = undefined
    this.prevDragPosition = 'none'
  }
}
