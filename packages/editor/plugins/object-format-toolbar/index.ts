import {
  FlexibleConnectedPositionStrategy,
  OverlayRef,
} from "@angular/cdk/overlay";
import {
  fromEvent,
  merge,
  type Observable,
  Subject,
  Subscription,
  takeUntil,
} from "rxjs";
import {
  closetBlockId,
  BindHotKey,
  createObjectPaint,
  DOC_FILE_SERVICE_TOKEN,
  DocPlugin,
  getPositionWithOffset,
  objectEffectsFilter,
  objectPicturePreserveAspectRatio,
  type BlockObjectLayout,
  type BlockObjectAlignment,
  type BlockObjectFormatSelectionState,
  type BlockObjectPlaneAlignment,
  type DocFileService,
  type ObjectFormatPatch,
  type UIEventStateContext,
} from "../../framework";
import { isSelectionAlive } from "../../framework/modules/selection/liveness";
import { deleteAbsolutePlacementObject } from "../../framework/services/block-placement/delete-command";
import {
  ObjectFormatToolbarComponent,
  type ObjectFormatToolbarAction,
} from "./object-format-toolbar.component";
import {
  hasOpenOwnedSubOverlay,
  isObjectToolbarOwnedTarget,
} from "../object-layout/object-toolbar-interaction";
import { InlineObjectInteractionController } from "../object-layout/inline-object-interaction";
import { getShapeDefinition } from "../../blocks/shape-block";

export * from "./object-format-toolbar.component";

const TOOLBAR_GAP = 10;

/** One object toolbar owner for Shape, TextBox, WordArt and mixed selection. */
export class ObjectFormatToolbarPlugin extends DocPlugin {
  override name = "object-format-toolbar";

  private readonly subscription = new Subscription();
  private readonly close$ = new Subject<void>();
  private overlayRef?: OverlayRef;
  private component?: ObjectFormatToolbarComponent;
  private activeIds: string[] = [];
  private toolbarPointerActive = false;
  private toolbarFocusActive = false;
  private toolbarPointerGraceUntil = 0;
  private chromeRetentionEpoch = 0;
  private toolbarPositionFrame: number | null = null;
  private readonly retainedObjectChrome = new Map<string, HTMLElement>();
  private inlineObjects: InlineObjectInteractionController[] = [];
  private previewFrame: number | null = null;
  private pendingPreview?: ObjectFormatPatch;
  private activeWordArtHost?: HTMLElement;
  private pendingShapeClickCleanup?: () => void;
  private textBoxResizerGesture?: { blockId: string; pointerId: number };

  init(): void {
    this.inlineObjects = [
      new InlineObjectInteractionController(this.doc, "shape", this.close),
      new InlineObjectInteractionController(this.doc, "word-art", this.close),
    ];
    this.inlineObjects.forEach((controller) => controller.init());
    this.subscription.add(
      this.doc.selection.selectionChange$.subscribe((selection) =>
        this.sync(selection),
      ),
    );
    this.subscription.add(
      this.doc.subscribeReadonlyChange((readonly) => {
        if (readonly) this.close();
      }),
    );
    this.subscription.add(
      fromEvent<PointerEvent>(document, "pointerdown", { capture: true })
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe((event) => {
          const target = this.resolveElement(event.target);
          if (
            isObjectToolbarOwnedTarget(this.overlayRef?.overlayElement, target)
          ) {
            this.toolbarPointerActive = true;
            this.toolbarFocusActive = true;
            this.toolbarPointerGraceUntil = 0;
            this.retainObjectChrome();
            this.scheduleRetainObjectChrome();
            return;
          }
          if (this.extendAbsoluteSelection(event)) return;
          this.handleExistingObjectPointerDown(event);
        }),
    );
    this.subscription.add(
      fromEvent<PointerEvent>(document, "pointerup", { capture: true })
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe((event) => {
          this.toolbarPointerActive = false;
          this.toolbarPointerGraceUntil = Date.now() + 100;
          this.finishTextBoxResizerGesture(event.pointerId);
        }),
    );
    this.subscription.add(
      fromEvent<PointerEvent>(document, "pointercancel", { capture: true })
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe((event) => {
          this.toolbarPointerActive = false;
          this.toolbarPointerGraceUntil = 0;
          this.finishTextBoxResizerGesture(event.pointerId);
        }),
    );
    this.subscription.add(
      fromEvent<FocusEvent>(document, "focusin", { capture: true })
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe((event) => this.handleFocusIn(event)),
    );
  }

