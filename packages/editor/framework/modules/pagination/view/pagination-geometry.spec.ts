// packages/editor/framework/modules/pagination/view/pagination-geometry.spec.ts
import {resolveMargins, resolveScreenGeometry} from "./pagination-geometry";

describe('pagination-geometry', () => {
  it('resolveMargins 缺省每边 72px', () => {
    expect(resolveMargins()).toEqual({top: 72, right: 72, bottom: 72, left: 72});
  });

  it('resolveMargins 部分覆盖，其余取默认', () => {
    expect(resolveMargins({top: 40, bottom: 40})).toEqual({top: 40, right: 72, bottom: 40, left: 72});
  });

  it('A4 命名尺寸转像素时保留物理页的亚像素精度', () => {
    const g = resolveScreenGeometry({pageSize: 'A4'});
    expect(g.sheetWidthPx).toBeCloseTo(210 * 96 / 25.4, 6);
    expect(g.sheetHeightPx).toBeCloseTo(297 * 96 / 25.4, 6);
    expect(g.geometry.contentHeight).toBeCloseTo(297 * 96 / 25.4 - 144, 6);
  });

  it('自定义像素尺寸按原值（不做 pt 转换）', () => {
    const g = resolveScreenGeometry({pageSize: {width: 800, height: 1000}, margins: {top: 50, bottom: 50}});
    expect(g.sheetWidthPx).toBe(800);
    expect(g.sheetHeightPx).toBe(1000);
    expect(g.geometry.contentHeight).toBe(900); // 1000-50-50
  });

  it('landscape 交换宽高', () => {
    const g = resolveScreenGeometry({pageSize: 'A4', orientation: 'landscape'});
    expect(g.sheetWidthPx).toBeCloseTo(297 * 96 / 25.4, 6);
    expect(g.sheetHeightPx).toBeCloseTo(210 * 96 / 25.4, 6);
  });

  it('pageGap 缺省 24，可覆盖', () => {
    expect(resolveScreenGeometry({}).pageGap).toBe(24);
    expect(resolveScreenGeometry({pageGap: 40}).pageGap).toBe(40);
  });

  it('无页眉页脚时 headerHeight/footerHeight 为 0', () => {
    const g = resolveScreenGeometry({pageSize: 'A4'});
    expect(g.headerHeight).toBe(0);
    expect(g.footerHeight).toBe(0);
    expect(g.geometry.contentHeight).toBeCloseTo(297 * 96 / 25.4 - 144, 6);
  });

  it('有页眉页脚时高度计入、contentHeight 相应扣除', () => {
    const g = resolveScreenGeometry({
      pageSize: 'A4',
      header: {center: '第 {page} 页'},        // 默认高 24
      footer: {left: 'x', height: 30},          // 显式高 30
    });
    expect(g.headerHeight).toBe(24);
    expect(g.footerHeight).toBe(30);
    expect(g.geometry.contentHeight).toBeCloseTo(297 * 96 / 25.4 - 198, 6);
  });

  it('页眉页脚距离可独立于正文页边距，位于页边距带内时不额外压缩正文', () => {
    const g = resolveScreenGeometry({
      pageSize: {width: 800, height: 1000},
      margins: {top: 72, bottom: 72},
      header: {center: '{page}', height: 24, distance: 48},
      footer: {center: '{page}', height: 24, distance: 48},
    });
    expect(g.headerDistance).toBe(48);
    expect(g.footerDistance).toBe(48);
    expect(g.contentTop).toBe(72);
    expect(g.contentBottom).toBe(72);
    expect(g.geometry.contentHeight).toBe(856);
  });

  it('页眉页脚越过正文页边距时仅扣除越界部分', () => {
    const g = resolveScreenGeometry({
      pageSize: {width: 800, height: 1000},
      margins: {top: 50, bottom: 50},
      header: {center: '{page}', height: 24, distance: 40},
      footer: {center: '{page}', height: 30, distance: 40},
    });
    expect(g.contentTop).toBe(64);
    expect(g.contentBottom).toBe(70);
    expect(g.geometry.contentHeight).toBe(866);
  });

  it('无页眉页脚文本时 distance 不改变正文几何', () => {
    const g = resolveScreenGeometry({
      pageSize: {width: 800, height: 1000},
      margins: {top: 50, bottom: 50},
      header: {distance: 200},
      footer: {distance: 200},
    });
    expect(g.geometry.contentHeight).toBe(900);
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
