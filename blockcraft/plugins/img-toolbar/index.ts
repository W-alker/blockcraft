import {BindHotKey, DOC_FILE_SERVICE_TOKEN, DocPlugin, EventNames} from "../../framework";
import {UIEventStateContext} from "../../framework/event/base";
import {fromEvent, Subject, Subscription, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {ImageToolbar} from "./widgets/image.toolbar";
import {getPositionWithOffset} from "../../components";
import {nextTick} from "../../global";

export class ImgToolbarPlugin extends DocPlugin {
  override name = 'img-toolbar';

  private _sub?: Subscription
  private _timer: number | null = null
  private _overlayRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  @BindHotKey({key: 'Enter', shortKey: null, shiftKey: null, ctrlKey: null, altKey: null}, {flavour: "image"})
  onImageTitleEnter(ctx: UIEventStateContext) {
    ctx.preventDefault()
    const state = ctx.get('keyboardState')
    const selection = state.selection
    const blockId = selection.commonParent
    const block = this.doc.getBlockById(blockId)

    const np = this.doc.schemas.createSnapshot('paragraph', [])
    this.doc.crud.insertBlocksAfter(block.flavour === 'caption' ? block.parentId! : block.id, [np]).then(() => {
      this.doc.selection.setBlockPosition(np.id, true)
    })
    return true
  }

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || selection.to || selection.firstBlock.flavour !== 'image' || this._overlayRef) return

      this.clearTimer()
      setTimeout(() => {
        if (this._overlayRef) return

        const imgEle = selection.firstBlock.hostElement.querySelector('img')!

        const overlay = this.doc.injector.get(Overlay)
        const portal = new ComponentPortal(ImageToolbar, null, this.doc.injector)
        this._overlayRef = overlay.create({
          positionStrategy: overlay.position().flexibleConnectedTo(imgEle).withPositions([
            getPositionWithOffset("top-center", 0, 8),
            getPositionWithOffset("bottom-center", 0, -8),
          ])
        })
        const cpr = this._overlayRef.attach(portal)

        cpr.setInput('imgBlock', selection.firstBlock)

        fromEvent<MouseEvent>(imgEle, 'mousedown').pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          this.doc.injector.get(DOC_FILE_SERVICE_TOKEN).previewImg(imgEle)
        })

        fromEvent<MouseEvent>(this.doc.root.hostElement.parentElement!, 'scroll').pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          this._overlayRef?.updatePosition()
        })

        selection.firstBlock.onPropsChange.pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          cpr.instance.cdr.markForCheck()
          nextTick().then(() => {
            this._overlayRef?.updatePosition()
          })
        })

        cpr.instance.onItemClicked.pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
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
                  this.doc.selection.setBlockPosition(title.id, true)
                })
              }
              break
            case 'change':
              break
            case 'download':
              const fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
              fileService.downloadSource(selection.firstBlock.props.src, selection.firstBlock.firstChildren?.textContent())
              break
            case 'copy-url':
              this.doc.clipboard.copyText(selection.firstBlock.props.src).then(() => {
                this.doc.messageService.success('图片链接已复制到剪贴板')
              })
              break
          }
        })

        const ls = this.doc.event.add(EventNames.dragStart, () => {
          this.closeToolbar()
          ls()
        }, {blockId: selection.firstBlock.id})

        selection.firstBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
          this.closeToolbar()
        })

        this.doc.selection.afterNextChange(() => {
          this.closeToolbar()
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
    this._closeToolbar$.next()
    this.clearTimer()
    this._overlayRef?.dispose()
    this._overlayRef = undefined
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}