  destroy(): void {
    this.inlineObjects.forEach((controller) => controller.destroy());
    this.inlineObjects = [];
    this.pendingShapeClickCleanup?.();
    this.close();
    this.subscription.unsubscribe();
    this.close$.complete();
  }

  close = (): void => {
    this.chromeRetentionEpoch++;
    this.activeWordArtHost?.classList.remove("word-art-block--object-selected");
    this.activeWordArtHost = undefined;
    this.restorePreview();
    this.releaseRetainedObjectChrome();
    this.close$.next();
    this.overlayRef?.dispose();
    const ownerWindow = this.doc.root.hostElement.ownerDocument.defaultView;
    if (this.toolbarPositionFrame !== null) {
      ownerWindow?.cancelAnimationFrame(this.toolbarPositionFrame);
      this.toolbarPositionFrame = null;
    }
    this.overlayRef = undefined;
    this.component = undefined;
    this.activeIds = [];
    this.toolbarPointerActive = false;
    this.toolbarFocusActive = false;
    this.toolbarPointerGraceUntil = 0;
    this.textBoxResizerGesture = undefined;
  };

  private sync(selection: BlockCraft.Selection | null): void {
    if (this.doc.isReadonly) {
      this.close();
      return;
    }
    if (!selection) {
      if (this.ownsInteraction()) {
        this.retainObjectChrome();
        this.scheduleRetainObjectChrome();
        return;
      }
      this.close();
      return;
    }
    if (!isSelectionAlive(selection as never, this.doc)) {
      this.close();
      return;
    }
    const state = this.doc.objectFormat.readSelection();
    if (!state) {
      const groupIds =
        this.doc.placement.getAbsoluteObjectSelectionIds(selection);
      if (
        groupIds?.length === 1 &&
        this.doc.placement.isObjectGroup(groupIds[0]!)
      ) {
        this.open(layoutOnlyState(groupIds), true);
        if (this.component) this.component.activePanel = "layout";
        return;
      }
      if (this.ownsInteraction()) {
        this.retainObjectChrome();
        this.scheduleRetainObjectChrome();
        return;
      }
      this.close();
      return;
    }
    this.open(state, false);
  }

