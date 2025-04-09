import {BehaviorSubject, filter, fromEvent, Subscription, take, takeUntil, throttleTime} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {BLOCK_POSITION, closetBlockId, DocPlugin} from "../../framework";
import {BlockNodeType} from "../../framework/types";

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
        if (!v?.collapsed) {
          this._cpr.setInput('activeBlock', this._activeBlock = null)
          this._cpr.setInput('hidden', this.isHidden = true)
        } else {
          this.isHidden && this._cpr.setInput('hidden', this.isHidden = false)
        }
      })
    )

    this.addDraggable()
  }

  onLeave = () => {
    this._cpr.setInput('activeBlockWrap', null)
  }

  private drag$!: BehaviorSubject<string>

  addDraggable() {
    this.drag$ = new BehaviorSubject('end')
    // this._cpr.location.nativeElement.setAttribute('draggable', 'true')

    const createDragLine = () => {
      const dragLine = document.createElement('div')
      dragLine.style.cssText = `
      display: none;
      position: absolute;
      height: 2px;
      background-color: #3a53d9;
      pointer-events: none;
    `
      this.doc.root.hostElement.appendChild(dragLine)
      return dragLine
    }

    const calcPosition = (e: DragEvent, blockWrap: HTMLElement) => {
      const rect = blockWrap.getBoundingClientRect()
      if (e.clientY > rect.top + rect.height / 2) return 'after'
      return 'before'
    }

    const calcLineRect = (blockWrap: HTMLElement, position: 'after' | 'before') => {
      const rootRect = this.doc.root.hostElement.getBoundingClientRect()
      const rect = blockWrap.getBoundingClientRect()
      if (position === 'after')
        return {top: rect.bottom - rootRect.top + 1, left: rect.left - rootRect.left, width: rect.width}
      return {top: rect.top - rootRect.top - 1, left: rect.left - rootRect.left, width: rect.width}
    }

    fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragstart')
      .subscribe((e) => {
        if (!this._activeBlock) return
        // this.doc.selection.selectAllChildren(this._activeBlock)

        this._cpr.instance.menuDisabled = true
        this._cpr.instance.cdr.detectChanges()

        const dataTransfer = e.dataTransfer!
        dataTransfer.dropEffect = 'none';
        dataTransfer.clearData()
        dataTransfer.setDragImage(this._activeBlock.hostElement, 0, 0);

        let prevPosition: 'before' | 'after' | 'none' = 'none'
        let prevBlock: BlockCraft.BlockComponent
        let dragMoveSub: Subscription | undefined = undefined
        const dragLine = createDragLine()
        this.drag$.next('start')

        fromEvent<DragEvent>(document.body, 'dragover')
          .pipe(takeUntil(this.drag$.pipe(filter((e) => e === 'end'))))
          .subscribe((e) => {
            e.preventDefault()
            e.stopPropagation()
          })

        fromEvent<DragEvent>(this.doc.root.hostElement, 'dragenter')
          .pipe(takeUntil(this.drag$.pipe(filter((e) => e === 'end'))))
          .subscribe((e) => {
            e.stopPropagation()
            e.preventDefault()

            const blockId = closetBlockId(e.target as Node)
            if (!blockId || prevBlock?.id === blockId) return
            const block = this.doc.getBlockById(blockId)
            if (block.nodeType === BlockNodeType.root) return
            const schema = this.doc.schemas.get(block.flavour)
            if (schema.metadata.isLeaf) return;

            prevBlock = block
            dragMoveSub?.unsubscribe()
            dragMoveSub = undefined

            dragMoveSub = fromEvent<DragEvent>(block.hostElement, 'dragover').pipe(throttleTime(60))
              .subscribe((e) => {
                e.preventDefault()
                e.stopPropagation()
                const position = calcPosition(e, block.hostElement)
                if (prevPosition === position) return
                prevPosition = position
                const rect = calcLineRect(block.hostElement, position)
                dragLine.style.display = 'block'
                dragLine.style.top = rect.top + 'px'
                dragLine.style.left = rect.left + 'px'
                dragLine.style.width = rect.width + 'px'
              })
          })

        fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragend').pipe(take(1))
          .subscribe((e) => {
            e.preventDefault()
            e.stopPropagation()
            dragLine.remove()
            this.drag$.next('end')
            this._cpr.instance.menuDisabled = false
            prevBlock && this.onSortBlock(prevBlock, prevPosition)
          })
      })
  }

  onSortBlock(targetBlock: BlockCraft.BlockComponent, position: 'before' | 'after' | 'none') {
    if (!this._activeBlock || position === 'none' || targetBlock === this._activeBlock
      || (this._activeBlock?.hostElement.nextElementSibling === targetBlock.hostElement && position === 'before')
      || (this._activeBlock?.hostElement.previousElementSibling === targetBlock.hostElement && position === 'after')
    ) return

    let targetIdx = targetBlock.getIndexOfParent()
    const posRelationship = this.doc.compareBlockPosition(this._activeBlock, targetBlock)
    if (position === 'before' && posRelationship === BLOCK_POSITION.AFTER) {
      targetIdx = Math.max(0, targetIdx - 1)
    }
    if (position === 'after' && (targetBlock.parentId !== this._activeBlock.parentId || posRelationship === BLOCK_POSITION.BEFORE)) {
      targetIdx += 1
    }
    this.doc.crud.moveBlocks(this._activeBlock.parentId!, this._activeBlock.getIndexOfParent(), 1,
      targetBlock.parentId!, targetIdx)
  }

  destroy() {
    this._cpr.destroy()
    this.eventSubs.unsubscribe()
  }

}
