import {
  cloneTableCellFlowPlan,
  planTableCellFlow,
  TableCellFlowPlanningError,
  TableFlowRowInput,
} from "./table-cell-flow";

function tallRow(
  rowId: string,
  cells: Array<{cellId: string; points: number[]}>,
): TableFlowRowInput {
  return {
    kind: "cell-flow",
    rowId,
    cells: cells.map(cell => ({
      cellId: cell.cellId,
      points: cell.points.map((offset, index) => ({
        offset,
        anchor: index === cell.points.length - 1
          ? {kind: "cell-end" as const}
          : {kind: "text" as const, blockId: `${cell.cellId}-p`, offset: index + 1},
      })),
    })),
  };
}

describe("planTableCellFlow", () => {
  it("同一超高单元格按安全锚点连续分页", () => {
    const plan = planTableCellFlow([tallRow("r1", [{cellId: "c1", points: [80, 160, 240]}])], 100);

    expect(plan.paginationHeight).toBe(240);
    expect(plan.splitOffsets).toEqual([80, 160]);
    expect(plan.segments.map(segment => segment.height)).toEqual([80, 80, 80]);
    expect(plan.segments[0].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [{cellId: "c1", anchor: {kind: "text", blockId: "c1-p", offset: 1}, pageOffset: 80}],
    });
  });

  it("文字切点用 requiredTail 推进虚拟页面，但 continuation 保留真实锚点偏移", () => {
    const plan = planTableCellFlow([{
      kind: "cell-flow",
      rowId: "r1",
      cells: [{
        cellId: "c1",
        points: [
          {
            offset: 80,
            requiredTail: 20,
            anchor: {kind: "text", blockId: "p1", offset: 8},
          },
          {
            offset: 160,
            requiredTail: 20,
            anchor: {kind: "text", blockId: "p1", offset: 16},
          },
          {offset: 240, anchor: {kind: "cell-end"}},
        ],
      }],
    }], 100);

    expect(plan.segments.map(segment => segment.height)).toEqual([100, 100, 80]);
    expect(plan.paginationHeight).toBe(280);
    expect(plan.splitOffsets).toEqual([100, 200]);
    expect(plan.segments[0].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [{
        cellId: "c1",
        anchor: {kind: "text", blockId: "p1", offset: 8},
        pageOffset: 80,
      }],
    });
    expect(plan.segments[1].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [{
        cellId: "c1",
        anchor: {kind: "text", blockId: "p1", offset: 16},
        pageOffset: 80,
      }],
    });

    const cloned = cloneTableCellFlowPlan(plan);
    expect(cloned).toEqual(plan);
    expect(cloned).not.toBe(plan);
    expect(cloned.segments[0]).not.toBe(plan.segments[0]);
    expect(cloned.segments[0].breakAfter).not.toBe(plan.segments[0].breakAfter);
  });

  it("保护带容不下文字切点时仍可选择后续完整 cell-end", () => {
    const plan = planTableCellFlow([{
      kind: "cell-flow",
      rowId: "r1",
      cells: [{
        cellId: "c1",
        points: [
          {
            offset: 90,
            requiredTail: 20,
            anchor: {kind: "text", blockId: "p1", offset: 9},
          },
          {offset: 100, anchor: {kind: "cell-end"}},
        ],
      }],
    }], 100);

    expect(plan.segments).toEqual([{
      fromOffset: 0,
      toOffset: 100,
      height: 100,
    }]);
    expect(plan.splitOffsets).toEqual([]);
  });

  it("不同单元格可选择不同高度的安全锚点，并以最深内容决定当前片段高度", () => {
    const plan = planTableCellFlow([
      tallRow("r1", [
        {cellId: "left", points: [80, 160, 240]},
        {cellId: "right", points: [60, 120, 180]},
      ]),
    ], 100);

    expect(plan.segments.map(segment => segment.height)).toEqual([80, 80, 80]);
    expect(plan.segments[0].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [
        {cellId: "left", anchor: {kind: "text", blockId: "left-p", offset: 1}, pageOffset: 80},
        {cellId: "right", anchor: {kind: "text", blockId: "right-p", offset: 1}, pageOffset: 60},
      ],
    });
    expect(plan.segments[1].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [
        {cellId: "left", anchor: {kind: "text", blockId: "left-p", offset: 2}, pageOffset: 80},
        {cellId: "right", anchor: {kind: "text", blockId: "right-p", offset: 2}, pageOffset: 60},
      ],
    });
  });

  it("多列错位切点产生的虚拟流高度可以大于自然最高列", () => {
    const plan = planTableCellFlow([
      tallRow("r1", [
        {cellId: "left", points: [90, 180]},
        {cellId: "right", points: [60, 150, 240]},
      ]),
    ], 100);

    expect(plan.segments.map(segment => segment.height)).toEqual([90, 90, 90]);
    expect(plan.paginationHeight).toBe(270);
    expect(plan.splitOffsets).toEqual([90, 180]);
  });

  it("本页剩余空间容不下行内首个安全点时，先在行前换页", () => {
    const plan = planTableCellFlow([
      {kind: "atomic", rowId: "r0", height: 40},
      tallRow("r1", [{cellId: "c1", points: [70, 140]}]),
    ], 100);

    expect(plan.segments.map(segment => segment.height)).toEqual([40, 70, 70]);
    expect(plan.segments[0].breakAfter).toEqual({kind: "row", beforeRowId: "r1"});
    expect(plan.splitOffsets).toEqual([40, 110]);
  });

  it("某列当前页无可用点时可留白，由其他列推进并在 cell-start 续排", () => {
    const plan = planTableCellFlow([
      {kind: "atomic", rowId: "r0", height: 40},
      tallRow("r1", [
        {cellId: "left", points: [50, 120]},
        {cellId: "right", points: [70, 140]},
      ]),
    ], 100);

    expect(plan.segments[0].height).toBe(90);
    expect(plan.segments[0].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [
        {cellId: "left", anchor: {kind: "text", blockId: "left-p", offset: 1}, pageOffset: 90},
        {cellId: "right", anchor: {kind: "cell-start"}, pageOffset: 40},
      ],
    });
  });

  it("垂直居中短单元格可跨页消费首个 Block 前的空白", () => {
    const plan = planTableCellFlow([{
      kind: "cell-flow",
      rowId: "r1",
      cells: [
        {
          cellId: "short",
          points: [
            {offset: 230, anchor: {kind: "block", blockId: "short-p"}},
            {offset: 260, anchor: {kind: "cell-end"}},
          ],
        },
        {
          cellId: "tall",
          points: [
            {offset: 80, anchor: {kind: "text", blockId: "tall-p", offset: 1}},
            {offset: 160, anchor: {kind: "text", blockId: "tall-p", offset: 2}},
            {offset: 240, anchor: {kind: "cell-end"}},
          ],
        },
      ],
    }], 100);

    expect(plan.segments.map(segment => segment.height)).toEqual([100, 100, 80]);
    expect(plan.segments[0].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [
        {cellId: "short", anchor: {kind: "cell-start"}, pageOffset: 100},
        {cellId: "tall", anchor: {kind: "text", blockId: "tall-p", offset: 1}, pageOffset: 80},
      ],
    });
    expect(plan.segments[1].breakAfter).toEqual({
      kind: "cell-flow",
      rowId: "r1",
      continuations: [
        {cellId: "short", anchor: {kind: "cell-start"}, pageOffset: 100},
        {cellId: "tall", anchor: {kind: "text", blockId: "tall-p", offset: 2}, pageOffset: 80},
      ],
    });
  });

  it("整页内没有任何安全进展时显式失败，让调用方对不可拆原子内容降级锁高", () => {
    expect(() => planTableCellFlow([
      tallRow("r1", [{cellId: "c1", points: [120]}]),
    ], 100)).toThrowError(TableCellFlowPlanningError);
  });
});