  private open(
    state: BlockObjectFormatSelectionState,
    groupSelection: boolean,
  ): void {
    const key = state.blockIds.join("\u0000");
    if (
      this.overlayRef &&
      this.activeIds.join("\u0000") === key &&
      this.component?.groupSelection === groupSelection
    ) {
      this.componentState(state);
      return;
    }
    this.close();
    const anchor = state.blockIds
      .map((id) => this.doc.vm.get(id)?.instance)
      .find((block) => block?.hostElement.isConnected);
    if (!anchor) return;
    if (anchor.flavour === "word-art") {
      anchor.hostElement.classList.add("word-art-block--object-selected");
      this.activeWordArtHost = anchor.hostElement;
    }
    const surface =
      anchor.hostElement.querySelector<HTMLElement>(
        "[data-bc-object-surface]",
      ) ?? anchor.hostElement;
    const toolbar =
      this.doc.overlayService.createConnectedOverlay<ObjectFormatToolbarComponent>(
        {
          target: surface,
          component: ObjectFormatToolbarComponent,
          positions: [
            getPositionWithOffset("right-center", TOOLBAR_GAP, 0),
            getPositionWithOffset("left-center", TOOLBAR_GAP, 0),
            getPositionWithOffset("right-top", TOOLBAR_GAP, 0),
            getPositionWithOffset("left-top", TOOLBAR_GAP, 0),
          ],
          clampTo: this.doc.scrollContainer ?? undefined,
        },
        this.close$,
        this.close,
      );
    this.overlayRef = toolbar.overlayRef;
    this.component = toolbar.componentRef.instance;
    this.activeIds = [...state.blockIds];
    toolbar.componentRef.setInput("state", state);
    toolbar.componentRef.setInput(
      "activeLayout",
      this.resolveCommonObjectLayout(state.blockIds),
    );
    toolbar.componentRef.setInput("groupSelection", groupSelection);
    toolbar.componentRef.instance.action
      .pipe(takeUntil(this.close$))
      .subscribe((action) => void this.handleAction(action));
    toolbar.componentRef.instance.panelChange
      .pipe(takeUntil(this.close$))
      .subscribe(() => this.scheduleToolbarPositionUpdate());
    const strategy = toolbar.overlayRef.getConfig().positionStrategy;
    if (strategy instanceof FlexibleConnectedPositionStrategy) {
      strategy.positionChanges
        .pipe(takeUntil(this.close$))
        .subscribe((change) => {
          const side =
            change.connectionPair.originX === "start" ? "left" : "right";
          toolbar.componentRef.setInput("side", side);
        });
    }
    this.watchProps(state.blockIds);
  }

  private watchProps(blockIds: readonly string[]): void {
    for (const id of blockIds) {
      const block = this.doc.vm.get(id)?.instance;
      const propsChange$ = block?.onPropsChange as
        | Observable<unknown>
        | undefined;
      propsChange$?.pipe(takeUntil(this.close$)).subscribe(() => {
        const next = this.doc.objectFormat.readSelection(this.activeIds);
        if (!next) return this.close();
        this.componentState(next);
      });
    }
  }

  private componentState(state: BlockObjectFormatSelectionState): void {
    if (!this.component) return;
    this.component.state = state;
    this.component.activeLayout = this.resolveCommonObjectLayout(
      state.blockIds,
    );
    this.component.cdr.markForCheck();
    this.component.reapplyEffectDraftPreview();
    this.overlayRef?.updatePosition();
  }

  private async handleAction(action: ObjectFormatToolbarAction): Promise<void> {
    if (action.name === "preview") {
      this.schedulePreview(action.patch);
      return;
    }
    if (action.name === "patch") {
      this.restorePreview();
      this.applyPatch(action.patch);
      return;
    }
    if (action.name === "restore-preview") {
      this.restorePreview();
      return;
    }
    if (action.name === "upload-picture") {
      await this.uploadPicture(action.target);
      return;
    }
    if (action.name === "layout") {
      this.handleLayout(action.value);
      return;
    }
    this.deleteTargets();
  }

  private applyPatch(patch: ObjectFormatPatch): void {
    const allowDetachedSelection =
      this.doc.objectFormat.getSelectionIds() === null &&
      this.ownsInteraction();
    const result = this.doc.objectFormat.updateSelection(
      this.activeIds,
      patch,
      { allowDetachedSelection },
    );
    if (
      result.reason === "selection-changed" ||
      result.reason === "target-missing"
    ) {
      this.close();
      return;
    }
    if (result.skippedReadonlyIds.length) {
      this.doc.messageService.warn(
        `${result.skippedReadonlyIds.length} 个锁定对象未修改`,
      );
    }
    const next = this.doc.objectFormat.readSelection(this.activeIds);
    if (next) this.componentState(next);
  }

  private schedulePreview(patch: ObjectFormatPatch): void {
    this.pendingPreview = patch;
    if (this.previewFrame !== null) return;
    const ownerWindow = this.doc.root.hostElement.ownerDocument.defaultView;
    if (!ownerWindow) return;
    this.previewFrame = ownerWindow.requestAnimationFrame(() => {
      this.previewFrame = null;
      const pending = this.pendingPreview;
      this.pendingPreview = undefined;
      if (pending) this.renderPreview(pending);
    });
  }

