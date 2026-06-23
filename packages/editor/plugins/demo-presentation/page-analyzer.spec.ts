import {analyzePages} from "./page-analyzer";
import {BlockNodeType, IBlockSnapshot} from "../../framework";

// ─── snapshot 构造辅助（analyzePages 只读 flavour 与 props.heading）───

function block(id: string, flavour: string, props: Record<string, unknown> = {}): IBlockSnapshot {
  return {
    id,
    flavour,
    nodeType: BlockNodeType.block,
    meta: {},
    props,
    children: [],
  } as unknown as IBlockSnapshot;
}

const para = (id: string) => block(id, 'paragraph');
const heading = (id: string, level = 1) => block(id, 'paragraph', {heading: level});
const callout = (id: string) => block(id, 'callout');
const pageDivider = (id: string) => block(id, 'page-divider');

/** 把分页结果压成 id 矩阵，便于断言。 */
function ids(pages: IBlockSnapshot[][]): string[][] {
  return pages.map(page => page.map(b => b.id));
}

describe('analyzePages', () => {
  it('无分页块时所有块归为单页', () => {
    expect(ids(analyzePages([para('a'), para('b'), para('c')]))).toEqual([
      ['a', 'b', 'c'],
    ]);
  });

  it('空输入返回空页列表', () => {
    expect(analyzePages([])).toEqual([]);
  });

  it('标题作为内容型分页块，开启新页并作为新页首块', () => {
    expect(ids(analyzePages([para('a'), heading('h'), para('b')]))).toEqual([
      ['a'],
      ['h', 'b'],
    ]);
  });

  it('callout 作为内容型分页块，开启新页并保留为新页首块', () => {
    expect(ids(analyzePages([para('a'), callout('c'), para('b')]))).toEqual([
      ['a'],
      ['c', 'b'],
    ]);
  });

  it('连续标题各自成页（内容型分页块不被合并）', () => {
    expect(ids(analyzePages([heading('h1'), heading('h2'), para('b')]))).toEqual([
      ['h1'],
      ['h2', 'b'],
    ]);
  });

  // ─── 回归：分页符（display:none）不得产生空白页 ───

  it('分页符紧跟标题时不产生空白页（用户报告场景）', () => {
    expect(ids(analyzePages([pageDivider('d'), heading('h'), para('b')]))).toEqual([
      ['h', 'b'],
    ]);
  });

  it('内容 → 分页符 → 标题：分页符只切页、不单独成页', () => {
    expect(ids(analyzePages([para('a'), pageDivider('d'), heading('h'), para('b')]))).toEqual([
      ['a'],
      ['h', 'b'],
    ]);
  });

  it('分页符夹在普通内容之间：纯切页，不渲染分页符本身', () => {
    expect(ids(analyzePages([para('a'), pageDivider('d'), para('b')]))).toEqual([
      ['a'],
      ['b'],
    ]);
  });

  it('末尾分页符不产生尾随空白页', () => {
    expect(ids(analyzePages([para('a'), pageDivider('d')]))).toEqual([
      ['a'],
    ]);
  });

  it('连续多个分页符不产生空白页', () => {
    expect(ids(analyzePages([para('a'), pageDivider('d1'), pageDivider('d2'), para('b')]))).toEqual([
      ['a'],
      ['b'],
    ]);
  });

  it('开头即分页符：被吸收，不产生前导空白页', () => {
    expect(ids(analyzePages([pageDivider('d'), para('a')]))).toEqual([
      ['a'],
    ]);
  });
});
