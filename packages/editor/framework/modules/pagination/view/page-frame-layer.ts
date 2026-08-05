// packages/editor/framework/modules/pagination/view/page-frame-layer.ts
import {SheetRect} from "./sheet-layout";
import {PageChrome, PageChromeSegments} from "../pagination.types";
import {PageMargins} from "../engine";
import {resolveChromeSegments} from "./chrome-tokens";

/** 一次渲染所需的全部输入。 */
export interface FrameRenderInput {
  rects: SheetRect[];
  sheetWidthPx: number;
  totalHeight: number;
  margins: PageMargins;
  headerHeight: number;
  footerHeight: number;
  headerDistance: number;
  footerDistance: number;
  header?: PageChrome;
  footer?: PageChrome;
}

/**
 * 分页定位面内的「A4 纸张背景层」：一个绝对定位、pointer-events:none 的 div，
 * 作为 root 直接父容器的首个子节点（绘制在内容之下），内含若干 .bc-page-sheet。
 * 它不必与真实 scrollContainer 是同一元素；宿主可以在两者之间安排文档头等布局。
 * 每张纸内按需渲染 .bc-page-header / .bc-page-footer（左/中/右三段，{page}/{total} 已替换）。
 * 不进 Yjs、不是块。
 */
export class PageFrameLayer {
  private _root: HTMLElement | null = null;
  private _surfaceClassApplied = false;

  constructor(private layoutSurface: HTMLElement) {}

  mount(): void {
    if (this._root) return;
    const el = document.createElement('div');
    el.className = 'bc-pagination-backdrop';
    el.setAttribute('contenteditable', 'false');
    this.layoutSurface.classList.add('bc-pagination-surface');
    this._surfaceClassApplied = true;
    this.layoutSurface.insertBefore(el, this.layoutSurface.firstChild);
    this._root = el;
  }

  render(input: FrameRenderInput): void {
    if (!this._root) return;
    const {
      rects,
      sheetWidthPx,
      totalHeight,
      margins,
      headerHeight,
      footerHeight,
      headerDistance,
      footerDistance,
      header,
      footer,
    } = input;
    this._root.style.height = `${totalHeight}px`;

    const total = rects.length;
    while (this._root.children.length < total) {
      const s = document.createElement('div');
      s.className = 'bc-page-sheet';
      this._root.appendChild(s);
    }
    while (this._root.children.length > total) {
      this._root.lastElementChild!.remove();
    }

    rects.forEach((r, i) => {
      const s = this._root!.children[i] as HTMLElement;
      s.style.top = `${r.top}px`;
      s.style.height = `${r.height}px`;
      s.style.width = `${sheetWidthPx}px`;
      s.replaceChildren();
      const page = i + 1;
      if (headerHeight > 0) {
        s.appendChild(this._chromeEl('bc-page-header', resolveChromeSegments(header, page, total), headerDistance, headerHeight, margins));
      }
      if (footerHeight > 0) {
        const top = r.height - footerDistance - footerHeight;
        s.appendChild(this._chromeEl('bc-page-footer', resolveChromeSegments(footer, page, total), top, footerHeight, margins));
      }
    });
  }

  private _chromeEl(cls: string, segs: PageChromeSegments, top: number, height: number, margins: PageMargins): HTMLElement {
    const el = document.createElement('div');
    el.className = cls;
    el.style.position = 'absolute';
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    el.style.left = `${margins.left}px`;
    el.style.right = `${margins.right}px`;
    const mk = (segCls: string, txt?: string): HTMLElement => {
      const sp = document.createElement('span');
      sp.className = segCls;
      sp.textContent = txt || '';
      return sp;
    };
    el.appendChild(mk('bc-page-chrome-left', segs.left));
    el.appendChild(mk('bc-page-chrome-center', segs.center));
    el.appendChild(mk('bc-page-chrome-right', segs.right));
    return el;
  }

  destroy(): void {
    this._root?.remove();
    this._root = null;
    if (this._surfaceClassApplied) {
      this.layoutSurface.classList.remove('bc-pagination-surface');
      this._surfaceClassApplied = false;
    }
  }
}
