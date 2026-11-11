import {
  ClipboardDataType, closetBlockId,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
  DocPlugin,
  EventListen, getPositionWithOffset
} from "../../framework";
import {UIEventStateContext, IBlockSnapshot} from "../../framework";
import {BlockCraftError, downloadFile, ErrorCode, nextTick} from "../../global";
import {checkIncomingContentSize} from '../../framework/doc/incoming-content';
import {fromEvent, merge, Subject, Subscription, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {AttachmentBlockToolbar, IAttachmentToolbarItem} from "./widgets/attachment-toolbar";
import {RenameInputPad} from "./widgets/rename-input-pad";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {ComponentRef} from "@angular/core";
import {focusAfterImageInsertion} from '../../framework/modules/selection/after-insertion';
import {ATTACHMENT_TOOLBAR_INTERACTION} from './interaction-config';
export {ATTACHMENT_TOOLBAR_INTERACTION} from './interaction-config';

type AttachmentBlock = BlockCraft.IBlockComponents['attachment']

/** 按钮展示与业务动作放在同一处；旧 IAttachmentToolbarItem 配置仍可直接使用。 */
export interface AttachmentToolbarAction extends IAttachmentToolbarItem {
  /** 同步、无副作用的条件；打开、附件属性/权限变化和执行前重新判断。 */
  visible?: (block: AttachmentBlock, doc: BlockCraft.Doc) => boolean
  /** 优先于旧 onExtraItemClick；异步失败由插件统一提示。 */
  onClick?: (block: AttachmentBlock, doc: BlockCraft.Doc) => void | Promise<void>
}

const ATTACHMENT_RENAMING_CLASS = 'bc-attachment-renaming'
const ATTACHMENT_CONTENT_SELECTOR = [
  '.attachment-block__empty',
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
  extraItems?: AttachmentToolbarAction[];

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
  override readonly interactionConfigs = [ATTACHMENT_TOOLBAR_INTERACTION]
  override name = "attachment-extension";

  fileService!: DocFileService

  private _sub?: Subscription
  private _timer: number | null = null
  private _hoveredBlock: AttachmentBlock | null = null
  private _toolbarRef?: OverlayRef
  private _toolbarComponentRef?: ComponentRef<AttachmentBlockToolbar>

  private _closeToolbar$ = new Subject<void>()

  private _activeBlock: AttachmentBlock | null = null
  private _selectedBlock: AttachmentBlock | null = null

  private get hoverToolbarEnabled(): boolean {
    // 阅读仍可通过悬停访问下载/预览，不受编辑档位影响。
    return this.doc.isReadonly || this.doc.interaction?.get(ATTACHMENT_TOOLBAR_INTERACTION).hoverOpen !== false
  }

  private get selectionToolbarEnabled(): boolean {
    return !this.doc.isReadonly && this.doc.interaction?.get(ATTACHMENT_TOOLBAR_INTERACTION).selectionOpen !== false
  }

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

    this._sub = new Subscription()
    let hoverEnabled = this.hoverToolbarEnabled
    let selectionEnabled = this.selectionToolbarEnabled
    const syncInteraction = () => {
      const next = this.hoverToolbarEnabled
      const nextSelection = this.selectionToolbarEnabled
      if (next === hoverEnabled && nextSelection === selectionEnabled) return
      if (next !== hoverEnabled) this.closeToolbar()
      hoverEnabled = next
      selectionEnabled = nextSelection
      this.syncSelectionToolbar()
    }
    this._sub.add(this.doc.interaction?.policyChanges$.subscribe(syncInteraction))
    this._sub.add(this.doc.subscribeReadonlyChange?.(syncInteraction))
    this._sub.add(this.doc.selection.selectionChange$.subscribe(() => this.syncSelectionToolbar()))
    this.syncSelectionToolbar()
    // Delegated boundary events avoid a listener per attachment and DOM layout reads.
    this.doc.ngZone.runOutsideAngular(() => {
      const root = this.doc.root.hostElement
      this._sub!.add(fromEvent<PointerEvent>(root, 'pointerover').subscribe(event => {
        if (!this.hoverToolbarEnabled || event.pointerType === 'touch' || event.buttons) return
        const target = event.target
        if (!(target instanceof Element)) return
        const block = this._getAttachmentFromTarget(target)
        if (!block || this._hoveredBlock === block || (this._selectedBlock && this._selectedBlock !== block)) return
        if (this._activeBlock === block && this._toolbarRef) {
          this.clearTimer()
          this._hoveredBlock = block
          return
        }
        this.closeToolbar()
        this._hoveredBlock = block
        this._timer = setTimeout(() => {
          this._timer = null
          if (!this.hoverToolbarEnabled || this._hoveredBlock !== block || !this._isBlockAlive(block)) return
          this.doc.ngZone.run(() => this._openToolbar(block))
        }, 200)
      }))
      // 触屏没有 hover，保留原有点击访问入口。
      this._sub!.add(fromEvent<PointerEvent>(root, 'pointerup').subscribe(event => {
        if (event.pointerType !== 'touch' || !(event.target instanceof Element)) return
        const block = this._getAttachmentFromTarget(event.target)
        if (!block?.props.url) return
        this.doc.ngZone.run(() => {
          this.closeToolbar()
          this._openToolbar(block)
        })
      }))
      this._sub!.add(fromEvent<PointerEvent>(root, 'pointerout').subscribe(event => {
        if (event.pointerType === 'touch') return
        const block = this._hoveredBlock
        if (!block || !(event.target instanceof Node) || !block.hostElement.contains(event.target)) return
        if (event.relatedTarget instanceof Node && block.hostElement.contains(event.relatedTarget)) return
        this._hoveredBlock = null
        this._scheduleClose()
      }))
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
        this.refreshToolbar()
      }))
    }
    this._sub.add(this.doc.onPropsUpdate$.subscribe(event => {
      if (this._activeBlock && event.transactions.some(change => change.block === this._activeBlock)) {
        this.refreshToolbar()
      }
    }))
  }

  private syncSelectionToolbar() {
    const previous = this._selectedBlock
    const selection = this.doc.selection.value
    const block = this.selectionToolbarEnabled && selection?.isInSameBlock &&
      selection.anchor.type === 'selected' && selection.head.type === 'selected'
      ? this._getLiveAttachmentBlockById(selection.firstBlock.id) : null
    this._selectedBlock = block
    if (block) {
      this.clearTimer()
      if (this._activeBlock !== block || !this._toolbarRef) {
        const hovered = this._hoveredBlock === block
        this.closeToolbar()
        if (hovered) this._hoveredBlock = block
        this._openToolbar(block)
      }
    } else if (previous && this._activeBlock === previous && this._hoveredBlock !== previous) {
      this.closeToolbar()
    }
  }

  private _openToolbar(attachmentBlock: AttachmentBlock) {
    this._activeBlock = attachmentBlock
    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<AttachmentBlockToolbar>({
      target: attachmentBlock,
      // Follow card width changes in columns without changing selection or layout.
      getOriginRect: () => attachmentBlock.hostElement.getBoundingClientRect(),
      component: AttachmentBlockToolbar,
      allowReadonly: this.doc.isReadonly,
      positions: [
        getPositionWithOffset("top-right", 0, 8),
        getPositionWithOffset("bottom-right", 0, 8),
      ]
    }, this._closeToolbar$, this.closeToolbar)

    this._toolbarRef = overlayRef
    this._toolbarComponentRef = componentRef

    componentRef.setInput('doc', this.doc)
    this.refreshToolbar()
    componentRef.setInput('showPreview', !!this.options?.onPreview)
    if (this.options?.previewIcon) {
      componentRef.setInput('previewIcon', this.options.previewIcon)
    }
    if (this.options?.previewLabel) {
      componentRef.setInput('previewLabel', this.options.previewLabel)
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
          if (readonly || !this._isCanUse(attachmentBlock)) return
          this.closeToolbar()
          this.onRename(attachmentBlock)
          break
        case 'download':
          if (!this._isCanUse(attachmentBlock)) return
          this.fileService.downloadAttachment(attachmentBlock.props);
          break
        case 'preview':
          if (!this._isCanUse(attachmentBlock)) return
          this.options?.onPreview?.(attachmentBlock, this.doc)
          break
        case 'delete':
          if (readonly) return
          this.doc.crud.deleteBlockById(attachmentBlock.id)
          break
        default:
          void this.runExtraAction(v.name, attachmentBlock)
          break
      }
    })
    this.doc.ngZone.runOutsideAngular(() => {
      fromEvent(overlayRef.overlayElement, 'pointerenter').pipe(takeUntil(this._closeToolbar$))
        .subscribe(() => this.clearTimer())
      fromEvent(overlayRef.overlayElement, 'pointerleave').pipe(takeUntil(this._closeToolbar$))
        .subscribe(() => this._scheduleClose())
      fromEvent<PointerEvent>(overlayRef.overlayElement.ownerDocument, 'pointerdown')
        .pipe(takeUntil(this._closeToolbar$)).subscribe(event => {
          if (!(event.target instanceof Node) || overlayRef.overlayElement.contains(event.target) ||
            attachmentBlock.hostElement.contains(event.target)) return
          this.doc.ngZone.run(() => this.closeToolbar())
        })
      fromEvent<KeyboardEvent>(overlayRef.overlayElement.ownerDocument, 'keydown')
        .pipe(takeUntil(this._closeToolbar$)).subscribe(event => {
          if (event.key === 'Escape') this.doc.ngZone.run(() => this.closeToolbar())
        })
    })
  }

  private _scheduleClose() {
    this.clearTimer()
    if (this._selectedBlock && this._selectedBlock === this._activeBlock) return
    this._timer = setTimeout(() => {
      this._timer = null
      this.doc.ngZone.run(() => this.closeToolbar())
    }, 200)
  }

  private visibleActions(block: AttachmentBlock): AttachmentToolbarAction[] {
    const canUse = this._isCanUse(block)
    const readonly = this._isReadonly(block)
    return (this.options?.extraItems ?? []).filter(item =>
      (canUse || item.showWhenUnavailable) && (!item.editOnly || !readonly) &&
      (!item.visible || item.visible(block, this.doc)))
  }

  private refreshToolbar() {
    const block = this._activeBlock
    const ref = this._toolbarComponentRef
    if (!block || !ref) return
    if (!this._isBlockAlive(block)) {
      this.closeToolbar()
      return
    }
    ref.setInput('canUse', this._isCanUse(block))
    ref.setInput('isReadonly', this._isReadonly(block))
    ref.setInput('extraItems', this.visibleActions(block))
  }

  private async runExtraAction(name: string, block: AttachmentBlock) {
    try {
      const action = this.visibleActions(block).find(item => item.name === name)
      if (!action) return
      if (action.onClick) await action.onClick(block, this.doc)
      else this.options?.onExtraItemClick?.(name, block, this.doc)
    } catch (error) {
      this.doc.logger.warn('attachmentActionError', error)
      if (this._sub && !this._sub.closed) this.doc.messageService.warn('附件操作失败，请重试')
    }
  }

  private _getAttachmentFromTarget(target: Element): AttachmentBlock | null {
    // 嵌套文档拥有独立 block map；禁止外层委托监听解析内层的 ID。
    if (target.closest('[data-blockcraft-root="true"]') !== this.doc.root.hostElement) return null
    const id = closetBlockId(target)
    return id ? this._getLiveAttachmentBlockById(id) : null
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
    this._hoveredBlock = null
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
      if (!checkIncomingContentSize(this.doc, {snapshots})) return true;
      inserted = this._insertFileSnapshotsAtSelection(state.selection, snapshots);
      if (inserted) focusAfterImageInsertion(this.doc, snapshots[snapshots.length - 1]);
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
    this._selectedBlock = null
    this._sub?.unsubscribe()
    this.closeToolbar()
  }


}
