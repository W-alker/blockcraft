// packages/editor/framework/modules/pagination/view/split-points.spec.ts
import {
  computeSplitOffsets,
  computeTableSplitOffsets,
  excludeCutsInsideVerticalBands,
  rowSplitOffsets,
  widowOrphanCuts,
} from "./split-points";

describe('split-points - widowOrphanCuts (纯逻辑)', () => {
  const bottoms = (n: number, step = 20) => Array.from({length: n}, (_, i) => (i + 1) * step);

  it('默认 minLines=2：10 行 → 第 2..8 行底边（下标 1..7）', () => {
    expect(widowOrphanCuts(bottoms(10), 2)).toEqual([40, 60, 80, 100, 120, 140, 160]);
  });

  it('minLines=1：5 行 → 第 1..4 行底边（下标 0..3）', () => {
    expect(widowOrphanCuts(bottoms(5), 1)).toEqual([20, 40, 60, 80]);
  });

  it('行数不足两侧最小行 → 空', () => {
    expect(widowOrphanCuts(bottoms(3), 2)).toEqual([]); // 3 < 2*2
    expect(widowOrphanCuts(bottoms(4), 2)).toEqual([40]); // 恰好 4 = 2*2 → 仅中间一刀
    expect(widowOrphanCuts([], 2)).toEqual([]);
  });

  it('永不返回末行底边（块内容底，非内部切点）', () => {
    const b = bottoms(6); // [20..120]
    const cuts = widowOrphanCuts(b, 2);
    expect(cuts).not.toContain(120);
    expect(Math.max(...cuts)).toBeLessThan(120);
  });

  it('过滤掉 ≤0 的偏移', () => {
    // L=6, minLines=2 → 取下标 1..3 = [0, 30, 60]，再丢掉 ≤0 的 0 → [30, 60]。
    expect(widowOrphanCuts([-5, 0, 30, 60, 90, 120], 2)).toEqual([30, 60]);
  });
});

describe('split-points - rowSplitOffsets (rowspan 感知，纯逻辑)', () => {
  const bottoms = (n: number, step = 30) => Array.from({length: n}, (_, i) => (i + 1) * step);
  const noCover = (n: number) => new Array(n).fill(false);

  it('coveredFromAbove 全 false 时等价 widowOrphanCuts', () => {
    const b = bottoms(8);
    expect(rowSplitOffsets(b, noCover(8), 2)).toEqual(widowOrphanCuts(b, 2));
  });

  it('跳过被 rowspan 跨越的边界', () => {
    // 8 行；行3 被上方 rowspan 覆盖 → 边界3（行2底=90）不可切。
    const b = bottoms(8); // [30,60,90,120,150,180,210,240]
    const covered = noCover(8);
    covered[3] = true;
    // widow/orphan(2) 正常取边界 2..6（下标 1..5）= [60,90,120,150,180]；剔除边界3(90)
    expect(rowSplitOffsets(b, covered, 2)).toEqual([60, 120, 150, 180]);
  });

  it('多个 rowspan 覆盖多个边界全部剔除', () => {
    const b = bottoms(8);
    const covered = noCover(8);
    covered[2] = true; // 边界2(60)
    covered[4] = true; // 边界4(120)
    expect(rowSplitOffsets(b, covered, 2)).toEqual([90, 150, 180]);
  });

  it('所有内部边界都被覆盖 → 无切点（整表不可拆）', () => {
    const b = bottoms(6);
    const covered = [false, true, true, true, true, true]; // 一个跨全表的合并单元格
    expect(rowSplitOffsets(b, covered, 2)).toEqual([]);
  });
});

describe('split-points - 环绕对象不可切区间（纯逻辑）', () => {
  it('只排除区间内部切点，区间前后与上下边界仍允许', () => {
    expect(excludeCutsInsideVerticalBands(
      [20, 40, 60, 80, 100],
      [{top: 40, bottom: 80}],
    )).toEqual([20, 40, 80, 100]);
  });

  it('忽略无效区间并保留普通段落切点', () => {
    expect(excludeCutsInsideVerticalBands(
      [20, 40, 60],
      [
        {top: Number.NaN, bottom: 50},
        {top: 80, bottom: 40},
      ],
    )).toEqual([20, 40, 60]);
  });
});

