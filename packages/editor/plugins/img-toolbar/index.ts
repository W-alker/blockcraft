import {
  BindHotKey,
  closetBlockId,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
  DocPlugin,
  EditableBlockComponent,
  EventListen,
  getPositionWithOffset,
  InlineImageData,
} from "../../framework";
import { UIEventStateContext } from "../../framework";
import { fromEvent, Subject, Subscription, takeUntil } from "rxjs";
import { IImageToolbarItem, ImageToolbar } from "./widgets/image.toolbar";
import {
  BlockCraftError,
  ErrorCode,
  getImageExt,
  nextTick,
} from "../../global";
import { OverlayRef } from "@angular/cdk/overlay";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {imageBlockSnapshotToInlineParagraph} from "./inline-image-conversion";
import {
  calculateInlineImageSize,
  inlineImageSnapshotToBlockSnapshots,
  resolveInlineImageAtOffset,
} from './inline-image-interaction';
import {InlineImageToolbar} from './widgets/inline-image.toolbar';
import {ResizeContainerComponent} from '../../components';
import {ApplicationRef, ComponentRef, createComponent} from '@angular/core';

interface ActiveInlineImageContext {
  block: EditableBlockComponent;
  blockId: string;
  offset: number;
  shell: HTMLElement;
  image: HTMLImageElement;
  data: InlineImageData;
}

export interface ImgToolbarPluginOptions {
  /**
   * 追加到工具栏的自定义按钮
   */
  extraItems?: IImageToolbarItem[];

  /**
   * 自定义按钮点击回调。返回 true 表示已处理。
   */
  onExtraItemClick?: (
    itemName: string,
    block: BlockCraft.IBlockComponents["image"],
    doc: BlockCraft.Doc,
  ) => boolean;
}

export class ImgToolbarPlugin extends DocPlugin {
  override name = "img-toolbar";

  fileService!: DocFileService;

  constructor(private options?: ImgToolbarPluginOptions) {
    super();
  }

  private _sub = new Subscription();
  private _toolbarRef?: OverlayRef;
  private _openToolbarTimer?: number;
  private _pendingImageClickCleanup?: () => void;

  private _closeToolbar$ = new Subject<void>();
  private _inlineClose$ = new Subject<void>();
  private _inlineToolbarRef?: OverlayRef;
  private _inlineResizerRef?: ComponentRef<ResizeContainerComponent>;
  private _inlineAppRef?: ApplicationRef;
  private _inlineContext?: ActiveInlineImageContext;

  @BindHotKey(
    {
      key: "Enter",
      shortKey: null,
      shiftKey: null,
      ctrlKey: null,
      altKey: null,
    },
    { flavour: "image" },
  )
  onImageTitleEnter(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return;

    ctx.preventDefault();
    const state = ctx.get("keyboardState");
    const selection = state.selection;
    const blockId = selection.commonParent;
    const block = this._getLiveBlockById(blockId);
    if (!block) return true;

    const np = this.doc.schemas.createSnapshot("paragraph", []);
    const imgBlock = block.flavour === "caption" ? block.parentBlock! : block;
    if (this.doc.readonlyManager?.isReadonly(imgBlock) ?? this.doc.isReadonly) {
      return true;
    }
    void this.doc
      .chain()
      .insertSnapshots(
        imgBlock.parentId!,
        imgBlock.getIndexOfParent() + (state.raw.ctrlKey ? 0 : 1),
        [np],
      )
      .selectOrSetCursorAtBlock(np.id, true)
      .run();
    return true;
  }

  @EventListen("doubleClick", { flavour: "image" })
  onImageMouseDown(ctx: UIEventStateContext) {
    const evt: MouseEvent = ctx.getDefaultEvent();
    const target = evt.target;
    if (
      !target ||
      !(target instanceof HTMLElement) ||
      !target.classList.contains("img-wrapper")
    )
      return;
    if (!this.doc.isReadonly) {
      const blockId = closetBlockId(target);
      if (!blockId || !this.doc.readonlyManager.isReadonly(blockId)) return;
    }
    const img = target.querySelector("img")!;
    this.doc.injector.get(DOC_FILE_SERVICE_TOKEN).previewImg({ el: img });
    img.dispatchEvent(
      new MouseEvent("click", {
        bubbles: false,
        cancelable: true,
        view: window,
      }),
    );
    return true;
  }

