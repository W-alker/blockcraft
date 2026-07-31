export const INLINE_IMAGE_RESIZE_PROXY_ATTRIBUTE =
  'data-bc-inline-image-resize-proxy';
export const INLINE_IMAGE_RESIZE_LABEL_ATTRIBUTE =
  'data-bc-inline-image-resize-label';

export type InlineImageResizeSide = 'left' | 'right';

export interface InlineImageResizePreviewInput {
  side: InlineImageResizeSide;
  pointerX: number;
  startPointerX: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  boundsLeft: number;
  boundsRight: number;
  minWidth?: number;
  aspectRatio?: number;
}

export interface InlineImageResizePreview {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InlineImageResizeCommit extends InlineImageResizePreview {}

export interface InlineImageResizeSessionOptions {
  event: PointerEvent;
  side: InlineImageResizeSide;
  frame: HTMLElement;
  bounds: HTMLElement;
  minWidth?: number;
  aspectRatio?: number;
  acquireLayoutFreeze: () => () => void;
  acquireViewLease: () => () => void;
  onCommit: (result: InlineImageResizeCommit) => void;
  onFinish?: () => void;
  onError?: (error: unknown) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

const positive = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback;

export function resolveInlineImageResizePreview(
  input: InlineImageResizePreviewInput,
): InlineImageResizePreview {
  const startWidth = positive(input.startWidth, 1);
  const startHeight = positive(input.startHeight, startWidth);
  const aspectRatio = positive(
    input.aspectRatio,
    startWidth / startHeight,
  );
  const directionalMax = input.side === 'right'
    ? input.boundsRight - input.startLeft
    : input.startLeft + startWidth - input.boundsLeft;
  const maxWidth = Math.max(1, directionalMax);
  const minWidth = Math.min(
    maxWidth,
    Math.max(1, positive(input.minWidth, 30)),
  );
  const delta = input.pointerX - input.startPointerX;
  const requestedWidth = startWidth + (input.side === 'left' ? -delta : delta);
  const width = clamp(requestedWidth, minWidth, maxWidth);

  return {
    left: input.side === 'left'
      ? input.startLeft + startWidth - width
      : input.startLeft,
    top: input.startTop,
    width,
    height: width / aspectRatio,
  };
}

/**
 * One pointer-owned inline-image resize gesture. It projects only an inert
 * body overlay and never mutates the committed frame or editor model.
 */
export class InlineImageResizeSession {
  private readonly _ownerWindow: Window;
  private readonly _ownerDocument: Document;
  private readonly _handle: HTMLElement;
  private readonly _frameRect: DOMRect;
  private readonly _boundsRect: DOMRect;
  private readonly _proxy: HTMLElement;
  private readonly _label: HTMLElement;
  private readonly _releaseLayoutFreeze: () => void;
  private readonly _releaseViewLease: () => void;
  private _pendingClientX: number;
  private _preview: InlineImageResizePreview;
  private _rafId?: number;
  private _active = true;

  constructor(private readonly _options: InlineImageResizeSessionOptions) {
    const handle = _options.event.currentTarget;
    if (!(handle instanceof HTMLElement)) {
      throw new Error('Inline image resize handle is unavailable');
    }
    const ownerDocument = _options.frame.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow || !_options.frame.isConnected || !_options.bounds.isConnected) {
      throw new Error('Inline image resize target is disconnected');
    }

    const frameRect = _options.frame.getBoundingClientRect();
    const boundsRect = _options.bounds.getBoundingClientRect();
    if (
      !Number.isFinite(frameRect.width) ||
      !Number.isFinite(frameRect.height) ||
      frameRect.width <= 0 ||
      frameRect.height <= 0 ||
      boundsRect.right <= boundsRect.left
    ) {
      throw new Error('Inline image resize geometry is invalid');
    }

    this._handle = handle;
    this._ownerDocument = ownerDocument;
    this._ownerWindow = ownerWindow;
    this._frameRect = frameRect;
    this._boundsRect = boundsRect;
    this._pendingClientX = _options.event.clientX;
    this._preview = this._resolve(_options.event.clientX);

