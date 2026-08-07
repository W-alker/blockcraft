// packages/editor/framework/modules/pagination/export/print-vector.ts
import {PaginationConfig} from "../pagination.types";
import {PrintPages} from "./print-paginator";
import {resolvePrintPageDimensions} from './print-page-geometry'
import {materializeWordArtForPrint} from './print-word-art'

/**
 * 矢量浏览器打印：把逐页 A4 页盒放进打印 iframe，`@page{margin:0}` 让每个页盒 = 一张物理页。
 * 文字保持矢量可选中。仅浏览器环境可靠（Tauri/WKWebView 的 window.print 行为不一定，故作为可选项）。
 *
 * 页盒由独立只读 BlockCraftDoc 渲染（非 contenteditable/非聚焦），importNode 进 iframe 不触发
 * 聚焦编辑器 host 的克隆问题。
 */
export async function printPagesVector(pages: PrintPages, _config: PaginationConfig): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
  document.body.appendChild(iframe);

  await new Promise<void>(res => {
    iframe.onload = () => res();
    iframe.srcdoc = '<!DOCTYPE html><html><head></head><body></body></html>';
  });

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error('print iframe unavailable');
  }
  const idoc = win.document;

  // @page 尺寸 + 0 边距（页盒自身已含边距/页眉页脚），逐页分页
  const style = idoc.createElement('style');
  style.textContent = `
    @page { size: ${pages.pageWidthCss} ${pages.pageHeightCss}; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    @media print {
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      ::-webkit-scrollbar { display: none; }
    }
    .bc-print-root { position: static !important; left: auto !important; top: auto !important; }
    .bc-print-page { break-after: page; page-break-after: always; }
    .bc-print-page:last-child { break-after: auto; page-break-after: auto; }
  `;
  idoc.head.appendChild(style);

  await copyStylesheets(document, idoc);
  await rasterizeCanvases(pages.container);
  // importNode 前以最终主文档布局再幂等收口一次，避免异步只读组件把艺术字恢复成
  // WKWebView/浏览器打印器解释不一致的 CSS background-clip:text。
  materializeWordArtForPrint(pages.container)

  const imported = idoc.importNode(pages.container, true) as HTMLElement;
  imported.removeAttribute('style');
  idoc.body.appendChild(imported);

  try {
    await (idoc as Document & {fonts?: FontFaceSet}).fonts?.ready;
  } catch {
    /* ignore */
  }
  await new Promise(r => setTimeout(r, 400));

  await new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    win.onafterprint = finish;
    // 某些浏览器不触发 onafterprint，兜底
    setTimeout(finish, 60000);
    win.focus();
    win.print();
  });

  iframe.remove();
}

/** CSS @page size 关键字（命名纸张）或自定义像素尺寸 + 方向。 */
export function cssPageSize(config: PaginationConfig): string {
  const page = resolvePrintPageDimensions(config)
  return `${page.widthCss} ${page.heightCss}`
}

/** 复制主文档样式表到打印文档（块主题样式）。带 try/catch 跳过 CORS 受限表。 */
async function copyStylesheets(src: Document, dest: Document): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const sheet of Array.from(src.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      const target = dest.createElement('style');
      let text = '';
      for (const rule of Array.from(rules)) {
        text += rule.cssText + '\n';
      }
      target.textContent = text;
      dest.head.appendChild(target);
    } catch {
      // 跨域样式表无法读取 cssRules；让打印 iframe 自己加载同一 stylesheet。
      const owner = sheet.ownerNode;
      if (!(owner instanceof HTMLLinkElement) || !owner.href) continue;
      const link = dest.createElement('link');
      link.rel = 'stylesheet';
      link.href = owner.href;
      link.media = owner.media || 'all';
      pending.push(new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, 3000);
        link.addEventListener('load', finish, {once: true});
        link.addEventListener('error', finish, {once: true});
      }));
      dest.head.appendChild(link);
    }
  }
  await Promise.all(pending);
}

/** 把 canvas 内容固化成 <img> 替换原 canvas（importNode 不会复制 canvas 位图）。 */
export async function rasterizeCanvases(container: HTMLElement): Promise<void> {
  const canvases = Array.from(container.querySelectorAll('canvas'));
  for (const canvas of canvases) {
    try {
      const url = canvas.toDataURL('image/png');
      const img = document.createElement('img');
      img.src = url;
      img.width = canvas.width;
      img.height = canvas.height;
      img.style.cssText = canvas.style.cssText;
      canvas.replaceWith(img);
    } catch {
      // toDataURL 受 CORS 限制时跳过
    }
  }
}
