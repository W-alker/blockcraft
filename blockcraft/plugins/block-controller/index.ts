import {fromEvent, Subscription, throttleTime} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {
  BLOCK_POSITION, ClipboardDataType,
  closetBlockId, DOC_FILE_SERVICE_TOKEN,
  DocPlugin,
  EventListen,
  EventNames
} from "../../framework";
import {BlockNodeType, IBlockSnapshot} from "../../framework/types";
import {UIEventStateContext} from "../../framework/event/base";

export class BlockControllerPlugin extends DocPlugin {
  override name = 'block-controller'
  override version = 1.0

  private _vcr!: ViewContainerRef
  private _cpr!: ComponentRef<TriggerBtn>

  private eventSubs: Subscription = new Subscription()
  private _activeBlock: BlockCraft.BlockComponent | null = null

  private isHidden = false

  init() {
    this._vcr = this.doc.injector.get(ViewContainerRef)
    this._cpr = this._vcr.createComponent(TriggerBtn, {
      injector: this.doc.injector
    })
    this._cpr.setInput('doc', this.doc)

    this.doc.root.hostElement.appendChild(this._cpr.location.nativeElement)

    this.eventSubs.add(
      fromEvent(
        this.doc.root.hostElement, 'mouseover'
      ).subscribe((e) => {
        if (this.doc.readonlySwitch$.value || this.isHidden) return
        const target = e.target as HTMLElement
        if (target === this.doc.root.hostElement) return

        const blockId = closetBlockId(target)
        if (!blockId || this._activeBlock?.id === blockId) return
        const block = this.doc.getBlockById(blockId)
        if (block.nodeType === BlockNodeType.root) return
        this._cpr.setInput('activeBlock', this._activeBlock = this.doc.getBlockById(blockId))
      })
    )

    this.eventSubs.add(
      this.doc.selection.selectionChange$.subscribe(v => {
        if (v?.to) {
          this._cpr.setInput('activeBlock', this._activeBlock = null)
          this._cpr.setInput('hidden', this.isHidden = true)
        } else {
          this.isHidden && this._cpr.setInput('hidden', this.isHidden = false)
        }
      })
    )

    this.addDraggable()
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

  private onDragEnter = (ctx: UIEventStateContext) => {
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

  // drag handle 拖拽响应
  addDraggable() {
    this.doc.event.createDndChains(this._cpr.location.nativeElement, {
      onDragStart: (ctx) => {
        if (!this._activeBlock) return
        const evt: DragEvent = ctx.getDefaultEvent()

        this._cpr.instance.menuDisabled = true
        this._cpr.instance.cdr.detectChanges()

        evt.dataTransfer?.setDragImage(this._activeBlock.hostElement, 0, 0);

        this.onDragStart(evt)
      },
      onDragEnter: this.onDragEnter,
      onDragEnd: (ctx) => {
        const e: DragEvent = ctx.getDefaultEvent()
        e.preventDefault()
        e.stopPropagation()
        this._cpr.instance.menuDisabled = false
        this.prevBlock && this._activeBlock && this.onSortBlock(this._activeBlock, this.prevBlock, this.prevDragPosition)
        this.onDragEnd()
      }
    })
  }

  // img 拖拽响应
  @EventListen(EventNames.dragStart, {flavour: "image"})
  onImageDragStart(ctx: UIEventStateContext) {
    ctx.stopPropagation()

    if (this.doc.selection.value?.to) {
      ctx.preventDefault()
      return
    }

    const evt: DragEvent = ctx.getDefaultEvent()

    const target = evt.target
    if (!target || !(target instanceof HTMLImageElement)) return
    const blockId = closetBlockId(target)
    if (!blockId) return

    this.onDragStart(evt)
    const imgBlock = this.doc.getBlockById(blockId)

    const events = [
      this.doc.event.add(EventNames.dragEnter, this.onDragEnter),
      this.doc.event.add(EventNames.dragEnd, () => {
        this.prevBlock && imgBlock && this.onSortBlock(imgBlock, this.prevBlock, this.prevDragPosition)
        this.onDragEnd()
        events.forEach(v => v())
      }, {blockId})
    ]
  }

  // 外部文件 拖拽响应
  @EventListen(EventNames.dragEnter, {flavour: 'root'})
  onRootDragEnter(ctx: UIEventStateContext) {
    if (this.dragLine) return false
    const evt: DragEvent = ctx.getDefaultEvent()
    if (!evt.dataTransfer?.types.includes(ClipboardDataType.FILES)) return false
    evt.preventDefault()
    this.onDragStart(evt)

    const events = [
      this.doc.event.add(EventNames.dragMove, this.onDragEnter),
      this.doc.event.add(EventNames.drop, ctx => {
        ctx.preventDefault()
        this.onInsertFiles((ctx.getDefaultEvent() as DragEvent).dataTransfer?.files!, this.prevBlock!, this.prevDragPosition)
        this.onDragEnd()
        events.forEach(v => v())
      })
    ]
    return true
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

  onInsertFiles(files: FileList, targetBlock: BlockCraft.BlockComponent, position: typeof this.prevDragPosition) {
    if (!files?.length || position === 'none') return
    const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    if (!files.length) return
    if (files.length === 1 && files[0].type.startsWith('image/')) {
      if (!this.doc.schemas.isValidChildren('image', this.doc.schemas.get(targetBlock.parentBlock!.flavour))) {
        this.doc.messageService.warn(`不允许的移动`)
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
      this.doc.messageService.warn(`不允许的移动`)
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

  destroy() {
    this._cpr.destroy()
    this.eventSubs.unsubscribe()
  }

}

const calcPosition = (e: DragEvent, blockWrap: HTMLElement) => {
  const rect = blockWrap.getBoundingClientRect()
  if (e.clientY > rect.top + rect.height / 2) return 'after'
  return 'before'
}