    let releaseLayoutFreeze: () => void = () => undefined;
    let releaseViewLease: () => void = () => undefined;
    try {
      releaseLayoutFreeze = _options.acquireLayoutFreeze();
      releaseViewLease = _options.acquireViewLease();
      const {proxy, label} = this._createProxy();
      this._proxy = proxy;
      this._label = label;
      this._releaseLayoutFreeze = releaseLayoutFreeze;
      this._releaseViewLease = releaseViewLease;
    } catch (error) {
      try { releaseViewLease(); } catch {}
      try { releaseLayoutFreeze(); } catch {}
      throw error;
    }

    this._render(this._preview);
    this._ownerWindow.addEventListener('pointermove', this._onPointerMove, true);
    this._ownerWindow.addEventListener('pointerup', this._onPointerUp, true);
    this._ownerWindow.addEventListener('pointercancel', this._onPointerCancel, true);
    this._ownerWindow.addEventListener('keydown', this._onKeyDown, true);
    this._ownerWindow.addEventListener('blur', this._onWindowBlur);
    this._ownerDocument.addEventListener('selectstart', this._onSelectStart, true);
    try { this._handle.setPointerCapture(_options.event.pointerId); } catch {}
  }

  get active(): boolean {
    return this._active;
  }

  cancel(): void {
    this._finish(false);
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (!this._active || event.pointerId !== this._options.event.pointerId) return;
    event.preventDefault();
    this._pendingClientX = event.clientX;
    if (this._rafId !== undefined) return;
    this._rafId = this._ownerWindow.requestAnimationFrame(() => {
      this._rafId = undefined;
      if (!this._active) return;
      this._preview = this._resolve(this._pendingClientX);
      this._render(this._preview);
    });
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    if (!this._active || event.pointerId !== this._options.event.pointerId) return;
    event.preventDefault();
    this._pendingClientX = event.clientX;
    this._finish(true);
  };