  private restorePreview(): void {
    const ownerWindow = this.doc.root.hostElement.ownerDocument.defaultView;
    if (this.previewFrame !== null)
      ownerWindow?.cancelAnimationFrame(this.previewFrame);
    this.previewFrame = null;
    this.pendingPreview = undefined;
    const state = this.activeIds.length
      ? this.doc.objectFormat.readSelection(this.activeIds)
      : null;
    if (!state) return;
    for (const target of state.targets) {
      this.renderPreviewForTarget(
        target.blockId,
        {
          shapeFill: target.format.shapeFill,
          shapeOutline: target.format.shapeOutline,
          shapeEffects: target.format.shapeEffects,
          textStyle: target.format.textStyle,
        },
        false,
      );
    }
  }

  private renderPreview(patch: ObjectFormatPatch): void {
    for (const id of this.activeIds)
      this.renderPreviewForTarget(id, patch, true);
  }

  private renderPreviewForTarget(
    id: string,
    patch: ObjectFormatPatch,
    transient: boolean,
  ): void {
    const host = this.doc.vm.get(id)?.instance?.hostElement;
    if (!host?.isConnected) return;
    if (patch.shapeFill) {
      const fill = patch.shapeFill;
      host
        .querySelectorAll<SVGPathElement>("[data-bc-shape-render-path]")
        .forEach((path) =>
          path.setAttribute(
            "fill-opacity",
            `${fill.type === "none" ? 0 : fill.opacity}`,
          ),
        );
      if (fill.type === "picture") {
        host
          .querySelectorAll<SVGImageElement>("pattern image")
          .forEach((image) =>
            image.setAttribute(
              "preserveAspectRatio",
              objectPicturePreserveAspectRatio(fill),
            ),
          );
      }
    }
    if (patch.shapeOutline) {
      host
        .querySelectorAll<SVGPathElement>("[data-bc-shape-render-path]")
        .forEach((path) =>
          path.setAttribute("stroke-opacity", `${patch.shapeOutline!.opacity}`),
        );
    }
    if (patch.shapeEffects) {
      const filter = objectEffectsFilter(patch.shapeEffects);
      host
        .querySelectorAll<SVGPathElement>("[data-bc-shape-render-path]")
        .forEach((path) => {
          path.style.filter = filter;
        });
    }
    if (patch.textStyle) {
      const fill = patch.textStyle.fill;
      host
        .querySelectorAll<HTMLElement>(
          ".shape-block__text-frame, .text-box-block__content, .word-art-block__editor",
        )
        .forEach((text) => {
          text.style.backgroundPosition =
            fill.type === "picture"
              ? `${fill.positionX}% ${fill.positionY}%`
              : "";
          text.style.opacity = transient
            ? `${fill.type === "none" ? 0 : fill.opacity}`
            : fill.type === "picture"
              ? `${fill.opacity}`
              : "";
        });
    }
  }

  private async uploadPicture(target: "shape" | "text"): Promise<void> {
    const service = this.doc.injector.get<DocFileService | null>(
      DOC_FILE_SERVICE_TOKEN,
      null,
    );
    if (!service) {
      this.doc.messageService.warn("当前宿主未配置图片上传服务");
      return;
    }
    try {
      const files = await service.inputFiles("image/*");
      const file = files.item(0);
      if (!file) return;
      if (service.isOverMaxSize(file.size)) {
        this.doc.messageService.warn("图片大小超过上传限制");
        return;
      }
      const url = await service.uploadImg(file);
      const state = this.doc.objectFormat.readSelection(this.activeIds);
      if (target === "shape") {
        const fill = state?.targets[0]?.format.shapeFill;
        if (fill) {
          const picture =
            fill.type === "picture" ? fill : createObjectPaint("picture");
          this.applyPatch({
            shapeFill: { ...picture, src: url },
          });
        }
      } else {
        const style = state?.targets[0]?.format.textStyle;
        if (style) {
          const picture =
            style.fill.type === "picture"
              ? style.fill
              : createObjectPaint("picture");
          this.applyPatch({
            textStyle: {
              ...style,
              fill: { ...picture, src: url },
            },
          });
        }
      }
    } catch {
      this.doc.messageService.warn("图片上传失败");
    }
  }

