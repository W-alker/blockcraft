import { resolvePlacementContainerBox } from "../../../framework/services/block-placement/geometry";

const DRAG_THRESHOLD_PX = 4;
const MIN_OBJECT_WIDTH = 48;
const MIN_OBJECT_HEIGHT = 32;

export interface ObjectDrawInsertGeometry {
  anchorRect: DOMRect;
  width: number;
  height: number;
}

export interface ObjectDrawInsertRequest {
  defaultWidth: number;
  defaultHeight: number;
  commit: (geometry: ObjectDrawInsertGeometry) => void | Promise<void>;
}

interface DrawSurfaceBox {
  originX: number;
  originY: number;
  visualScale: number;
  /** scrollContainer 视口边界，换算为 placement 内容原点坐标。 */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * One-shot Word-like object drawing mode owned by the fixed toolbar.
 *
 * Arming is view-only. An object snapshot is committed only after the
 * primary pointer is released; Escape, blur, scrolling and pointercancel leave
 * the Yjs document untouched.
 */
export class ObjectDrawInsertController {
  private request: ObjectDrawInsertRequest | null = null;
  private root: HTMLElement | null = null;
  private surface: HTMLElement | null = null;
  private constraint: HTMLElement | null = null;
  private layer: HTMLDivElement | null = null;
  private preview: HTMLDivElement | null = null;
  private view: Window | null = null;
  private ownerDocument: Document | null = null;
  private pointerId: number | null = null;
  private startClientX = 0;
  private startClientY = 0;
  private startLocalX = 0;
  private startLocalY = 0;
  private startBox: DrawSurfaceBox | null = null;
  private pendingClientX = 0;
  private pendingClientY = 0;
  private previewFrame = 0;
  private layerOriginX = 0;
  private layerOriginY = 0;
  private destroyed = false;

  constructor(private readonly doc: BlockCraft.Doc) {}

  arm(request: ObjectDrawInsertRequest): boolean {
    if (this.destroyed) return false;
    this.cancel();

    const root = this.doc.root?.hostElement;
    const surface = this.doc.root?.childrenRenderRef?.containerElement ?? root;
    const constraint = this.doc.scrollContainer ?? root;
    if (
      this.doc.isReadonly ||
      !root?.isConnected ||
      !surface?.isConnected ||
      !constraint?.isConnected
    ) {
      return false;
    }

    const ownerDocument = root.ownerDocument;
    const view = ownerDocument.defaultView;
    if (!view || !ownerDocument.body) return false;

    const constraintRect = constraint.getBoundingClientRect();
    if (constraintRect.width <= 0 || constraintRect.height <= 0) return false;

    const layer = ownerDocument.createElement("div");
    layer.dataset["bcObjectDrawLayer"] = "true";
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("contenteditable", "false");
    Object.assign(layer.style, {
      position: "fixed",
      left: `${constraintRect.left}px`,
      top: `${constraintRect.top}px`,
      width: `${constraintRect.width}px`,
      height: `${constraintRect.height}px`,
      zIndex: "2147483645",
      cursor: "crosshair",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
      background: "transparent",
    });

    const preview = ownerDocument.createElement("div");
    preview.dataset["bcObjectDrawPreview"] = "true";
    Object.assign(preview.style, {
      position: "absolute",
      display: "none",
      boxSizing: "border-box",
      border: "1px dashed currentColor",
      background: "color-mix(in srgb, currentColor 12%, transparent)",
      pointerEvents: "none",
    });
    const rootStyle = view.getComputedStyle(root);
    layer.style.color =
      rootStyle.getPropertyValue("--bc-active-color").trim() || rootStyle.color;
    layer.appendChild(preview);
    ownerDocument.body.appendChild(layer);

    this.request = request;
    this.root = root;
    this.surface = surface;
    this.constraint = constraint;
    this.layer = layer;
    this.preview = preview;
    this.view = view;
    this.ownerDocument = ownerDocument;
    this.layerOriginX = constraintRect.left;
    this.layerOriginY = constraintRect.top;

    layer.addEventListener("pointerdown", this.onPointerDown, true);
    ownerDocument.addEventListener(
      "pointerdown",
      this.onOutsidePointerDown,
      true,
    );
    view.addEventListener("keydown", this.onKeyDown, true);
    view.addEventListener("blur", this.onCancelEvent, true);
    view.addEventListener("resize", this.onCancelEvent, true);
    view.addEventListener("scroll", this.onScroll, true);
    return true;
  }

