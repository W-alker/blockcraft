// packages/editor/framework/modules/pagination/export/print-paginator.spec.ts
import {
  buildPaginatedPrintSurface,
  buildPrintPages,
  captureStablePrintPlacementPlanes,
} from "./print-paginator";
import {BlockNodeType, IBlockSnapshot} from "../../../block-std/types/block.type";
import {PaginationConfig} from "../pagination.types";
import {resolveScreenGeometry} from '../view/pagination-geometry';
import {createStablePaginationLayout} from '../view/stable-pagination-layout';
import {planTableCellFlow} from '../engine/table-cell-flow';
import {setTableCellFlowPlan} from '../engine/table-cell-flow-metadata';
import {paginate} from '../engine';

function paragraph(id: string, text: string): IBlockSnapshot {
  return {id, flavour: "paragraph", nodeType: BlockNodeType.editable, meta: {}, props: {depth: 0}, children: [{insert: text}]};
}

function root(children: IBlockSnapshot[]): IBlockSnapshot {
  return {id: "root", flavour: "root", nodeType: BlockNodeType.root, meta: {}, props: {}, children};
}

function placementLayout(id: string, children: IBlockSnapshot[]): IBlockSnapshot {
  return {
    id,
    flavour: 'placement-layout',
    nodeType: BlockNodeType.block,
    meta: {},
    props: {},
    children,
  };
}

