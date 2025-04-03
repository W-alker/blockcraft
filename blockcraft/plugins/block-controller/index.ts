import {BehaviorSubject, fromEvent, Subscription} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {closetBlockId, DocPlugin} from "../../framework";
import {BlockNodeType} from "../../framework/types";

export class BlockControllerPlugin extends DocPlugin {
  override name = 'block-controller'
  override version = 1.0

  private _vcr!: ViewContainerRef
  private _cpr!: ComponentRef<TriggerBtn>

  private eventSubs: Subscription[] = []
  private _activeBlock: BlockCraft.BlockComponent | null = null

  init() {
    this._vcr = this.doc.injector.get(ViewContainerRef)
    this._cpr = this._vcr.createComponent(TriggerBtn, {
      injector: this.doc.injector
    })
    this._cpr.setInput('doc', this.doc)

    this.doc.root.hostElement.appendChild(this._cpr.location.nativeElement)

    this.eventSubs = [
      fromEvent(
        this.doc.root.hostElement, 'mouseover'
      ).subscribe((e) => {
        if (this.doc.readonlySwitch$.value) return
        const target = e.target as HTMLElement
        if (target === this.doc.root.hostElement) return

        const blockId = closetBlockId(target)
        if (!blockId || this._activeBlock?.id === blockId) return
        const block = this.doc.getBlockById(blockId)
        if (block.nodeType === BlockNodeType.root) return
        this._cpr.setInput('activeBlock', this._activeBlock = this.doc.getBlockById(blockId))
      })
    ]

    // this.addDraggable()
  }

  onLeave = () => {
    this._cpr.setInput('activeBlockWrap', null)
  }

  private drag$!: BehaviorSubject<string>

  // addDraggable() {
  //   this.drag$ = new BehaviorSubject('end')
  //   this._cpr.location.nativeElement.setAttribute('draggable', 'true')
  //
  //   const createDragLine = () => {
  //     const dragLine = document.createElement('div')
  //     dragLine.style.cssText = `
  //     display: none;
  //     position: absolute;
  //     height: 2px;
  //     background-color: #3a53d9;
  //     pointer-events: none;
  //   `
  //     this._controller.rootElement.appendChild(dragLine)
  //     return dragLine
  //   }
  //
  //   const calcPosition = (e: DragEvent, blockWrap: HTMLElement) => {
  //     const rect = blockWrap.getBoundingClientRect()
  //     if (e.clientY > rect.top + rect.height / 2) return 'after'
  //     return 'before'
  //   }
  //
  //   const calcLineRect = (blockWrap: HTMLElement, position: 'after' | 'before') => {
  //     const rootRect = this._controller.rootElement.getBoundingClientRect()
  //     const rect = blockWrap.getBoundingClientRect()
  //     if (position === 'after')
  //       return {top: rect.bottom - rootRect.top + 1, left: rect.left - rootRect.left, width: rect.width}
  //     return {top: rect.top - rootRect.top - 1, left: rect.left - rootRect.left, width: rect.width}
  //   }
  //
  //   fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragstart')
  //     .subscribe((e) => {
  //
  //       this._cpr.instance.closeContextMenu()
  //       this._cpr.instance.cdr.detectChanges()
  //       if (this._controller.root.selectedBlockRange) this._controller.root.clearSelectedBlockRange()
  //
  //       if (!this._activeBlockWrap) return
  //       const dataTransfer = e.dataTransfer!
  //       dataTransfer.dropEffect = 'none';
  //       dataTransfer.clearData()
  //       dataTransfer.setDragImage(this._activeBlockWrap, 0, 0);
  //
  //       let prevPosition: 'before' | 'after' | 'none' = 'none'
  //       let prevBlockWrap: HTMLElement | null = null
  //       let dragMoveSub: Subscription | undefined = undefined
  //       const dragLine = createDragLine()
  //       this.drag$.next('start')
  //
  //       fromEvent<DragEvent>(document.body, 'dragover')
  //         .pipe(takeUntil(this.drag$.pipe(filter((e) => e === 'end'))))
  //         .subscribe((e) => {
  //           e.preventDefault()
  //           e.stopPropagation()
  //         })
  //
  //       fromEvent<DragEvent>(this._controller.rootElement, 'dragenter')
  //         .pipe(takeUntil(this.drag$.pipe(filter((e) => e === 'end'))))
  //         .subscribe((e) => {
  //           e.stopPropagation()
  //           e.preventDefault()
  //
  //           const target = e.target as HTMLElement
  //           const blockWrap = target.closest('[bf-block-wrap]') as HTMLElement
  //           if (!blockWrap || prevBlockWrap === blockWrap) return
  //           prevBlockWrap = blockWrap
  //           dragMoveSub?.unsubscribe()
  //           dragMoveSub = undefined
  //
  //           dragMoveSub = fromEvent<DragEvent>(blockWrap, 'dragover').pipe(throttleTime(60))
  //             .subscribe((e) => {
  //               e.preventDefault()
  //               e.stopPropagation()
  //               const position = calcPosition(e, blockWrap)
  //               if (prevPosition === position) return
  //               prevPosition = position
  //               const rect = calcLineRect(blockWrap, position)
  //               dragLine.style.display = 'block'
  //               dragLine.style.top = rect.top + 'px'
  //               dragLine.style.left = rect.left + 'px'
  //               dragLine.style.width = rect.width + 'px'
  //             })
  //
  //         })
  //
  //       fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragend').pipe(take(1))
  //         .subscribe((e) => {
  //           e.preventDefault()
  //           e.stopPropagation()
  //           dragLine.remove()
  //           this.drag$.next('end')
  //           prevBlockWrap && this.onSortBlock(prevBlockWrap, prevPosition)
  //         })
  //     })
  // }
  //
  // onSortBlock(targetBlockWrap: HTMLElement, position: 'before' | 'after' | 'none') {
  //   if (position === 'none' || targetBlockWrap === this._activeBlockWrap
  //     || (this._activeBlockWrap?.nextElementSibling === targetBlockWrap && position === 'before')
  //     || (this._activeBlockWrap?.previousElementSibling === targetBlockWrap && position === 'after')
  //   ) return
  //   // console.log('sort block', targetBlockWrap, position)
  //   const activeBlockId = this._activeBlockWrap!.getAttribute('data-block-id')!
  //   const targetBlockId = targetBlockWrap.getAttribute('data-block-id')!
  //   this._controller.moveBlock(activeBlockId, targetBlockId, position)
  // }

  destroy() {
    this._cpr.destroy()
    this.eventSubs.forEach(sub => sub.unsubscribe())
  }

}