  private handleLayout(value: string): void {
    const ids = [...this.activeIds];
    const first = ids[0];
    if (!first) return;
    if (value === "group") {
      const groupId = this.doc.placement.group(ids);
      if (groupId)
        queueMicrotask(() => this.doc.selection.selectBlock(groupId));
      return;
    }
    if (value === "ungroup") {
      const children = this.doc.placement.ungroup(first);
      if (children.length) this.close();
      return;
    }
    const alignment = ALIGNMENTS[value];
    if (alignment) {
      this.doc.placement.alignObjects(ids, alignment);
      return;
    }
    const planeAlignment = PLANE_ALIGNMENTS[value];
    if (planeAlignment) {
      this.doc.placement.alignObjectsToPlane(ids, planeAlignment);
      return;
    }
    if (value === "forward" || value === "backward") {
      for (const id of ids) {
        value === "forward"
          ? this.doc.placement.moveForward(id)
          : this.doc.placement.moveBackward(id);
      }
      return;
    }
    const layout =
      value === "wrap" ? "inline" : value === "relative" ? "top-bottom" : value;
    if (
      layout === "inline" ||
      layout === "top-bottom" ||
      layout === "under" ||
      layout === "over"
    ) {
      for (const id of ids) this.doc.placement.setObjectLayout(id, layout);
    }
  }

  private deleteTargets(): void {
    const targets = [...this.activeIds];
    this.close();
    for (const id of targets) {
      const block = this.doc.vm.get(id)?.instance;
      if (!block || this.doc.readonlyManager.isReadonly(id)) continue;
      if (!deleteAbsolutePlacementObject(this.doc, block, "menu")) {
        void this.doc.chain().deleteById(id).run();
      }
    }
  }

  private ownsInteraction(): boolean {
    if (this.toolbarPointerActive) return true;
    if (this.toolbarFocusActive) return true;
    if (Date.now() < this.toolbarPointerGraceUntil) return true;
    const overlay = this.overlayRef?.overlayElement;
    if (!overlay) return false;
    if (hasOpenOwnedSubOverlay(overlay)) return true;
    const active = overlay.ownerDocument.activeElement;
    return (
      active instanceof Element && isObjectToolbarOwnedTarget(overlay, active)
    );
  }

  private handleFocusIn(event: FocusEvent): void {
    if (!this.overlayRef) return;
    const target = this.resolveElement(event.target);
    if (isObjectToolbarOwnedTarget(this.overlayRef.overlayElement, target)) {
      this.toolbarFocusActive = true;
      this.retainObjectChrome();
      this.scheduleRetainObjectChrome();
      return;
    }
    this.toolbarFocusActive = false;
    if (
      target &&
      this.activeIds.some((id) =>
        this.doc.vm.get(id)?.instance?.hostElement.contains(target),
      )
    )
      return;
    if (
      target === this.doc.root.hostElement &&
      sameIds(this.doc.objectFormat.getSelectionIds(), this.activeIds)
    )
      return;
    this.close();
  }

  private scheduleToolbarPositionUpdate(): void {
    const ownerWindow = this.doc.root.hostElement.ownerDocument.defaultView;
    if (!ownerWindow) return;
    if (this.toolbarPositionFrame !== null) {
      ownerWindow.cancelAnimationFrame(this.toolbarPositionFrame);
    }
    this.toolbarPositionFrame = ownerWindow.requestAnimationFrame(() => {
      this.toolbarPositionFrame = null;
      this.overlayRef?.updatePosition();
    });
  }

  private retainObjectChrome(): void {
    for (const id of this.activeIds) {
      const host = this.doc.vm.get(id)?.instance?.hostElement;
      if (!host?.isConnected) continue;
      this.retainedObjectChrome.set(id, host);
      host.classList.add("selected");
    }
  }

