// packages/editor/framework/modules/pagination/engine/pagination-engine.spec.ts
import {paginate} from "./pagination-engine";
import {PageGeometry, PaginationItem, PaginationResult} from "./types";

// ─── 构造助手 ───
const geo = (contentHeight: number, firstPageContentHeight?: number): PageGeometry =>
  firstPageContentHeight === undefined ? {contentHeight} : {contentHeight, firstPageContentHeight};

function item(id: string, height: number, extra: Partial<PaginationItem> = {}): PaginationItem {
  return {id, height, breakable: false, keepWithNext: false, ...extra};
}
const para = (id: string, h = 100) => item(id, h);
const divider = (id: string) => item(id, 0, {manualBreak: true});
const breakBlock = (id: string, h: number, splitOffsets: number[]) =>
  item(id, h, {breakable: true, splitOffsets});

/** 把分页结果压成每页 id（片段块标记为 id[from-to]）矩阵，便于断言。 */
function pageIds(result: PaginationResult): string[][] {
  return result.pages.map(p =>
    p.slots.map(s => (s.fragment ? `${s.id}[${s.fragment.fromOffset}-${s.fragment.toOffset}]` : s.id)),
  );
}

describe('paginate - 基础', () => {
  it('空文档返回单个空页', () => {
    const r = paginate([], geo(800));
    expect(r.pages.length).toBe(1);
    expect(r.pages[0].slots).toEqual([]);
    expect(r.byBlock.size).toBe(0);
  });

  it('全部装得下时归为单页', () => {
    const r = paginate([para('a'), para('b'), para('c')], geo(800));
    expect(pageIds(r)).toEqual([['a', 'b', 'c']]);
    expect(r.pages[0].usedHeight).toBe(300);
  });

  it('放不下的块整块下推到下一页（不切断）', () => {
    // 容量 250；三个高 100 的块：a,b 占 200，c 放不下 → 整块下推
    const r = paginate([para('a'), para('b'), para('c')], geo(250));
    expect(pageIds(r)).toEqual([['a', 'b'], ['c']]);
  });

  it('byBlock 记录块所在页', () => {
    const r = paginate([para('a'), para('b'), para('c')], geo(250));
    expect(r.byBlock.get('a')!.pageIndex).toBe(0);
    expect(r.byBlock.get('c')!.pageIndex).toBe(1);
  });

  it('首页容量不同于常规页', () => {
    // 首页 150、常规 300，块各 100：首页放 a，b/c 到常规页
    const r = paginate([para('a'), para('b'), para('c')], geo(300, 150));
    expect(pageIds(r)).toEqual([['a'], ['b', 'c']]);
    // 首页额外顶部属于真实布局高度，必须进入 usedHeight，
    // 才能让第二页前的 spacer 抵消这段偏移。
    expect(r.pages[0].usedHeight).toBe(250);
    expect(r.pages[1].usedHeight).toBe(200);
  });

  it('首页文档头占满剩余空间时，首个块下推但后续页恢复常规容量', () => {
    const r = paginate([para('a', 200), para('b', 100)], geo(300, 150));
    expect(pageIds(r)).toEqual([[], ['a', 'b']]);
    expect(r.pages[0].usedHeight).toBe(150);
    expect(r.pages[1].usedHeight).toBe(300);
  });

  // ─── 手动分页符：镜像 analyzePages 语义（像素化）───
  it('手动分页符切页', () => {
    expect(pageIds(paginate([para('a'), divider('d'), para('b')], geo(800)))).toEqual([['a'], ['b']]);
  });

  it('开头分页符被吸收，不产生前导空白页', () => {
    expect(pageIds(paginate([divider('d'), para('a')], geo(800)))).toEqual([['a']]);
  });

  it('末尾分页符不产生尾随空白页', () => {
    expect(pageIds(paginate([para('a'), divider('d')], geo(800)))).toEqual([['a']]);
  });

  it('连续分页符不产生空白页', () => {
    expect(pageIds(paginate([para('a'), divider('d1'), divider('d2'), para('b')], geo(800)))).toEqual([['a'], ['b']]);
  });
});

