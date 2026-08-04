import {
  BindHotKey,
  BlockObjectLayout,
  BlockPositionState,
  closetBlockId,
  DEFAULT_INLINE_IMAGE_WRAP_GAP,
  DOC_FILE_SERVICE_TOKEN,
  DocFileService,
  DocPlugin,
  EditableBlockComponent,
  EventListen,
  getPositionWithOffset,
  IBlockSnapshot,
  IInlineNodeAttrs,
  InlineImageData,
  InlineImageWrapSide,
  measureObjectPlacement,
  ORIGIN_NO_RECORD,
} from "../../framework";
import {
  INLINE_IMAGE_INTRINSIC_SIZE_EVENT,
} from '../../framework/block-std/inline/image-embed-events';
import { UIEventStateContext } from "../../framework";
import { fromEvent, merge, Subject, Subscription, takeUntil } from "rxjs";
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
  disableInlineImageWrap,
  enableInlineImageWrap,
  inlineImageSnapshotToBlockSnapshots,
  planInlineImageAnchorMove,
  resolveInlineImageDragPreview,
  resolveInlineImageDeltaAtOffset,
  resolveInlineImageAtOffset,
} from './inline-image-interaction';
import {
  InlineImageDragProxy,
  resolveInlineImageDropTarget,
  resolveInlineImageOverlapTarget,
} from './inline-image-drag';
import {
  InlineImageResizeSession,
} from './inline-image-resize';
import type {
  InlineImageResizeCommit,
  InlineImageResizeSide,
} from './inline-image-resize';
import {InlineImageToolbar} from './widgets/inline-image.toolbar';
import {InlineImageResizerComponent} from './widgets/inline-image-resizer';
import {
  INLINE_FLOAT_PREVIEW_ATTRIBUTE,
} from '../../framework/block-std/inline/runtime/inline-float-layout';
import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  NgZone,
} from '@angular/core';

interface ActiveInlineImageContext {
  block: EditableBlockComponent;
  blockId: string;
  offset: number;
  shell: HTMLElement;
  frame: HTMLElement;
  image: HTMLImageElement;
  data: InlineImageData;
}

interface InlineImageIntrinsicSizeEventDetail {
  src: string
  width: number
  height: number
}

