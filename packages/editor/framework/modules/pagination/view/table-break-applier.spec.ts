// packages/editor/framework/modules/pagination/view/table-break-applier.spec.ts
import {TableBreakApplier} from "./table-break-applier";
import {TableRowGeom} from "./item-builder";
import {PaginationResult} from "../engine";

function rows(n: number, h = 40): TableRowGeom[] {
  return Array.from({length: n}, (_, i) => ({id: `r${i}`, top: i * h, bottom: (i + 1) * h, coveredFromAbove: false}));
}

function splitResult(tableId: string, cuts: number[], usedHeights: number[]): PaginationResult {
  const pages = cuts.map((to, i) => ({
    index: i,
    slots: [{id: tableId, fragment: {fromOffset: i === 0 ? 0 : cuts[i - 1], toOffset: to}}],
    usedHeight: usedHeights[i],
  }));
  return {pages, byBlock: new Map()};
}

function fakeTable() {
  return {
    applyPaginationBreaks: jasmine.createSpy("applyPaginationBreaks"),
    clearPaginationBreaks: jasmine.createSpy("clearPaginationBreaks"),
  };
}

describe("TableBreakApplier - 缺块兜底（getBlockById 抛错不炸 _recompute）", () => {
  it("_broken 持有的表格被删除后，下一轮 apply 的 cleanup 不抛错（疯狂重算根因之一）", () => {
    const live = fakeTable();
    let liveExists = true;
    // 真实 doc.getBlockById 在缺块时**抛错**（不是返回 null）。模拟之。
    const doc: any = {
      getBlockById: (id: string, onError?: () => void) => {
        if (id === "live" && liveExists) return live;
        onError?.();
        throw new Error(`Block not found: ${id}`);
      },
    };
    const applier = new TableBreakApplier(doc);

    // 第一轮：live 表被拆 → 进入 _broken
    const meta: any = {id: "live", tableRows: rows(6)};
    applier.apply([meta], splitResult("live", [80, 160, 240], [80, 80, 80]), 120, 20);
    expect(live.applyPaginationBreaks).toHaveBeenCalled();

    // live 表被删除（远端协同/撤销/删表）→ getBlockById("live") 现在抛错
    liveExists = false;

    // 第二轮：metas 里不再有 live → cleanup 循环命中已死的 "live"。修复前 getBlockById 抛错会炸掉
    // 整个 _recompute，而此前 apply 已改过 DOM → ResizeObserver 再触发 → 再抛 → 疯狂重算。
    const empty: PaginationResult = {pages: [{index: 0, slots: [], usedHeight: 0}], byBlock: new Map()};
    expect(() => applier.apply([], empty, 120, 20)).not.toThrow();

    // clear() 同样安全
    expect(() => applier.clear()).not.toThrow();
  });

  it("apply 的主循环遇到缺块的 meta 也不抛错（防御性）", () => {
    const doc: any = {
      getBlockById: (id: string, onError?: () => void) => {
        onError?.();
        throw new Error(`Block not found: ${id}`);
      },
    };
    const applier = new TableBreakApplier(doc);
    const meta: any = {id: "ghost", tableRows: rows(4)};
    expect(() => applier.apply([meta], splitResult("ghost", [80, 160], [80, 80]), 120, 20)).not.toThrow();
  });
});
