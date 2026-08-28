// Clipboard-owned Youdao Note table converter tests.
import { yneTableToSnapshot } from "./table-converter";
import { YneBlock } from "./types";

// 2x2 网格，左上角 2x2 合并锚点 + 3 个占位
const mergedTable: YneBlock = {
  blockType: 'table',
  type: 'table',
  data: {
    widths: [100, 100],
    heights: [40, 40],
    cells: [
      { cellId: 'A', mergeHeight: 2, mergeWidth: 2, content: { data: [{ data: [{ char: 'x' }] }], type: 'text' } },
      { cellId: 'A-0-1', mergePointDX: 1, mergePointDY: 0, content: { data: [], type: 'text' } },
      { cellId: 'A-1-0', mergePointDX: 0, mergePointDY: 1, content: { data: [], type: 'text' } },
      { cellId: 'A-1-1', mergePointDX: 1, mergePointDY: 1, content: { data: [], type: 'text' } },
    ],
  },
};

describe('table-converter', () => {
  it('builds a table with colWidths and per-row heights', () => {
    const t = yneTableToSnapshot(mergedTable);
    expect(t.flavour).toBe('table');
    expect(t.props['colWidths']).toEqual([100, 100]);
    expect(t.children.length).toBe(2);
    expect((t.children[0] as any).props.height).toBe(40);
  });

  it('sets colspan/rowspan on the merge anchor', () => {
    const t = yneTableToSnapshot(mergedTable);
    const anchor = (t.children[0] as any).children[0];
    expect(anchor.flavour).toBe('table-cell');
    expect(anchor.props.colspan).toBe(2);
    expect(anchor.props.rowspan).toBe(2);
  });

  it('marks covered cells with display:none', () => {
    const t = yneTableToSnapshot(mergedTable);
    const covered = (t.children[0] as any).children[1];
    expect(covered.props.display).toBe('none');
  });

  it('converts cell content lines into paragraph children', () => {
    const t = yneTableToSnapshot(mergedTable);
    const anchor = (t.children[0] as any).children[0];
    expect(anchor.children[0].flavour).toBe('paragraph');
    expect(anchor.children[0].children).toEqual([{ insert: 'x' }]);
  });

  it('throws on malformed dimensions', () => {
    expect(() => yneTableToSnapshot({ blockType: 'table', data: { widths: [1], heights: [1], cells: [] } }))
      .toThrowError(/malformed table/);
  });
});
