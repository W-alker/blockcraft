// packages/editor/framework/modules/pagination/export/print-live.ts
import {PaginationConfig} from "../pagination.types";
import {PrintPages} from "./print-paginator";
import {rasterizeCanvases} from "./print-vector";
import {materializeWordArtForPrint} from './print-word-art'

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
 * 浏览器兼容：`@page size/margin`、固定物理页槽、`print-color-adjust` 为打印基线能力；
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
  _config: PaginationConfig,
): Promise<MountedPrintPages> {
  const container = pages.container;
  container.classList.add(MIRROR_CLASS);
  // build 阶段产出的页几何是 SoT；mount 不能再从 config 独立解析一次。
  const page = {widthCss: pages.pageWidthCss, heightCss: pages.pageHeightCss};
  // WebKit 的 paged layout 会把物理纸高换算为整数 CSS px 再切页（例如 A4：
  // 297mm = 1122.519...px，但实际分页步长是 1122px）。页槽若继续使用 297mm，
  // 每页约 0.5px 的尾差会累计，并在长文档末尾生成一张只含背景条的空白页。
  // 这里只收敛“流中的分页占位”；内层 page 和 @page 仍保持精确物理尺寸，正文、
  // 页眉页脚及绝对定位内容的坐标不会被重新缩放。
  const flowPageHeightPx = Math.max(1, Math.floor(pages.pageHeightPx));
  // 浏览器拥有最终 page area，BlockCraft 在同一物理尺寸内提供固定页高、页边距与内容。
  // 这里不能改成 100%：WKWebView 会先按打印视图宽度解析百分比，再由 NSPrintInfo 的
  // horizontal pagination 缩放，横向缩放会同时改变页槽的纵向高度，导致逻辑页与物理页
  // 越往后越错位。页槽和 @page 必须复用完全相同的物理单位。
  const slots = pages.pages.map(pageElement => {
    const slot = document.createElement('div');
    slot.className = 'bc-print-page-slot';
    pageElement.before(slot);
    slot.appendChild(pageElement);
    return {slot, pageElement};
  });

  const style = document.createElement('style');
  style.setAttribute(MIRROR_STYLE_ATTR, 'true');
  style.textContent = `
    .${MIRROR_CLASS} { display: none !important; }
    @media print {
      @page { size: ${page.widthCss} ${page.heightCss}; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
        width: ${page.widthCss} !important; min-width: ${page.widthCss} !important; max-width: ${page.widthCss} !important;
        height: auto !important; min-height: 0 !important; max-height: none !important;
        overflow: visible !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* 只留镜像页盒，其余应用界面（编辑器/侧栏/工具栏/CDK overlay…）全部不打印 */
      body > *:not(.${MIRROR_CLASS}) { display: none !important; }
      .${MIRROR_CLASS} { display: block !important; position: static !important; left: auto !important; top: auto !important;
        width: ${page.widthCss} !important; min-width: ${page.widthCss} !important; max-width: ${page.widthCss} !important;
        height: auto !important; min-height: 0 !important; max-height: none !important;
        margin: 0 !important; padding: 0 !important; }
      /* 每个固定高页槽自然占满一张物理纸。不要再给后续槽加 break-before：
         WebKit 会先因满高槽自然换页，再执行强制换页，结果严格变成“一页内容 +
         一页空白”。页槽使用 WebKit 真实采用的整数 CSS px 分页步长，避免物理
         单位的小数尾差逐页累计；真实纸面仍由内层 page 和 @page 定义。 */
      .${MIRROR_CLASS} > .bc-print-page-slot {
        display: block !important;
        box-sizing: border-box !important;
        width: ${page.widthCss} !important; min-width: ${page.widthCss} !important; max-width: ${page.widthCss} !important;
        height: ${flowPageHeightPx}px !important;
        min-height: ${flowPageHeightPx}px !important;
        max-height: ${flowPageHeightPx}px !important;
        position: relative !important;
        margin: 0 !important; padding: 0 !important; overflow: hidden !important;
        break-before: auto !important; page-break-before: auto !important;
        break-after: auto !important; page-break-after: auto !important;
        break-inside: avoid !important; page-break-inside: avoid !important;
      }
      .${MIRROR_CLASS} > .bc-print-page-slot > .bc-print-page {
        position: absolute !important; top: 0 !important; left: 0 !important;
        box-sizing: border-box !important;
        display: block !important;
        width: ${page.widthCss} !important; min-width: ${page.widthCss} !important; max-width: ${page.widthCss} !important;
        height: ${page.heightCss} !important;
        min-height: ${page.heightCss} !important;
        max-height: ${page.heightCss} !important;
        margin: 0 !important; padding: 0 !important; overflow: hidden !important;
        break-before: auto !important; page-break-before: auto !important;
        break-after: auto !important; page-break-after: auto !important;
      }
      /* 逻辑分页已经完成，业务主题或旧 page-divider 遗留的分页指令不能让浏览器
         在固定页盒内部再次分页。 */
      .${MIRROR_CLASS} > .bc-print-page-slot > .bc-print-page *,
      .${MIRROR_CLASS} > .bc-print-page-slot > .bc-print-page *::before,
      .${MIRROR_CLASS} > .bc-print-page-slot > .bc-print-page *::after {
        break-before: auto !important; page-break-before: auto !important;
        break-after: auto !important; page-break-after: auto !important;
      }
      ::-webkit-scrollbar { display: none; }
    }
  `;
  document.head.appendChild(style);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    style.remove();
    for (const {slot, pageElement} of slots) {
      if (slot.parentNode) slot.parentNode.insertBefore(pageElement, slot);
      slot.remove();
    }
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
    // 页盒挂载后的短暂静默可能触发宿主持有的只读组件补渲染。原生打印开始前
    // 再幂等收口一次，保证最终 print mirror 里不存在 CSS gradient WordArt。
    materializeWordArtForPrint(container)
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
