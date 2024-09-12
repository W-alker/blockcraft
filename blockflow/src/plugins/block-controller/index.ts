import {Controller, IPlugin} from "@core";
import {fromEvent, Subscription} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";

export class BlockControllerPlugin implements IPlugin {
  name = 'block-controller'
  version = 1.0

  private _controller!: Controller
  private _vcr!: ViewContainerRef
  private _cpr!: ComponentRef<TriggerBtn>
  private _activeBlockWrap: Element | null = null

  private _timer: number | null = null
  private mouseLeaveSub?: Subscription

  private eventSubs: Subscription[] = []

  constructor() {
  }

  init(controller: Controller) {
    this._controller = controller
    this._vcr = controller.injector.get(ViewContainerRef)
    this._cpr = this._vcr.createComponent(TriggerBtn, {
      injector: controller.injector
    })
    this._cpr.instance.controller = controller

    controller.rootElement.appendChild(this._cpr.location.nativeElement)

    this.eventSubs = [
      fromEvent(this._cpr.location.nativeElement, 'mouseenter').subscribe(() => {
        this._timer && clearTimeout(this._timer)
      }),
      fromEvent(
        controller.rootElement, 'mouseover'
      ).subscribe((e) => {
        if (controller.readonly$.value) return
        const target = e.target as HTMLElement
        if (target === controller.rootElement) return

        const blockWrap = target.closest('[bf-block-wrap]') as HTMLElement
        // console.log('mouseover', blockWrap, target)
        if (!blockWrap || this._activeBlockWrap === blockWrap) return
        this._timer && clearTimeout(this._timer)
        this.mouseLeaveSub?.unsubscribe()
        this._cpr.setInput('activeBlockWrap', blockWrap)
        this._activeBlockWrap = blockWrap

        this.mouseLeaveSub = fromEvent(blockWrap, 'mouseleave').subscribe(() => {
          this._timer = setTimeout(this.onLeave, 200)
        })

      })
    ]

    this.addDraggable()
  }

  onLeave = () => {
    this._cpr.setInput('activeBlockWrap', null)
    this._timer = this._activeBlockWrap = null
    this.mouseLeaveSub?.unsubscribe()
  }

  addDraggable() {
    const dragLine = document.createElement('div')
    dragLine.style.cssText = `
      display: none;
      position: absolute;
      height: 2px;
      background-color: #3a53d9;
      pointer-events: none;
    `
    this._controller.rootElement.appendChild(dragLine)

    this._cpr.location.nativeElement.setAttribute('draggable', 'true')

    let prevBlockWrap: HTMLElement | null = null
    let prevPosition: 'before' | 'after' | 'none' = 'none'
    let dragMoveSub: Subscription | null
    const calcPosition = (e: DragEvent, blockWrap: HTMLElement) => {
      const rect = blockWrap.getBoundingClientRect()
      if (e.clientY > rect.top + rect.height / 2) return 'after'
      return 'before'
    }

    const calcLineRect = (blockWrap: HTMLElement, position: 'after' | 'before') => {
      const rootRect = this._controller.rootElement.getBoundingClientRect()
      const rect = blockWrap.getBoundingClientRect()
      if (position === 'after')
        return {top: rect.bottom - rootRect.top + 8, left: rect.left - rootRect.left, width: rect.width}
      return {top: rect.top - rootRect.top - 8, left: rect.left - rootRect.left, width: rect.width}
    }

    const dragStartSub = fromEvent(this._cpr.location.nativeElement, 'dragstart')
      // @ts-ignore
      .subscribe((e: DragEvent) => {
        // console.log('dragstart', this._activeBlockWrap)
        this._cpr.instance.showPopover = false
        this._cpr.instance.cdr.detectChanges()

        if (this._controller.root.selectedBlockRange) this._controller.root.clearSelectedBlocks()

        const dataTransfer = e.dataTransfer!
        dataTransfer.dropEffect = 'none';
        dataTransfer.clearData()
        dataTransfer.setDragImage(this._activeBlockWrap!, 0, 0);

        const dragOverSub = fromEvent(document.body, 'dragover')
          .subscribe((e: Event) => {
            e.preventDefault()
            e.stopPropagation()
          })

        const dragEnterSub = fromEvent(this._controller.rootElement, 'dragenter')
          // @ts-ignore
          .subscribe((e: DragEvent) => {
            e.stopPropagation()
            e.preventDefault()
            dragMoveSub?.unsubscribe()
            dragMoveSub = null
            const target = e.target as HTMLElement
            const blockWrap = target.closest('[bf-block-wrap]') as HTMLElement
            if (!blockWrap || prevBlockWrap === blockWrap) return
            prevBlockWrap = blockWrap
            dragMoveSub = fromEvent(blockWrap, 'dragover')
              // @ts-ignore
              .subscribe((e: DragEvent) => {
                e.preventDefault()
                e.stopPropagation()
                const position = calcPosition(e, blockWrap)
                if (prevPosition === position) return
                prevPosition = position
                const rect = calcLineRect(blockWrap, position)
                dragLine.style.display = 'block'
                dragLine.style.top = rect.top + 'px'
                dragLine.style.left = rect.left + 'px'
                dragLine.style.width = rect.width + 'px'
              })
          })

        const dragEndSub = fromEvent(this._cpr.location.nativeElement, 'dragend')
          // @ts-ignore
          .subscribe((e: Event) => {
            e.preventDefault()
            e.stopPropagation()
            dragLine.style.display = 'none'
            dragMoveSub?.unsubscribe()
            dragEnterSub.unsubscribe()
            dragEndSub.unsubscribe()
            dragOverSub.unsubscribe()
            prevBlockWrap && this.onSortBlock(prevBlockWrap, prevPosition)
          })
      })

    this.eventSubs.push(dragStartSub)
  }

  onSortBlock(targetBlockWrap: HTMLElement, position: 'before' | 'after' | 'none') {
    if (position === 'none' || targetBlockWrap === this._activeBlockWrap
      || (this._activeBlockWrap?.nextElementSibling === targetBlockWrap && position === 'before')
      || (this._activeBlockWrap?.previousElementSibling === targetBlockWrap && position === 'after')
    ) return
    // console.log('sort block', targetBlockWrap, position)
    const activeBlockId = this._activeBlockWrap!.getAttribute('data-block-id')!
    const targetBlockId = targetBlockWrap.getAttribute('data-block-id')!
    this._controller.moveBlock(activeBlockId, targetBlockId, position)
  }

  destroy() {
    this._cpr.destroy()
    this.eventSubs.forEach(sub => sub.unsubscribe())
  }


}
