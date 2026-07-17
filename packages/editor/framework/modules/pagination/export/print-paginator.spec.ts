// packages/editor/framework/modules/pagination/export/print-paginator.spec.ts
import {buildPaginatedPrintSurface, buildPrintPages} from "./print-paginator";
import {BlockNodeType, IBlockSnapshot} from "../../../block-std/types/block.type";
import {PaginationConfig} from "../pagination.types";
import {resolveScreenGeometry} from '../view/pagination-geometry';
import {createStablePaginationLayout} from '../view/stable-pagination-layout';

function paragraph(id: string, text: string): IBlockSnapshot {
  return {id, flavour: "paragraph", nodeType: BlockNodeType.editable, meta: {}, props: {depth: 0}, children: [{insert: text}]};
}

function root(children: IBlockSnapshot[]): IBlockSnapshot {
  return {id: "root", flavour: "root", nodeType: BlockNodeType.root, meta: {}, props: {}, children};
}

function cell(id: string, text: string): IBlockSnapshot {
  return {
    id, flavour: "table-cell", nodeType: BlockNodeType.block, meta: {}, props: {},
    children: [{id: `${id}-p`, flavour: "paragraph", nodeType: BlockNodeType.editable, meta: {}, props: {depth: 0}, children: [{insert: text}]}],
  };
}

function tableRow(id: string, text: string): IBlockSnapshot {
  return {
    id, flavour: "table-row", nodeType: BlockNodeType.block, meta: {}, props: {height: 40},
    children: [cell(`${id}-c1`, `${text} A`), cell(`${id}-c2`, `${text} B`)],
  };
}

function table(id: string, rows: number): IBlockSnapshot {
  return {
    id, flavour: "table", nodeType: BlockNodeType.block, meta: {}, props: {colWidths: [180, 180]},
    children: Array.from({length: rows}, (_, i) => tableRow(`${id}-r${i}`, `row${i}`)),
  };
}

/** 小页确定性触发 oversized：内容区 400-20 宽、220-20=200 高。 */
const SMALL_PAGE: PaginationConfig = {
  pageSize: {width: 400, height: 220},
  margins: {top: 10, right: 10, bottom: 10, left: 10},
};
const CONTENT_HEIGHT = 200;

const LONG_TEXT = Array.from({length: 400}, (_, i) => `word${i}`).join(" ");