/**
 * 真实 DOM 测量（karma headless）。用 white-space:pre + 换行文本造确定行数的行盒，
 * getClientRects() 对每行返回一个文本行盒。字号断言不可靠（字形盒受 leading 影响），
 * 故只断言结构性质：切点数量（widow/orphan 正确）、严格升序、落在 (0, 块高) 内。
 */
function mountLines(count: number, lineHeight: number): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText =
    `position:absolute; left:0; top:0; margin:0; border:0; padding:0;` +
    `white-space:pre; line-height:${lineHeight}px; font-size:${Math.round(lineHeight * 0.7)}px;`;
  host.textContent = Array.from({length: count}, (_, i) => `line ${i}`).join('\n');
  document.body.appendChild(host);
  return host;
}

function mountTable(rows: number, rowHeight: number): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `position:absolute; left:0; top:0; margin:0; border:0;`;
  const table = document.createElement('table');
  table.style.cssText = `border-collapse:collapse;`;
  const tbody = document.createElement('tbody');
  for (let i = 0; i < rows; i++) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.style.cssText = `height:${rowHeight}px; padding:0; line-height:${rowHeight}px;`;
    td.textContent = `row ${i}`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  host.appendChild(table);
  document.body.appendChild(host);
  return host;
}

/**
 * 2 列表格；行 `rowspanAt`（0 基）的首列单元格 rowspan=`span`，被覆盖的后续行省略首列 td。
 * `mergeHasContent`：合并单元格是否带内容（默认带）。带内容的合并不可拆 → all 剔除其内部边界；空合并可拆。
 */
function mountTableWithRowspan(rowCount: number, rowHeight: number, rowspanAt: number, span: number, mergeHasContent = true): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `position:absolute; left:0; top:0; margin:0; border:0;`;
  const table = document.createElement('table');
  table.style.cssText = `border-collapse:collapse;`;
  const tbody = document.createElement('tbody');
  for (let i = 0; i < rowCount; i++) {
    const tr = document.createElement('tr');
    const coveredByRowspan = i > rowspanAt && i < rowspanAt + span;
    if (!coveredByRowspan) {
      const td0 = document.createElement('td');
      td0.style.cssText = `height:${rowHeight}px; padding:0; line-height:${rowHeight}px;`;
      if (i === rowspanAt) td0.setAttribute('rowspan', `${span}`);
      // 合并源单元格按 mergeHasContent 决定带内容与否；其余首列单元格照常带内容。
      td0.textContent = (i === rowspanAt && !mergeHasContent) ? '' : `r${i}c0`;
      tr.appendChild(td0);
    }
    const td1 = document.createElement('td');
    td1.style.cssText = `height:${rowHeight}px; padding:0; line-height:${rowHeight}px;`;
    td1.textContent = `r${i}c1`;
    tr.appendChild(td1);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  host.appendChild(table);
  document.body.appendChild(host);
  return host;
}

function assertCuts(host: HTMLElement, offsets: number[], expectedCount: number): void {
  const h = host.offsetHeight;
  expect(offsets.length).toBe(expectedCount);
  for (let i = 0; i < offsets.length; i++) {
    expect(offsets[i]).toBeGreaterThan(0);
    expect(offsets[i]).toBeLessThan(h);
    if (i > 0) expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
  }
}

