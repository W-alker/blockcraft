// packages/editor/framework/modules/pagination/export/print-vector.ts
import {PaginationConfig} from "../pagination.types";
import {PrintPages} from "./print-paginator";

/**
 * 矢量浏览器打印：把逐页 A4 页盒放进打印 iframe，`@page{margin:0}` 让每个页盒 = 一张物理页。
 * 文字保持矢量可选中。仅浏览器环境可靠（Tauri/WKWebView 的 window.print 行为不一定，故作为可选项）。
 *
 * 页盒由独立只读 BlockCraftDoc 渲染（非 contenteditable/非聚焦），importNode 进 iframe 不触发
 * 聚焦编辑器 host 的克隆问题。
 */
export async function printPagesVector(pages: PrintPages, config: PaginationConfig): Promise<void> {
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
    @page { size: ${cssPageSize(config)}; margin: 0; }
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
  const orient = config.orientation === 'landscape' ? 'landscape' : 'portrait';
  const size = config.pageSize ?? 'A4';
  if (typeof size === 'string') {
    // CSS 支持的命名尺寸：A3/A4/A5/B4/B5/letter/legal/ledger（大小写不敏感）
    const named: Record<string, string> = {
      A3: 'A3', A4: 'A4', A5: 'A5', A6: 'A6', Letter: 'letter', Legal: 'legal', Tabloid: 'ledger',
    };
    return `${named[size] ?? 'A4'} ${orient}`;
  }
  // 自定义像素尺寸（@page size 接受长度）
  const w = orient === 'landscape' ? size.height : size.width;
  const h = orient === 'landscape' ? size.width : size.height;
  return `${w}px ${h}px`;
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
