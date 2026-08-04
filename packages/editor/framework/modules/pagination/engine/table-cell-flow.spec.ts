import {
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

  it("整页内没有任何安全进展时显式失败，让调用方对不可拆原子内容降级锁高", () => {
    expect(() => planTableCellFlow([
      tallRow("r1", [{cellId: "c1", points: [120]}]),
    ], 100)).toThrowError(TableCellFlowPlanningError);
  });
});
