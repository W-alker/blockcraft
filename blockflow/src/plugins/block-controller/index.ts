import {Controller, IPlugin} from "@core";
import {fromEvent, Subscription, take} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {IContextMenuComponent} from "@editor";

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

  constructor(public readonly contextMenu: IContextMenuComponent) {
  }

  init(controller: Controller) {
    this._controller = controller
    this._vcr = controller.injector.get(ViewContainerRef)
    this._cpr = this._vcr.createComponent(TriggerBtn, {
      injector: controller.injector
    })
    this._cpr.instance.controller = controller
    this._cpr.setInput('contextmenu', this.contextMenu)

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

    const dragStartSub = fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragstart')
      .subscribe((e) => {

        this._cpr.instance.closeContextMenu()
        this._cpr.instance.cdr.detectChanges()

        if (this._controller.root.selectedBlockRange) this._controller.root.clearSelectedBlocks()

        const dataTransfer = e.dataTransfer!
        dataTransfer.dropEffect = 'none';
        dataTransfer.clearData()
        dataTransfer.setDragImage(this._activeBlockWrap!, 0, 0);

        let prevPosition: 'before' | 'after' | 'none' = 'none'
        let prevBlockWrap: HTMLElement | null = null
        let dragMoveSub: Subscription | undefined = undefined

        const dragOverSub = fromEvent<DragEvent>(document.body, 'dragover')
          .subscribe((e) => {
            e.preventDefault()
            e.stopPropagation()
          })

        const dragEnterSub = fromEvent<DragEvent>(this._controller.rootElement, 'dragenter')
          .subscribe((e) => {
            e.stopPropagation()
            e.preventDefault()

            const target = e.target as HTMLElement
            const blockWrap = target.closest('[bf-block-wrap]') as HTMLElement
            if (!blockWrap || prevBlockWrap === blockWrap) return
            prevBlockWrap = blockWrap
            dragMoveSub?.unsubscribe()
            dragMoveSub = undefined

            dragMoveSub = fromEvent<DragEvent>(blockWrap, 'dragover')
              .subscribe((e) => {
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

        fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragend').pipe(take(1))
          .subscribe((e) => {
            e.preventDefault()
            e.stopPropagation()
            dragLine.style.display = 'none'
            dragEnterSub.unsubscribe()
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