describe('split-points - computeSplitOffsets (真实 DOM)', () => {
  let hosts: HTMLElement[] = [];
  const track = (h: HTMLElement) => (hosts.push(h), h);
  afterEach(() => {
    hosts.forEach(h => h.remove());
    hosts = [];
  });

  it('段落 10 行（默认 widow/orphan 2）→ 7 个内部切点', () => {
    const host = track(mountLines(10, 20));
    assertCuts(host, computeSplitOffsets(host, 'paragraph'), 7); // 10 - 3
  });

  it('段落 widowOrphanLines=1，5 行 → 4 个切点', () => {
    const host = track(mountLines(5, 20));
    assertCuts(host, computeSplitOffsets(host, 'paragraph', {widowOrphanLines: 1}), 4);
  });

  it('行数不足 → 无切点', () => {
    const host = track(mountLines(3, 20));
    expect(computeSplitOffsets(host, 'paragraph')).toEqual([]);
  });

  it('空块 → 无切点', () => {
    const host = track(mountLines(0, 20));
    expect(computeSplitOffsets(host, 'paragraph')).toEqual([]);
  });

  it('双侧环绕 fragment group 内部不可切，但 group 上下边界仍允许', () => {
    const host = track(mountLines(10, 20));
    const baseline = computeSplitOffsets(host, 'paragraph');
    const top = baseline[2];
    const bottom = baseline[4];
    const group = document.createElement('span');
    group.setAttribute('data-bc-inline-fragment-group', '');
    group.style.cssText =
      `position:absolute;left:0;top:${top}px;width:10px;height:${bottom - top}px;`;
    host.appendChild(group);

    expect(computeSplitOffsets(host, 'paragraph')).toEqual(
      baseline.filter(cut => cut <= top || cut >= bottom),
    );
    expect(computeSplitOffsets(host, 'paragraph')).toContain(top);
    expect(computeSplitOffsets(host, 'paragraph')).toContain(bottom);
  });

  it('单侧 wrap shell 的排除带含 gap，不只是 frame 高度', () => {
    const host = track(mountLines(10, 20));
    const baseline = computeSplitOffsets(host, 'paragraph');
    const top = baseline[1];
    const frameBottom = baseline[4];
    const shellBottom = baseline[5];
    const shell = document.createElement('span');
    shell.setAttribute('data-bc-inline-float', '');
    shell.setAttribute('data-bc-inline-float-layout', 'wrap');
    shell.style.cssText =
      `position:absolute;left:0;top:${top}px;width:10px;` +
      `height:${shellBottom - top}px;`;
    const frame = document.createElement('span');
    frame.setAttribute('data-bc-inline-float-frame', '');
    frame.style.cssText =
      `position:absolute;left:0;top:0;width:10px;height:${frameBottom - top}px;`;
    shell.appendChild(frame);
    host.appendChild(shell);

    expect(computeSplitOffsets(host, 'paragraph')).toEqual(
      baseline.filter(cut => cut <= top || cut >= shellBottom),
    );
    expect(computeSplitOffsets(host, 'paragraph')).toContain(top);
    expect(computeSplitOffsets(host, 'paragraph')).toContain(shellBottom);
    expect(computeSplitOffsets(host, 'paragraph')).not.toContain(frameBottom);
  });

  it('table 按 <tr> 切（8 行，widow/orphan 2）→ 5 个切点', () => {
    const host = track(mountTable(8, 30));
    assertCuts(host, computeSplitOffsets(host, 'table'), 5); // 8 - 3
  });

  it('table 含**带内容**合并单元格：all 也剔除其内部边界（不可拆 → keep-together）', () => {
    // 8 行、行高 30；行2 首列 rowspan=2（带内容，覆盖行3）→ 边界3（行2底=90）跨带内容合并单元格。
    // 带内容合并不可跨页拆（内容流不进空续段、必溢出）→ all 与 preferred 都剔除 90。
    const host = track(mountTableWithRowspan(8, 30, 2, 2, true));
    const {all, preferred} = computeTableSplitOffsets(host);
    expect(all).not.toContain(90);        // 带内容合并内部不可断
    expect(all.length).toBe(4);           // 5 − 1（剔除 90）
    expect(preferred).not.toContain(90);  // 干净边界同样剔除
    expect(preferred.length).toBe(4);
  });

  it('table 含**空**合并单元格：all 含其内部边界（可拆，续段为空不溢出），preferred 不含', () => {
    // 同结构但合并源为空 → all 保留 90（空合并可拆）；preferred 仍剔除 90（优先干净边界）。
    const host = track(mountTableWithRowspan(8, 30, 2, 2, false));
    const {all, preferred} = computeTableSplitOffsets(host);
    expect(all).toContain(90);            // 空合并内部可断
    expect(all.length).toBe(5);
    expect(preferred).not.toContain(90);
    expect(preferred.length).toBe(4);
  });
});
