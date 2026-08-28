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
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {ComponentRef} from "@angular/core";

type AttachmentBlock = BlockCraft.IBlockComponents['attachment']

const ATTACHMENT_RENAMING_CLASS = 'bc-attachment-renaming'
const ATTACHMENT_CONTENT_SELECTOR = [
  '.attachment-block__empty',
  '.attachment-block__prefix',
  '.attachment-block__info',
  '.attachment-block__name',
  '.attachment-block__size',
  '.attachment-block__icon-wrapper',
  '.attachment-block__progress',
  '.attachment-block__spinner',
].join(',')

export interface AttachmentExtensionOptions {
  /**
   * 追加到工具栏的自定义按钮
   */
  extraItems?: IAttachmentToolbarItem[];

  /**
   * 自定义按钮点击回调。返回 true 表示已处理。
   */
  onExtraItemClick?: (
    itemName: string,
    block: AttachmentBlock,
    doc: BlockCraft.Doc,
  ) => boolean;

  /**
   * 自定义预览逻辑。一旦传入，将在工具栏追加预览按钮，点击时调用此函数。
   * 不传则不显示预览按钮。
   */
  onPreview?: (block: AttachmentBlock, doc: BlockCraft.Doc) => void;

  /**
   * 预览按钮图标类名，默认 'bc_eye-open'
   */
  previewIcon?: string;

  /**
   * 预览按钮 tooltip 文案，默认 '预览'
   */
  previewLabel?: string;

  /**
   * 空附件点击时的提示（附件仍在上传中时），默认 '文件可能正在上传中，暂不可用'
   */
  uploadingTip?: string;
}

export class AttachmentExtensionPlugin extends DocPlugin {
  override name = "attachment-extension";

  fileService!: DocFileService

  private _sub?: Subscription
  private _timer: number | null = null
  private _toolbarRef?: OverlayRef
  private _toolbarComponentRef?: ComponentRef<AttachmentBlockToolbar>

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: AttachmentBlock | null = null

  private _isReadonly(block: AttachmentBlock) {
    return this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly
  }

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
    const target = state.getDefaultEvent().target
    const content = target instanceof Element
      ? target.closest(ATTACHMENT_CONTENT_SELECTOR)
      : null
    if (!content) return

    const blockId = closetBlockId(content)
    if (!blockId) return
    const block = this._getLiveAttachmentBlockById(blockId)
    if (!block) return