  private scheduleRetainObjectChrome(): void {
    const epoch = ++this.chromeRetentionEpoch;
    Promise.resolve().then(() => {
      if (
        epoch !== this.chromeRetentionEpoch ||
        !this.overlayRef ||
        !this.ownsInteraction()
      )
        return;
      this.retainObjectChrome();
    });
  }

  private resolveCommonObjectLayout(
    blockIds: readonly string[],
  ): BlockObjectLayout | null {
    const layouts = blockIds.map((id) =>
      this.doc.placement.getObjectLayout(id),
    );
    const first = layouts[0];
    return first && layouts.every((layout) => layout === first) ? first : null;
  }

  private releaseRetainedObjectChrome(): void {
    const currentIds = new Set(this.doc.objectFormat.getSelectionIds() ?? []);
    for (const [id, host] of this.retainedObjectChrome) {
      if (!currentIds.has(id)) host.classList.remove("selected");
    }
    this.retainedObjectChrome.clear();
  }

  private resolveElement(target: EventTarget | null): Element | null {
    if (target instanceof Element) return target;
    return target instanceof Node ? target.parentElement : null;
  }

  /** Shift-click extends a stable boundary selection inside one object plane. */
  private extendAbsoluteSelection(event: PointerEvent): boolean {
    if (!event.shiftKey || event.button !== 0 || this.doc.isReadonly)
      return false;
    const target = event.target;
    if (
      !(target instanceof Element) ||
      !this.doc.root.hostElement.contains(target)
    )
      return false;
    const targetId = this.resolveTopLevelObjectId(target);
    if (!targetId || !this.doc.objectFormat.getCapabilityForBlock(targetId))
      return false;
    const parentId = this.doc.model.getParentId(targetId);
    if (!parentId || !this.doc.placement.isPlacementLayout(parentId))
      return false;
    const siblings = this.doc.model.getChildrenIds(parentId);
    const targetIndex = siblings.indexOf(targetId);
    if (targetIndex < 0) return false;
    const selection = this.doc.selection.value;
    let anchorIndex = -1;
    if (
      selection?.anchor.type === "boundary" &&
      selection.head.type === "boundary" &&
      selection.anchor.blockId === parentId &&
      selection.head.blockId === parentId
    ) {
      anchorIndex = Math.min(selection.anchor.index, selection.head.index);
    } else if (selection) {
      let id: string | null = selection.anchor.blockId;
      while (id && this.doc.model.getParentId(id) !== parentId) {
        id = this.doc.model.getParentId(id);
      }
      if (id) anchorIndex = siblings.indexOf(id);
    }
    if (anchorIndex < 0 || anchorIndex === targetIndex) return false;
    const from = Math.min(anchorIndex, targetIndex);
    const to = Math.max(anchorIndex, targetIndex) + 1;
    const ids = siblings.slice(from, to);
    if (ids.some((id) => !this.doc.objectFormat.getCapabilityForBlock(id)))
      return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.doc.selection.replay({
      anchor: { blockId: parentId, type: "boundary", index: from },
      head: { blockId: parentId, type: "boundary", index: to },
      commonParent: parentId,
    });
    return true;
  }

  private resolveTopLevelObjectId(target: Element): string | null {
    const closest = target.closest<HTMLElement>("[data-block-id]");
    let id = closest ? closetBlockId(closest) : null;
    while (id) {
      const parentId = this.doc.model.getParentId(id);
      if (!parentId) return null;
      if (this.doc.placement.isPlacementLayout(parentId)) return id;
      id = parentId;
    }
    return null;
  }

