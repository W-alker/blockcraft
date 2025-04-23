import {
  ClipboardDataType,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
  DocPlugin,
  EventListen,
  EventNames
} from "../../framework";
import {UIEventStateContext} from "../../framework/event/base";
import {BlockCraftError, ErrorCode, nextTick} from "../../global";
import {IBlockSnapshot} from "../../framework/types";
import {fromEvent, merge, Subject, Subscription, take, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {getPositionWithOffset} from "../../components";
import {AttachmentBlockToolbar} from "./widgets/attachment-toolbar";
import {RenameInputPad} from "./widgets/rename-input-pad";

export class AttachmentExtensionPlugin extends DocPlugin {
  override name = "attachment-extension";

  fileService!: DocFileService

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _renameInputRef?: OverlayRef
  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: BlockCraft.IBlockComponents['attachment'] | null = null

  init() {
    this.fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    if (!this.fileService) {
      throw new BlockCraftError(ErrorCode.PluginError, "AttachmentController requires DocFileService")
    }

    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection || selection.to || selection.firstBlock?.flavour !== 'attachment') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      this.clearTimer()

      const attachmentBlock = selection.firstBlock
      if (this._toolbarRef && this._activeBlock === attachmentBlock) return;
      this.closeToolbar()

      setTimeout(() => {
        if (this._toolbarRef && this._activeBlock === attachmentBlock) return;

        this._activeBlock = attachmentBlock as any

        const overlay = this.doc.injector.get(Overlay)
        const portal = new ComponentPortal(AttachmentBlockToolbar, null, this.doc.injector)
        this._toolbarRef = overlay.create({
          positionStrategy: overlay.position().flexibleConnectedTo(attachmentBlock.hostElement).withPositions([
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ])
        })
        const cpr = this._toolbarRef.attach(portal)

        fromEvent<MouseEvent>(this.doc.root.hostElement.parentElement!, 'scroll').pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          this._toolbarRef?.updatePosition()
        })

        attachmentBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
          this.closeToolbar()
        })

        cpr.instance.onItemClick.pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          switch (v.name) {
            case 'rename':
              this.onRename(attachmentBlock as BlockCraft.IBlockComponents['attachment'])
              break
            case 'download':
              this.fileService.downloadAttachment(attachmentBlock.props)
              break
            // case 'delete':
            //   this.doc.crud.deleteBlockById(attachmentBlock.id)
            //   break
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
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
    this._activeBlock = null
  }

  onRename(block: BlockCraft.IBlockComponents['attachment']) {
    const overlay = this.doc.injector.get(Overlay)

    const positionStrategy = overlay.position().flexibleConnectedTo(block.hostElement).withPositions([
      getPositionWithOffset('top-left', 0, 4),
      getPositionWithOffset('bottom-left', 0, 4),
    ])
    const portal = new ComponentPortal(RenameInputPad)
    this._renameInputRef = overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    const cpr = this._renameInputRef.attach(portal)

    cpr.setInput('value', block.props.name)

    // 伪造选中
    requestAnimationFrame(() => {
      cpr.instance.focus()
      block.hostElement.classList.add('selected')
    })

    const close = () => {
      this._renameInputRef?.dispose()

      nextTick().then(() => {
        block.hostElement.classList.remove('selected')
        this.doc.selection.selectBlock(block)
      })

    }

    merge(this._renameInputRef.backdropClick(), cpr.instance.cancel).pipe(take(1)).subscribe(() => {
      close()
    })

    cpr.instance.valueChange.pipe(take(1)).subscribe(v => {
      close()
      block.updateProps({
        name: v
      })
    })

  }

  @EventListen(EventNames.paste, {flavour: "root"})
  onPaste(ctx: UIEventStateContext) {
    const state = ctx.get('clipboardState')
    if (!state.dataTypes.includes(ClipboardDataType.FILES)) return false
    this.doc.clipboard.deleteContentFromSelection(state.selection)
    const files = state.clipboardData?.files
    if (!files) return false
    ctx.preventDefault()
    Promise.allSettled(Array.from(files).filter(file => !file.type.startsWith('image'))
      .map(file => this.fileService.uploadAttachment(file)))
      .then(res => {
        const attachmentSnapshots: IBlockSnapshot[] = []

        res.forEach(r => {
          if (r.status !== 'fulfilled') {
            this.doc.messageService.error(r.reason)
            return
          }
          attachmentSnapshots.push(this.doc.schemas.createSnapshot('attachment', [(r.value as any)]))
        })
        if (!attachmentSnapshots.length) return
        this.doc.crud.insertBlocksAfter(state.selection.firstBlock, attachmentSnapshots)
      })
    return true
  }

  destroy() {
    this._sub?.unsubscribe()
  }


}