  init() {
    this.fileService = this.doc.injector.get(DOC_FILE_SERVICE_TOKEN);
    if (!this.fileService) {
      throw new BlockCraftError(
        ErrorCode.PluginError,
        "AttachmentController requires DocFileService",
      );
    }

    this._sub.add(
      this.doc.subscribeReadonlyChange((readonly) => {
        if (readonly) {
          this.closeToolbar();
          this.closeInlineToolbar();
        }
      }),
    );

    const stateChange$ = this.doc.readonlyManager?.stateChange$;
    if (stateChange$) {
      this._sub.add(stateChange$.subscribe(() => {
        const inlineContext = this._inlineContext;
        if (inlineContext) {
          const liveInlineBlock = this._getLiveBlockById(inlineContext.blockId);
          if (
            this.doc.isReadonly ||
            !liveInlineBlock ||
            liveInlineBlock !== inlineContext.block ||
            this.doc.readonlyManager.isReadonly(liveInlineBlock)
          ) {
            this.closeInlineToolbar();
          }
        }
        const selection = this.doc.selection.value;
        if (!selection || !isSelectionAlive(selection as any, this.doc)) {
          this.closeToolbar();
          return;
        }
        const firstBlock = selection.firstBlock;
        if (firstBlock.flavour === "image" && this.doc.readonlyManager.isReadonly(firstBlock)) {
          this.clearOpenToolbarTimer();
          this.closeToolbar();
        }
      }));
    }

    this._sub.add(
      fromEvent<MouseEvent>(this.doc.root.hostElement, 'mousedown', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this._onInlineImageMouseDown(event)),
    );

    // Image block drag via pointerdown (replaces former HTML5 dragstart path)
    // 重点：
    // 1. image-block.scss 给 <img> 设了 pointer-events: none（仅 .selected 状态 unset），
    //    所以点击图片时 evt.target 多半是 .img-wrapper 而不是 HTMLImageElement。
    //    只命中 .img-wrapper：图片块周围留白应继续走普通 selection/gap 流程。
    // 2. 监听 document capture phase（而不是 root.hostElement）—— 比 root 更外层一层，
    //    任何 root 内部 element 上的 stopPropagation(capture) 都不会拦掉我们。
    // 3. 不再做 isInSameBlock 检查 —— 老 dragstart 路径里那条 guard 在 mousedown 之后触发，
    //    selection 已是最新；PointerEvents 路径里 pointerdown 早于 mousedown，selection
    //    还是旧的，那条 guard 会误拦掉对图片的拖拽。
    this._sub.add(
      fromEvent<PointerEvent>(document, 'pointerdown', { capture: true })
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(evt => {
          if (this.doc.isReadonly) return
          if (evt.button !== 0) return
          const target = evt.target
          if (!(target instanceof Element)) return
          if (!this.doc.root.hostElement.contains(target)) return
          // 排除调宽度的 resize 句柄、占位插图按钮等
          if (target.closest('block-resizer')) return
          if (target.closest('.upload-hint')) return
          const imageContent = target.closest('.img-wrapper')
          if (!imageContent || !this.doc.root.hostElement.contains(imageContent)) return

          const blockId = closetBlockId(imageContent)
          if (!blockId) return
          let block: BlockCraft.BlockComponent | null = null
          try { block = this.doc.getBlockById(blockId) } catch { return }
          if (!block || block.flavour !== 'image' || !this._isBlockAlive(block)) return
          if (this.doc.dragController.state !== 'idle') return

          // 显式选中 image block。不依赖 native selection → selectionchange → recalculate
          // 这条间接链路（pointerdown 触发 startDrag 后会 attach 一堆 listener，
          // 经验上对 native selection 链路有干扰，导致单击图片不显示 selected 工具栏）。
          this.doc.selection.selectBlock(block)
          this._confirmImageClickSelection(evt, block as BlockCraft.IBlockComponents["image"])

          if (!this.doc.readonlyManager.isReadonly(block)) {
            this.doc.dragController.startDrag(
              evt,
              { kind: 'origin-block', blockId },
              { ghostLabel: '图片' },
            )
          }
        })
    );

    this._sub.add(this.doc.selection.selectionChange$.subscribe((selection) => {
      if (
        this.doc.isReadonly ||
        !selection ||
        !isSelectionAlive(selection as any, this.doc) ||
        !selection.isInSameBlock ||
        selection.firstBlock.flavour !== "image" ||
        selection.anchor.type !== "selected" ||
        selection.head.type !== "selected"
      ) {
        this._toolbarRef && this.closeToolbar();
        return;
      }

      const imgBlock = selection.firstBlock;
      if (this.doc.readonlyManager.isReadonly(imgBlock)) {
        this._toolbarRef && this.closeToolbar();
        return;
      }
      this.clearOpenToolbarTimer();
      this._openToolbarTimer = setTimeout(() => {
        this._openToolbarTimer = undefined;
        if (this.doc.isReadonly || this.doc.readonlyManager.isReadonly(imgBlock)) {
          this.closeToolbar();
          return;
        }

        if (this._toolbarRef) return;
        if (!this._isBlockAlive(imgBlock)) return;
        const currentSelection = this.doc.selection.value;
        if (
          !currentSelection ||
          !isSelectionAlive(currentSelection as any, this.doc) ||
          !currentSelection.isInSameBlock ||
          currentSelection.firstBlock.id !== imgBlock.id ||
          currentSelection.anchor.type !== "selected" ||
          currentSelection.head.type !== "selected"
        ) {
          return;
        }

        const imgEle = imgBlock.hostElement.querySelector("img");
        if (!imgEle || !imgEle.isConnected) return;
        const { overlayRef, componentRef } =
          this.doc.overlayService.createConnectedOverlay<ImageToolbar>(
            {
              target: imgEle,
              positions: [
                getPositionWithOffset("top-center", 0, 8),
                getPositionWithOffset("bottom-center", 0, 8),
              ],
              component: ImageToolbar,
            },
            this._closeToolbar$,
            this.closeToolbar,
          );

        this._toolbarRef = overlayRef;
        componentRef.setInput("imgBlock", imgBlock);

        if (this.options?.extraItems?.length) {
          componentRef.setInput("extraItems", this.options.extraItems);
        }

        fromEvent<MouseEvent>(imgEle, "mousedown")
          .pipe(takeUntil(this._closeToolbar$))
          .subscribe((v) => {
            this.doc.injector
              .get(DOC_FILE_SERVICE_TOKEN)
              .previewImg({ el: imgEle });
          });

        imgBlock.onPropsChange
          .pipe(takeUntil(this._closeToolbar$))
          .subscribe((v) => {
            componentRef?.instance.cdr.markForCheck();
            nextTick().then(() => {
              overlayRef?.updatePosition();
            });
          });

        componentRef.instance.onItemClicked
          .pipe(takeUntil(this._closeToolbar$))
          .subscribe((v) => {
            if (!this._isBlockAlive(imgBlock)) {
              this.closeToolbar();
              return;
            }
            if (this.doc.readonlyManager.isReadonly(imgBlock) && v.name !== "download") {
              this.closeToolbar();
              return;
            }
            switch (v.name) {
              case "align":
                imgBlock.updateProps({
                  align: v.value,
                });
                break;
              case "caption":
                if (imgBlock.childrenLength) {
                  this.doc.crud.deleteBlocks(imgBlock.id, 0, 1, true);
                } else {
                  const title = this.doc.schemas.createSnapshot("caption", []);
                  void this.doc
                    .chain()
                    .insertSnapshots(imgBlock.id, 0, [title])
                    .selectOrSetCursorAtBlock(title.id, true)
                    .run();
                }
                break;
              case "change":
                break;
              case "download":
                this.fileService.downloadAttachment({
                  url: imgBlock.props.src,
                  name:
                    (imgBlock.firstChildren?.textContent() || Date.now()) +
                    "." +
                    getImageExt(imgBlock.props.src),
                });
                break;
              case "copy-url":
                this.doc.clipboard
                  .copyText(imgBlock.props.src)
                  .then(() => {
                    this.doc.messageService.success("图片链接已复制到剪贴板");
                  });
                break;
              case "inline": {
                const current = this.doc.model.toSnapshot(imgBlock.id);
                if (!current) {
                  this.closeToolbar();
                  break;
                }
                const paragraph = imageBlockSnapshotToInlineParagraph(current);
                if (!paragraph) {
                  this.doc.messageService.warn("图片地址为空，无法转为行内图片");
                  break;
                }
                this.closeToolbar();
                void this.doc
                  .chain()
                  .replaceWithSnapshots(imgBlock.id, [paragraph])
                  .selectOrSetCursorAtBlock(paragraph.id, false)
                  .run();
                break;
              }
              default:
                this.options?.onExtraItemClick?.(
                  v.name,
                  imgBlock as BlockCraft.IBlockComponents["image"],
                  this.doc,
                );
                break;
            }
          });

        const dragSub = this.doc.dragController.state$
          .pipe(takeUntil(this._closeToolbar$))
          .subscribe(state => {
            if (state === 'dragging') {
              this._closeToolbar$.next();
              dragSub.unsubscribe();
            }
          });

        this.doc.selection.nextChangeObserve()
          .pipe(takeUntil(this._closeToolbar$))
          .subscribe(() => {
            this._closeToolbar$.next();
          });

        imgBlock.onDestroy$
          .pipe(takeUntil(this._closeToolbar$))
          .subscribe(() => {
            this._closeToolbar$.next();
          });
      }, 200);
    }));
  }