    // 空附件：编辑模式下打开文件选择
    if (!block.props.url) {
      state.preventDefault()
      if (!this._isReadonly(block)) {
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
    if (this._isReadonly(block)) {
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

      if (!selection || !isSelectionAlive(selection as any, this.doc) || !selection.isInSameBlock || selection.firstBlock?.flavour !== 'attachment' || selection.anchor.type !== 'selected' || selection.head.type !== 'selected') {
        this._toolbarRef && this.closeToolbar()
        return
      }

      const attachmentBlock = selection.firstBlock as AttachmentBlock
      if (this._toolbarRef && this._activeBlock === attachmentBlock) return;
      this.closeToolbar()

      this._timer = setTimeout(() => {
        this._timer = null
        if (this._toolbarRef && this._activeBlock === attachmentBlock) return;
        const currentSelection = this.doc.selection.value
        if (
          !currentSelection ||
          !isSelectionAlive(currentSelection as any, this.doc) ||
          !currentSelection.isInSameBlock ||
          currentSelection.firstBlock?.id !== attachmentBlock.id ||
          currentSelection.anchor.type !== 'selected' ||
          currentSelection.head.type !== 'selected'
        ) {
          return
        }
        if (!this._isBlockAlive(attachmentBlock)) return

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
        this._toolbarComponentRef = componentRef

        const canUse = this._isCanUse(attachmentBlock)
        componentRef.setInput('doc', this.doc)
        componentRef.setInput('canUse', canUse)
        componentRef.setInput('isReadonly', this._isReadonly(attachmentBlock))
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
          if (!this._isBlockAlive(attachmentBlock)) {
            this.closeToolbar()
            return
          }
          const readonly = this._isReadonly(attachmentBlock)
          switch (v.name) {
            case 'rename':
              if (readonly) return
              this.onRename(attachmentBlock)
              break
            case 'download':
              this.fileService.downloadAttachment(attachmentBlock.props);
              break
            case 'preview':
              this.options?.onPreview?.(attachmentBlock, this.doc)
              break
            case 'delete':
              if (readonly) return
              this.doc.crud.deleteBlockById(attachmentBlock.id)
              break
            default:
              this.options?.onExtraItemClick?.(v.name, attachmentBlock, this.doc)
              break
          }
        })

      }, 200)

    })
    const stateChange$ = this.doc.readonlyManager?.stateChange$
    if (stateChange$) {
      this._sub.add(stateChange$.subscribe(() => {
        const activeBlock = this._activeBlock
        if (!activeBlock || !this._toolbarComponentRef) return
        if (!this._isBlockAlive(activeBlock)) {
          this.closeToolbar()
          return
        }
        this._toolbarComponentRef.setInput('isReadonly', this._isReadonly(activeBlock))
      }))
    }
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
    this._toolbarRef?.dispose()
    this._toolbarRef = undefined
    this._toolbarComponentRef = undefined
    this._activeBlock = null
  }

  private _setRenamingHighlight(block: AttachmentBlock, active: boolean) {
    block.hostElement.classList.toggle(ATTACHMENT_RENAMING_CLASS, active)
  }

  private _isBlockAlive(block: AttachmentBlock): boolean {
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private _getLiveAttachmentBlockById(blockId: string): AttachmentBlock | null {
    try {
      const block = this.doc.getBlockById(blockId) as AttachmentBlock | null
      return block && block.flavour === 'attachment' && this._isBlockAlive(block) ? block : null
    } catch {
      return null
    }
  }

  onRename(block: AttachmentBlock) {
    if (!this._isBlockAlive(block) || this._isReadonly(block)) return
    const close$ = new Subject<void>()

    const close = () => {
      close$.next()
      nextTick().then(() => {
        this._setRenamingHighlight(block, false)
        if (!this._isBlockAlive(block)) return
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

    // Keep attachment visually active while the native rename input owns focus.
    // The real selection remains model-owned and is restored on close.
    requestAnimationFrame(() => {
      if (!this._isBlockAlive(block)) return
      componentRef.instance.focus()
      this._setRenamingHighlight(block, true)
    })

    merge(overlayRef.backdropClick(), componentRef.instance.cancel).pipe(takeUntil(close$)).subscribe(() => {
      close()
    })

    componentRef.instance.valueChange.pipe(takeUntil(close$)).subscribe(v => {
      close()
      if (!this._isBlockAlive(block)) return
      if (this._isReadonly(block)) return
      block.updateProps({
        name: v
      })
    })

  }

  @EventListen('paste', {flavour: 'root'})
  onPaste(ctx: UIEventStateContext) {
    const state = ctx.get('clipboardState');
    if (!state.dataTypes.includes(ClipboardDataType.FILES)) return false;
    if (state.selection.isAllSelected) {
      ctx.preventDefault();
      return true;
    }
    const files = state.clipboardData?.files;
    if (!files?.length) return false;
    ctx.preventDefault();

    if (state.selection.getTableCellSelection?.()) {
      this.doc.messageService.warn('请先进入单元格内容后再粘贴文件')
      return true
    }

    if (!isSelectionAlive(state.selection as any, this.doc)) {
      this.doc.logger.warn('attachment paste target selection is stale, abort')
      return true
    }
    if (this.doc.readonlyManager?.isSelectionReadonly(state.selection) ?? this.doc.isReadonly) return true

    // Create blocks with local object URLs IMMEDIATELY — image / attachment
    // block components detect a non-http(s) src in their `ngOnInit` and kick
    // off the upload themselves, showing in-place upload progress. The
    // previous implementation awaited every upload before inserting, so a
    // pasted screenshot stayed invisible until the network round-trip
    // finished. Matches the drag-and-drop path in `DndService.onInsertFiles`.
    const depth = this._selectionDepth(state.selection);
    const snapshots: IBlockSnapshot[] = [];
    const objectUrls: string[] = [];
    let inserted = false;
    try {
      for (const file of Array.from(files)) {
        if (this.fileService.isOverMaxSize(file.size)) {
          this.doc.messageService.warn(
            file.type.startsWith('image/') ? '图片过大，最大支持 60MB' : '文件过大',
          );
          continue;
        }
        const url = this.fileService.createObjectURL(file);
        objectUrls.push(url);
        const snapshot = file.type.startsWith('image/')
          ? this.doc.schemas.createSnapshot('image', [url])
          : this.doc.schemas.createSnapshot('attachment', [{
              name: file.name,
              url,
              type: file.type,
              size: file.size,
            }]);
        snapshot.props.depth = depth;
        snapshots.push(snapshot);
      }

      if (!snapshots.length) return true;
      inserted = this._insertFileSnapshotsAtSelection(state.selection, snapshots);
      return true;
    } finally {
      if (!inserted) this._releaseObjectUrls(objectUrls);
    }
  }

  private _releaseObjectUrls(urls: readonly string[]): void {
    for (const url of urls) {
      try {
        this.fileService.removeObjectURL(url);
      } catch (error) {
        // Cleanup is best-effort and must not mask the original insertion error
        // or prevent the remaining URLs in this paste batch from being released.
        this.doc.logger.warn('attachment paste object URL cleanup failed', error);
      }
    }
  }

  private _selectionDepth(selection: BlockCraft.Selection): number {
    try {
      if (selection.start.type === 'gap') {
        return selection.start.block.props.depth || 0
      }
      return selection.firstBlock.props.depth || 0
    } catch {
      return 0
    }
  }

  private _insertFileSnapshotsAtSelection(selection: BlockCraft.Selection, snapshots: IBlockSnapshot[]): boolean {
    if (!snapshots.length) return false

    if (selection.getTableCellSelection?.()) {
      return false
    }

    if (selection.collapsed && selection.start.type === 'gap') {
      const gap = selection.start
      if (!gap.block.parentId) return false
      const index = gap.block.getIndexOfParent() + (gap.side === 'after' ? 1 : 0)
      this.doc.crud.insertBlocks(gap.block.parentId, index, snapshots)
      return true
    }

    if (selection.start.type === 'boundary' && selection.end.type === 'boundary' && selection.start.blockId === selection.end.blockId) {
      const host = selection.start.block
      const max = host.childrenLength
      const from = Math.max(0, Math.min(selection.start.index, selection.end.index, max))
      const to = Math.max(from, Math.min(Math.max(selection.start.index, selection.end.index), max))
      this.doc.crud.transact(() => {
        if (to > from) {
          this.doc.crud.deleteBlocks(host.id, from, to - from, true)
        }
        this.doc.crud.insertBlocks(host.id, from, snapshots)
      })
      return true
    }

    if (selection.start.type === 'text') {
      const anchorBlock = selection.firstBlock
      this.doc.crud.transact(() => {
        this.doc.clipboard.deleteContentFromSelection(selection)
        this.doc.crud.insertBlocksAfter(anchorBlock, snapshots)
      })
      return true
    }

    return false
  }

  destroy() {
    this._sub?.unsubscribe()
    this.closeToolbar()
  }


}
