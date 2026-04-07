import {
  ClipboardDataType, closetBlockId,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
  DocPlugin,
  EventListen, getPositionWithOffset
} from "../../framework";
import {UIEventStateContext, IBlockSnapshot} from "../../framework";
import {BlockCraftError, downloadFile, ErrorCode, nextTick} from "../../global";
import {merge, Subject, Subscription, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {AttachmentBlockToolbar, IAttachmentToolbarItem} from "./widgets/attachment-toolbar";
import {RenameInputPad} from "./widgets/rename-input-pad";

type AttachmentBlock = BlockCraft.IBlockComponents['attachment']

export interface AttachmentExtensionOptions {
  /**
   * 追加到工具栏的自定义按钮
   */
  extraItems?: IAttachmentToolbarItem[]

  /**
   * 自定义按钮点击回调。返回 true 表示已处理。
   */
  onExtraItemClick?: (itemName: string, block: AttachmentBlock, doc: BlockCraft.Doc) => boolean

  /**
   * 自定义预览逻辑。一旦传入，将在工具栏追加预览按钮，点击时调用此函数。
   * 不传则不显示预览按钮。
   */
  onPreview?: (block: AttachmentBlock, doc: BlockCraft.Doc) => void

  /**
   * 预览按钮图标类名，默认 'bc_eye-open'
   */
  previewIcon?: string

  /**
   * 预览按钮 tooltip 文案，默认 '预览'
   */
  previewLabel?: string

  /**
   * 空附件点击时的提示（附件仍在上传中时），默认 '文件可能正在上传中，暂不可用'
   */
  uploadingTip?: string
}

export class AttachmentExtensionPlugin extends DocPlugin {
  override name = "attachment-extension";

  fileService!: DocFileService

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: AttachmentBlock | null = null

  constructor(private options?: AttachmentExtensionOptions) {
    super();
  }

  /**
   * 统一处理附件块的点击行为：
   *  - 空附件（无 url）：编辑模式下打开文件选择器
   *  - 正在上传（非 http url）：提示上传中
   *  - 已就绪 + 只读模式：选中块
   */
  @EventListen('mouseDown', {flavour: 'attachment'})
  onClick(state: UIEventStateContext) {
    const blockId = closetBlockId(state.getDefaultEvent().target as Node)
    if (!blockId) return
    const block = this.doc.getBlockById(blockId) as AttachmentBlock | null
    if (!block) return

    // 空附件：编辑模式下打开文件选择
    if (!block.props.url) {
      state.preventDefault()
      if (!this.doc.isReadonly) {
        block.inputLocalFile()
      }
      return true
    }

    // 正在上传中
    if (!block.props.url.startsWith('http')) {
      state.preventDefault()
      this.doc.messageService.warn(this.options?.uploadingTip ?? '文件可能正在上传中，暂不可用')
      return true
    }

    // 只读模式下：选中块以便预览/下载
    if (this.doc.isReadonly) {
      state.preventDefault()
      this.doc.selection.selectBlock(blockId)
      return true
    }

    return
  }

  init() {
    this.fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN)
    if (!this.fileService) {
      throw new BlockCraftError(ErrorCode.PluginError, "AttachmentController requires DocFileService")
    }

    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()

      if (!selection || !selection.isInSameBlock || selection.firstBlock?.flavour !== 'attachment') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      const attachmentBlock = selection.firstBlock as AttachmentBlock
      if (this._toolbarRef && this._activeBlock === attachmentBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._toolbarRef && this._activeBlock === attachmentBlock) return;

        this._activeBlock = attachmentBlock

        const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<AttachmentBlockToolbar>({
          target: attachmentBlock,
          component: AttachmentBlockToolbar,
          positions: [
            getPositionWithOffset("top-left", 0, 8),
            getPositionWithOffset("bottom-left", 0, 8),
          ]
        }, this._closeToolbar$, this.closeToolbar)

        this._toolbarRef = overlayRef

        const canUse = this._isCanUse(attachmentBlock)
        componentRef.setInput('doc', this.doc)
        componentRef.setInput('canUse', canUse)
        componentRef.setInput('showPreview', !!this.options?.onPreview)
        if (this.options?.previewIcon) {
          componentRef.setInput('previewIcon', this.options.previewIcon)
        }
        if (this.options?.previewLabel) {
          componentRef.setInput('previewLabel', this.options.previewLabel)
        }
        if (this.options?.extraItems?.length) {
          componentRef.setInput('extraItems', this.options.extraItems)
        }

        attachmentBlock.onDestroy$.pipe(takeUntil(this._closeToolbar$)).subscribe(() => {
          this._closeToolbar$.next()
        })

        componentRef.instance.onItemClick.pipe(takeUntil(this._closeToolbar$)).subscribe(v => {
          switch (v.name) {
            case 'rename':
              this.onRename(attachmentBlock)
              break
            case 'download':
              downloadFile(attachmentBlock.props.url, attachmentBlock.props.name)
              break
            case 'preview':
              this.options?.onPreview?.(attachmentBlock, this.doc)
              break
            case 'delete':
              this.doc.crud.deleteBlockById(attachmentBlock.id)
              break
            default:
              this.options?.onExtraItemClick?.(v.name, attachmentBlock, this.doc)
              break
          }
        })

      }, 200)

    })
  }

  /** 附件是否就绪：有 url 且已上传至远端（http(s) 协议） */
  private _isCanUse(block: AttachmentBlock): boolean {
    const url = block.props.url
    return !!url && (url.startsWith('http://') || url.startsWith('https://'))
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

  onRename(block: AttachmentBlock) {
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

  @EventListen('paste', {flavour: 'root'})
  onPaste(ctx: UIEventStateContext) {
    const state = ctx.get('clipboardState');
    if (!state.dataTypes.includes(ClipboardDataType.FILES)) return false;
    if (this.doc.selection.value?.isAllSelected) {
      ctx.preventDefault();
      return true;
    }
    const files = state.clipboardData?.files;
    if (!files?.length) return false;
    ctx.preventDefault();
    Promise.allSettled(Array.from(files)
      .map(file => {
        if (file.type.startsWith('image/')) return this.fileService.uploadImg(file)
        return this.fileService.uploadAttachment(file)
      }))
      .then(res => {
        const snapshots: IBlockSnapshot[] = [];

        res.forEach(r => {
          if (r.status !== 'fulfilled') {
            this.doc.messageService.error(r.reason);
            return;
          }
          const snapshot = typeof r.value === 'string' ? this.doc.schemas.createSnapshot('image', [r.value])
            : this.doc.schemas.createSnapshot('attachment', [r.value]);
          snapshot.props.depth = (state.selection.firstBlock.props.depth || 0);
          snapshots.push(snapshot);
        });

        if (!snapshots.length) return;
        this.doc.clipboard.deleteContentFromSelection(state.selection);
        this.doc.crud.insertBlocksAfter(state.selection.firstBlock, snapshots);
      });
    return true;
  }

  destroy() {
    this._sub?.unsubscribe()
    this.closeToolbar()
  }


}