  closeToolbar = () => {
    this.clearOpenToolbarTimer();
    this._closeToolbar$.next();
    this._toolbarRef?.dispose();
    this._toolbarRef = undefined;
  };

  closeInlineToolbar = () => {
    this._inlineClose$.next();
    this._inlineToolbarRef?.dispose();
    this._inlineToolbarRef = undefined;
    this._inlineContext?.shell.classList.remove('bc-inline-image-shell--selected');

    const resizerRef = this._inlineResizerRef;
    const appRef = this._inlineAppRef;
    this._inlineResizerRef = undefined;
    this._inlineAppRef = undefined;
    this._inlineContext = undefined;
    if (resizerRef) {
      try { appRef?.detachView(resizerRef.hostView); } catch {}
      resizerRef.destroy();
    }
  };

  private _onInlineImageMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const shell = target.closest<HTMLElement>('.bc-inline-image-shell[data-bc-inline-image]');
    if (!shell || !this.doc.root.hostElement.contains(shell)) {
      this.closeInlineToolbar();
      return;
    }
    if (this._inlineContext?.shell === shell) return;
    if (this.doc.isReadonly) {
      this.closeInlineToolbar();
      return;
    }

    const blockId = closetBlockId(shell);
    if (!blockId) return;
    const block = this._getLiveBlockById(blockId);
    if (
      !block ||
      !this.doc.isEditable(block) ||
      this.doc.readonlyManager.isReadonly(block)
    ) {
      this.closeInlineToolbar();
      return;
    }

