import {
  BindHotKey, closetBlockId,
  DOC_FILE_SERVICE_TOKEN,
  DocPlugin,
  EventListen,
  getPositionWithOffset
} from "../../framework";
import {UIEventStateContext} from "../../framework";
import {fromEvent, Subject, Subscription, takeUntil} from "rxjs";
import {ImageToolbar} from "./widgets/image.toolbar";
import {downloadFile, nextTick} from "../../global";
import {OverlayRef} from "@angular/cdk/overlay";

export class ImgToolbarPlugin extends DocPlugin {
  override name = 'img-toolbar';

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  // img 拖拽响应
  @EventListen('dragStart', {flavour: "image"})
  onImageDragStart(ctx: UIEventStateContext) {
    ctx.stopPropagation()

    if (this.doc.isReadonly || this.doc.selection.value?.to) {
      ctx.preventDefault()
      return
    }

    const evt: DragEvent = ctx.getDefaultEvent()

    const target = evt.target
    if (!target || !(target instanceof HTMLImageElement)) return
    const blockId = closetBlockId(target)
    if (!blockId) return

    evt.dataTransfer?.setDragImage(target, 0, 0)

    this.doc.dndService.startDrag(evt, 'origin-block', blockId)
  }

  @BindHotKey({key: 'Enter', shortKey: null, shiftKey: null, ctrlKey: null, altKey: null}, {flavour: "image"})
  onImageTitleEnter(ctx: UIEventStateContext) {
    ctx.preventDefault()
    const state = ctx.get('keyboardState')
    const selection = state.selection
    const blockId = selection.commonParent
    const block = this.doc.getBlockById(blockId)

    const np = this.doc.schemas.createSnapshot('paragraph', [])
    const imgBlock = block.flavour === 'caption' ? block.parentBlock! : block
    this.doc.crud.insertBlocks(imgBlock.parentId!, imgBlock.getIndexOfParent() + (state.raw.ctrlKey ? 0 : 1), [np]).then(() => {
      this.doc.selection.selectOrSetCursorAtBlock(np.id, true)
    })
    return true
  }

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || selection.to || selection.firstBlock.flavour !== 'image') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      this.clearTimer()
      setTimeout(() => {
        if (this._toolbarRef) return

        const imgEle = selection.firstBlock.hostElement.querySelector('img')!
        const {overlayRef, componentRef} = this.doc.overlayService.createConnectedOverlay<ImageToolbar>({
          target: imgEle,
          positions: [
            getPositionWithOffset("top-center", 0, 8),
            getPositionWithOffset("bottom-center", 0, 8),
          ],
          component: ImageToolbar
        }, this._closeToolbar$, this.closeToolbar)

        this._toolbarRef = overlayRef
        componentRef.setInput('imgBlock', selection.firstBlock)

        fromEvent<MouseEvent>(imgEle, 'mousedown').pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          this.doc.injector.get(DOC_FILE_SERVICE_TOKEN).previewImg(imgEle)
        })

        selection.firstBlock.onPropsChange.pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          componentRef?.instance.cdr.markForCheck()
          nextTick().then(() => {
            overlayRef?.updatePosition()
          })
        })

        componentRef.instance.onItemClicked.pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          switch (v.name) {
            case 'align':
              selection.firstBlock.updateProps({
                align: v.value
              })
              break
            case 'caption':
              if (selection.firstBlock.childrenLength) {
                this.doc.crud.deleteBlocks(selection.firstBlock.id, 0)
              } else {
                const title = this.doc.schemas.createSnapshot('caption', [])
                this.doc.crud.insertBlocks(selection.firstBlock.id, 0, [title]).then(() => {
                  this.doc.selection.selectOrSetCursorAtBlock(title.id, true)
                })
              }
              break
            case 'change':
              break
            case 'download':
              downloadFile(selection.firstBlock.props.src, selection.firstBlock.firstChildren?.textContent())
              break
            case 'copy-url':
              console.log(selection.firstBlock.props.src)
              this.doc.clipboard.copyText(selection.firstBlock.props.src).then(() => {
                this.doc.messageService.success('图片链接已复制到剪贴板')
              })
              break
          }
        })

        const ls = this.doc.event.add('dragStart', () => {
          this._closeToolbar$.next()
          ls()
        }, {blockId: selection.firstBlock.id})

        this.doc.selection.afterNextChange(() => {
          this._closeToolbar$.next()
        })
      }, 200)

    })
  }

  clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  closeToolbar = () => {
    this.clearTimer()
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}
