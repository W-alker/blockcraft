import {Controller, EditableBlock, IPlugin, USER_CHANGE_SIGNAL} from "../../core";
import {BehaviorSubject, filter, fromEvent, Subscription, take, takeUntil, throttleTime} from "rxjs";
import Viewer from 'viewerjs';
import {HTML} from "mermaid/dist/diagram-api/types";

export class InlineImgPlugin implements IPlugin {
  public name = "inline-img";
  version = 1.0

  private _controller!: Controller
  private sub = new Subscription()

  private prevImg?: HTMLElement
  private inlineImg$ = new BehaviorSubject<HTMLElement | null>(null)
  private _viewer: Viewer | null = null

  init(controller: Controller) {
    this._controller = controller

    this.sub.add(
      this.inlineImg$.subscribe(ele => {
        this._viewer?.destroy()
        this._viewer = null
        if (ele) {
          this.wrapImg(this.prevImg = ele)
        } else {
          this.prevImg && this.unWrapImg(this.prevImg)
        }
      })
    )

    this.sub.add(
      fromEvent<MouseEvent>(controller.rootElement, 'click')
        .subscribe((e: MouseEvent) => {
          if (e.target instanceof HTMLImageElement && e.target.parentElement?.getAttribute('bf-embed') === 'image') {
            const ele = e.target.parentElement

            if(this._controller.readonly$.value) {
              this.previewImg(e.target.parentElement)
              return
            }

            // 先设置焦点, 用于找到位置
            const sel = document.getSelection()!
            const range = document.createRange()
            range.setStartBefore(ele)
            range.setEndBefore(ele)
            sel.removeAllRanges()
            sel.addRange(range)

            this.inlineImg$.value !== ele && this.inlineImg$.next(ele)
          } else {
            this.inlineImg$.value && !this.inlineImg$.value.contains(e.target as Node) && this.inlineImg$.next(null)
          }
        })
    )
  }

  previewImg(ele: HTMLElement) {
    this._viewer?.destroy()
    this._viewer = new Viewer(ele)
    this._viewer?.show()
  }

  private wrapImg(ele: HTMLElement) {
    if (!ele) return
    const fragment = document.createElement('span')
    fragment.className = 'resize-container'
    const tl = document.createElement('span')
    tl.className = 'resize-point top-left'
    const tr = document.createElement('span')
    tr.className = 'resize-point top-right'
    const bl = document.createElement('span')
    bl.className = 'resize-point bottom-left'
    const br = document.createElement('span')
    br.className = 'resize-point bottom-right'
    fragment.appendChild(tl)
    fragment.appendChild(tr)
    fragment.appendChild(bl)
    fragment.appendChild(br)
    ele.classList.add('focused')
    ele.appendChild(fragment)

    fromEvent<MouseEvent>(ele.firstChild!, 'click')
      .pipe(takeUntil(this.inlineImg$.pipe(filter(v => v !== ele))))
      .subscribe((e) => {
        e.stopPropagation()
        this.previewImg(ele)
      })

    fromEvent<MouseEvent>(tl, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
      this.onResizeHandleMouseDown(ele, e, 'left')
    })
    fromEvent<MouseEvent>(bl, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
      this.onResizeHandleMouseDown(ele, e, 'left')
    })
    fromEvent<MouseEvent>(br, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
      this.onResizeHandleMouseDown(ele, e, 'right')
    })
    fromEvent<MouseEvent>(tr, 'mousedown').pipe(takeUntil(fromEvent(document, 'mouseup'))).subscribe((e) => {
      this.onResizeHandleMouseDown(ele, e, 'right')
    })
  }

  unWrapImg(ele: HTMLElement) {
    ele.classList.remove('focused')
    ele.removeChild(ele.lastChild!)
  }

  private onResizeHandleMouseDown(container: HTMLElement, event: MouseEvent, direction: 'left' | 'right') {
    event.stopPropagation()
    event.preventDefault()
    const startPoint = {x: event.clientX, y: event.clientY, direction}
    let initWidth = Number(container.style.width) || container.clientWidth
    let updateWidth = initWidth

    const mouseMove$ = fromEvent<MouseEvent>(document.body, 'mousemove')
      .pipe(throttleTime(60))
      .subscribe((e) => {
        const movePx = e.clientX - startPoint!.x
        if (startPoint!.direction === 'left') updateWidth -= movePx
        else updateWidth += movePx
        container.style.width = `${updateWidth}px`
        startPoint!.x = e.clientX
      })

    fromEvent<MouseEvent>(document.body, 'mouseup').pipe(take(1)).subscribe((e) => {
      mouseMove$?.unsubscribe()

      if (initWidth !== updateWidth) {
        // format
        const curRange = this._controller.selection.getSelection()
        if (!curRange || curRange?.isAtRoot) throw new Error('Unexpected Selection')
        const bRef = this._controller.getBlockRef(curRange!.blockId) as EditableBlock
        if (!bRef) throw new Error('Unexpected BlockRef')

        this._controller.transact(() => {

          bRef.yText.format(curRange.blockRange.start, 1, {'d:width': updateWidth})

        }, USER_CHANGE_SIGNAL)
      }

    })
  }

  destroy() {
    this.sub.unsubscribe()
    this._viewer?.destroy()
  }
}
