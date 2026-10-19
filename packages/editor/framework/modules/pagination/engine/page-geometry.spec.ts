// packages/editor/framework/modules/pagination/engine/page-geometry.spec.ts
import {PAGE_SIZES, ptToPx, resolvePageDimensions, resolveGeometry} from "./page-geometry";

describe('page-geometry', () => {
  it('A4 标准尺寸（pt）与 pdfSizes 对齐', () => {
    expect(PAGE_SIZES.A4.width).toBeCloseTo(595.2755906, 6);
    expect(PAGE_SIZES.A4.height).toBeCloseTo(841.8897638, 6);
  });

  it('ptToPx 默认 96dpi：72pt=96px', () => {
    expect(ptToPx(72)).toBe(96);
    expect(ptToPx(72, 72)).toBe(72);
  });

  it('resolvePageDimensions landscape 交换宽高', () => {
    const page = resolvePageDimensions('A4', 'landscape');
    expect(page.width).toBeCloseTo(841.8897638, 6);
    expect(page.height).toBeCloseTo(595.2755906, 6);
  });

  it('resolvePageDimensions 自定义尺寸 portrait 原样返回', () => {
    expect(resolvePageDimensions({width: 100, height: 200})).toEqual({width: 100, height: 200});
  });

  it('resolveGeometry 扣除边距/页眉/页脚得到可用内容高', () => {
    const g = resolveGeometry({
      pageHeightPx: 1000,
      margins: {top: 50, right: 0, bottom: 50, left: 0},
      headerHeight: 30,
      footerHeight: 20,
    });
    expect(g.contentHeight).toBe(850);
    expect(g.firstPageContentHeight).toBeUndefined();
  });

  it('resolveGeometry firstPageExtraTop 产出首页可用高', () => {
    const g = resolveGeometry({
      pageHeightPx: 1000,
      margins: {top: 0, right: 0, bottom: 0, left: 0},
      firstPageExtraTop: 100,
    });
    expect(g.contentHeight).toBe(1000);
    expect(g.firstPageContentHeight).toBe(900);
  });

  it('非法页面几何收敛为正容量', () => {
    expect(resolveGeometry({
      pageHeightPx: 100,
      margins: {top: 80, right: 0, bottom: 80, left: 0},
    })).toEqual({contentHeight: 1});
  });
});
