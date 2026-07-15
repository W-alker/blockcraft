// packages/editor/framework/modules/pagination/view/sheet-layout.spec.ts
import {computeBackdropHeight, computeBlockGaps, computeSheetRects} from "./sheet-layout";
import {PaginationResult} from "../engine";

// 构造一个最小 PaginationResult
function result(pages: {ids: string[]; usedHeight: number; firstFragmentFrom?: number}[]): PaginationResult {
  return {
    pages: pages.map((p, i) => ({
      index: i,
      slots: p.ids.map((id, j) => (j === 0 && p.firstFragmentFrom !== undefined)
        ? {id, fragment: {fromOffset: p.firstFragmentFrom, toOffset: p.firstFragmentFrom + 10}}
        : {id}),
      usedHeight: p.usedHeight,
    })),
    byBlock: new Map(),
  };
}

describe('sheet-layout', () => {
  it('computeSheetRects 按 sheetHeight+gap 堆叠', () => {
    expect(computeSheetRects(3, 1000, 20)).toEqual([
      {top: 0, height: 1000},
      {top: 1020, height: 1000},
      {top: 2040, height: 1000},
    ]);
  });

  it('computeSheetRects 0 页返回空', () => {
    expect(computeSheetRects(0, 1000, 20)).toEqual([]);
  });

  it('computeBackdropHeight = n*sheet + (n-1)*gap', () => {
    expect(computeBackdropHeight(3, 1000, 20)).toBe(3040);
    expect(computeBackdropHeight(1, 1000, 20)).toBe(1000);
    expect(computeBackdropHeight(0, 1000, 20)).toBe(0);
  });

  it('computeBlockGaps：页N首块 gap = sheet+pageGap − 上页usedHeight', () => {
    const r = result([
      {ids: ['a', 'b'], usedHeight: 800},
      {ids: ['c'], usedHeight: 300},
    ]);
    const gaps = computeBlockGaps(r, 1000, 20);
    // 页1首块 c：1000+20−800 = 220
    expect(gaps.get('c')).toBe(220);
    expect(gaps.has('a')).toBe(false); // 页0首块不下推
    expect(gaps.size).toBe(1);
  });

  it('computeBlockGaps：上页正好填满则 gap = pageGap', () => {
    const r = result([{ids: ['a'], usedHeight: 1000}, {ids: ['b'], usedHeight: 100}]);
    // 1000 + 20 − 1000 = 20
    expect(computeBlockGaps(r, 1000, 20).get('b')).toBe(20);
  });

  it('computeBlockGaps：续页首块是延续片段(fromOffset>0)则跳过', () => {
    const r = result([
      {ids: ['t'], usedHeight: 1000},
      {ids: ['t'], usedHeight: 1000, firstFragmentFrom: 1000}, // 同块延续
    ]);
    expect(computeBlockGaps(r, 1000, 20).size).toBe(0);
  });
});