  /** Preserve the three blocks' established object/edit interaction contract. */
  private handleExistingObjectPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      !(target instanceof Element) ||
      !this.doc.root.hostElement.contains(target)
    ) {
      return;
    }

    const shapeShell = target.closest<HTMLElement>(".shape-block__shell");
    if (shapeShell) {
      if (
        target.closest(
          "shape-resizer, shape-geometry-editor, shape-adjustment-editor, .shape-text-block",
        )
      )
        return;
      const block = this.resolveBlockFromSurface(shapeShell, "shape");
      if (!block) return;
      this.doc.selection.selectBlock(block);
      this.confirmShapeClickSelection(event, block);
      if (this.doc.readonlyManager.isReadonly(block)) return;
      if (this.doc.placement.getState(block).mode === "absolute") {
        this.doc.placement.startDrag(event, block);
      } else if (this.doc.dragController.state === "idle") {
        this.doc.dragController.startDrag(
          event,
          { kind: "origin-block", blockId: block.id },
          {
            ghostLabel: getShapeDefinition(
              (block as BlockCraft.IBlockComponents["shape"]).shapeProps
                .shapeType,
            ).label,
          },
        );
      }
      return;
    }

    const textBoxSurface = target.closest<HTMLElement>(
      ".text-box-block__surface",
    );
    if (textBoxSurface) {
      const block = this.resolveBlockFromSurface(textBoxSurface, "text-box");
      if (!block) return;
      const resizer = target.closest("shape-resizer");
      const moveEdge = target.closest(".shape-resizer__move-edge");
      const objectHandle = target.closest(".text-box-block__object-handle");
      if (resizer && !moveEdge) {
        this.textBoxResizerGesture = {
          blockId: block.id,
          pointerId: event.pointerId,
        };
        this.queueObjectSelection(block.id);
        return;
      }
      // The selectable-frame Schema contract continues to own ordinary frame
      // clicks; the toolbar only claims the established move handles.
      if (!moveEdge && !objectHandle) return;
      event.preventDefault();
      event.stopPropagation();
      this.doc.selection.selectBlock(block);
      if (!this.doc.readonlyManager.isReadonly(block)) {
        this.startObjectDrag(event, block, "文本框");
      }
      return;
    }

    const wordArtSurface = target.closest<HTMLElement>(
      ".word-art-block__surface",
    );
    if (!wordArtSurface) return;
    const block = this.resolveBlockFromSurface(wordArtSurface, "word-art") as
      | BlockCraft.IBlockComponents["word-art"]
      | null;
    if (!block) return;
    const moveEdge = target.closest(".shape-resizer__move-edge");
    const objectHandle = target.closest(".word-art-block__object-handle");
    if (target.closest("shape-resizer") && !moveEdge) return;
    if (moveEdge || objectHandle) {
      event.preventDefault();
      event.stopPropagation();
      this.doc.selection.selectBlock(block);
      if (!this.doc.readonlyManager.isReadonly(block)) {
        this.startObjectDrag(event, block, "艺术字");
      }
      return;
    }
    if (this.doc.readonlyManager.isReadonly(block)) {
      event.preventDefault();
      event.stopPropagation();
      this.doc.selection.selectBlock(block);
      return;
    }
    if (this.overlayRef) this.close();
    const editorTarget = Boolean(target.closest(".word-art-block__editor"));
    if (editorTarget && this.isEditingWordArt(block.id)) return;
    if (!editorTarget) {
      event.preventDefault();
      event.stopPropagation();
    }
    block.enterEditing();
  }

  private resolveBlockFromSurface(
    surface: Element,
    flavour: "shape" | "text-box" | "word-art",
  ): BlockCraft.BlockComponent | null {
    const blockId = closetBlockId(surface);
    if (!blockId) return null;
    try {
      const block = this.doc.getBlockById(blockId);
      return block.flavour === flavour && block.hostElement.isConnected
        ? block
        : null;
    } catch {
      return null;
    }
  }

  private startObjectDrag(
    event: PointerEvent,
    block: BlockCraft.BlockComponent,
    ghostLabel: string,
  ): void {
    if (this.doc.placement.getState(block).mode === "absolute") {
      this.doc.placement.startDrag(event, block);
      return;
    }
    if (this.doc.dragController.state !== "idle") return;
    this.doc.dragController.startDrag(
      event,
      { kind: "origin-block", blockId: block.id },
      { ghostLabel },
    );
  }

  private finishTextBoxResizerGesture(pointerId: number): void {
    const gesture = this.textBoxResizerGesture;
    if (!gesture || gesture.pointerId !== pointerId) return;
    this.textBoxResizerGesture = undefined;
    this.queueObjectSelection(gesture.blockId);
  }

  private queueObjectSelection(blockId: string): void {
    queueMicrotask(() => {
      if (this.subscription.closed) return;
      const block = this.doc.vm.get(blockId)?.instance;
      if (block?.hostElement.isConnected) this.doc.selection.selectBlock(block);
    });
  }

  private isEditingWordArt(blockId: string): boolean {
    const selection = this.doc.selection.value;
    return Boolean(
      selection?.isInSameBlock &&
      selection.firstBlock.id === blockId &&
      selection.anchor.type === "text" &&
      selection.head.type === "text",
    );
  }

  private confirmShapeClickSelection(
    startEvent: PointerEvent,
    block: BlockCraft.BlockComponent,
  ): void {
    this.pendingShapeClickCleanup?.();
    let didDrag =
      this.doc.dragController.isDragging || this.doc.placement.isDragging;
    const stateSub = merge(
      this.doc.dragController.state$,
      this.doc.placement.state$,
    )
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe((state) => {
        if (state === "dragging" || state === "dropping") didDrag = true;
      });
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", onPointerCancel, true);
      stateSub.unsubscribe();
      if (this.pendingShapeClickCleanup === cleanup) {
        this.pendingShapeClickCleanup = undefined;
      }
    };
    const onPointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== startEvent.pointerId) return;
      const shouldConfirm = !didDrag;
      cleanup();
      if (!shouldConfirm || !block.hostElement.isConnected) return;
      this.doc.selection.selectBlock(block);
    };
    const onPointerCancel = () => cleanup();
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("blur", onPointerCancel, true);
    this.pendingShapeClickCleanup = cleanup;
  }

  @BindHotKey({ key: "Escape" }, { flavour: "shape-text" })
  onShapeTextEscape(ctx: UIEventStateContext): true | void {
    const selection = ctx.get("keyboardState").selection;
    if (!selection.isInSameBlock) return;
    const parentId = this.doc.model.getParentId(selection.anchor.blockId);
    if (!parentId || this.doc.model.getFlavour(parentId) !== "shape") return;
    ctx.preventDefault();
    this.doc.selection.selectBlock(parentId);
    return true;
  }
}