interface WrappedInlineTextTarget {
  block: EditableBlockComponent
  offset: number
  normalizedX: number
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
  private _inlineResizerRef?: ComponentRef<InlineImageResizerComponent>;
  private _inlineAppRef?: ApplicationRef;
  private _inlineContext?: ActiveInlineImageContext;
  private _inlineWrapDragCancel?: () => void;
  private _inlineResizeSession?: InlineImageResizeSession;
  private _pendingInlineConversions = new Map<string, Subscription>();

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
      !(target instanceof Element) ||
      target.closest(
        "block-resizer, .upload-hint, .bc-resource-placeholder",
      )
    ) {
      return;
    }
    const wrapper = target.closest<HTMLElement>(".img-wrapper");
    if (!wrapper || !this.doc.root.hostElement.contains(wrapper)) return;
    const blockId = closetBlockId(wrapper);
    const block = blockId ? this._getLiveBlockById(blockId) : null;
    if (!block || block.flavour !== "image") return;
    const img = wrapper.querySelector("img");
    if (!img || !img.isConnected) return;

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
      this.doc.placement.registerObjectLayoutAdapter('image', {
        toInline: ({block}) => {
          if (block.flavour !== 'image') return false;
          return this._convertImageBlockToInline(
            block as BlockCraft.IBlockComponents['image'],
          );
        },
      }),
    );

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

    this._sub.add(
      fromEvent<PointerEvent>(document, 'pointerdown', {capture: true})
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this._onInlineWrapPointerDown(event)),
    );

    this._sub.add(
      fromEvent<CustomEvent<InlineImageIntrinsicSizeEventDetail>>(
        this.doc.root.hostElement,
        INLINE_IMAGE_INTRINSIC_SIZE_EVENT,
      )
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(event => this._backfillInlineImageSize(event)),
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
          if (target.closest(
            'block-resizer, [data-bc-inline-image-resizer]',
          )) return
          if (target.closest('.upload-hint')) return
          const imageContent = target.closest('.img-wrapper')
          if (!imageContent || !this.doc.root.hostElement.contains(imageContent)) return

          const blockId = closetBlockId(imageContent)
          if (!blockId) return
          let block: BlockCraft.BlockComponent | null = null
          try { block = this.doc.getBlockById(blockId) } catch { return }
          if (!block || block.flavour !== 'image' || !this._isBlockAlive(block)) return
          if (this.doc.dragController.state !== 'idle') return

          // 工具栏在布局迁移时会主动关闭，但 model selection 可能仍然是同一
          // image。此时重复 selectBlock 会被等值去重，必须先清掉旧选择，让
          // pointerdown 可以重新发布对象选择并挂回图片专用工具栏。
          const currentSelection = this.doc.selection.value
          if (
            !this._toolbarRef &&
            currentSelection?.isInSameBlock &&
            currentSelection.firstBlockId === block.id &&
            currentSelection.anchor.type === 'selected' &&
            currentSelection.head.type === 'selected'
          ) {
            this.doc.selection.blur()
          }

          // 显式选中 image block。不依赖 native selection → selectionchange → recalculate
          // 这条间接链路（pointerdown 触发 startDrag 后会 attach 一堆 listener，
          // 经验上对 native selection 链路有干扰，导致单击图片不显示 selected 工具栏）。
          this.doc.selection.selectBlock(block)
          this._confirmImageClickSelection(evt, block as BlockCraft.IBlockComponents["image"])

          if (!this.doc.readonlyManager.isReadonly(block)) {
            if (this.doc.placement.getState(block).mode === 'absolute') {
              this.doc.placement.startDrag(evt, block)
            } else {
              this.doc.dragController.startDrag(
                evt,
                { kind: 'origin-block', blockId },
                { ghostLabel: '图片' },
              )
            }
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
            if (v.disabled) return;
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
              case "object-layout":
                if (v.value === 'wrap') {
                  this._convertImageBlockToInline(
                    imgBlock as BlockCraft.IBlockComponents['image'],
                    true,
                  );
                } else if (
                  v.value === 'inline' ||
                  v.value === 'top-bottom' ||
                  v.value === 'under' ||
                  v.value === 'over'
                ) {
                  this.doc.placement.setObjectLayout(imgBlock, v.value);
                  if (v.value !== 'inline') this.closeToolbar();
                }
                break;
              case "move-forward":
                this.doc.placement.moveForward(imgBlock);
                componentRef.instance.cdr.markForCheck();
                break;
              case "move-backward":
                this.doc.placement.moveBackward(imgBlock);
                componentRef.instance.cdr.markForCheck();
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
              default:
                this.options?.onExtraItemClick?.(
                  v.name,
                  imgBlock as BlockCraft.IBlockComponents["image"],
                  this.doc,
                );
                break;
            }
          });

        const dragSub = merge(
          this.doc.dragController.state$,
          this.doc.placement.state$,
        )
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
    this._inlineWrapDragCancel?.();
    const resizeSession = this._inlineResizeSession;
    this._inlineResizeSession = undefined;
    resizeSession?.cancel();
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
    const alreadyActive = this._inlineContext?.shell === shell;

    const blockId = closetBlockId(shell);
    if (!blockId) return;
    const block = this._getLiveBlockById(blockId);
    if (
      !block ||
      !this.doc.isEditable(block)
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
    const frame = shell.querySelector<HTMLElement>('.bc-inline-image-frame');
    const image = shell.querySelector<HTMLImageElement>('img.bc-inline-image');
    if (!data || !frame || !image) return;

    event.preventDefault();
    event.stopPropagation();
    // The shell's contenteditable=false wrapper prevents the browser from
    // creating a useful native selection, and preventDefault above deliberately
    // suppresses its fallback caret placement. Select the one-character Embed
    // through SelectionManager so the canonical model selection and DOM Range
    // move together; copy/cut can then operate on the image delta.
    try {
      editable.setInlineRange(offset, 1);
    } catch {
      this.closeInlineToolbar();
      return;
    }
    if (
      this.doc.isReadonly ||
      this.doc.readonlyManager.isReadonly(block)
    ) {
      this.closeInlineToolbar();
      return;
    }
    // A repeated click must still restore the Embed selection, but does not
    // need to tear down and rebuild the already connected controls.
    if (alreadyActive) return;

    this.closeToolbar();
    this.closeInlineToolbar();

    const context: ActiveInlineImageContext = {
      block: editable,
      blockId,
      offset,
      shell,
      frame,
      image,
      data,
    };
    this._inlineContext = context;
    shell.classList.add('bc-inline-image-shell--selected');

    const appRef = this.doc.injector.get(ApplicationRef);
    const resizerRef = createComponent(InlineImageResizerComponent, {
      environmentInjector: appRef.injector,
      elementInjector: this.doc.injector,
    });
    this._inlineAppRef = appRef;
    this._inlineResizerRef = resizerRef;
    resizerRef.setInput('container', frame);
    appRef.attachView(resizerRef.hostView);
    frame.appendChild(resizerRef.location.nativeElement);
    resizerRef.changeDetectorRef.detectChanges();
    resizerRef.instance.handlePointerDown
      .pipe(takeUntil(this._inlineClose$))
      .subscribe(({event: pointerEvent, side}) => {
        this._startInlineImageResize(context, pointerEvent, side);
      });

    const rect = frame.getBoundingClientRect();
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
        target: frame,
        positions: [
          getPositionWithOffset('top-center', 0, 8),
          getPositionWithOffset('bottom-center', 0, 8),
        ],
        component: InlineImageToolbar,
      }, this._inlineClose$, this.closeInlineToolbar);
    this._inlineToolbarRef = overlayRef;
    componentRef.setInput('width', size.width);
    componentRef.setInput('height', size.height);
    componentRef.setInput('layout', data.wrap ? 'wrap' : 'inline');
    componentRef.setInput('side', data.side ?? 'auto');
    componentRef.instance.onItemClicked
      .pipe(takeUntil(this._inlineClose$))
      .subscribe(item => {
        if (item.name === 'object-layout') {
          if (item.value === 'wrap') {
            this._setInlineImageWrap(context, true);
            return;
          }
          if (item.value === 'inline') {
            if (data.wrap) this._setInlineImageWrap(context, false);
            return;
          }
          if (
            item.value === 'top-bottom' ||
            item.value === 'under' ||
            item.value === 'over'
          ) {
            this._convertInlineImageToBlock(context, item.value);
          }
          return;
        }
        if (
          item.name === 'inline-wrap-side' &&
          (
            item.value === 'auto' ||
            item.value === 'left' ||
            item.value === 'right'
          )
        ) {
          this._setInlineImageWrapSide(context, item.value);
        }
      });
  }

  private _resolveLiveInlineImage(
    context: ActiveInlineImageContext,
  ): InlineImageData | null {
    const liveBlock = this._getLiveBlockById(context.blockId);
    if (
      this.doc.isReadonly ||
      liveBlock !== context.block ||
      !this.doc.isEditable(liveBlock) ||
      this.doc.readonlyManager.isReadonly(liveBlock)
    ) {
      return null;
    }
    return resolveInlineImageAtOffset(
      context.block.textDeltas(),
      context.offset,
      context.data.src,
    );
  }

  private _setInlineImageWrap(
    context: ActiveInlineImageContext,
    enabled: boolean,
  ): void {
    const current = this._resolveLiveInlineImage(context);
    if (!current) {
      this.closeInlineToolbar();
      return;
    }

    let attributes: ReturnType<typeof enableInlineImageWrap> |
      ReturnType<typeof disableInlineImageWrap>;
    if (enabled) {
      const ownerRect = context.block.containerElement.getBoundingClientRect();
      const frameRect = context.frame.getBoundingClientRect();
      const ownerWidth =
        context.block.containerElement.clientWidth || ownerRect.width;
      const initialX = ownerWidth > 0
        ? (frameRect.left - ownerRect.left) / ownerWidth
        : 0;
      attributes = enableInlineImageWrap(current, {
        side: 'auto',
        x: initialX,
        gap: DEFAULT_INLINE_IMAGE_WRAP_GAP,
      });
    } else {
      attributes = disableInlineImageWrap();
    }

    this.closeInlineToolbar();
    this.doc.crud.transact(() => {
      context.block.formatText(
        context.offset,
        1,
        attributes as unknown as IInlineNodeAttrs,
      );
    });
  }

  private _setInlineImageWrapSide(
    context: ActiveInlineImageContext,
    side: InlineImageWrapSide,
  ): void {
    const current = this._resolveLiveInlineImage(context);
    if (!current?.wrap) {
      this.closeInlineToolbar();
      return;
    }

    this.closeInlineToolbar();
    this.doc.crud.transact(() => {
      context.block.formatText(context.offset, 1, {side});
    });
  }

  private _onInlineWrapPointerDown(event: PointerEvent): void {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      this.doc.isReadonly ||
      this.doc.event.status.isComposing
    ) {
      return;
    }
    const target = event.target;
    if (
      !(target instanceof Element) ||
      target.closest('block-resizer, [data-bc-inline-image-resizer]')
    ) return;
    const frame = target.closest<HTMLElement>('.bc-inline-image-frame');
    const context = this._inlineContext;
    if (
      !frame ||
      !context ||
      frame !== context.frame ||
      !this.doc.root.hostElement.contains(frame)
    ) {
      return;
    }
    const current = this._resolveLiveInlineImage(context);
    if (!current?.wrap) return;

    const frameRect = frame.getBoundingClientRect();
    if (frameRect.width <= 0 || frameRect.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    this._inlineWrapDragCancel?.();
    context.shell.setAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE, '');
    const releaseLayoutFreeze =
      context.block.runtime.acquireFloatLayoutFreeze?.() ?? (() => undefined);
    let releaseViewLease: () => void = () => undefined;
    try {
      releaseViewLease = this.doc.virtualization.acquireBlockViewLease([
        context.blockId,
      ]);
    } catch {
      context.shell.removeAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE);
      releaseLayoutFreeze();
      return;
    }

    let proxy: InlineImageDragProxy;
    try {
      proxy = new InlineImageDragProxy(
        frame,
        frameRect,
        event.clientX,
        event.clientY,
      );
    } catch {
      context.shell.removeAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE);
      releaseViewLease();
      releaseLayoutFreeze();
      return;
    }

    const pointerId = event.pointerId;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let moved = false;
    let cleaned = false;
    let released = false;
    const zone = this.doc.injector.get(NgZone);

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('blur', onBlur, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('selectstart', onSelectStart, true);
      context.shell.removeAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE);
      proxy.destroy();
      try {
        if (frame.hasPointerCapture(pointerId)) {
          frame.releasePointerCapture(pointerId);
        }
      } catch {}
      if (this._inlineWrapDragCancel === cancel) {
        this._inlineWrapDragCancel = undefined;
      }
    };
    const releaseDragResources = () => {
      if (released) return;
      released = true;
      try {
        releaseViewLease();
      } catch (error) {
        this.doc.logger.warn('inlineImageDragViewLeaseReleaseError: ', error);
      }
      try {
        releaseLayoutFreeze();
      } catch (error) {
        this.doc.logger.warn('inlineImageDragLayoutFreezeReleaseError: ', error);
      }
    };
    const cancel = () => {
      cleanup();
      releaseDragResources();
    };
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      moved = moved || Math.hypot(
        moveEvent.clientX - startClientX,
        moveEvent.clientY - startClientY,
      ) >= 2;
      proxy.move(moveEvent.clientX, moveEvent.clientY);
    };
    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      moved = moved || Math.hypot(
        upEvent.clientX - startClientX,
        upEvent.clientY - startClientY,
      ) >= 2;
      proxy.move(upEvent.clientX, upEvent.clientY);
      const proxyPosition = proxy.position();
      cleanup();
      if (!moved) {
        releaseDragResources();
        return;
      }
      const live = this._resolveLiveInlineImage(context);
      const sourceDelta = resolveInlineImageDeltaAtOffset(
        context.block.textDeltas(),
        context.offset,
        context.data.src,
      );
      let target = resolveInlineImageDropTarget(
        this.doc,
        upEvent.clientX,
        upEvent.clientY,
      );
      if (!live?.wrap || !sourceDelta) {
        this.closeInlineToolbar();
        releaseDragResources();
        return;
      }
      if (!target) {
        releaseDragResources();
        return;
      }

      const targetRect = target.block.containerElement.getBoundingClientRect();
      const targetWidth = target.block.containerElement.clientWidth ||
        targetRect.width;
      if (targetWidth <= 0) {
        releaseDragResources();
        return;
      }
      if (
        target.block === context.block &&
        Math.abs(proxyPosition.top - frameRect.top) < 1
      ) {
        target = {...target, offset: context.offset};
      }
      const placement = resolveInlineImageDragPreview({
        containerWidth: targetWidth,
        imageWidth: live.width ?? frameRect.width,
        imageHeight: live.height ?? frameRect.height,
        imageX: proxyPosition.left - targetRect.left,
        side: live.side,
        gap: live.gap,
      });
      const plan = planInlineImageAnchorMove({
        sourceBlockId: context.blockId,
        sourceOffset: context.offset,
        sourceLength: context.block.textLength,
        targetBlockId: target.block.id,
        targetOffset: target.offset,
        targetLength: target.block.textLength,
        delta: sourceDelta,
        normalizedX: placement.attributes.x,
      });
      this.closeInlineToolbar();
      try {
        if (plan.kind !== 'noop') {
          this.doc.crud.transact(() => {
            this.doc.crud.applyTextDelta(
              context.blockId,
              plan.sourceOperations,
            );
            if (plan.kind === 'cross-block') {
              this.doc.crud.applyTextDelta(
                target.block.id,
                plan.targetOperations,
              );
            }
          });
        }
      } finally {
        releaseDragResources();
      }
    };
    const onPointerCancel = (cancelEvent?: PointerEvent) => {
      if (cancelEvent && cancelEvent.pointerId !== pointerId) return;
      cancel();
    };
    const onBlur = () => cancel();
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      cancel();
    };
    const onSelectStart = (selectEvent: Event) => selectEvent.preventDefault();

    this._inlineWrapDragCancel = cancel;
    zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', onPointerMove, {
        capture: true,
        passive: false,
      });
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerCancel, true);
      window.addEventListener('blur', onBlur, true);
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('selectstart', onSelectStart, true);
      try { frame.setPointerCapture(pointerId); } catch {}
    });
  }

  private _startInlineImageResize(
    context: ActiveInlineImageContext,
    event: PointerEvent,
    side: InlineImageResizeSide,
  ): void {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      this.doc.isReadonly ||
      this.doc.event.status.isComposing ||
      this._inlineContext !== context ||
      !context.frame.isConnected ||
      !context.block.containerElement.isConnected
    ) {
      return;
    }
    const current = this._resolveLiveInlineImage(context);
    if (!current) {
      this.closeInlineToolbar();
      return;
    }

    const frameRect = context.frame.getBoundingClientRect();
    if (frameRect.width <= 0 || frameRect.height <= 0) return;
    const startSize = calculateInlineImageSize(
      current.width ?? frameRect.width,
      current,
      {
        naturalWidth: context.image.naturalWidth,
        naturalHeight: context.image.naturalHeight,
        renderedWidth: frameRect.width,
        renderedHeight: frameRect.height,
      },
    );
    const aspectRatio = startSize.width / startSize.height;

    event.preventDefault();
    event.stopPropagation();
    this._inlineWrapDragCancel?.();
    this._inlineResizeSession?.cancel();
    const zone = this.doc.injector.get(NgZone);
    let session: InlineImageResizeSession | undefined;
    try {
      session = zone.runOutsideAngular(() => new InlineImageResizeSession({
        event,
        side,
        frame: context.frame,
        bounds: context.block.containerElement,
        aspectRatio,
        acquireLayoutFreeze: () =>
          context.block.runtime.acquireFloatLayoutFreeze?.() ??
          (() => undefined),
        acquireViewLease: () =>
          this.doc.virtualization.acquireBlockViewLease([context.blockId]),
        onCommit: result => {
          this._commitInlineImageResize(context, result);
        },
        onFinish: () => {
          if (session && this._inlineResizeSession === session) {
            this._inlineResizeSession = undefined;
          }
        },
        onError: error => {
          this.doc.logger.warn('inlineImageResizeError: ', error);
        },
      }));
      this._inlineResizeSession = session;
    } catch (error) {
      this.doc.logger.warn('inlineImageResizeStartError: ', error);
    }
  }

  private _commitInlineImageResize(
    context: ActiveInlineImageContext,
    result: InlineImageResizeCommit,
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

    const rect = context.frame.getBoundingClientRect();
    const size = calculateInlineImageSize(result.width, current, {
      naturalWidth: context.image.naturalWidth,
      naturalHeight: context.image.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
    });
    let attributes: {width: number; height: number} &
      Partial<ReturnType<typeof enableInlineImageWrap>> = size;
    if (current.wrap) {
      const boundsRect = context.block.containerElement.getBoundingClientRect();
      const containerWidth = context.block.containerElement.clientWidth ||
        boundsRect.width;
      attributes = {
        ...size,
        ...resolveInlineImageDragPreview({
          containerWidth,
          imageWidth: size.width,
          imageHeight: size.height,
          imageX: result.left - boundsRect.left,
          side: current.side,
          gap: current.gap,
        }).attributes,
      };
    }
    this.closeInlineToolbar();
    context.block.formatText(
      context.offset,
      1,
      attributes as unknown as IInlineNodeAttrs,
    );
  }

  private _backfillInlineImageSize(
    event: CustomEvent<InlineImageIntrinsicSizeEventDetail>,
  ): void {
    if (this.doc.isReadonly) return
    const target = event.target
    const {src, width, height} = event.detail
    if (
      !(target instanceof HTMLElement) ||
      !target.matches('.bc-inline-image-shell[data-bc-inline-image]') ||
      !src ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return
    }

    const blockId = closetBlockId(target)
    if (!blockId) return
    const block = this._getLiveBlockById(blockId)
    if (
      !block ||
      !this.doc.isEditable(block) ||
      this.doc.readonlyManager.isReadonly(block)
    ) {
      return
    }

    let offset: number
    try {
      offset = block.runtime.domPointToModel(target, 0)
    } catch {
      return
    }
    const current = resolveInlineImageAtOffset(block.textDeltas(), offset, src)
    if (!current || (current.width != null && current.height != null)) return

    const attributes = {
      ...(current.width == null ? {width} : {}),
      ...(current.height == null ? {height} : {}),
    }
    this.doc.crud.transact(() => {
      block.formatText(offset, 1, attributes)
    }, ORIGIN_NO_RECORD)
  }

  private _convertInlineImageToBlock(
    context: ActiveInlineImageContext,
    layout: Exclude<BlockObjectLayout, 'inline'>,
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

    const parentId = this.doc.model.getParentId(context.blockId);
    if (
      !parentId ||
      !this.doc.canInsertChild(parentId, 'image')
    ) {
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

    if (layout === 'under' || layout === 'over') {
      let targetContainer = context.block.hostElement.parentElement;
      try {
        const parentBlock = this.doc.getBlockById(parentId);
        targetContainer =
          parentBlock.childrenRenderRef?.containerElement ??
          targetContainer;
      } catch {}
      if (!targetContainer) {
        this.doc.messageService.warn('无法确定图片块的定位容器');
        return;
      }
      const measured = measureObjectPlacement(
        context.image,
        targetContainer,
        layout,
      );
      const placement: BlockPositionState = {
        mode: 'absolute',
        x: measured.x,
        y: measured.y,
        ...(layout === 'under' ? {layer: layout} : {}),
      };
      result.image.props = {
        ...result.image.props,
        placement,
      };
    }

    this.closeInlineToolbar();
    void this.doc.chain()
      .replaceWithSnapshots(context.blockId, result.snapshots)
      .selectOrSetCursorAtBlock(result.image.id, true)
      .run();
  }

  private _convertImageBlockToInline(
    imgBlock: BlockCraft.IBlockComponents['image'],
    wrap = false,
  ): boolean {
    if (
      !this._isBlockAlive(imgBlock) ||
      this.doc.isReadonly ||
      this.doc.readonlyManager.isReadonly(imgBlock)
    ) {
      this.closeToolbar();
      return false;
    }
    const current = this.doc.model.toSnapshot(imgBlock.id);
    if (!current) {
      this.closeToolbar();
      return false;
    }
    const src = current.props['src'];
    if (
      typeof src === 'string' &&
      this.fileService.isLocalObjectURL(src)
    ) {
      this._deferImageBlockToInline(imgBlock, wrap);
      return true;
    }
    return this._commitImageBlockToInline(imgBlock, current, wrap);
  }

  private _deferImageBlockToInline(
    imgBlock: BlockCraft.IBlockComponents['image'],
    wrap: boolean,
  ) {
    if (this._pendingInlineConversions.has(imgBlock.id)) {
      this.closeToolbar();
      return;
    }

    this.closeToolbar();
    this.doc.messageService.warn(
      wrap
        ? '图片正在上传，完成后将自动转为四周型环绕'
        : '图片正在上传，完成后将自动转为嵌入型',
    );
    const pending = imgBlock.onPropsChange
      .pipe(
        takeUntil(imgBlock.onDestroy$),
        takeUntil(this.doc.onDestroy$),
      )
      .subscribe(() => {
        if (!this._isBlockAlive(imgBlock)) return;
        const current = this.doc.model.toSnapshot(imgBlock.id);
        const src = current?.props['src'];
        if (
          typeof src === 'string' &&
          this.fileService.isLocalObjectURL(src)
        ) {
          return;
        }

        pending.unsubscribe();
        if (typeof src !== 'string' || !src.trim()) {
          this.doc.messageService.warn(
            wrap
              ? '图片上传失败，未转换为四周型环绕'
              : '图片上传失败，未转换为嵌入型',
          );
          return;
        }
        this._convertImageBlockToInline(imgBlock, wrap);
      });

    this._pendingInlineConversions.set(imgBlock.id, pending);
    pending.add(() => {
      if (this._pendingInlineConversions.get(imgBlock.id) === pending) {
        this._pendingInlineConversions.delete(imgBlock.id);
      }
    });
    this._sub.add(pending);
  }

  private _commitImageBlockToInline(
    imgBlock: BlockCraft.IBlockComponents['image'],
    current: IBlockSnapshot,
    wrap: boolean,
  ): boolean {
    const dimensions = this.doc.objectSizing?.resolve(
      current.flavour,
      current.props,
    );
    const inlineSource = dimensions
      ? {
          ...current,
          props: {
            ...current.props,
            width: dimensions.width,
            height: dimensions.height,
          },
        }
      : current;
    const placement = this.doc.placement.getState(imgBlock);
    const textTarget = wrap && placement.mode === 'absolute'
      ? this._resolveWrappedInlineTextTarget(
          imgBlock,
          dimensions?.width ?? current.props['width'],
          dimensions?.height ?? current.props['height'],
        )
      : null;
    const paragraph = imageBlockSnapshotToInlineParagraph(
      inlineSource,
      wrap
        ? {
            wrap: true,
            side: 'auto',
            x: textTarget?.normalizedX ??
              Math.max(0, Math.min(1, placement.x / 100)),
            gap: DEFAULT_INLINE_IMAGE_WRAP_GAP,
          }
        : undefined,
    );
    if (!paragraph) {
      this.doc.messageService.warn("图片地址为空，无法转换为嵌入型");
      return false;
    }
    if (
      textTarget &&
      this._insertImageBlockIntoText(imgBlock, paragraph, textTarget)
    ) return true;
    const needsReanchor = placement.mode === "absolute";
    const flowAnchor = needsReanchor
      ? this.doc.placement.resolveFlowAnchor(imgBlock)
      : null;
    let converted = false;
    this.closeToolbar();
    this.doc.crud.transact(() => {
      if (
        needsReanchor &&
        !this.doc.placement.reanchorToFlow(imgBlock, flowAnchor)
      ) {
        return;
      }
      this.doc.crud.replaceWithSnapshots(imgBlock.id, [paragraph]);
      converted = true;
    });
    if (!converted) {
      this.doc.messageService.warn("图片无法回到正文位置，未转换为嵌入型");
      return false;
    }
    void this.doc
      .chain()
      .nextTick()
      .selectOrSetCursorAtBlock(paragraph.id, false)
      .run();
    return true;
  }

  private _resolveWrappedInlineTextTarget(
    imgBlock: BlockCraft.IBlockComponents['image'],
    imageWidth: unknown,
    imageHeight: unknown,
  ): WrappedInlineTextTarget | null {
    const visual = imgBlock.hostElement.querySelector<HTMLElement>('.img-wrapper') ??
      imgBlock.hostElement;
    const imageRect = visual.getBoundingClientRect();
    const target = resolveInlineImageOverlapTarget(
      this.doc,
      imgBlock.id,
      imageRect,
    );
    if (!target) return null;

    const targetRect = target.block.containerElement.getBoundingClientRect();
    const containerWidth = target.block.containerElement.clientWidth ||
      targetRect.width;
    const width = typeof imageWidth === 'number' && imageWidth > 0
      ? imageWidth
      : imageRect.width;
    const height = typeof imageHeight === 'number' && imageHeight > 0
      ? imageHeight
      : imageRect.height;
    if (containerWidth <= 0 || width <= 0 || height <= 0) return null;

    const preview = resolveInlineImageDragPreview({
      containerWidth,
      imageWidth: width,
      imageHeight: height,
      imageX: imageRect.left - targetRect.left,
      side: 'auto',
      gap: DEFAULT_INLINE_IMAGE_WRAP_GAP,
    });
    return {
      ...target,
      normalizedX: preview.attributes.x ?? 0,
    };
  }

  private _insertImageBlockIntoText(
    imgBlock: BlockCraft.IBlockComponents['image'],
    paragraph: IBlockSnapshot,
    target: WrappedInlineTextTarget,
  ): boolean {
    const parentId = this.doc.model.getParentId(imgBlock.id);
    const sourceIndex = this.doc.model.indexInParent(imgBlock.id);
    if (!parentId || sourceIndex < 0) return false;

    const deltas = paragraph.nodeType === 'editable'
      ? paragraph.children
      : [];
    if (!deltas.length) return false;
    const insertionLength = deltas.reduce((length, delta) =>
      length + (typeof delta.insert === 'string' ? delta.insert.length : 1), 0);
    const operations = [
      ...(target.offset > 0 ? [{retain: target.offset}] : []),
      ...deltas,
    ];

    this.closeToolbar();
    this.doc.crud.transact(() => {
      this.doc.crud.applyTextDelta(target.block.id, operations);
      // `force` prevents an empty placement-layout from manufacturing a
      // paragraph before its normalizer removes the infrastructure block.
      this.doc.crud.deleteBlocks(parentId, sourceIndex, 1, true);
    });
    void this.doc
      .chain()
      .nextTick()
      .setSelection({
        blockId: target.block.id,
        type: 'text',
        index: target.offset + insertionLength,
        length: 0,
      })
      .run();
    return true;
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

    let didDrag =
      this.doc.dragController.isDragging ||
      this.doc.placement.isDragging;
    const stateSub = merge(
      this.doc.dragController.state$,
      this.doc.placement.state$,
    )
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
