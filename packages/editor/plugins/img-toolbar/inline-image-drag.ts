import {
  closetBlockId,
  EditableBlockComponent,
  caretRangeFromPoint,
} from '../../framework';

export const INLINE_IMAGE_DRAG_PROXY_ATTRIBUTE =
  'data-bc-inline-image-drag-proxy';

export interface InlineImageDropTarget {
  block: EditableBlockComponent
  offset: number
}

const rectsOverlap = (a: DOMRect, b: DOMRect): boolean =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
  Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

export interface InlineImageDragProxyPosition {
  left: number
  top: number
}

export interface InlineImageDragProxyOptions {
  className?: string
  attribute?: string
  preserveTransform?: boolean
}

/**
 * A presentation-only copy of the committed image frame. It intentionally
 * lives outside contenteditable and never participates in inline layout.
 */
export class InlineImageDragProxy {
  readonly element: HTMLElement;

  private _left: number;
  private _top: number;
  private readonly _originLeft: number;
  private readonly _originTop: number;
  private _rafId?: number;
  private _destroyed = false;

  constructor(
    frame: HTMLElement,
    frameRect: DOMRect,
    private readonly _startClientX: number,
    private readonly _startClientY: number,
    options: InlineImageDragProxyOptions = {},
  ) {
    this._originLeft = frameRect.left;
    this._originTop = frameRect.top;
    this._left = frameRect.left;
    this._top = frameRect.top;

    const proxy = document.createElement('div');
    proxy.className = options.className ?? 'bc-inline-image-drag-proxy';
    proxy.setAttribute(
      options.attribute ?? INLINE_IMAGE_DRAG_PROXY_ATTRIBUTE,
      '',
    );
    proxy.setAttribute('aria-hidden', 'true');
    proxy.setAttribute('role', 'presentation');
    proxy.setAttribute('inert', '');
    proxy.style.position = 'fixed';
    proxy.style.left = `${frameRect.left}px`;
    proxy.style.top = `${frameRect.top}px`;
    proxy.style.width = `${frameRect.width}px`;
    proxy.style.height = `${frameRect.height}px`;
    proxy.style.pointerEvents = 'none';
    proxy.style.visibility = 'hidden';
    const activeColor = getComputedStyle(frame)
      .getPropertyValue('--bc-active-color')
      .trim();
    if (activeColor) proxy.style.setProperty('--bc-active-color', activeColor);

    const visual = frame.cloneNode(true) as HTMLElement;
    visual.querySelectorAll('block-resizer').forEach(node => node.remove());
    visual.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    visual.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]',
    ).forEach(node => node.setAttribute('tabindex', '-1'));
    visual.removeAttribute('id');
    visual.removeAttribute('contenteditable');
    visual.style.position = 'relative';
    visual.style.inset = 'auto';
    visual.style.left = 'auto';
    visual.style.right = 'auto';
    visual.style.top = 'auto';
    visual.style.bottom = 'auto';
    visual.style.width = '100%';
    visual.style.height = '100%';
    visual.style.maxWidth = 'none';
    if (!options.preserveTransform) visual.style.transform = 'none';
    visual.style.visibility = 'visible';
    visual.style.aspectRatio = 'auto';
    proxy.appendChild(visual);

    this.element = proxy;
    document.body.appendChild(proxy);
  }

  move(clientX: number, clientY: number): void {
    if (this._destroyed) return;
    this.element.style.visibility = 'visible';
    this._left = this._originLeft + clientX - this._startClientX;
    this._top = this._originTop + clientY - this._startClientY;
    this._scheduleRender();
  }

  position(): InlineImageDragProxyPosition {
    return {left: this._left, top: this._top};
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._rafId !== undefined) {
      cancelAnimationFrame(this._rafId);
      this._rafId = undefined;
    }
    this.element.remove();
  }

  private _scheduleRender(): void {
    if (this._rafId !== undefined) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = undefined;
      if (this._destroyed) return;
      this.element.style.transform = `translate3d(${
        this._left - this._originLeft
      }px, ${this._top - this._originTop}px, 0)`;
    });
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

const clampInside = (value: number, start: number, end: number): number =>
  end - start > 2 ? clamp(value, start + 1, end - 1) : (start + end) / 2;

const lineStartX = (
  block: EditableBlockComponent,
  rect: DOMRect,
): number => getComputedStyle(block.containerElement).direction === 'rtl'
  ? clampInside(rect.right, rect.left, rect.right)
  : clampInside(rect.left, rect.left, rect.right);

function compatibleEditableBlock(
  doc: BlockCraft.Doc,
  blockId: string,
): EditableBlockComponent | null {
  try {
    if (!doc.model.exists(blockId) || !doc.vm.isMounted(blockId)) return null;
    const block = doc.getBlockById(blockId);
    if (
      !doc.isEditable(block) ||
      doc.isPlainTextBlock(blockId) ||
      doc.readonlyManager.isReadonly(block) ||
      !block.hostElement.isConnected ||
      !doc.root.hostElement.contains(block.hostElement)
    ) {
      return null;
    }
    return block;
  } catch {
    return null;
  }
}