    const editable = block as EditableBlockComponent;
    let offset: number;
    try {
      offset = editable.runtime.domPointToModel(shell, 0);
    } catch {
      return;
    }
    const data = resolveInlineImageAtOffset(editable.textDeltas(), offset);
    const image = shell.querySelector<HTMLImageElement>('img.bc-inline-image');
    if (!data || !image) return;

    event.preventDefault();
    event.stopPropagation();
    this.closeToolbar();
    this.closeInlineToolbar();

    const context: ActiveInlineImageContext = {
      block: editable,
      blockId,
      offset,
      shell,
      image,
      data,
    };
    this._inlineContext = context;
    shell.classList.add('bc-inline-image-shell--selected');

    const appRef = this.doc.injector.get(ApplicationRef);
    const resizerRef = createComponent(ResizeContainerComponent, {
      environmentInjector: appRef.injector,
      elementInjector: this.doc.injector,
    });
    this._inlineAppRef = appRef;
    this._inlineResizerRef = resizerRef;
    resizerRef.setInput('container', image);
    resizerRef.setInput('maxWidthContainer', editable.containerElement);
    appRef.attachView(resizerRef.hostView);
    shell.appendChild(resizerRef.location.nativeElement);
    resizerRef.changeDetectorRef.detectChanges();
    resizerRef.instance.widthChange
      .pipe(takeUntil(this._inlineClose$))
      .subscribe(width => this._commitInlineImageResize(context, width));