describe('paginate - keepWithNext', () => {
  it('通用 keepWithNext 信号仍能把当前块与下一块一起下推', () => {
    // 容量 250；a(100)，k(100) 显式 keepWithNext，b(100)。
    // a 占 100；k 放得下(≤150)，但其后剩 50 装不下 b，且 k+b=200≤250 → k,b 一起下推
    const items = [para('a'), item('k', 100, {breakable: true, keepWithNext: true}), para('b')];
    expect(pageIds(paginate(items, geo(250)))).toEqual([['a'], ['k', 'b']]);
  });

  it('keepWithNext 块已在页首时不触发下推', () => {
    const items = [item('k', 100, {keepWithNext: true}), para('b')];
    expect(pageIds(paginate(items, geo(250)))).toEqual([['k', 'b']]);
  });

  it('keepWithNext 块是最后一块时正常放置', () => {
    const items = [para('a'), item('k', 100, {keepWithNext: true})];
    expect(pageIds(paginate(items, geo(250)))).toEqual([['a', 'k']]);
  });

  it('keepWithNext 块与下一块合计超过一页时不强行绑定', () => {
    // 容量 150；a(100)，k(100) keepWithNext，b(100)。k+b=200>150 → 不一起下推，k 自己整块下推
    const items = [para('a'), item('k', 100, {keepWithNext: true}), para('b')];
    expect(pageIds(paginate(items, geo(150)))).toEqual([['a'], ['k'], ['b']]);
  });
});