function mapRangeToTarget(
  doc: BlockCraft.Doc,
  range: Range | null,
  expectedBlockId?: string,
): InlineImageDropTarget | null {
  if (!range) return null;
  const blockId = closetBlockId(range.startContainer);
  if (!blockId || (expectedBlockId && blockId !== expectedBlockId)) return null;
  const block = compatibleEditableBlock(doc, blockId);
  if (!block) return null;
  try {
    return {
      block,
      offset: clamp(
        block.runtime.domPointToModel(range.startContainer, range.startOffset),
        0,
        block.textLength,
      ),
    };
  } catch {
    return null;
  }
}

interface MountedCandidate {
  block: EditableBlockComponent
  rect: DOMRect
  verticalDistance: number
  horizontalDistance: number
}

/**
 * Resolves a mounted editable target from a viewport point. Block gaps and
 * non-editable blocks fall back to the nearest compatible editable block.
 */
export function resolveInlineImageDropTarget(
  doc: BlockCraft.Doc,
  clientX: number,
  clientY: number,
): InlineImageDropTarget | null {
  const root = doc.root.hostElement;
  const rootRect = root.getBoundingClientRect();
  if (
    clientX < rootRect.left ||
    clientX > rootRect.right ||
    clientY < rootRect.top ||
    clientY > rootRect.bottom
  ) {
    return null;
  }

  const direct = mapRangeToTarget(doc, caretRangeFromPoint(clientX, clientY));
  if (direct) {
    const rect = direct.block.containerElement.getBoundingClientRect();
    const lineAnchor = mapRangeToTarget(
      doc,
      caretRangeFromPoint(
        lineStartX(direct.block, rect),
        clampInside(clientY, rect.top, rect.bottom),
      ),
      direct.block.id,
    );
    return lineAnchor ?? direct;
  }

  const seen = new Set<string>();
  const candidates: MountedCandidate[] = [];
  root.querySelectorAll<HTMLElement>('[data-block-id]').forEach(host => {
    const blockId = host.dataset['blockId'];
    if (!blockId || seen.has(blockId)) return;
    seen.add(blockId);
    const block = compatibleEditableBlock(doc, blockId);
    if (!block) return;
    const rect = block.containerElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const verticalDistance = clientY < rect.top
      ? rect.top - clientY
      : clientY > rect.bottom
        ? clientY - rect.bottom
        : 0;
    const horizontalDistance = clientX < rect.left
      ? rect.left - clientX
      : clientX > rect.right
        ? clientX - rect.right
        : 0;
    candidates.push({block, rect, verticalDistance, horizontalDistance});
  });
  candidates.sort((a, b) =>
    a.verticalDistance - b.verticalDistance ||
    a.horizontalDistance - b.horizontalDistance ||
    Math.abs(clientY - (a.rect.top + a.rect.height / 2)) -
      Math.abs(clientY - (b.rect.top + b.rect.height / 2)),
  );
  const nearest = candidates[0];
  if (!nearest) return null;

  const probeX = lineStartX(nearest.block, nearest.rect);
  const probeY = clampInside(clientY, nearest.rect.top, nearest.rect.bottom);
  const mapped = mapRangeToTarget(
    doc,
    caretRangeFromPoint(probeX, probeY),
    nearest.block.id,
  );
  if (mapped) return mapped;

  return {
    block: nearest.block,
    offset: clientY <= nearest.rect.top + nearest.rect.height / 2
      ? 0
      : nearest.block.textLength,
  };
}

/**
 * Resolves the editable text line visually covered by an absolute image.
 * Unlike the drag resolver's nearest-block fallback, this conversion helper
 * only accepts a block whose box actually overlaps the image and never
 * targets editable descendants such as the image's own caption.
 */
export function resolveInlineImageOverlapTarget(
  doc: BlockCraft.Doc,
  sourceBlockId: string,
  imageRect: DOMRect,
): InlineImageDropTarget | null {
  if (imageRect.width <= 0 || imageRect.height <= 0) return null;

  const probeX = clampInside(
    imageRect.left + Math.min(24, imageRect.width / 2),
    imageRect.left,
    imageRect.right,
  );
  const probeY = clampInside(
    imageRect.top + Math.min(12, imageRect.height / 2),
    imageRect.top,
    imageRect.bottom,
  );
  const target = resolveInlineImageDropTarget(doc, probeX, probeY);
  if (!target) return null;

  const targetPath = doc.model.getPath(target.block.id);
  if (!targetPath || targetPath.includes(sourceBlockId)) return null;

  const targetRect = target.block.containerElement.getBoundingClientRect();
  return rectsOverlap(imageRect, targetRect) ? target : null;
}