describe("buildPrintPages - 超大块按行拆分（PDF 防分割）", () => {
  it('uses the page content-height variable instead of per-block inline caps', async () => {
    const snapshot = root([{
      id: 'code-1',
      flavour: 'code',
      nodeType: BlockNodeType.editable,
      meta: {},
      props: {depth: 0},
      children: [{insert: 'const value = 1;'}],
    }]);
    const items = [{
      id: 'code-1',
      height: CONTENT_HEIGHT,
      breakable: false,
      keepWithNext: false,
      lockHeight: CONTENT_HEIGHT,
    }];
    const layout = createStablePaginationLayout(10, SMALL_PAGE, resolveScreenGeometry(SMALL_PAGE), items, {
      pages: [{index: 0, usedHeight: CONTENT_HEIGHT, slots: [{id: 'code-1'}]}],
      byBlock: new Map([['code-1', {pageIndex: 0}]]),
    });
    const offscreen = document.createElement('div');
    const code = document.createElement('div');
    code.dataset['blockId'] = 'code-1';
    code.className = 'code-block';
    offscreen.appendChild(code);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const content = pages.pages[0]!.querySelector<HTMLElement>('.bc-print-content')!;
      const renderedCode = content.querySelector<HTMLElement>('[data-block-id="code-1"]')!;

      expect(content.style.getPropertyValue('--bc-page-content-height')).toBe('200px');
      expect(renderedCode.classList.contains('bc-page-height-locked')).toBeTrue();
      expect(renderedCode.style.maxHeight).toBe('');
      expect(renderedCode.style.overflow).toBe('');
    } finally {
      pages.dispose();
    }
  });

  it('uses the captured page result instead of paginating the readonly DOM again', async () => {
    const snapshot = root([paragraph('p1', 'first'), paragraph('p2', 'second')]);
    const config: PaginationConfig = {
      pageSize: {width: 400, height: 220},
      margins: {top: 10, right: 10, bottom: 10, left: 10},
    };
    const items = [
      {id: 'p1', height: 40, breakable: false, keepWithNext: false},
      {id: 'p2', height: 40, breakable: false, keepWithNext: false},
    ];
    // 两块实际能放同一页，但捕获结果明确分成两页；打印面必须忠实消费该结果。
    const layout = createStablePaginationLayout(9, config, resolveScreenGeometry(config), items, {
      pages: [
        {index: 0, usedHeight: 40, slots: [{id: 'p1'}]},
        {index: 1, usedHeight: 40, slots: [{id: 'p2'}]},
      ],
      byBlock: new Map([['p1', {pageIndex: 0}], ['p2', {pageIndex: 1}]]),
    });
    const offscreen = document.createElement('div');
    offscreen.style.position = 'absolute';
    offscreen.style.left = '-99999px';
    for (const id of ['p1', 'p2']) {
      const el = document.createElement('div');
      el.dataset['blockId'] = id;
      el.style.height = '40px';
      offscreen.appendChild(el);
    }
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      expect(pages.pageCount).toBe(2);
      expect(pages.layoutRevision).toBe(9);
      expect(pages.pages[0]!.querySelector('[data-block-id="p1"]')).not.toBeNull();
      expect(pages.pages[0]!.querySelector('[data-block-id="p2"]')).toBeNull();
      expect(pages.pages[1]!.querySelector('[data-block-id="p2"]')).not.toBeNull();
      expect(pages.pages[1]!.querySelector('.bc-print-flow-sentinel')).not.toBeNull();
      expect(pages.pages[1]!.querySelector('[data-block-id="p2"]:last-child')).toBeNull();

      const content = pages.pages[0]!.querySelector<HTMLElement>('.bc-print-content');
      expect(content).not.toBeNull();
      expect(content!.getAttribute('data-blockcraft-root')).toBe('true');
      expect(content!.style.top).toBe('10px');
      expect(content!.style.right).toBe('10px');
      expect(content!.style.bottom).toBe('10px');
      expect(content!.style.left).toBe('10px');
      expect(content!.style.padding).toBe('0px');
      expect(content!.style.minHeight).toBe('0px');
      expect(content!.style.boxSizing).toBe('border-box');
    } finally {
      pages.dispose();
    }
  });

  it("高过一整页的段落被拆成多页的裁剪窗口，且无单片溢出整页", async () => {
    const pages = await buildPrintPages(root([paragraph("p-long", LONG_TEXT)]), SMALL_PAGE);
    try {
      // 跨多页
      expect(pages.pageCount).toBeGreaterThan(1);

      const frags = Array.from(pages.container.querySelectorAll<HTMLElement>(".bc-print-frag"));
      // 同一超大块被切成多个片段窗口
      expect(frags.length).toBeGreaterThan(1);

      // 没有任何片段窗口高过一整页内容区（= 真正防分割，而非整块溢出）
      for (const f of frags) {
        expect(f.offsetHeight).toBeLessThanOrEqual(CONTENT_HEIGHT + 1);
      }

      // 片段累计高度 > 一整页（证明内容确实跨了页而非被截断丢弃）
      const totalFragHeight = frags.reduce((sum, f) => sum + f.offsetHeight, 0);
      expect(totalFragHeight).toBeGreaterThan(CONTENT_HEIGHT);

      // 每页内容区不超过 contentHeight（裁剪窗口求和不溢出页盒）
      const contents = Array.from(pages.container.querySelectorAll<HTMLElement>(".bc-print-content"));
      for (const c of contents) {
        expect(c.scrollHeight).toBeLessThanOrEqual(CONTENT_HEIGHT + 2);
      }
    } finally {
      pages.dispose();
    }
  });

  it("高过一整页的表格按 <tr> 行边界跨页拆分，每页不溢出且不切断行", async () => {
    // 24 行表格远高于 200px 内容区 → 必拆。切点只来自 <tr> 底边，故拆点必落在行边界。
    const pages = await buildPrintPages(root([table("t", 24)]), SMALL_PAGE);
    try {
      expect(pages.pageCount).toBeGreaterThan(1);

      const frags = Array.from(pages.container.querySelectorAll<HTMLElement>(".bc-print-frag"));
      expect(frags.length).toBeGreaterThan(1);

      // 每个片段窗口都装进一页内容区（防分割：不是整表溢出）
      for (const f of frags) {
        expect(f.offsetHeight).toBeLessThanOrEqual(CONTENT_HEIGHT + 1);
      }

      // 拆出来的每个片段里，所有 <tr> 都是完整的（顶/底都落在该片段窗口内，没有被横切）。
      // 这是「按行拆」的核心保证。
      for (const f of frags) {
        const fRect = f.getBoundingClientRect();
        const rows = Array.from(f.querySelectorAll<HTMLElement>("tr.table-row-block"));
        const visibleRows = rows.filter(r => {
          const rr = r.getBoundingClientRect();
          return rr.height > 0 && rr.bottom > fRect.top && rr.top < fRect.bottom;
        });
        for (const r of visibleRows) {
          const rr = r.getBoundingClientRect();
          // 该行若在本片段可见，则其上下边都必须在窗口内（容差 1px）——即没有被页边横切。
          expect(rr.top).toBeGreaterThanOrEqual(fRect.top - 1);
          expect(rr.bottom).toBeLessThanOrEqual(fRect.bottom + 1);
        }
      }
    } finally {
      pages.dispose();
    }
  });

  it("放得下的普通段落整块搬移、不产生裁剪窗口", async () => {
    const pages = await buildPrintPages(root([paragraph("p-short", "短段落")]), SMALL_PAGE);
    try {
      expect(pages.pageCount).toBe(1);
      expect(pages.container.querySelectorAll(".bc-print-frag").length).toBe(0);
      expect(pages.container.querySelector('[data-block-id="p-short"]')).not.toBeNull();
    } finally {
      pages.dispose();
    }
  });
});
