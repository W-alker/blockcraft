// packages/editor/framework/modules/pagination/export/print-readonly-render.ts
import {IBlockSnapshot} from "../../../block-std/types/block.type";
import {appendFlowSentinel} from './print-dom';
import {
  PaginationExportError,
  PaginationPdfOptions,
  throwIfPaginationExportAborted,
} from './pdf-export.types'
import type {PrintRenderProvider} from "./print-paginator";

/** 每次只读打印渲染用一个独立 docId，避免与 live doc / 上次打印 doc 撞键。 */
let _printDocSeq = 0;

/**
 * 打印内容渲染来源 = 「只读编辑器渲染」：复用 live `doc` 的 injector / schemas / embeds / theme
 * 新建一个 **readonly、无插件、无分页** 的 BlockCraftDoc，离屏渲染同一份快照。
 *
 * 相比 snapshot-viewer（独立的纯 DOM 渲染引擎，embed/媒体块渲染与 live 不一致），这里渲染出的
 * 块组件与 live 编辑器**完全相同**（只是只读）——embed/媒体块的视觉与高度都与屏幕一致，
 * 从而打印产物在「断点 + 内容」两个维度都 WYSIWYG。
 *
 * 安全性：只读 + 全新渲染（非 clone 聚焦 host），不触发 WKWebView 聚焦 host 克隆 bug；
 * 主题为全局（`:root` / `body[blockcraft-theme]`），块搬进页盒后照常继承，无需特殊处理。
 *
 * 不直接 import `BlockCraftDoc`（会与 doc→pagination→export 形成循环依赖）：用 `doc.constructor`
 * 构造同类实例。打印结束（dispose）时 destroy 该 doc，销毁其全部组件与监听。
 */
export function readonlyDocRenderProvider(
  doc: BlockCraft.Doc,
  snapshot: IBlockSnapshot,
  options: Pick<PaginationPdfOptions, 'prepareDocument' | 'signal'> = {},
): PrintRenderProvider {
  return async (contentWidthPx: number) => {
    const off = document.createElement('div');
    off.setAttribute('data-bc-print-offscreen', 'true');
    off.style.cssText = `position:absolute; left:-99999px; top:0; width:${contentWidthPx}px; pointer-events:none;`;
    document.body.appendChild(off);

    const anyDoc = doc as any;
    const DocCtor = anyDoc.constructor;
    const YDocCtor = anyDoc.yDoc.constructor;
    const printDoc = new DocCtor({
      docId: `${doc.config.docId ?? 'bc'}-print-ro-${++_printDocSeq}`,
      schemas: doc.config.schemas,
      logger: doc.config.logger,
      injector: doc.config.injector,
      yDoc: new YDocCtor(),
      embeds: doc.config.embeds,
      theme: anyDoc.theme,
      readonly: true,
      plugins: [],
      // 不传 pagination：避免只读 doc 又递归启用一个分页子系统。
    });
    const dispose = () => {
      try {
        printDoc.destroy?.();
      } catch {
        /* ignore */
      }
      off.remove();
    }

    try {
      printDoc.initBySnapshot(snapshot, off);

      // 等 initBySnapshot 内 _initEditor 的 nextTick（应用 readonly / theme）跑完。
      // 字体、图片、canvas/iframe 的稳定与策略由统一 print-resources 层处理。
      await new Promise<void>(r => setTimeout(r, 0));
      await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));
      throwIfPaginationExportAborted(options.signal)

      const root = off.querySelector<HTMLElement>('[data-blockcraft-root="true"]') ?? off;
      root.classList.add('bc-pagination-print-source');
      root.style.width = `${contentWidthPx}px`;
      root.style.maxWidth = 'none';
      root.style.margin = '0';
      root.style.padding = '0';
      for (const child of Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-block-id]'))) {
        child.style.marginTop = '0';
      }

      if (options.prepareDocument) {
        try {
          await options.prepareDocument({doc: printDoc, root, signal: options.signal})
        } catch (error) {
          throwIfPaginationExportAborted(options.signal)
          if (error instanceof PaginationExportError) throw error
          throw new PaginationExportError(
            'layout-not-ready',
            '导出副本文档的业务视图准备失败',
            {stage: 'layout'},
            error,
          )
        }
      }
      throwIfPaginationExportAborted(options.signal)
      appendFlowSentinel(root);

      return {root, dispose};
    } catch (error) {
      dispose()
      throw error
    }
  };
}