const ALIGNMENTS: Readonly<Record<string, BlockObjectAlignment>> = {
  "align-left": "left",
  "align-center": "horizontal-center",
  "align-right": "right",
  "align-top": "top",
  "align-middle": "vertical-center",
  "align-bottom": "bottom",
  "distribute-x": "horizontal-distribute",
  "distribute-y": "vertical-distribute",
};
const PLANE_ALIGNMENTS: Readonly<Record<string, BlockObjectPlaneAlignment>> = {
  "page-left": "left",
  "page-center": "horizontal-center",
  "page-right": "right",
};

function sameIds(
  actual: readonly string[] | null,
  expected: readonly string[],
): boolean {
  return (
    actual?.length === expected.length &&
    actual.every((id, index) => id === expected[index])
  );
}

function layoutOnlyState(
  blockIds: readonly string[],
): BlockObjectFormatSelectionState {
  const empty = { mixed: false, value: undefined };
  return {
    blockIds,
    targets: [],
    features: {
      geometry: false,
      shape: false,
      pictureFill: false,
      lineArrows: false,
      textFrame: false,
      textStyle: false,
    },
    shapeTypes: [],
    values: {
      width: empty,
      height: empty,
      rotation: empty,
      lockAspectRatio: empty,
      shapeType: empty,
      shapeFill: empty,
      shapeOutline: empty,
      shapeEffects: empty,
      textFrame: empty,
      textStyle: empty,
    },
    readonlyCount: 0,
  };
}
