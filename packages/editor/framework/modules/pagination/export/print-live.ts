// packages/editor/framework/modules/pagination/export/print-live.ts
import {PaginationConfig} from "../pagination.types";
import {PrintPages} from "./print-paginator";
import {cssPageSize, rasterizeCanvases} from "./print-vector";

/** 注入的 @media print 样式标记，便于清理与去重。 */
const MIRROR_STYLE_ATTR = 'data-bc-print-mirror-style';
/** 镜像容器标记类：屏幕上恒隐藏、打印时独占输出。 */
const MIRROR_CLASS = 'bc-print-mirror';

/**
 * 原地（live document）矢量打印：把 `buildPrintPages` 产出的逐页 A4 页盒挂进**当前文档**，
 * 用 `@media print` 让原生 `Cmd+P` / 浏览器打印**只**渲染这些确定性页盒、隐藏其余应用界面。
 *
 * 与 {@link printPagesVector}（打印 iframe）的区别：iframe 路径打印的是 iframe 文档，
 * 而原生 Cmd+P 打印的是**主文档**，故必须把页盒放进主文档并用 media query 切换可见性，
 * 才能让用户的 Cmd+P 直接产出与「导出 PDF（矢量）」一致的分页。
 *
 * 页盒是 snapshot-viewer 渲染的纯 DOM（非 contenteditable/非聚焦），不触发 WKWebView 聚焦 host
 * 克隆 bug；与主文档同源，块主题样式表已生效，无需 copyStylesheets。
 *
 * 浏览器兼容：`@page size/margin`、`break-after:page`、`print-color-adjust` 为打印基线能力；
 * 页盒自身是绝对定位/固定尺寸的普通块（非 flex/grid 分片），规避 CSS 分页引擎在复杂容器上的
 * 跨浏览器差异——分页边界由我们的引擎在 buildPrintPages 时已定死，浏览器只做「每盒一页」。
 *
 * @returns window.print() 返回（afterprint 或兜底超时）后 resolve；调用方负责 `pages.dispose()`。
 */
export async function printPagesInPage(pages: PrintPages, config: PaginationConfig): Promise<void> {
  const mirror = await mountPrintPagesInPage(pages, config);
  try {
    await waitForWindowPrint();
  } finally {
    mirror.dispose();
  }
}

export interface MountedPrintPages {
  printRoot: HTMLElement;
  dispose(): void;
}

/**
 * 把确定性页盒安装成当前顶层文档的 print mirror，但不主动调用 window.print()。
 * 宿主必须在返回的生命周期内调用当前 WebView 的原生打印 API，完成后 dispose。
 */
export async function mountPrintPagesInPage(
  pages: PrintPages,
  config: PaginationConfig,
): Promise<MountedPrintPages> {
  const container = pages.container;
  container.classList.add(MIRROR_CLASS);

  const style = document.createElement('style');
  style.setAttribute(MIRROR_STYLE_ATTR, 'true');
  style.textContent = `
    .${MIRROR_CLASS} { display: none !important; }
    @media print {
      @page { size: ${cssPageSize(config)}; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* 只留镜像页盒，其余应用界面（编辑器/侧栏/工具栏/CDK overlay…）全部不打印 */
      body > *:not(.${MIRROR_CLASS}) { display: none !important; }
      .${MIRROR_CLASS} { display: block !important; position: static !important; left: auto !important; top: auto !important; }
      .${MIRROR_CLASS} .bc-print-page { break-after: page; page-break-after: always; break-inside: avoid; }
      .${MIRROR_CLASS} .bc-print-page:last-child { break-after: auto; page-break-after: auto; }
      ::-webkit-scrollbar { display: none; }
    }
  `;
  document.head.appendChild(style);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    style.remove();
    container.classList.remove(MIRROR_CLASS);
  };

  try {
    // canvas（mermaid 等）固化为 <img>，否则部分浏览器打印时丢位图
    await rasterizeCanvases(container);
    try {
      await (document as Document & {fonts?: FontFaceSet}).fonts?.ready;
    } catch {
      /* ignore */
    }
    await new Promise(r => setTimeout(r, 50));
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    printRoot: container,
    dispose,
  };
}

async function waitForWindowPrint(): Promise<void> {
  await new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', finish);
      clearTimeout(timer);
      resolve();
    };
    // 某些浏览器不触发 afterprint，兜底超时
    const timer = setTimeout(finish, 60000);
    window.addEventListener('afterprint', finish, {once: true});
    window.focus();
    window.print();
  });
}