  cancel(): void {
    this.clearPreviewFrame();
    const layer = this.layer;
    const ownerDocument = this.ownerDocument;
    const view = this.view;

    if (layer) {
      layer.removeEventListener("pointerdown", this.onPointerDown, true);
      if (this.pointerId !== null && layer.hasPointerCapture(this.pointerId)) {
        layer.releasePointerCapture(this.pointerId);
      }
      layer.remove();
    }
    ownerDocument?.removeEventListener(
      "pointerdown",
      this.onOutsidePointerDown,
      true,
    );
    view?.removeEventListener("keydown", this.onKeyDown, true);
    view?.removeEventListener("blur", this.onCancelEvent, true);
    view?.removeEventListener("resize", this.onCancelEvent, true);
    view?.removeEventListener("scroll", this.onScroll, true);
    view?.removeEventListener("pointermove", this.onPointerMove, true);
    view?.removeEventListener("pointerup", this.onPointerUp, true);
    view?.removeEventListener("pointercancel", this.onPointerCancel, true);

    this.request = null;
    this.root = null;
    this.surface = null;
    this.constraint = null;
    this.layer = null;
    this.preview = null;
    this.view = null;
    this.ownerDocument = null;
    this.pointerId = null;
    this.startBox = null;
    this.layerOriginX = 0;
    this.layerOriginY = 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancel();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (
      this.pointerId !== null ||
      event.button !== 0 ||
      event.isPrimary === false
    ) {
      return;
    }
    const box = this.measureSurface();
    if (!box || !this.layer) {
      this.cancel();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.pointerId = event.pointerId;
    this.startClientX = event.clientX;
    this.startClientY = event.clientY;
    this.startLocalX = this.clientToLocalX(event.clientX, box);
    this.startLocalY = this.clientToLocalY(event.clientY, box);
    this.pendingClientX = event.clientX;
    this.pendingClientY = event.clientY;
    this.startBox = box;
    try {
      this.layer.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser tests and older WebViews may not expose capture for
      // a dispatched pointer. Window-level cancellation still keeps this
      // one-shot gesture safe.
    }
    this.view?.addEventListener("pointermove", this.onPointerMove, true);
    this.view?.addEventListener("pointerup", this.onPointerUp, true);
    this.view?.addEventListener("pointercancel", this.onPointerCancel, true);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.startBox) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pendingClientX = event.clientX;
    this.pendingClientY = event.clientY;
    if (this.previewFrame || !this.view) return;
    this.previewFrame = this.view.requestAnimationFrame(() => {
      this.previewFrame = 0;
      this.paintPreview();
    });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const request = this.request;
    const box = this.measureSurface();
    const dragged =
      Math.hypot(
        event.clientX - this.startClientX,
        event.clientY - this.startClientY,
      ) >= DRAG_THRESHOLD_PX;
    const geometry =
      request && box
        ? this.resolveGeometry(event.clientX, event.clientY, box, dragged)
        : null;

    this.cancel();
    if (!request || !geometry) return;
    try {
      void Promise.resolve(request.commit(geometry)).catch((error) => {
        this.doc.logger?.warn?.("objectDrawInsertCommitError: ", error);
      });
    } catch (error) {
      this.doc.logger?.warn?.("objectDrawInsertCommitError: ", error);
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  };

  private readonly onOutsidePointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && this.layer?.contains(target)) return;
    this.cancel();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  };

  private readonly onCancelEvent = (): void => {
    this.cancel();
  };

  private readonly onScroll = (event: Event): void => {
    const target = event.target;
    if (
      target === this.view ||
      target === this.ownerDocument ||
      this.isDrawingSurfaceScrollTarget(target)
    ) {
      this.cancel();
    }
  };

  /**
   * Window capture receives scroll events from every scrollable overlay too.
   * Only scrolling that can move the editor surface invalidates the geometry;
   * dropdown/tooltip scrolling must not immediately disarm a freshly picked
   * drawing tool.
   */
  private isDrawingSurfaceScrollTarget(target: EventTarget | null): boolean {
    if (
      !(target instanceof Node) ||
      !this.root ||
      !this.surface ||
      !this.constraint
    )
      return false;
    return (
      target === this.root ||
      target === this.surface ||
      target === this.constraint ||
      target.contains(this.root) ||
      target.contains(this.surface) ||
      target.contains(this.constraint) ||
      this.root.contains(target) ||
      this.surface.contains(target) ||
      this.constraint.contains(target)
    );
  }