  private readonly _onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this._options.event.pointerId) return;
    this._finish(false);
  };

  private readonly _onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this._active) return;
    event.preventDefault();
    this._finish(false);
  };

  private readonly _onWindowBlur = (): void => this._finish(false);
  private readonly _onSelectStart = (event: Event): void => event.preventDefault();

  private _resolve(pointerX: number): InlineImageResizePreview {
    return resolveInlineImageResizePreview({
      side: this._options.side,
      pointerX,
      startPointerX: this._options.event.clientX,
      startLeft: this._frameRect.left,
      startTop: this._frameRect.top,
      startWidth: this._frameRect.width,
      startHeight: this._frameRect.height,
      boundsLeft: this._boundsRect.left,
      boundsRight: this._boundsRect.right,
      minWidth: this._options.minWidth,
      aspectRatio: this._options.aspectRatio,
    });
  }

  private _finish(commit: boolean): void {
    if (!this._active) return;
    if (this._rafId !== undefined) {
      this._ownerWindow.cancelAnimationFrame(this._rafId);
      this._rafId = undefined;
    }
    if (commit) {
      this._preview = this._resolve(this._pendingClientX);
      this._render(this._preview);
    }
    const shouldCommit = commit &&
      Math.round(this._preview.width) !== Math.round(this._frameRect.width);
    const result: InlineImageResizeCommit = {
      left: this._preview.left,
      top: this._preview.top,
      width: Math.max(1, Math.round(this._preview.width)),
      height: Math.max(1, Math.round(this._preview.height)),
    };

    this._active = false;
    this._removeListeners();
    this._proxy.remove();
    try {
      if (this._handle.hasPointerCapture?.(this._options.event.pointerId)) {
        this._handle.releasePointerCapture(this._options.event.pointerId);
      }
    } catch {}

    let callbackError: unknown;
    try {
      if (shouldCommit) this._options.onCommit(result);
    } catch (error) {
      callbackError = error;
      this._options.onError?.(error);
    } finally {
      this._release(this._releaseViewLease);
      this._release(this._releaseLayoutFreeze);
      this._options.onFinish?.();
    }
    if (callbackError && !this._options.onError) throw callbackError;
  }

  private _removeListeners(): void {
    this._ownerWindow.removeEventListener('pointermove', this._onPointerMove, true);
    this._ownerWindow.removeEventListener('pointerup', this._onPointerUp, true);
    this._ownerWindow.removeEventListener('pointercancel', this._onPointerCancel, true);
    this._ownerWindow.removeEventListener('keydown', this._onKeyDown, true);
    this._ownerWindow.removeEventListener('blur', this._onWindowBlur);
    this._ownerDocument.removeEventListener('selectstart', this._onSelectStart, true);
  }

  private _release(release: () => void): void {
    try {
      release();
    } catch (error) {
      this._options.onError?.(error);
    }
  }

  private _createProxy(): {proxy: HTMLElement; label: HTMLElement} {
    const proxy = this._ownerDocument.createElement('div');
    proxy.setAttribute(INLINE_IMAGE_RESIZE_PROXY_ATTRIBUTE, '');
    proxy.setAttribute('aria-hidden', 'true');
    proxy.setAttribute('role', 'presentation');
    proxy.setAttribute('inert', '');
    proxy.style.position = 'fixed';
    proxy.style.boxSizing = 'border-box';
    proxy.style.zIndex = '2147483646';
    proxy.style.pointerEvents = 'none';
    proxy.style.userSelect = 'none';
    proxy.style.overflow = 'visible';
    proxy.style.border = '2px solid var(--bc-active-color, #4857e2)';
    proxy.style.borderRadius = '3px';
    proxy.style.willChange = 'left, width, height';
    const activeColor = this._ownerWindow.getComputedStyle(this._options.frame)
      .getPropertyValue('--bc-active-color')
      .trim();
    if (activeColor) proxy.style.setProperty('--bc-active-color', activeColor);

    for (const [horizontal, vertical] of [
      ['left', 'top'],
      ['right', 'top'],
      ['left', 'bottom'],
      ['right', 'bottom'],
    ] as const) {
      const corner = this._ownerDocument.createElement('span');
      corner.setAttribute('data-bc-inline-image-resize-corner', '');
      corner.style.position = 'absolute';
      corner.style[horizontal] = '-5px';
      corner.style[vertical] = '-5px';
      corner.style.width = '8px';
      corner.style.height = '8px';
      corner.style.boxSizing = 'border-box';
      corner.style.border = '2px solid var(--bc-active-color, #4857e2)';
      corner.style.borderRadius = '50%';
      corner.style.background = '#fff';
      proxy.appendChild(corner);
    }

    const label = this._ownerDocument.createElement('span');
    label.setAttribute(INLINE_IMAGE_RESIZE_LABEL_ATTRIBUTE, '');
    label.style.position = 'absolute';
    label.style.left = '50%';
    label.style.top = '100%';
    label.style.transform = 'translate(-50%, 6px)';
    label.style.padding = '3px 8px';
    label.style.borderRadius = '5px';
    label.style.background = 'rgba(31, 41, 55, 0.92)';
    label.style.color = '#fff';
    label.style.font = '600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace';
    label.style.whiteSpace = 'nowrap';
    label.style.boxShadow = '0 2px 7px rgba(0, 0, 0, 0.18)';
    proxy.appendChild(label);
    this._ownerDocument.body.appendChild(proxy);
    return {proxy, label};
  }

  private _render(preview: InlineImageResizePreview): void {
    this._proxy.style.left = `${preview.left}px`;
    this._proxy.style.top = `${preview.top}px`;
    this._proxy.style.width = `${preview.width}px`;
    this._proxy.style.height = `${preview.height}px`;
    this._label.textContent = `${Math.round(preview.width)} × ${Math.round(preview.height)}`;
    const labelFitsBelow =
      preview.top + preview.height + 32 <= this._ownerWindow.innerHeight;
    this._label.style.top = labelFitsBelow ? '100%' : 'auto';
    this._label.style.bottom = labelFitsBelow ? 'auto' : '6px';
    this._label.style.transform = labelFitsBelow
      ? 'translate(-50%, 6px)'
      : 'translateX(-50%)';
  }
}
