// packages/editor/framework/modules/pagination/view/pagination-geometry.spec.ts
import {resolveMargins, resolveScreenGeometry} from "./pagination-geometry";

describe('pagination-geometry', () => {
  it('resolveMargins 缺省每边 72px', () => {
    expect(resolveMargins()).toEqual({top: 72, right: 72, bottom: 72, left: 72});
  });

  it('resolveMargins 部分覆盖，其余取默认', () => {
    expect(resolveMargins({top: 40, bottom: 40})).toEqual({top: 40, right: 72, bottom: 40, left: 72});
  });

  it('A4 命名尺寸转像素（pt→px @96dpi，四舍五入）', () => {
    const g = resolveScreenGeometry({pageSize: 'A4'});
    // A4 = 595×842 pt → ptToPx: 595*96/72=793.33→793, 842*96/72=1122.67→1123
    expect(g.sheetWidthPx).toBe(793);
    expect(g.sheetHeightPx).toBe(1123);
    // contentHeight = 1123 - 72 - 72 = 979
    expect(g.geometry.contentHeight).toBe(979);
  });

  it('自定义像素尺寸按原值（不做 pt 转换）', () => {
    const g = resolveScreenGeometry({pageSize: {width: 800, height: 1000}, margins: {top: 50, bottom: 50}});
    expect(g.sheetWidthPx).toBe(800);
    expect(g.sheetHeightPx).toBe(1000);
    expect(g.geometry.contentHeight).toBe(900); // 1000-50-50
  });

  it('landscape 交换宽高', () => {
    const g = resolveScreenGeometry({pageSize: 'A4', orientation: 'landscape'});
    expect(g.sheetWidthPx).toBe(1123);
    expect(g.sheetHeightPx).toBe(793);
  });

  it('pageGap 缺省 24，可覆盖', () => {
    expect(resolveScreenGeometry({}).pageGap).toBe(24);
    expect(resolveScreenGeometry({pageGap: 40}).pageGap).toBe(40);
  });

  it('无页眉页脚时 headerHeight/footerHeight 为 0', () => {
    const g = resolveScreenGeometry({pageSize: 'A4'});
    expect(g.headerHeight).toBe(0);
    expect(g.footerHeight).toBe(0);
    // A4 contentHeight = 1123 - 72 - 72 = 979
    expect(g.geometry.contentHeight).toBe(979);
  });

  it('有页眉页脚时高度计入、contentHeight 相应扣除', () => {
    const g = resolveScreenGeometry({
      pageSize: 'A4',
      header: {center: '第 {page} 页'},        // 默认高 24
      footer: {left: 'x', height: 30},          // 显式高 30
    });
    expect(g.headerHeight).toBe(24);
    expect(g.footerHeight).toBe(30);
    // 1123 - 72 - 72 - 24 - 30 = 925
    expect(g.geometry.contentHeight).toBe(925);
  });

  it('自定义页眉高度非法时回退默认值，不污染分页几何', () => {
    for (const height of [Number.NaN, Number.POSITIVE_INFINITY, -20]) {
      const g = resolveScreenGeometry({
        pageSize: {width: 800, height: 1000},
        margins: {top: 50, bottom: 50},
        header: {left: 'Custom header', height},
      });
      expect(g.headerHeight).toBe(24);
      expect(g.geometry.contentHeight).toBe(876);
    }
  });

  it('宿主文档头只扣减首页容量', () => {
    const g = resolveScreenGeometry({
      pageSize: {width: 800, height: 1000},
      margins: {top: 50, bottom: 50},
    }, {firstPageExtraTop: 180});
    expect(g.geometry.contentHeight).toBe(900);
    expect(g.geometry.firstPageContentHeight).toBe(720);
  });
});
