// packages/editor/framework/modules/pagination/view/table-split.spec.ts
import {computeTableBreaks} from "./table-split";
import {TableRowGeom} from "./item-builder";
import {PaginationResult} from "../engine";

function rows(n: number, h = 40): TableRowGeom[] {
  return Array.from({length: n}, (_, i) => ({id: `r${i}`, top: i * h, bottom: (i + 1) * h, coveredFromAbove: false}));
}

/** 构造一个表格被切成多页的 PaginationResult。 */
function splitResult(tableId: string, cuts: number[], usedHeights: number[]): PaginationResult {
  // cuts = 每页片段的结束偏移；页 i 片段 = [cuts[i-1]||0, cuts[i]]
  const pages = cuts.map((to, i) => ({
    index: i,
    slots: [{id: tableId, fragment: {fromOffset: i === 0 ? 0 : cuts[i - 1], toOffset: to}}],
    usedHeight: usedHeights[i],
  }));
  return {pages, byBlock: new Map()};
}

describe("computeTableBreaks", () => {
  it("续页的延续片段 → 在 fromOffset 对应行前插页缝（gap=sheet+pageGap−上页usedHeight）", () => {
    const result = splitResult("t", [80, 160, 240], [80, 80, 80]);
    const breaks = computeTableBreaks("t", rows(6), result, 120, 20);
    expect(breaks).toEqual([
      {beforeRowId: "r2", gap: 60}, // 页1首=片段 from80 → r2(top80)；120+20−80=60
      {beforeRowId: "r4", gap: 60}, // 页2首=片段 from160 → r4(top160)；120+20−80=60
    ]);
  });

  it("首页片段（fromOffset=0）不产生断点", () => {
    const result = splitResult("t", [120], [120]);
    expect(computeTableBreaks("t", rows(3), result, 120, 20)).toEqual([]);
  });

  it("续页首槽不是该表格 → 跳过", () => {
    const result: PaginationResult = {
      pages: [
        {index: 0, slots: [{id: "t", fragment: {fromOffset: 0, toOffset: 80}}], usedHeight: 80},
        {index: 1, slots: [{id: "other"}], usedHeight: 50},
      ],
      byBlock: new Map(),
    };
    expect(computeTableBreaks("t", rows(4), result, 120, 20)).toEqual([]);
  });

  it("fromOffset 匹配不到行（容差外）→ 跳过该断点", () => {
    const result = splitResult("t", [85, 160], [85, 75]); // 85 不等于任何 row.top(0/40/80/120)
    const breaks = computeTableBreaks("t", rows(4), result, 120, 20);
    // 页1 from85 匹配不到（最近 r2.top=80 差 5 > 容差）→ 不产生
    expect(breaks).toEqual([]);
  });

  it("gap ≤ 0（上页恰好或超额填满）不插页缝", () => {
    const result = splitResult("t", [140, 240], [140, 100]); // 120+20−140=0
    expect(computeTableBreaks("t", rows(6), result, 120, 20)).toEqual([]);
  });
});