describe('paginate - 超大块', () => {
  it('可拆块按 splitOffsets 跨页切', () => {
    // 容量 100；块高 250，安全切点 [80,160]（candidateCuts 追加 250）
    // 页1：0-80，页2：80-160，页3：160-250
    const r = paginate([breakBlock('t', 250, [80, 160])], geo(100));
    expect(pageIds(r)).toEqual([['t[0-80]'], ['t[80-160]'], ['t[160-250]']]);
  });

  it('优先在「干净」切点(preferredSplitOffsets)断页，即便不是最大切点', () => {
    // 容量 100；块高 160，所有切点[50,80]，但只有 50 是干净边界(preferred)。
    // 页0 剩100：80 能填更多，但 50 是 preferred → 选 50；80 退为次选只在无 preferred 时用。
    const r = paginate(
      [item('t', 160, {breakable: true, splitOffsets: [50, 80], preferredSplitOffsets: [50]})],
      geo(100),
    );
    expect(pageIds(r)).toEqual([['t[0-50]'], ['t[50-80]'], ['t[80-160]']]);
  });

  it('当前页剩余内无干净切点 → 退回普通切点（被合并单元格逼着拆）', () => {
    // 容量 100；块高 160，切点[60]，无 preferred（全是跨合并的脏边界）→ 仍按 60 拆填本页。
    const r = paginate(
      [item('t', 160, {breakable: true, splitOffsets: [60], preferredSplitOffsets: []})],
      geo(100),
    );
    expect(pageIds(r)).toEqual([['t[0-60]'], ['t[60-160]']]);
  });

  it('可拆块先填满当前页剩余再跨页', () => {
    // 容量 100；a(40) 占页1 剩 60；块高 200 切点[50,120]
    // 页1 剩60：选 ≤(0+60) 的最大切点=50 → 0-50；页2：50-120；页3：120-200
    const r = paginate([para('a', 40), breakBlock('t', 200, [50, 120])], geo(100));
    expect(pageIds(r)).toEqual([['a', 't[0-50]'], ['t[50-120]'], ['t[120-200]']]);
  });

  it('可拆块不超过一页时，即使剩余空间内有安全切点也整块下推', () => {
    // 容量 100；a(60) 占页0 剩 40；可拆块高 90（≤容量）且切点[30,60]。
    // 只按“块自身是否超过一页”决定能否拆，因此 t 整块下推到页1。
    const r = paginate([para('a', 60), breakBlock('t', 90, [30, 60])], geo(100));
    expect(pageIds(r)).toEqual([['a'], ['t']]);
  });

  it('可拆块高度恰好等于一页时仍整块放置', () => {
    // 容量 100；a(20) 后剩80，t 高度恰好100且带切点[50]，仍不进入拆分循环。
    const r = paginate([para('a', 20), breakBlock('t', 100, [50])], geo(100));
    expect(pageIds(r)).toEqual([['a'], ['t']]);
    expect(r.pages[1].usedHeight).toBe(100);
  });

  it('splitStartsNewPage（表格强制拆分）独占新页起：不填当前页剩余', () => {
    // 容量100；a(40)占页0 剩60；可拆块高200 切点[50,150] 带 splitStartsNewPage。
    // 对照「可拆块先填满当前页剩余」：普通块会在页0填 t0-50；带 splitStartsNewPage 则先 commit 页0=[a]，
    // 表格从页1顶开始拆——以独占的页开始，不与前一页内容拼。
    const t = item('t', 200, {breakable: true, splitOffsets: [50, 150], splitStartsNewPage: true});
    const r = paginate([para('a', 40), t], geo(100));
    expect(pageIds(r)).toEqual([['a'], ['t[0-50]'], ['t[50-150]'], ['t[150-200]']]);
  });

  it('repeatHeaderHeight：续页预留表头高（每续页扣表头，行片更小）', () => {
    // 容量100；表头50；表格250 行边界[50,100,150,200] splitStartsNewPage。
    // 首片[0-100]（含原表头）；续页 avail=100-50(重复表头)=50 → 每续页只放一行50：[100-150][150-200][200-250]
    const t = item('t', 250, {breakable: true, splitOffsets: [50, 100, 150, 200], splitStartsNewPage: true, repeatHeaderHeight: 50});
    const r = paginate([t], geo(100));
    expect(pageIds(r)).toEqual([['t[0-100]'], ['t[100-150]'], ['t[150-200]'], ['t[200-250]']]);
  });

  it('可拆块非超大、当前页剩余放不下最小安全片 → 整块下推（keep-together）', () => {
    // 容量 100；a(80) 占页0 剩 20；可拆块高 90 切点[30,60]
    // 剩20 < 最小安全片30 → 不拆，整块下推到页1
    const r = paginate([para('a', 80), breakBlock('t', 90, [30, 60])], geo(100));
    expect(pageIds(r)).toEqual([['a'], ['t']]);
  });

  it('超大原子块独占整页并允许溢出（usedHeight 记为整页容量）', () => {
    // 容量 100；原子块高 250；占满页，下个块换页
    const r = paginate([item('img', 250), para('b', 50)], geo(100));
    expect(pageIds(r)).toEqual([['img'], ['b']]);
    expect(r.pages.length).toBe(2);
    expect(r.pages[0].usedHeight).toBe(100);
  });

  it('可拆块进入时当前页已满：先换页再拆，不溢出已满页（回归）', () => {
    // 容量 100；a(100) 占满页0；可拆块高 250 切点[80,160]
    // 必须先换页，再 0-80 / 80-160 / 160-250；页0 usedHeight 不得超 100
    const r = paginate([para('a', 100), breakBlock('t', 250, [80, 160])], geo(100));
    expect(pageIds(r)).toEqual([['a'], ['t[0-80]'], ['t[80-160]'], ['t[160-250]']]);
    expect(r.pages[0].usedHeight).toBe(100);
  });

  it('可拆块当前页剩余放不下最小安全片时整体换页（不塞超额片）', () => {
    // 容量 100；a(70) 占页0 剩 30；可拆块高 200 切点[50,120]
    // 剩30 < 最小安全片50 → 不塞，换页：页1 0-50 / 页2 50-120 / 页3 120-200
    const r = paginate([para('a', 70), breakBlock('t', 200, [50, 120])], geo(100));
    expect(pageIds(r)).toEqual([['a'], ['t[0-50]'], ['t[50-120]'], ['t[120-200]']]);
    expect(r.pages[0].usedHeight).toBe(70);
  });

  it('splitOffsets 含 >total 的越界切点被忽略（不产生越界片段）', () => {
    // 容量 100；可拆块高 200，切点[300] 越界 → candidateCuts 过滤后只剩 {200}
    // 单片 0-200 溢出，toOffset 不得超过块高 200
    const r = paginate([breakBlock('t', 200, [300])], geo(100));
    expect(pageIds(r)).toEqual([['t[0-200]']]);
  });

  it('可拆块但无安全切点时退化为单片溢出', () => {
    // 容量 100；可拆块高 250 但 splitOffsets 空 → 候选只有 {250} → 0-250 一片（溢出，接受）
    const r = paginate([breakBlock('t', 250, [])], geo(100));
    expect(pageIds(r)).toEqual([['t[0-250]']]);
  });

  it('byBlock 对拆开块记录首片所在页', () => {
    const r = paginate([para('a', 40), breakBlock('t', 200, [50, 120])], geo(100));
    expect(r.byBlock.get('t')!.pageIndex).toBe(0); // 首片 0-50 在页0
  });

  it('大量安全切点仍能按序线性推进，不反复扫描完整切点集', () => {
    const cutCount = 4096;
    const cuts = Array.from({length: cutCount - 1}, (_, index) => index + 1);
    const r = paginate([breakBlock('huge', cutCount, cuts)], geo(1));

    expect(r.pages.length).toBe(cutCount);
    expect(r.pages[0].slots[0].fragment).toEqual({fromOffset: 0, toOffset: 1});
    expect(r.pages[cutCount - 1].slots[0].fragment).toEqual({
      fromOffset: cutCount - 1,
      toOffset: cutCount,
    });
  });
});