  private paintPreview(): void {
    if (!this.preview || !this.layer || !this.startBox) return;
    const dragged =
      Math.hypot(
        this.pendingClientX - this.startClientX,
        this.pendingClientY - this.startClientY,
      ) >= DRAG_THRESHOLD_PX;
    if (!dragged) {
      this.preview.style.display = "none";
      return;
    }
    const geometry = this.resolveGeometry(
      this.pendingClientX,
      this.pendingClientY,
      this.startBox,
      true,
    );
    this.preview.style.display = "block";
    this.preview.style.left = `${geometry.anchorRect.left - this.layerOriginX}px`;
    this.preview.style.top = `${geometry.anchorRect.top - this.layerOriginY}px`;
    this.preview.style.width = `${geometry.anchorRect.width}px`;
    this.preview.style.height = `${geometry.anchorRect.height}px`;
  }

  private resolveGeometry(
    clientX: number,
    clientY: number,
    box: DrawSurfaceBox,
    dragged: boolean,
  ): ObjectDrawInsertGeometry {
    const request = this.request!;
    const endX = this.clientToLocalX(clientX, box);
    const endY = this.clientToLocalY(clientY, box);
    let width: number;
    let height: number;
    let left: number;
    let top: number;

    const planeWidth = Math.max(MIN_OBJECT_WIDTH, box.maxX - box.minX);
    const planeHeight = Math.max(MIN_OBJECT_HEIGHT, box.maxY - box.minY);

    if (dragged) {
      width = Math.min(
        planeWidth,
        Math.max(MIN_OBJECT_WIDTH, Math.abs(endX - this.startLocalX)),
      );
      height = Math.min(
        planeHeight,
        Math.max(MIN_OBJECT_HEIGHT, Math.abs(endY - this.startLocalY)),
      );
      left =
        endX < this.startLocalX ? this.startLocalX - width : this.startLocalX;
      top =
        endY < this.startLocalY ? this.startLocalY - height : this.startLocalY;
    } else {
      width = Math.min(
        planeWidth,
        Math.max(MIN_OBJECT_WIDTH, request.defaultWidth),
      );
      height = Math.min(
        planeHeight,
        Math.max(MIN_OBJECT_HEIGHT, request.defaultHeight),
      );
      left = this.startLocalX;
      top = this.startLocalY;
    }

    width = Math.round(width);
    height = Math.round(height);
    left = Math.min(
      Math.max(box.minX, box.maxX - width),
      Math.max(box.minX, left),
    );
    top = Math.min(
      Math.max(box.minY, box.maxY - height),
      Math.max(box.minY, top),
    );

    return {
      anchorRect: new DOMRect(
        box.originX + left * box.visualScale,
        box.originY + top * box.visualScale,
        width * box.visualScale,
        height * box.visualScale,
      ),
      width,
      height,
    };
  }

  private measureSurface(): DrawSurfaceBox | null {
    if (!this.surface || !this.constraint) return null;
    const placement = resolvePlacementContainerBox(this.surface);
    const constraintRect = this.constraint.getBoundingClientRect();
    const minX =
      (constraintRect.left - placement.originX) / placement.visualScale;
    const maxX =
      (constraintRect.right - placement.originX) / placement.visualScale;
    const minY =
      (constraintRect.top - placement.originY) / placement.visualScale;
    const maxY =
      (constraintRect.bottom - placement.originY) / placement.visualScale;
    return {
      originX: placement.originX,
      originY: placement.originY,
      visualScale: placement.visualScale,
      minX,
      maxX: Math.max(minX, maxX),
      minY,
      maxY: Math.max(minY, maxY),
    };
  }

  private clientToLocalX(clientX: number, box: DrawSurfaceBox): number {
    return Math.min(
      box.maxX,
      Math.max(box.minX, (clientX - box.originX) / box.visualScale),
    );
  }

  private clientToLocalY(clientY: number, box: DrawSurfaceBox): number {
    return Math.min(
      box.maxY,
      Math.max(box.minY, (clientY - box.originY) / box.visualScale),
    );
  }

  private clearPreviewFrame(): void {
    if (this.previewFrame && this.view) {
      this.view.cancelAnimationFrame(this.previewFrame);
    }
    this.previewFrame = 0;
  }
}