function absoluteShape(id: string, y: number): IBlockSnapshot {
  return {
    id,
    flavour: 'shape',
    nodeType: BlockNodeType.void,
    meta: {},
    props: {position: {x: 0, y}},
    children: [],
  };
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

function createPlacementRenderRoot(input: {
  id?: string;
  left: number;
  top: number;
  width: number;
  height: number;
}): {
  root: HTMLElement;
  plane: HTMLElement;
  block: HTMLElement;
} {
  const rootElement = document.createElement('div');
  rootElement.style.cssText =
    'position:absolute;left:-99999px;top:0;width:380px;min-height:200px;';
  const flow = document.createElement('div');
  flow.dataset['blockId'] = 'p1';
  flow.style.cssText = 'height:40px;margin:0;';
  rootElement.appendChild(flow);

  const plane = document.createElement('div');
  plane.dataset['blockId'] = 'placement';
  plane.setAttribute('data-bc-placement-layout', '');
  plane.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
  const content = document.createElement('div');
  content.className = 'children-render-container';
  content.style.cssText = 'position:relative;width:100%;height:0;';
  const block = document.createElement('div');
  block.dataset['blockId'] = input.id ?? 'shape';
  block.dataset['bcPlacement'] = 'absolute';
  block.style.cssText =
    `position:absolute;left:${input.left}px;top:${input.top}px;`
    + `width:${input.width}px;height:${input.height}px;margin:0;`;
  content.appendChild(block);
  plane.appendChild(content);
  rootElement.appendChild(plane);
  document.body.appendChild(rootElement);
  return {root: rootElement, plane, block};
}

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
      expect(content.style.overflow).toBe('visible');
      expect(content.style.clipPath).toBe('');
      expect(renderedCode.classList.contains('bc-page-height-locked')).toBeTrue();
      expect(renderedCode.style.maxHeight).toBe('');
      expect(renderedCode.style.overflow).toBe('');
    } finally {
      pages.dispose();
    }
  });

  it('constrains only an oversized image wrapper instead of zooming the block host', async () => {
    const imageSnapshot = root([{
      id: 'image-1',
      flavour: 'image',
      nodeType: BlockNodeType.block,
      meta: {},
      props: {},
      children: [],
    }]);
    const offscreen = document.createElement('div');
    const image = document.createElement('div');
    image.dataset['blockId'] = 'image-1';
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'img-wrapper';
    image.appendChild(imageWrapper);
    Object.defineProperty(image, 'offsetWidth', {value: 380});
    Object.defineProperty(image, 'scrollWidth', {value: 380});
    Object.defineProperty(image, 'offsetHeight', {value: 400});
    Object.defineProperty(image, 'scrollHeight', {value: 400});
    Object.defineProperties(imageWrapper, {
      offsetWidth: {value: 380},
      scrollWidth: {value: 380},
      offsetHeight: {value: 400},
      scrollHeight: {value: 400},
    });
    offscreen.appendChild(image);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(imageSnapshot, SMALL_PAGE, {
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const rendered = pages.pages[0]!.querySelector<HTMLElement>('[data-block-id="image-1"]')!;
      const renderedWrapper = rendered.querySelector<HTMLElement>('.img-wrapper')!;
      expect(rendered.classList.contains('bc-page-height-fitted')).toBeFalse();
      expect(rendered.style.getPropertyValue('--bc-page-fit-scale')).toBe('');
      expect(rendered.style.zoom).toBe('');
      expect(renderedWrapper.hasAttribute('data-bc-page-media-fitted')).toBeTrue();
      expect(renderedWrapper.style.maxWidth).toBe('190px');
      expect(renderedWrapper.style.maxHeight).toBe('200px');
    } finally {
      pages.dispose();
    }
  });

  it('does not fit or zoom a wide shape block', async () => {
    const snapshot = root([{
      id: 'embed-1',
      flavour: 'shape',
      nodeType: BlockNodeType.void,
      meta: {},
      props: {},
      children: [],
    }]);
    const offscreen = document.createElement('div');
    const embed = document.createElement('div');
    embed.dataset['blockId'] = 'embed-1';
    Object.defineProperty(embed, 'offsetWidth', {value: 760});
    Object.defineProperty(embed, 'scrollWidth', {value: 760});
    Object.defineProperty(embed, 'offsetHeight', {value: 80});
    Object.defineProperty(embed, 'scrollHeight', {value: 80});
    offscreen.appendChild(embed);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const rendered = pages.pages[0]!.querySelector<HTMLElement>('[data-block-id="embed-1"]')!;
      expect(rendered.classList.contains('bc-page-height-fitted')).toBeFalse();
      expect(rendered.style.getPropertyValue('--bc-page-fit-scale')).toBe('');
      expect(rendered.style.zoom).toBe('');
      expect(rendered.hasAttribute('data-bc-page-media-fitted')).toBeFalse();
    } finally {
      pages.dispose();
    }
  });

  it('does not fit an atomic block only because its editor caret extends scrollWidth', async () => {
    const snapshot = root([{
      id: 'kr-list-1',
      flavour: 'bookmark',
      nodeType: BlockNodeType.void,
      meta: {},
      props: {},
      children: [],
    }]);
    const offscreen = document.createElement('div');
    const krList = document.createElement('div');
    krList.dataset['blockId'] = 'kr-list-1';
    const trailingGap = document.createElement('span');
    trailingGap.setAttribute('data-block-zero-space', 'true');
    trailingGap.setAttribute('data-block-gap-side', 'after');
    krList.appendChild(trailingGap);
    Object.defineProperty(krList, 'offsetWidth', {value: 380});
    Object.defineProperty(krList, 'scrollWidth', {
      get: () => trailingGap.style.display === 'none' ? 380 : 382,
    });
    Object.defineProperty(krList, 'offsetHeight', {value: 80});
    Object.defineProperty(krList, 'scrollHeight', {value: 80});
    offscreen.appendChild(krList);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const rendered = pages.pages[0]!.querySelector<HTMLElement>('[data-block-id="kr-list-1"]')!;
      expect(rendered.classList.contains('bc-page-height-fitted')).toBeFalse();
      expect(
        rendered.querySelector<HTMLElement>('[data-block-zero-space="true"]')!.style.display,
      ).toBe('none');
    } finally {
      pages.dispose();
    }
  });

  it('validates a stable width-only fitted image using its constrained media height', async () => {
    const snapshot = root([{
      id: 'image-stable',
      flavour: 'image',
      nodeType: BlockNodeType.block,
      meta: {},
      props: {},
      children: [],
    }]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [{
      id: 'image-stable',
      height: 40,
      naturalHeight: 80,
      fitScale: 0.5,
      breakable: false,
      keepWithNext: false,
    }];
    const layout = createStablePaginationLayout(
      8,
      SMALL_PAGE,
      geometry,
      items,
      paginate(items, geometry.geometry),
    );
    const offscreen = document.createElement('div');
    const image = document.createElement('div');
    image.dataset['blockId'] = 'image-stable';
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'img-wrapper';
    image.appendChild(imageWrapper);
    Object.defineProperty(image, 'offsetWidth', {value: 760});
    Object.defineProperty(image, 'scrollWidth', {value: 760});
    Object.defineProperty(image, 'offsetHeight', {value: 80});
    Object.defineProperty(image, 'scrollHeight', {value: 80});
    Object.defineProperties(imageWrapper, {
      offsetWidth: {value: 760},
      scrollWidth: {value: 760},
      offsetHeight: {value: 80},
      scrollHeight: {value: 80},
    });
    offscreen.appendChild(image);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      resourcePolicy: 'strict',
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const rendered = pages.pages[0]!.querySelector<HTMLElement>('[data-block-id="image-stable"]')!;
      const renderedWrapper = rendered.querySelector<HTMLElement>('.img-wrapper')!;
      expect(rendered.classList.contains('bc-page-height-fitted')).toBeFalse();
      expect(rendered.style.getPropertyValue('--bc-page-fit-scale')).toBe('');
      expect(renderedWrapper.style.maxWidth).toBe('380px');
      expect(renderedWrapper.style.maxHeight).toBe('40px');
    } finally {
      pages.dispose();
    }
  });

  it('validates clipped atomic overflow using the same visual stride as live pagination', async () => {
    const snapshot = root([{
      id: 'clipped-atomic-stable',
      flavour: 'bookmark',
      nodeType: BlockNodeType.void,
      meta: {},
      props: {},
      children: [],
    }]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [{
      id: 'clipped-atomic-stable',
      height: 184,
      naturalHeight: 184,
      breakable: false,
      keepWithNext: false,
    }];
    const layout = createStablePaginationLayout(
      9,
      SMALL_PAGE,
      geometry,
      items,
      paginate(items, geometry.geometry),
    );
    const offscreen = document.createElement('div');
    const taskCard = document.createElement('div');
    taskCard.dataset['blockId'] = 'clipped-atomic-stable';
    taskCard.style.marginBottom = '8px';
    taskCard.style.overflow = 'hidden';
    Object.defineProperty(taskCard, 'offsetHeight', {value: 176});
    Object.defineProperty(taskCard, 'scrollHeight', {value: 180});
    offscreen.appendChild(taskCard);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      resourcePolicy: 'strict',
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      expect(pages.pageCount).toBe(1);
      expect(pages.pages[0]!.querySelector('[data-block-id="clipped-atomic-stable"]')).not.toBeNull();
    } finally {
      pages.dispose();
    }
  });

  it('validates visibly overflowing atomic content using its painted height', async () => {
    const snapshot = root([{
      id: 'visible-atomic-stable',
      flavour: 'bookmark',
      nodeType: BlockNodeType.void,
      meta: {},
      props: {},
      children: [],
    }]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [{
      id: 'visible-atomic-stable',
      height: 188,
      naturalHeight: 188,
      breakable: false,
      keepWithNext: false,
    }];
    const layout = createStablePaginationLayout(
      10,
      SMALL_PAGE,
      geometry,
      items,
      paginate(items, geometry.geometry),
    );
    const offscreen = document.createElement('div');
    const embed = document.createElement('div');
    embed.dataset['blockId'] = 'visible-atomic-stable';
    embed.style.marginBottom = '8px';
    embed.style.overflow = 'visible';
    Object.defineProperty(embed, 'offsetHeight', {value: 176});
    Object.defineProperty(embed, 'scrollHeight', {value: 180});
    offscreen.appendChild(embed);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      resourcePolicy: 'strict',
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      expect(pages.pageCount).toBe(1);
      expect(pages.pages[0]!.querySelector('[data-block-id="visible-atomic-stable"]')).not.toBeNull();
    } finally {
      pages.dispose();
    }
  });

  it('normalizes the readonly root tail before validating the captured block stride', async () => {
    const style = document.createElement('style');
    style.textContent = `
      [data-test-print-flow-root] > [data-block-id] {
        margin-bottom: 4px;
      }
      [data-test-print-flow-root] > [data-block-id]:last-child {
        margin-bottom: 0;
      }
    `;
    document.head.appendChild(style);

    const snapshot = root([{
      id: 'tail-task-card',
      // BlockCraft 基包用同样的 void/card 策略模拟宿主 task 业务块。
      flavour: 'bookmark',
      nodeType: BlockNodeType.void,
      meta: {},
      props: {},
      children: [],
    }]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [{
      id: 'tail-task-card',
      height: 188,
      naturalHeight: 188,
      trailingSpacing: 4,
      breakable: false,
      keepWithNext: false,
    }];
    const layout = createStablePaginationLayout(
      11,
      SMALL_PAGE,
      geometry,
      items,
      paginate(items, geometry.geometry),
    );
    const offscreen = document.createElement('div');
    offscreen.setAttribute('data-test-print-flow-root', '');
    // 模拟 provider 早期加过哨兵，后续又追加了业务块；统一入口必须把它重归一到末尾。
    const staleSentinel = document.createElement('span');
    staleSentinel.className = 'bc-print-flow-sentinel';
    offscreen.appendChild(staleSentinel);
    const taskCard = document.createElement('div');
    taskCard.dataset['blockId'] = 'tail-task-card';
    taskCard.style.overflow = 'hidden';
    Object.defineProperty(taskCard, 'offsetHeight', {value: 184});
    Object.defineProperty(taskCard, 'scrollHeight', {value: 184});
    offscreen.appendChild(taskCard);
    document.body.appendChild(offscreen);

    try {
      // 自定义 provider 返回的纯 root 会让末块命中 :last-child，尾距暂时为 0。
      expect(getComputedStyle(taskCard).marginBottom).toBe('0px');
      const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
        layout,
        resourcePolicy: 'strict',
        render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
      });
      try {
        expect(pages.pageCount).toBe(1);
        const rendered = pages.pages[0]!.querySelector<HTMLElement>(
          '[data-block-id="tail-task-card"]',
        )!;
        expect(rendered).not.toBeNull();
        expect(getComputedStyle(rendered).marginBottom).toBe('4px');
        expect(pages.pages[0]!.querySelectorAll('.bc-print-flow-sentinel').length).toBe(1);
      } finally {
        pages.dispose();
      }
    } finally {
      style.remove();
      offscreen.remove();
    }
  });

  it('preserves a zero stable tail after an oversized table instead of reviving the theme gap', async () => {
    const style = document.createElement('style');
    style.textContent = `
      [data-test-print-table-tail] > [data-block-id] {
        margin-bottom: 10px;
      }
      [data-test-print-table-tail] > [data-block-id]:last-child {
        margin-bottom: 0;
      }
    `;
    document.head.appendChild(style);

    const snapshot = root([
      table('long-table', 12),
      paragraph('terminal-paragraph', ''),
    ]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [{
      id: 'long-table',
      height: 500,
      trailingSpacing: 10,
      breakable: true,
      keepWithNext: false,
      splitOffsets: [200, 400],
      splitStartsNewPage: true,
    }, {
      id: 'terminal-paragraph',
      height: 24,
      trailingSpacing: 0,
      breakable: true,
      keepWithNext: false,
    }];
    const result = paginate(items, geometry.geometry);
    const layout = createStablePaginationLayout(
      12,
      SMALL_PAGE,
      geometry,
      items,
      result,
    );
    const offscreen = document.createElement('div');
    offscreen.setAttribute('data-test-print-table-tail', '');
    const tableElement = document.createElement('div');
    tableElement.dataset['blockId'] = 'long-table';
    Object.defineProperty(tableElement, 'offsetHeight', {value: 490});
    Object.defineProperty(tableElement, 'scrollHeight', {value: 490});
    offscreen.appendChild(tableElement);
    const terminal = document.createElement('div');
    terminal.dataset['blockId'] = 'terminal-paragraph';
    Object.defineProperty(terminal, 'offsetHeight', {value: 24});
    Object.defineProperty(terminal, 'scrollHeight', {value: 24});
    offscreen.appendChild(terminal);
    document.body.appendChild(offscreen);

    try {
      expect(getComputedStyle(terminal).marginBottom).toBe('0px');
      const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
        layout,
        resourcePolicy: 'strict',
        render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
      });
      try {
        expect(pages.pageCount).toBe(result.pages.length);
        const renderedTerminal = pages.container.querySelector<HTMLElement>(
          '[data-block-id="terminal-paragraph"]',
        )!;
        expect(renderedTerminal).not.toBeNull();
        expect(getComputedStyle(renderedTerminal).marginBottom).toBe('0px');
        expect(renderedTerminal.style.getPropertyPriority('margin-bottom')).toBe('important');
      } finally {
        pages.dispose();
      }
    } finally {
      style.remove();
      offscreen.remove();
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
      el.style.marginTop = '12px';
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
      expect(content!.getAttribute('data-bc-placement-container')).toBe('');
      expect(content!.style.top).toBe('10px');
      expect(content!.style.right).toBe('10px');
      expect(content!.style.bottom).toBe('10px');
      expect(content!.style.left).toBe('10px');
      expect(content!.style.width).toBe('auto');
      expect(content!.style.minWidth).toBe('0px');
      expect(content!.style.maxWidth).toBe('none');
      expect(content!.style.padding).toBe('0px');
      expect(content!.style.minHeight).toBe('0px');
      expect(content!.style.boxSizing).toBe('border-box');
      expect(content!.querySelector<HTMLElement>('[data-block-id="p1"]')!.style.marginTop).toBe('0px');
      expect(pages.pages[0]!.style.width).toBe('400px');
      expect(pages.pages[0]!.style.height).toBe('220px');
    } finally {
      pages.dispose();
    }
  });

  it('projects the tail placement layout through every page instead of moving it to the last slot page', async () => {
    const pageGap = 24;
    const pageStride = 220 + pageGap;
    const placement = placementLayout('placement', [
      absoluteShape('shape-first', 20),
      absoluteShape('shape-second', pageStride + 20),
    ]);
    const snapshot = root([
      paragraph('p1', 'first page'),
      paragraph('p2', 'second page'),
      placement,
    ]);
    const config: PaginationConfig = {
      ...SMALL_PAGE,
      pageGap,
    };
    const geometry = resolveScreenGeometry(config);
    const items = [
      {id: 'p1', height: CONTENT_HEIGHT, breakable: false, keepWithNext: false},
      {id: 'p2', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    // placement-layout 是 root 尾部零高节点，live result 会把它记录在末页；
    // 打印不能据此把整个 absolute 坐标平面搬到末页。
    const layout = createStablePaginationLayout(13, config, geometry, items, {
      pages: [
        {index: 0, usedHeight: CONTENT_HEIGHT, slots: [{id: 'p1'}]},
        {index: 1, usedHeight: 40, slots: [{id: 'p2'}, {id: 'placement'}]},
      ],
      byBlock: new Map([
        ['p1', {pageIndex: 0}],
        ['p2', {pageIndex: 1}],
        ['placement', {pageIndex: 1}],
      ]),
    });
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px;';
    const appendFlowBlock = (id: string, height: number) => {
      const element = document.createElement('div');
      element.dataset['blockId'] = id;
      element.style.cssText = `height:${height}px;margin:0;`;
      offscreen.appendChild(element);
    };
    appendFlowBlock('p1', CONTENT_HEIGHT);
    appendFlowBlock('p2', 40);
    const placementElement = document.createElement('div');
    placementElement.dataset['blockId'] = 'placement';
    placementElement.setAttribute('data-bc-placement-layer-bridge', '');
    placementElement.setAttribute('data-bc-placement-layout', '');
    placementElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
    const placementChildren = document.createElement('div');
    placementChildren.className = 'children-render-container';
    placementChildren.style.position = 'relative';
    for (const [id, top] of [['shape-first', 20], ['shape-second', pageStride + 20]] as const) {
      const child = document.createElement('div');
      child.dataset['blockId'] = id;
      child.dataset['bcPlacement'] = 'absolute';
      child.style.cssText = `position:absolute;top:${top}px;left:0;width:40px;height:20px;margin:0;`;
      placementChildren.appendChild(child);
    }
    placementElement.appendChild(placementChildren);
    offscreen.appendChild(placementElement);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const firstContent = pages.pages[0]!.querySelector<HTMLElement>('.bc-print-content')!;
      const secondContent = pages.pages[1]!.querySelector<HTMLElement>('.bc-print-content')!;
      const firstPlane = firstContent.querySelector<HTMLElement>('[data-bc-print-placement-plane="true"]')!;
      const secondPlane = secondContent.querySelector<HTMLElement>('[data-bc-print-placement-plane="true"]')!;

      expect(firstPlane).not.toBeNull();
      expect(secondPlane).not.toBeNull();
      expect(firstPlane.style.top).toBe('0px');
      expect(secondPlane.style.top).toBe(`-${pageStride}px`);
      expect(placementElement.parentElement).toBe(offscreen);

      const firstShape = firstPlane.querySelector<HTMLElement>('[data-block-id="shape-first"]')!;
      const secondShape = secondPlane.querySelector<HTMLElement>('[data-block-id="shape-second"]')!;
      expect(Math.round(firstShape.getBoundingClientRect().top - firstContent.getBoundingClientRect().top)).toBe(20);
      expect(Math.round(secondShape.getBoundingClientRect().top - secondContent.getBoundingClientRect().top)).toBe(20);
    } finally {
      pages.dispose();
    }
  });

  it('prints stable WordArt CSS text without measuring or moving its outer box', async () => {
    const pageGap = 24;
    const pageStride = 220 + pageGap;
    const wordArtY = pageStride + 20;
    const wordArt: IBlockSnapshot = {
      id: 'word-art',
      flavour: 'word-art',
      nodeType: BlockNodeType.editable,
      meta: {},
      props: {position: {x: 24, y: wordArtY}},
      children: [{insert: '非常帅气'}],
    };
    const placement = placementLayout('placement', [wordArt]);
    const snapshot = root([
      paragraph('p1', 'first page'),
      paragraph('p2', 'second page'),
      placement,
    ]);
    const config: PaginationConfig = {...SMALL_PAGE, pageGap};
    const geometry = resolveScreenGeometry(config);
    const items = [
      {id: 'p1', height: CONTENT_HEIGHT, breakable: false, keepWithNext: false},
      {id: 'p2', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(17, config, geometry, items, {
      pages: [
        {index: 0, usedHeight: CONTENT_HEIGHT, slots: [{id: 'p1'}]},
        {index: 1, usedHeight: 40, slots: [{id: 'p2'}, {id: 'placement'}]},
      ],
      byBlock: new Map([
        ['p1', {pageIndex: 0}],
        ['p2', {pageIndex: 1}],
        ['placement', {pageIndex: 1}],
      ]),
    });
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px;';
    for (const [id, height] of [['p1', CONTENT_HEIGHT], ['p2', 40]] as const) {
      const element = document.createElement('div');
      element.dataset['blockId'] = id;
      element.style.cssText = `height:${height}px;margin:0;`;
      offscreen.appendChild(element);
    }
    const placementElement = document.createElement('div');
    placementElement.dataset['blockId'] = 'placement';
    placementElement.setAttribute('data-bc-placement-layout', '');
    placementElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
    const placementChildren = document.createElement('div');
    placementChildren.className = 'children-render-container';
    placementChildren.style.cssText = 'position:relative;width:100%;';
    const wordArtHost = document.createElement('div');
    wordArtHost.dataset['blockId'] = 'word-art';
    wordArtHost.dataset['bcPlacement'] = 'absolute';
    wordArtHost.className = 'word-art-block';
    wordArtHost.style.cssText =
      `position:absolute;top:${wordArtY}px;left:24px;width:320px;height:96px;margin:0;`;
    const surface = document.createElement('div');
    surface.className = 'word-art-block__surface';
    surface.style.cssText =
      'display:flex;align-items:center;width:320px;height:96px;';
    const editor = document.createElement('div');
    editor.className = 'word-art-block__editor';
    editor.setAttribute('data-bc-word-art-print-props', JSON.stringify({
      fillType: 'linear-gradient',
      fillColor: '#f97316',
      gradientAngle: 180,
      gradientColors: ['#fde047', '#f97316', '#dc2626'],
      gradientStops: [0, 0.58, 1],
      outlineColor: '#9a3412',
      outlineWidthEm: 0.03,
      shadowEnabled: true,
      shadowColor: '#7c2d12',
      shadowOpacity: 0.3,
      shadowOffsetXEm: 0.08,
      shadowOffsetYEm: 0.12,
      shadowBlurEm: 0.04,
    }));
    editor.style.cssText = [
      'display:block',
      'box-sizing:border-box',
      'width:320px',
      'height:60px',
      'padding:4px 6px',
      'font-family:Arial,sans-serif',
      'font-size:48px',
      'font-weight:700',
      'line-height:1.1',
      'background-image:linear-gradient(180deg,#fde047 0%,#f97316 58%,#dc2626 100%)',
      'background-clip:text',
      '-webkit-background-clip:text',
      '-webkit-text-fill-color:transparent',
    ].join(';');
    editor.textContent = '非常帅气';
    surface.appendChild(editor);
    wordArtHost.appendChild(surface);
    placementChildren.appendChild(wordArtHost);
    placementElement.appendChild(placementChildren);
    offscreen.appendChild(placementElement);
    document.body.appendChild(offscreen);
    const rangeSpy = spyOn(document, 'createRange');

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const sourceSelector = '[data-bc-word-art-print-props]';

      // Source remains framework-owned and untouched; fixed copies reveal the same stable
      // CSS text node without another Range measurement.
      expect(offscreen.querySelector(sourceSelector)).toBe(editor);
      expect(pages.container.querySelectorAll(sourceSelector).length).toBe(pages.pageCount);
      expect(rangeSpy).not.toHaveBeenCalled();

      pages.pages.forEach((page, pageIndex) => {
        const plane = page.querySelector<HTMLElement>(
          '[data-bc-print-placement-plane="true"]',
        )!;
        const renderedHost = plane.querySelector<HTMLElement>(
          '[data-block-id="word-art"]',
        )!;
        const renderedText = renderedHost.querySelector<HTMLElement>(sourceSelector)!;
        const pageRect = page.getBoundingClientRect();
        const planeRect = plane.getBoundingClientRect();
        const hostRect = renderedHost.getBoundingClientRect();

        expect(renderedText.dataset['bcPrintWordArtCss']).toBe('true');
        expect(renderedText.style.backgroundImage).toContain('linear-gradient(');
        expect(renderedText.style.backgroundImage).toContain('rgb(253, 224, 71)');
        expect(renderedText.style.webkitTextFillColor).toBe('transparent');
        expect(renderedHost.style.top).toBe(`${wordArtY}px`);
        expect(renderedHost.style.left).toBe('24px');
        expect(hostRect.top - planeRect.top).toBeCloseTo(wordArtY, 1);
        expect(hostRect.left - pageRect.left).toBeCloseTo(10 + 24, 1);
        expect(hostRect.top - pageRect.top).toBeCloseTo(
          10 + wordArtY - pageIndex * pageStride,
          1,
        );
        expect(hostRect.width).toBeCloseTo(320, 1);
        expect(hostRect.height).toBeCloseTo(96, 1);
        expect(renderedText.offsetWidth).toBe(320);
        expect(renderedText.offsetHeight).toBe(60);
      });
    } finally {
      pages.dispose();
    }
  });

  it('keeps fixed root-px placement x coordinates with asymmetric margins', async () => {
    const config: PaginationConfig = {
      ...SMALL_PAGE,
      margins: {top: 10, right: 10, bottom: 10, left: 30},
    };
    const placement = placementLayout('placement', [absoluteShape('shape', 20)]);
    const snapshot = root([paragraph('p1', 'flow'), placement]);
    const geometry = resolveScreenGeometry(config);
    const items = [
      {id: 'p1', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = {
      ...createStablePaginationLayout(16, config, geometry, items, {
        pages: [{index: 0, usedHeight: 40, slots: [{id: 'p1'}, {id: 'placement'}]}],
        byBlock: new Map([
          ['p1', {pageIndex: 0}],
          ['placement', {pageIndex: 0}],
        ]),
      }),
      placementOriginX: 30,
      placementWidth: 360,
    };
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:360px;';
    const flow = document.createElement('div');
    flow.dataset['blockId'] = 'p1';
    flow.style.cssText = 'height:40px;margin:0;';
    offscreen.appendChild(flow);
    const placementElement = document.createElement('div');
    placementElement.dataset['blockId'] = 'placement';
    placementElement.setAttribute('data-bc-placement-layout', '');
    placementElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
    const placementChildren = document.createElement('div');
    placementChildren.className = 'children-render-container';
    placementChildren.style.cssText = 'position:relative;width:100%;';
    const shape = document.createElement('div');
    shape.dataset['blockId'] = 'shape';
    shape.dataset['bcPlacement'] = 'absolute';
    shape.style.cssText = 'position:absolute;left:200px;top:20px;width:20px;height:20px;margin:0;';
    placementChildren.appendChild(shape);
    placementElement.appendChild(placementChildren);
    offscreen.appendChild(placementElement);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const page = pages.pages[0]!;
      const plane = page.querySelector<HTMLElement>('[data-bc-print-placement-plane="true"]')!;
      const renderedShape = plane.querySelector<HTMLElement>('[data-block-id="shape"]')!;
      expect(plane.style.left).toBe('0px');
      expect(plane.style.right).toBe('auto');
      expect(plane.style.width).toBe('100%');
      expect(plane.style.height).toBe('0px');
      expect(plane.style.padding).toBe('0px');
      expect(renderedShape.style.left).toBe('200px');
      expect(Math.round(renderedShape.getBoundingClientRect().left - page.getBoundingClientRect().left)).toBe(230);
    } finally {
      pages.dispose();
    }
  });

  it('uses placement planes captured before the readonly root changes', async () => {
    const placement = placementLayout('placement', [absoluteShape('shape', 24)]);
    const snapshot = root([paragraph('p1', 'flow'), placement]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [
      {id: 'p1', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(19, SMALL_PAGE, geometry, items, {
      pages: [{
        index: 0,
        usedHeight: 40,
        slots: [{id: 'p1'}, {id: 'placement'}],
      }],
      byBlock: new Map([
        ['p1', {pageIndex: 0}],
        ['placement', {pageIndex: 0}],
      ]),
    });
    const render = createPlacementRenderRoot({
      left: 30,
      top: 24,
      width: 40,
      height: 20,
    });
    // 实际分页 root/plane 会用 padding 划出 380px content box；宿主显示层再整体缩放。
    render.root.style.width = '420px';
    render.root.style.boxSizing = 'border-box';
    render.root.style.padding = '12px 20px';
    render.plane.style.width = 'auto';
    render.plane.style.right = '0';
    render.plane.style.boxSizing = 'border-box';
    render.plane.style.padding = 'inherit';
    render.root.style.transform = 'scale(0.8, 0.65)';
    render.root.style.transformOrigin = '0 0';
    render.block.style.right = '10%';
    render.block.style.bottom = '5%';
    render.block.style.maxWidth = '100%';
    expect(render.plane.querySelector<HTMLElement>('.children-render-container')!.clientWidth)
      .toBe(380);
    const placementPlanes = captureStablePrintPlacementPlanes(render.root);
    const stableBlock = placementPlanes[0]!.element.querySelector<HTMLElement>(
      '[data-block-id="shape"]',
    )!;
    expect(stableBlock.style.right).toBe('auto');
    expect(stableBlock.style.bottom).toBe('auto');
    expect(stableBlock.style.maxWidth).toBe('none');

    // 模拟宿主在稳定捕获后关闭分页/重设 root，Angular live block 随之重新计算。
    render.block.style.left = '150px';
    render.block.style.top = '80px';
    render.block.style.width = '90px';
    render.block.style.height = '60px';

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      render: async () => ({
        root: render.root,
        placementPlanes,
        dispose: () => render.root.remove(),
      }),
    });
    try {
      const page = pages.pages[0]!;
      const content = page.querySelector<HTMLElement>('.bc-print-content')!;
      const plane = page.querySelector<HTMLElement>(
        '[data-bc-print-placement-plane="true"]',
      )!;
      const block = plane.querySelector<HTMLElement>('[data-block-id="shape"]')!;
      const projectedContent = plane.querySelector<HTMLElement>(
        '.children-render-container',
      )!;
      const blockRect = block.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();

      expect(blockRect.left - contentRect.left).toBeCloseTo(30, 1);
      expect(blockRect.top - contentRect.top).toBeCloseTo(24, 1);
      expect(blockRect.width).toBeCloseTo(40, 1);
      expect(blockRect.height).toBeCloseTo(20, 1);
      expect(plane.style.position).toBe('absolute');
      expect(plane.style.width).toBe('100%');
      expect(plane.style.height).toBe('0px');
      expect(projectedContent.style.position).toBe('relative');
      expect(projectedContent.style.width).toBe('100%');
      expect(projectedContent.style.height).toBe('0px');
      expect(projectedContent.style.transform).toBe('none');
      expect(render.block.style.left).toBe('150px');
    } finally {
      pages.dispose();
    }
  });

  it('projects an offscreen A4 plane through the canonical print content box', async () => {
    const firstPageExtraTop = 26.61;
    const config: PaginationConfig = {
      pageSize: 'A4',
      margins: {top: 72, right: 72, bottom: 72, left: 72},
    };
    const geometry = resolveScreenGeometry(config, {firstPageExtraTop});
    const contentWidth = geometry.sheetWidthPx
      - geometry.margins.left
      - geometry.margins.right;
    const placement = placementLayout('placement', [absoluteShape('shape', 24)]);
    const snapshot = root([paragraph('p1', 'flow'), placement]);
    const items = [
      {id: 'p1', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(21, config, geometry, items, {
      pages: [{
        index: 0,
        usedHeight: 40,
        slots: [{id: 'p1'}, {id: 'placement'}],
      }],
      byBlock: new Map([
        ['p1', {pageIndex: 0}],
        ['placement', {pageIndex: 0}],
      ]),
    });
    const render = createPlacementRenderRoot({
      left: 30,
      top: 24,
      width: 40,
      height: 20,
    });
    render.root.style.width = `${geometry.sheetWidthPx}px`;
    render.root.style.boxSizing = 'border-box';
    render.root.style.padding = `0 ${geometry.margins.right}px 0 ${geometry.margins.left}px`;
    render.plane.style.width = 'auto';
    render.plane.style.right = '0';
    render.plane.style.boxSizing = 'border-box';
    render.plane.style.padding = 'inherit';
    const placementPlanes = captureStablePrintPlacementPlanes(render.root);

    // 模拟 provider 捕获后关闭分页，并把只读 root 改成最终正文宽。
    render.root.style.width = `${contentWidth}px`;
    render.root.style.padding = '0';

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      resourcePolicy: 'strict',
      render: async () => ({
        root: render.root,
        placementPlanes,
        dispose: () => render.root.remove(),
      }),
    });
    try {
      const content = pages.pages[0]!.querySelector<HTMLElement>('.bc-print-content')!;
      const plane = content.querySelector<HTMLElement>(
        '[data-bc-print-placement-plane="true"]',
      )!;
      const placementContent = plane.querySelector<HTMLElement>(
        '.children-render-container',
      )!;
      const renderedShape = placementContent.querySelector<HTMLElement>(
        '[data-block-id="shape"]',
      )!;
      const planeRect = plane.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const pageRect = pages.pages[0]!.getBoundingClientRect();

      expect(pages.container.style.left).toBe('0px');
      expect(pages.container.style.visibility).toBe('hidden');
      expect(getComputedStyle(plane).zoom).toBe('1');
      expect(plane.offsetParent).toBe(content);
      expect(renderedShape.offsetParent).toBe(placementContent);
      expect(contentRect.top - pageRect.top).toBeCloseTo(72 + firstPageExtraTop, 1);
      expect(planeRect.left - contentRect.left).toBeCloseTo(0, 1);
      expect(planeRect.top - contentRect.top).toBeCloseTo(0, 1);
      expect(planeRect.width).toBeCloseTo(contentRect.width, 1);
    } finally {
      pages.dispose();
    }
  });

  it('rejects a stable placement snapshot whose internal visual surface drifted', async () => {
    const placement = placementLayout('placement', [absoluteShape('shape', 24)]);
    const snapshot = root([paragraph('p1', 'flow'), placement]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [
      {id: 'p1', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(20, SMALL_PAGE, geometry, items, {
      pages: [{
        index: 0,
        usedHeight: 40,
        slots: [{id: 'p1'}, {id: 'placement'}],
      }],
      byBlock: new Map([
        ['p1', {pageIndex: 0}],
        ['placement', {pageIndex: 0}],
      ]),
    });
    const render = createPlacementRenderRoot({
      left: 30,
      top: 24,
      width: 40,
      height: 20,
    });
    const surface = document.createElement('div');
    surface.setAttribute('data-bc-print-visual-surface', '');
    surface.style.cssText =
      'position:absolute;left:3px;top:2px;width:30px;height:12px;';
    render.block.appendChild(surface);
    const placementPlanes = captureStablePrintPlacementPlanes(render.root);
    const capturedSurface = placementPlanes[0]!.element.querySelector<HTMLElement>(
      '[data-bc-print-visual-surface]',
    )!;
    capturedSurface.style.setProperty('width', '60px', 'important');

    await expectAsync(buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      resourcePolicy: 'strict',
      render: async () => ({
        root: render.root,
        placementPlanes,
        dispose: () => render.root.remove(),
      }),
    })).toBeRejectedWith(jasmine.objectContaining({
      code: 'layout-diverged',
      message: jasmine.stringMatching('真实视觉面与稳定分页不一致'),
      context: jasmine.objectContaining({blockId: 'shape'}),
    }));
  });

  it('rejects a rotated placement coordinate context instead of inferring scale from its BCR', () => {
    const render = createPlacementRenderRoot({
      left: 30,
      top: 24,
      width: 40,
      height: 20,
    });
    render.root.style.transform = 'rotate(2deg)';
    try {
      let thrown: unknown;
      try {
        captureStablePrintPlacementPlanes(render.root);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toEqual(jasmine.objectContaining({
        code: 'layout-not-ready',
        context: jasmine.objectContaining({blockId: 'placement'}),
      }));
    } finally {
      render.root.remove();
    }
  });

  it('reports stable placement block drift as a best-effort warning', async () => {
    const placement = placementLayout('placement', [absoluteShape('shape', 24)]);
    const snapshot = root([paragraph('p1', 'flow'), placement]);
    const geometry = resolveScreenGeometry(SMALL_PAGE);
    const items = [
      {id: 'p1', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(21, SMALL_PAGE, geometry, items, {
      pages: [{
        index: 0,
        usedHeight: 40,
        slots: [{id: 'p1'}, {id: 'placement'}],
      }],
      byBlock: new Map([
        ['p1', {pageIndex: 0}],
        ['placement', {pageIndex: 0}],
      ]),
    });
    const render = createPlacementRenderRoot({
      left: 30,
      top: 24,
      width: 40,
      height: 20,
    });
    const placementPlanes = captureStablePrintPlacementPlanes(render.root);
    placementPlanes[0]!.element.querySelector<HTMLElement>(
      '[data-block-id="shape"]',
    )!.style.setProperty('height', '50px', 'important');

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      resourcePolicy: 'best-effort',
      render: async () => ({
        root: render.root,
        placementPlanes,
        dispose: () => render.root.remove(),
      }),
    });
    try {
      expect(pages.warnings).toContain(jasmine.objectContaining({
        code: 'layout-diverged',
        blockId: 'shape',
      }));
    } finally {
      pages.dispose();
    }
  });

  it('fails strict export when a non-empty placement layout is missing from the readonly DOM', async () => {
    const snapshot = root([
      paragraph('p1', 'flow'),
      placementLayout('placement', [absoluteShape('shape', 20)]),
    ]);
    const offscreen = document.createElement('div');
    const flow = document.createElement('div');
    flow.dataset['blockId'] = 'p1';
    flow.style.cssText = 'height:40px;margin:0;';
    offscreen.appendChild(flow);
    document.body.appendChild(offscreen);

    await expectAsync(buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      resourcePolicy: 'strict',
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    })).toBeRejectedWith(jasmine.objectContaining({
      code: 'layout-diverged',
      context: jasmine.objectContaining({blockId: 'placement'}),
    }));
  });

  it('does not fall back to a changed root when the stable plane set is incomplete', async () => {
    const snapshot = root([
      paragraph('p1', 'flow'),
      placementLayout('placement', [absoluteShape('shape', 24)]),
    ]);
    const render = createPlacementRenderRoot({
      left: 30,
      top: 24,
      width: 40,
      height: 20,
    });

    await expectAsync(buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      resourcePolicy: 'strict',
      render: async () => ({
        root: render.root,
        placementPlanes: [],
        dispose: () => render.root.remove(),
      }),
    })).toBeRejectedWith(jasmine.objectContaining({
      code: 'layout-diverged',
      context: jasmine.objectContaining({blockId: 'placement'}),
    }));
  });

  it('keeps the document-header leading offset in every placement-plane projection', async () => {
    const pageGap = 24;
    const firstPageExtraTop = 36;
    const pageStride = 220 + pageGap;
    const placement = placementLayout('placement', [absoluteShape('shape', 20)]);
    const snapshot = root([
      paragraph('p1', 'first page'),
      paragraph('p2', 'second page'),
      placement,
    ]);
    const config: PaginationConfig = {...SMALL_PAGE, pageGap};
    const geometry = resolveScreenGeometry(config, {firstPageExtraTop});
    const items = [
      {id: 'p1', height: CONTENT_HEIGHT - firstPageExtraTop, breakable: false, keepWithNext: false},
      {id: 'p2', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(14, config, geometry, items, {
      pages: [
        {index: 0, usedHeight: CONTENT_HEIGHT, slots: [{id: 'p1'}]},
        {index: 1, usedHeight: 40, slots: [{id: 'p2'}, {id: 'placement'}]},
      ],
      byBlock: new Map([
        ['p1', {pageIndex: 0}],
        ['p2', {pageIndex: 1}],
        ['placement', {pageIndex: 1}],
      ]),
    });
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px;';
    for (const [id, height] of [['p1', CONTENT_HEIGHT - firstPageExtraTop], ['p2', 40]] as const) {
      const element = document.createElement('div');
      element.dataset['blockId'] = id;
      element.style.cssText = `height:${height}px;margin:0;`;
      offscreen.appendChild(element);
    }
    const placementElement = document.createElement('div');
    placementElement.dataset['blockId'] = 'placement';
    placementElement.setAttribute('data-bc-placement-layout', '');
    placementElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
    offscreen.appendChild(placementElement);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const planes = pages.pages.map(page =>
        page.querySelector<HTMLElement>('[data-bc-print-placement-plane="true"]')!,
      );
      // stable geometry 已把首页 leading 放进 content.top；placement plane 不再重复加一次。
      expect(pages.pages[0]!.querySelector<HTMLElement>('.bc-print-content')!.style.top)
        .toBe(`${10 + firstPageExtraTop}px`);
      expect(planes[0]!.style.top).toBe('0px');
      expect(planes[1]!.style.top).toBe(`${firstPageExtraTop - pageStride}px`);
    } finally {
      pages.dispose();
    }
  });

  it('reuses a stable first-page layout and mounts host leading content without a synthetic block', async () => {
    const pageGap = 24;
    const headerHeight = 36;
    const headerGap = 16;
    const leadingHeight = headerHeight + headerGap;
    const pageStride = 220 + pageGap;
    const placement = placementLayout('placement', [absoluteShape('shape', 20)]);
    const snapshot = root([
      paragraph('p1', 'first page'),
      paragraph('p2', 'second page'),
      placement,
    ]);
    const config: PaginationConfig = {...SMALL_PAGE, pageGap};
    const geometry = resolveScreenGeometry(config);
    geometry.geometry.firstPageContentHeight = CONTENT_HEIGHT - leadingHeight;
    const items = [
      {id: 'p1', height: CONTENT_HEIGHT - leadingHeight, breakable: false, keepWithNext: false},
      {id: 'p2', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(
      15,
      config,
      geometry,
      items,
      paginate(items, geometry.geometry),
    );
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px;';
    const header = document.createElement('div');
    header.textContent = 'document header';
    Object.defineProperty(header, 'offsetHeight', {value: headerHeight});
    for (const [id, height] of [['p1', CONTENT_HEIGHT - leadingHeight], ['p2', 40]] as const) {
      const element = document.createElement('div');
      element.dataset['blockId'] = id;
      element.style.cssText = `height:${height}px;margin:0;`;
      offscreen.appendChild(element);
    }
    const placementElement = document.createElement('div');
    placementElement.dataset['blockId'] = 'placement';
    placementElement.setAttribute('data-bc-placement-layout', '');
    placementElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
    const shapeElement = document.createElement('div');
    shapeElement.dataset['blockId'] = 'shape';
    shapeElement.style.cssText =
      `position:absolute;top:${pageStride - leadingHeight + 20}px;left:0;width:10px;height:10px;`;
    placementElement.appendChild(shapeElement);
    offscreen.appendChild(placementElement);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({
        root: offscreen,
        dispose: () => offscreen.remove(),
        leadingContent: {element: header, gap: headerGap},
      }),
    });
    try {
      const contents = pages.pages.map(page => page.querySelector<HTMLElement>('.bc-print-content')!);
      const leadingHost = pages.pages[0]!.querySelector<HTMLElement>('.bc-print-leading-content')!;
      const planes = pages.pages.map(page =>
        page.querySelector<HTMLElement>('[data-bc-print-placement-plane="true"]')!,
      );
      expect(leadingHost.firstElementChild).toBe(header);
      expect(leadingHost.style.top).toBe('10px');
      expect(leadingHost.style.zIndex).toBe('2');
      expect(contents[0]!.style.top).toBe(`${10 + leadingHeight}px`);
      expect(contents[0]!.style.zIndex).toBe('1');
      expect(contents[1]!.contains(header)).toBeFalse();
      expect(header.style.margin).toBe('0px');
      expect(planes[0]!.style.top).toBe('0px');
      expect(planes[1]!.style.top).toBe(`${leadingHeight - pageStride}px`);
      const pageTwoShape = planes[1]!.querySelector<HTMLElement>('[data-block-id="shape"]')!;
      expect(Math.round(
        pageTwoShape.getBoundingClientRect().top
          - pages.pages[1]!.getBoundingClientRect().top,
      )).toBe(30);
    } finally {
      pages.dispose();
    }
  });

  it('rejects a readonly placement origin that diverges from the root content box', async () => {
    const pageGap = 24;
    const headerHeight = 36;
    const headerGap = 16;
    const leadingHeight = headerHeight + headerGap;
    const capturedOriginY = 34;
    const placement = placementLayout('placement', [absoluteShape('shape', 0)]);
    const snapshot = root([
      paragraph('p1', 'first page'),
      paragraph('p2', 'second page'),
      placement,
    ]);
    const config: PaginationConfig = {...SMALL_PAGE, pageGap};
    const geometry = resolveScreenGeometry(config);
    geometry.geometry.firstPageContentHeight = CONTENT_HEIGHT - leadingHeight;
    const items = [
      {id: 'p1', height: CONTENT_HEIGHT - leadingHeight, breakable: false, keepWithNext: false},
      {id: 'p2', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = createStablePaginationLayout(
      16,
      config,
      geometry,
      items,
      paginate(items, geometry.geometry),
    );
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px;';
    const header = document.createElement('div');
    Object.defineProperty(header, 'offsetHeight', {value: headerHeight});
    for (const [id, height] of [['p1', CONTENT_HEIGHT - leadingHeight], ['p2', 40]] as const) {
      const element = document.createElement('div');
      element.dataset['blockId'] = id;
      element.style.cssText = `height:${height}px;margin:0;`;
      offscreen.appendChild(element);
    }
    const placementElement = document.createElement('div');
    placementElement.dataset['blockId'] = 'placement';
    placementElement.setAttribute('data-bc-placement-layout', '');
    placementElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
    offscreen.appendChild(placementElement);
    document.body.appendChild(offscreen);

    await expectAsync(buildPaginatedPrintSurface(snapshot, config, {
      layout,
      resourcePolicy: 'strict',
      render: async () => ({
        root: offscreen,
        placementOriginY: capturedOriginY,
        leadingContent: {element: header, gap: headerGap},
        dispose: () => offscreen.remove(),
      }),
    })).toBeRejectedWith(jasmine.objectContaining({
      code: 'layout-diverged',
      message: jasmine.stringMatching('只读打印原点 Y'),
    }));
  });

  it('keeps model x/y relative to the canonical root content box', async () => {
    const pageGap = 24;
    const headerHeight = 36;
    const headerGap = 16;
    const leadingHeight = headerHeight + headerGap;
    const contentTop = 10;
    const liveFlowTop = contentTop + leadingHeight;
    const stablePlacementOriginY = liveFlowTop;
    const placementChildren: Array<{
      id: string;
      flavour: string;
      y: number;
    }> = [
      {id: 'shape-absolute', flavour: 'shape', y: 12},
      {id: 'word-art-absolute', flavour: 'word-art', y: 48},
      {id: 'image-absolute', flavour: 'image', y: 96},
    ];
    const placementSnapshots: IBlockSnapshot[] = [
      absoluteShape('shape-absolute', 12),
      {
        id: 'word-art-absolute',
        flavour: 'word-art',
        nodeType: BlockNodeType.editable,
        meta: {},
        props: {position: {x: 0, y: 48}},
        children: [{insert: 'WordArt'}],
      },
      {
        id: 'image-absolute',
        flavour: 'image',
        nodeType: BlockNodeType.block,
        meta: {},
        props: {position: {x: 0, y: 96}},
        children: [],
      },
    ];
    const placement = placementLayout('placement', placementSnapshots);
    const snapshot = root([paragraph('p1', 'first page'), placement]);
    const config: PaginationConfig = {...SMALL_PAGE, pageGap};
    const geometry = resolveScreenGeometry(config);
    geometry.geometry.firstPageContentHeight = CONTENT_HEIGHT - leadingHeight;
    const items = [
      {id: 'p1', height: 40, breakable: false, keepWithNext: false},
      {id: 'placement', height: 0, breakable: false, keepWithNext: false},
    ];
    const layout = {
      ...createStablePaginationLayout(18, config, geometry, items, {
        pages: [{
          index: 0,
          usedHeight: 40,
          slots: [{id: 'p1'}, {id: 'placement'}],
        }],
        byBlock: new Map([
          ['p1', {pageIndex: 0}],
          ['placement', {pageIndex: 0}],
        ]),
      }),
      placementOriginY: stablePlacementOriginY,
    };

    for (const providerPlacementOriginY of [undefined]) {
      const context = 'provider without placement origin';
      const offscreen = document.createElement('div');
      offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px;';
      const flow = document.createElement('div');
      flow.dataset['blockId'] = 'p1';
      flow.style.cssText = 'height:40px;margin:0;';
      offscreen.appendChild(flow);
      const placementElement = document.createElement('div');
      placementElement.dataset['blockId'] = 'placement';
      placementElement.setAttribute('data-bc-placement-layout', '');
      placementElement.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:0;margin:0;';
      const placementContainer = document.createElement('div');
      placementContainer.className = 'children-render-container';
      placementContainer.style.cssText = 'position:relative;width:100%;';
      for (const child of placementChildren) {
        const host = document.createElement('div');
        host.dataset['blockId'] = child.id;
        host.dataset['bcPlacement'] = 'absolute';
        host.className = `${child.flavour}-block`;
        host.style.cssText =
          `position:absolute;top:${child.y}px;left:20px;width:40px;height:20px;margin:0;`;
        placementContainer.appendChild(host);
      }
      placementElement.appendChild(placementContainer);
      offscreen.appendChild(placementElement);
      document.body.appendChild(offscreen);

      const pages = await buildPaginatedPrintSurface(snapshot, config, {
        layout,
        render: async () => ({
          root: offscreen,
          ...(providerPlacementOriginY == null ? {} : {placementOriginY: providerPlacementOriginY}),
          dispose: () => offscreen.remove(),
        }),
      });
      try {
        const page = pages.pages[0]!;
        const pageRect = page.getBoundingClientRect();
        const renderedFlow = page.querySelector<HTMLElement>('[data-block-id="p1"]')!;
        const flowTop = renderedFlow.getBoundingClientRect().top - pageRect.top;

        expect(page.querySelector('.bc-print-leading-content'))
          .withContext(context)
          .toBeNull();
        expect(page.querySelector<HTMLElement>('.bc-print-content')!.style.top)
          .withContext(context)
          .toBe(`${liveFlowTop}px`);
        expect(flowTop)
          .withContext(context)
          .toBeCloseTo(liveFlowTop, 1);

        for (const child of placementChildren) {
          const rendered = page.querySelector<HTMLElement>(
            `[data-block-id="${child.id}"]`,
          )!;
          const renderedTop = rendered.getBoundingClientRect().top - pageRect.top;
          const liveTop = stablePlacementOriginY + child.y;

          expect(rendered.style.top)
            .withContext(`${context}: ${child.flavour} keeps model y`)
            .toBe(`${child.y}px`);
          expect(renderedTop)
            .withContext(`${context}: ${child.flavour} keeps live sheet top`)
            .toBeCloseTo(liveTop, 1);
          expect(renderedTop - flowTop)
            .withContext(`${context}: ${child.flavour} keeps live flow delta`)
            .toBeCloseTo(liveTop - liveFlowTop, 1);
        }
      } finally {
        pages.dispose();
      }
    }
  });

  it('prints independent chrome distances and styled page-number tokens with live geometry', async () => {
    const snapshot = root([paragraph('p1', 'first')]);
    const config: PaginationConfig = {
      pageSize: {width: 800, height: 1000},
      margins: {top: 72, right: 72, bottom: 72, left: 72},
      header: {center: '{page:roman-upper}', height: 24, distance: 48},
      footer: {right: '第 {page:chinese} 页 共 {total:chinese} 页', height: 24, distance: 36},
    };
    const layout = createStablePaginationLayout(12, config, resolveScreenGeometry(config), [{
      id: 'p1', height: 40, breakable: false, keepWithNext: false,
    }], {
      pages: [{index: 0, usedHeight: 40, slots: [{id: 'p1'}]}],
      byBlock: new Map([['p1', {pageIndex: 0}]]),
    });
    const offscreen = document.createElement('div');
    const paragraphElement = document.createElement('div');
    paragraphElement.dataset['blockId'] = 'p1';
    paragraphElement.style.height = '40px';
    offscreen.appendChild(paragraphElement);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const page = pages.pages[0]!;
      const chrome = page.querySelectorAll<HTMLElement>('.bc-print-chrome');
      const content = page.querySelector<HTMLElement>('.bc-print-content')!;

      expect(chrome[0]!.style.top).toBe('48px');
      expect(chrome[0]!.children[1]?.textContent).toBe('I');
      expect(chrome[1]!.style.top).toBe('940px');
      expect(chrome[1]!.children[2]?.textContent).toBe('第 一 页 共 一 页');
      expect(content.style.top).toBe('72px');
      expect(content.style.bottom).toBe('72px');
    } finally {
      pages.dispose();
    }
  });

  it('prints structured brand chrome with the same token and separator contract', async () => {
    const snapshot = root([paragraph('p1', 'first')]);
    const config: PaginationConfig = {
      pageSize: {width: 800, height: 1000},
      margins: {top: 72, right: 72, bottom: 72, left: 72},
      footer: {
        height: 28,
        distance: 36,
        separator: 'top',
        content: {
          left: {
            items: [
              {
                kind: 'image',
                src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                height: 20,
                maxWidth: 28,
              },
              {kind: 'text', text: '品牌'},
              {kind: 'text', text: '@CSES', tone: 'muted'},
            ],
          },
          center: {items: [{kind: 'text', text: '{page} / {total}'}]},
        },
        right: '2026-08-09',
      },
    };
    const layout = createStablePaginationLayout(13, config, resolveScreenGeometry(config), [{
      id: 'p1', height: 40, breakable: false, keepWithNext: false,
    }], {
      pages: [{index: 0, usedHeight: 40, slots: [{id: 'p1'}]}],
      byBlock: new Map([['p1', {pageIndex: 0}]]),
    });
    const offscreen = document.createElement('div');
    const paragraphElement = document.createElement('div');
    paragraphElement.dataset['blockId'] = 'p1';
    paragraphElement.style.height = '40px';
    offscreen.appendChild(paragraphElement);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, config, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      const footer = pages.pages[0]!.querySelector<HTMLElement>('.bc-print-chrome')!;
      expect(footer.classList).toContain('bc-page-chrome--separator-top');
      expect(footer.querySelector('.bc-page-chrome-left')!.textContent).toBe('品牌@CSES');
      expect(footer.querySelector('.bc-page-chrome-center')!.textContent).toBe('1 / 1');
      expect(footer.querySelector('.bc-page-chrome-right')!.textContent).toBe('2026-08-09');
      expect(footer.querySelector('img')?.getAttribute('src')).toContain('data:image/png');
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

  it('打印复用超高单元格 flow plan，并把错位列压缩到相同片段边界', async () => {
    const snapshot = root([table('flow-table', 1)]);
    const plan = planTableCellFlow([{
      kind: 'cell-flow',
      rowId: 'flow-table-r0',
      cells: [
        {
          cellId: 'flow-table-r0-c1',
          points: [
            {offset: 180, anchor: {kind: 'block', blockId: 'left-2'}},
            {offset: 360, anchor: {kind: 'cell-end'}},
          ],
        },
        {
          cellId: 'flow-table-r0-c2',
          points: [
            {offset: 120, anchor: {kind: 'block', blockId: 'right-2'}},
            {offset: 300, anchor: {kind: 'block', blockId: 'right-3'}},
            {offset: 480, anchor: {kind: 'cell-end'}},
          ],
        },
      ],
    }], CONTENT_HEIGHT);
    expect(plan.paginationHeight).toBe(540);

    const item = {
      id: 'flow-table',
      height: plan.paginationHeight,
      breakable: true,
      keepWithNext: false,
      splitStartsNewPage: true,
      splitOffsets: plan.splitOffsets,
    };
    setTableCellFlowPlan(item, plan);
    const result = {
      pages: [
        {index: 0, usedHeight: 180, slots: [{id: 'flow-table', fragment: {fromOffset: 0, toOffset: 180}}]},
        {index: 1, usedHeight: 180, slots: [{id: 'flow-table', fragment: {fromOffset: 180, toOffset: 360}}]},
        {index: 2, usedHeight: 180, slots: [{id: 'flow-table', fragment: {fromOffset: 360, toOffset: 540}}]},
      ],
      byBlock: new Map([['flow-table', {pageIndex: 0}]]),
    };
    const layout = createStablePaginationLayout(
      11,
      SMALL_PAGE,
      resolveScreenGeometry(SMALL_PAGE),
      [item],
      result,
    );

    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;';
    const host = document.createElement('div');
    host.dataset['blockId'] = 'flow-table';
    const tableElement = document.createElement('table');
    tableElement.style.cssText = 'border-collapse:collapse;border-spacing:0;';
    const tr = document.createElement('tr');
    const makeCell = (id: string, blocks: Array<[string, number]>) => {
      const td = document.createElement('td');
      td.dataset['blockId'] = id;
      td.style.cssText = 'padding:0;vertical-align:top;border:0;';
      const wrapper = document.createElement('div');
      wrapper.className = 'table-cell__children-wrapper';
      for (const [blockId, height] of blocks) {
        const block = document.createElement('div');
        block.dataset['blockId'] = blockId;
        block.style.height = `${height}px`;
        wrapper.appendChild(block);
      }
      td.appendChild(wrapper);
      return td;
    };
    tr.append(
      makeCell('flow-table-r0-c1', [['left-1', 180], ['left-2', 180]]),
      makeCell('flow-table-r0-c2', [['right-1', 120], ['right-2', 180], ['right-3', 180]]),
    );
    tableElement.appendChild(tr);
    host.appendChild(tableElement);
    offscreen.appendChild(host);
    document.body.appendChild(offscreen);

    const pages = await buildPaginatedPrintSurface(snapshot, SMALL_PAGE, {
      layout,
      render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
    });
    try {
      expect(pages.pageCount).toBe(3);
      const fragments = Array.from(pages.container.querySelectorAll<HTMLElement>('.bc-print-frag'));
      expect(fragments.map(fragment => fragment.offsetHeight)).toEqual([180, 180, 180]);
      expect(fragments.every(fragment =>
        fragment.querySelector('[data-bc-print-cell-flow-pad="true"]') !== null,
      )).toBeTrue();
      expect(pages.container.querySelectorAll('.bc-print-table-flow-edge--top').length).toBe(2);
      expect(pages.container.querySelectorAll('.bc-print-table-flow-edge--bottom').length).toBe(2);
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
