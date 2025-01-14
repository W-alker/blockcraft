import {
  Controller,
  EditableBlock,
  getElementCharacterOffset,
  IPlugin, setCursorAfter,
  setCursorBefore,
  USER_CHANGE_SIGNAL
} from "../../core";
import {BehaviorSubject, filter, fromEvent, Subscription, take, takeUntil, throttleTime} from "rxjs";
import Viewer from 'viewerjs';

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
        // this._viewer?.destroy()
        // this._viewer = null
        if (ele) {
          this.wrapImg(this.prevImg = ele)
        } else if (this.prevImg) {
          this.unWrapImg(this.prevImg)
          this.prevImg = undefined
        }
      })
    )

    this.sub.add(
      fromEvent<MouseEvent>(controller.rootElement, 'focusin')
        .subscribe((e: MouseEvent) => {
          if (e.target instanceof HTMLElement && e.target.getAttribute('bf-embed') === 'image') {
            const ele = e.target

            if (this._controller.readonly$.value) {
              this.previewImg(ele)
              return
            }

            this.inlineImg$.value !== ele && this.inlineImg$.next(ele)

            fromEvent(ele, 'blur').pipe(take(1)).subscribe(() => {
              this.inlineImg$.next(null)
            })
          }
        })
    )
  }

  previewImg(ele: HTMLElement) {
    this._viewer?.destroy()
    this._viewer = new Viewer(ele, {zIndex: 999999})
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

    fromEvent<MouseEvent>(fragment, 'click')
      .pipe(takeUntil(this.inlineImg$.pipe(filter(v => v !== ele))))
      .subscribe((e) => {
        this.previewImg(ele)
      })

    fromEvent<KeyboardEvent>(ele, 'keydown')
      .pipe(takeUntil(this.inlineImg$.pipe(filter(v => v !== ele))))
      .subscribe((e) => {
        const remove = () => {
          const blockId = ele.closest('[bf-node-type]')?.id
          if (!blockId) return
          const bRef = this._controller.getBlockRef(blockId)
          if (!bRef || !this._controller.isEditableBlock(bRef)) return
          const characterOffset = getElementCharacterOffset(ele, bRef.containerEle)
          setCursorBefore(ele)
          ele.remove()
          this._controller.transact(() => {
            bRef.yText.delete(characterOffset, 1)
          }, USER_CHANGE_SIGNAL)
        }

        if ((e.ctrlKey || e.metaKey)) {
          e.stopPropagation()
          e.preventDefault()
          if (e.code === 'KeyX' || e.code === 'KeyC') {
            this._controller.clipboard.writeData([{type: 'text/uri-list', data: ele.querySelector('img')?.src || ''}])
          }
          e.code === 'KeyX' && remove()
          return
        }

        switch (e.key) {
          case 'Backspace':
          case 'Delete':
            e.preventDefault()
            e.stopPropagation()
            remove()
            break
          case 'ArrowRight':
            e.preventDefault()
            e.stopPropagation()
            setCursorAfter(ele)
            break
          case 'Enter':
          case 'ArrowLeft':
          case 'Escape':
          default:
            e.preventDefault()
            e.stopPropagation()
            setCursorBefore(ele)
            break
        }
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
