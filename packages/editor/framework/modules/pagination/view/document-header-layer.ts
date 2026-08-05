import {
  PaginationDocumentHeaderOptions,
  PaginationElementTarget,
} from '../pagination.types';

export interface DocumentHeaderLayout {
  top: number;
  width: number;
}

function resolveTarget(target: PaginationElementTarget): HTMLElement | null {
  return typeof target === 'function' ? target() : target;
}

/** 把宿主文档头临时投影到首页内，并在销毁时无损还原 DOM。 */
export class DocumentHeaderLayer {
  private element: HTMLElement | null = null;
  private originalParent: Node | null = null;
  private originalNextSibling: Node | null = null;
  private originalStyle: string | null = null;
  private hadRuntimeClass = false;
  private resizeObserver: ResizeObserver | null = null;
  private height = 0;

  readonly gap: number;

  constructor(
    private readonly surface: HTMLElement,
    private readonly root: HTMLElement,
    private readonly options: PaginationDocumentHeaderOptions,
    private readonly onHeightChange: (height: number) => void,
  ) {
    this.gap = Number.isFinite(options.gap) && (options.gap ?? 0) >= 0
      ? options.gap ?? 0
      : 0;
  }

  mount(layout: DocumentHeaderLayout): void {
    if (this.element) return;
    const element = resolveTarget(this.options.element);
    if (!element?.isConnected || !element.parentNode) return;

    this.element = element;
    this.originalParent = element.parentNode;
    this.originalNextSibling = element.nextSibling;
    this.originalStyle = element.getAttribute('style');
    this.hadRuntimeClass = element.classList.contains('bc-pagination-document-header');

    this.surface.insertBefore(element, this.root);
    element.classList.add('bc-pagination-document-header');
    this.updateLayout(layout);
    this.measure();

    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1];
      this.setHeight(entry?.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height);
    });
    this.resizeObserver.observe(element);
  }

  updateLayout(layout: DocumentHeaderLayout): void {
    const element = this.element;
    if (!element) return;
    element.style.position = 'absolute';
    element.style.top = `${layout.top}px`;
    element.style.left = '50%';
    element.style.width = `${Math.max(1, layout.width)}px`;
    element.style.margin = '0';
    element.style.transform = 'translateX(-50%)';
    element.style.zIndex = '2';
    element.style.boxSizing = 'border-box';
  }

  measure(): number {
    // offsetHeight / ResizeObserver borderBoxSize 都是 layout px，不受外层
    // DocumentViewScaleManager 的视觉缩放影响。
    const offsetHeight = this.element?.offsetHeight ?? 0;
    const height = offsetHeight > 0
      ? offsetHeight
      : this.element?.getBoundingClientRect().height ?? 0;
    this.setHeight(height);
    return this.height;
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const element = this.element;
    if (element) {
      if (!this.hadRuntimeClass) element.classList.remove('bc-pagination-document-header');
      if (this.originalStyle === null) element.removeAttribute('style');
      else element.setAttribute('style', this.originalStyle);

      const parent = this.originalParent;
      if (parent?.isConnected) {
        if (this.originalNextSibling?.parentNode === parent) {
          parent.insertBefore(element, this.originalNextSibling);
        } else {
          parent.appendChild(element);
        }
      }
      // 某些浏览器在重排序有 CSSStyleDeclaration 的节点时会重建空 style 属性。
      if (this.originalStyle === null) element.removeAttribute('style');
    }
    this.element = null;
    this.originalParent = null;
    this.originalNextSibling = null;
    this.originalStyle = null;
    this.height = 0;
    this.onHeightChange(0);
  }

  private setHeight(value: number): void {
    const height = Number.isFinite(value) && value >= 0 ? value : 0;
    if (Math.abs(height - this.height) < 0.5) return;
    this.height = height;
    this.onHeightChange(height);
  }
}
