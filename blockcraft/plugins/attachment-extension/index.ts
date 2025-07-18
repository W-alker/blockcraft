import {
  ClipboardDataType,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
  DocPlugin,
  EventListen, getPositionWithOffset
} from "../../framework";
import {UIEventStateContext, IBlockSnapshot} from "../../framework";
import {BlockCraftError, downloadFile, ErrorCode, nextTick} from "../../global";
import {merge, Subject, Subscription, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {AttachmentBlockToolbar} from "./widgets/attachment-toolbar";
import {RenameInputPad} from "./widgets/rename-input-pad";

export class AttachmentExtensionPlugin extends DocPlugin {
  override name = "attachment-extension";

  fileService!: DocFileService

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.IBlockComponents['attachment'] | null = null

  init() {
    this.fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    if (!this.fileService) {
      throw new BlockCraftError(ErrorCode.PluginError, "AttachmentController requires DocFileService")
    }

    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()

      if (!selection || selection.to || selection.firstBlock?.flavour !== 'attachment') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      const attachmentBlock = selection.firstBlock as BlockCraft.IBlockComponents['attachment']
      if (this._toolbarRef && this._activeBlock === attachmentBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._toolbarRef && this._activeBlock === attachmentBlock) return;

        this._activeBlock = attachmentBlock as any

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<AttachmentBlockToolbar>({
          target: attachmentBlock,
          component: AttachmentBlockToolbar,
          positions: [
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ]
        }, this._closeToolbar$, this.closeToolbar)

        this._toolbarRef = overlayRef

        attachmentBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
          this._closeToolbar$.next()
        })

        componentRef.instance.onItemClick.pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          switch (v.name) {
            case 'rename':
              this.onRename(attachmentBlock as BlockCraft.IBlockComponents['attachment'])
              break
            case 'download':
              downloadFile(attachmentBlock.props.url, attachmentBlock.props.name)
              break
            case 'delete':
              this.doc.crud.deleteBlockById(attachmentBlock.id)
              break
          }
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
    this._activeBlock = null
  }

  onRename(block: BlockCraft.IBlockComponents['attachment']) {
    const close$ = new Subject<void>()

    const close = () => {
      close$.next()
      nextTick().then(() => {
        block.hostElement.classList.remove('selected')
        this.doc.selection.selectBlock(block)
      })
    }

    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<RenameInputPad>({
      target: block,
      component: RenameInputPad,
      positions: [
        getPositionWithOffset('top-left', 0, 4),
        getPositionWithOffset('bottom-left', 0, 4),
      ],
      backdrop: true
    }, close$, close)

    componentRef.setInput('value', block.props.name)

    // 伪造选中
    requestAnimationFrame(() => {
      componentRef.instance.focus()
      block.hostElement.classList.add('selected')
    })

    merge(overlayRef.backdropClick(), componentRef.instance.cancel).pipe(takeUntil(close$)).subscribe(() => {
      close()
    })

    componentRef.instance.valueChange.pipe(takeUntil(close$)).subscribe(v => {
      close()
      block.updateProps({
        name: v
      })
    })

  }

  @EventListen('paste', {flavour: "root"})
  onPaste(ctx: UIEventStateContext) {
    const state = ctx.get('clipboardState')
    if (!state.dataTypes.includes(ClipboardDataType.FILES)) return false
    this.doc.clipboard.deleteContentFromSelection(state.selection)
    const files = state.clipboardData?.files
    if (!files?.length) return false
    ctx.preventDefault()
    Promise.allSettled(Array.from(files)
      .map(file => this.fileService.uploadAttachment(file)))
      .then(res => {
        const snapshots: IBlockSnapshot[] = []

        res.forEach(r => {
          if (r.status !== 'fulfilled') {
            this.doc.messageService.error(r.reason)
            return
          }
          if (r.value.type.startsWith('image/')) {
            snapshots.push(this.doc.schemas.createSnapshot('image', [r.value.url]))
          } else {
            snapshots.push(this.doc.schemas.createSnapshot('attachment', [(r.value as any)]))
          }
        })

        if (!snapshots.length) return
        this.doc.crud.insertBlocksAfter(state.selection.firstBlock, snapshots)
      })
    return true
  }

  destroy() {
    this._sub?.unsubscribe()
  }


}