    const rect = image.getBoundingClientRect();
    const size = calculateInlineImageSize(
      data.width ?? rect.width,
      data,
      {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: rect.width,
        renderedHeight: rect.height,
      },
    );
    const {overlayRef, componentRef} =
      this.doc.overlayService.createConnectedOverlay<InlineImageToolbar>({
        target: image,
        positions: [
          getPositionWithOffset('top-center', 0, 8),
          getPositionWithOffset('bottom-center', 0, 8),
        ],
        component: InlineImageToolbar,
      }, this._inlineClose$, this.closeInlineToolbar);
    this._inlineToolbarRef = overlayRef;
    componentRef.setInput('width', size.width);
    componentRef.setInput('height', size.height);
    componentRef.instance.onItemClicked
      .pipe(takeUntil(this._inlineClose$))
      .subscribe(item => {
        if (item.name === 'block') {
          this._convertInlineImageToBlock(context);
        }
      });
  }

  private _commitInlineImageResize(
    context: ActiveInlineImageContext,
    width: number,
  ) {
    const liveBlock = this._getLiveBlockById(context.blockId);
    if (
      this.doc.isReadonly ||
      liveBlock !== context.block ||
      !this.doc.isEditable(liveBlock) ||
      this.doc.readonlyManager.isReadonly(liveBlock)
    ) {
      this.closeInlineToolbar();
      return;
    }
    const current = resolveInlineImageAtOffset(
      context.block.textDeltas(),
      context.offset,
      context.data.src,
    );
    if (!current) {
      this.closeInlineToolbar();
      return;
    }

    const rect = context.image.getBoundingClientRect();
    const size = calculateInlineImageSize(width, current, {
      naturalWidth: context.image.naturalWidth,
      naturalHeight: context.image.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
    });
    this.closeInlineToolbar();
    context.block.formatText(context.offset, 1, size);
  }

  private _convertInlineImageToBlock(context: ActiveInlineImageContext) {
    const liveBlock = this._getLiveBlockById(context.blockId);
    if (
      this.doc.isReadonly ||
      liveBlock !== context.block ||
      !this.doc.isEditable(liveBlock) ||
      this.doc.readonlyManager.isReadonly(liveBlock)
    ) {
      this.closeInlineToolbar();
      return;
    }
    const current = resolveInlineImageAtOffset(
      context.block.textDeltas(),
      context.offset,
      context.data.src,
    );
    if (!current) {
      this.closeInlineToolbar();
      return;
    }

    const parentId = this.doc.model.getParentId(context.blockId);
    const parent = parentId ? this.doc.model.toSnapshot(parentId) : null;
    if (!parent || !this.doc.schemas.isValidChildren('image', parent.flavour)) {
      this.doc.messageService.warn('当前位置不支持图片块');
      return;
    }
    const snapshot = this.doc.model.toSnapshot(context.blockId);
    if (!snapshot) {
      this.closeInlineToolbar();
      return;
    }
    const result = inlineImageSnapshotToBlockSnapshots(snapshot, context.offset);
    if (!result) {
      this.closeInlineToolbar();
      return;
    }

    this.closeInlineToolbar();
    void this.doc.chain()
      .replaceWithSnapshots(context.blockId, result.snapshots)
      .selectOrSetCursorAtBlock(result.image.id, true)
      .run();
  }

  private clearOpenToolbarTimer() {
    if (this._openToolbarTimer === undefined) return;
    clearTimeout(this._openToolbarTimer);
    this._openToolbarTimer = undefined;
  }

  private _getLiveBlockById(blockId: string): BlockCraft.BlockComponent | null {
    try {
      const block = this.doc.getBlockById(blockId);
      return this._isBlockAlive(block) ? block : null;
    } catch {
      return null;
    }
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent | null | undefined): block is BlockCraft.BlockComponent {
    if (!block) return false;
    try {
      return this.doc.getBlockById(block.id) === block;
    } catch {
      return false;
    }
  }

  private _confirmImageClickSelection(
    startEvent: PointerEvent,
    block: BlockCraft.IBlockComponents["image"],
  ) {
    this._pendingImageClickCleanup?.();

    let didDrag = this.doc.dragController.isDragging;
    const stateSub = this.doc.dragController.state$
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(state => {
        if (state === 'dragging' || state === 'dropping') {
          didDrag = true;
        }
      });

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener('pointerup', onPointerEnd, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('blur', onPointerCancel, true);
      stateSub.unsubscribe();
      if (this._pendingImageClickCleanup === cleanup) {
        this._pendingImageClickCleanup = undefined;
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== startEvent.pointerId) return;
      const shouldConfirm = !didDrag;
      cleanup();
      if (!shouldConfirm) return;
      try {
        if (this._isBlockAlive(block)) {
          this.doc.selection.selectBlock(block);
        }
      } catch {}
    };
    const onPointerCancel = () => cleanup();

    window.addEventListener('pointerup', onPointerEnd, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('blur', onPointerCancel, true);
    this._pendingImageClickCleanup = cleanup;
  }

  destroy() {
    this.closeToolbar();
    this.closeInlineToolbar();
    this._pendingImageClickCleanup?.();
    this._sub.unsubscribe();
  }
}
