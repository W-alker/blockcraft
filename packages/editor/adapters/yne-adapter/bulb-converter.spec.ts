import { bulbNodesToDelta, convertBulbBlock, marksToAttributes, BulbConvertContext, BulbNode } from "./bulb-converter";
import { collectAndStripRehostMarkers } from "./resource";

function makeCtx(over: Partial<BulbConvertContext> = {}): BulbConvertContext {
  return {
    imageDataUris: [],
    imageCursor: { i: 0 },
    fileService: { createObjectURL: (f: File) => `blob-local:${f.name}` } as never,
    ...over,
  };
}

const textNode = (leaves: BulbNode['leaves']): BulbNode => ({ type: 'text', leaves });

describe('bulb marksToAttributes', () => {
  it('maps youdao marks to delta attributes', () => {
    expect(marksToAttributes([
      { type: 'bold' }, { type: 'italic' }, { type: 'delete' },
      { type: 'color', value: '#F33232' }, { type: 'backgroundColor', value: '#FFF2CC' },
    ])).toEqual({
      'a:bold': true, 'a:italic': true, 'a:strike': true,
      's:color': '#F33232', 's:background': '#FFF2CC',
    });
  });

  it('returns null for no marks', () => {
    expect(marksToAttributes(undefined)).toBeNull();
    expect(marksToAttributes([])).toBeNull();
  });

  it('drops fontSize for headings', () => {
    expect(marksToAttributes([{ type: 'fontSize', value: 28 }], { dropFontSize: true })).toBeNull();
    expect(marksToAttributes([{ type: 'fontSize', value: 28 }])).toEqual({ 's:fontSize': '28px' });
  });
});

describe('bulbNodesToDelta', () => {
  it('builds runs from leaves with marks', () => {
    const delta = bulbNodesToDelta([textNode([
      { text: 'AB', marks: [{ type: 'bold' }] },
      { text: 'cd', marks: [] },
    ])]);
    expect(delta).toEqual([
      { insert: 'AB', attributes: { 'a:bold': true } },
      { insert: 'cd' },
    ]);
  });
});

describe('convertBulbBlock', () => {
  it('heading h1 -> paragraph heading 1, drops font-size', () => {
    const out = convertBulbBlock({ name: 'heading', data: { level: 'h1' }, nodes: [textNode([{ text: 'd', marks: [{ type: 'bold' }, { type: 'fontSize', value: 28 }] }])] }, makeCtx());
    expect(out[0].flavour).toBe('paragraph');
    expect(out[0].props['heading']).toBe(1);
    expect(out[0].children).toEqual([{ insert: 'd', attributes: { 'a:bold': true } }]);
  });

  it('paragraph keeps center align', () => {
    const out = convertBulbBlock({ name: 'paragraph', data: { style: { textAlign: 'center' } }, nodes: [textNode([{ text: 'x' }])] }, makeCtx());
    expect(out[0].props['textAlign']).toBe('center');
  });

  it('ordered list-item -> ordered with depth + order', () => {
    const out = convertBulbBlock({ name: 'list-item', data: { listType: 'ordered', listLevel: 1 }, state: { index: 3 }, nodes: [textNode([{ text: 'a' }])] }, makeCtx());
    expect(out[0].flavour).toBe('ordered');
    expect(out[0].props['depth']).toBe(0);
    expect(out[0].props['order']).toBe(2);
  });

  it('todo checked -> timestamp', () => {
    expect(convertBulbBlock({ name: 'todo', data: { checked: true }, nodes: [textNode([{ text: 'a' }])] }, makeCtx())[0].props['checked']).toBeGreaterThan(0);
    expect(convertBulbBlock({ name: 'todo', data: { checked: false }, nodes: [textNode([{ text: 'a' }])] }, makeCtx())[0].props['checked']).toBe(0);
  });

  it('hr -> divider', () => {
    expect(convertBulbBlock({ name: 'hr' }, makeCtx())[0].flavour).toBe('divider');
  });

  it('image consumes next data: uri as local ObjectURL src', () => {
    const ctx = makeCtx({ imageDataUris: ['data:image/png;base64,aGk='] });
    const out = convertBulbBlock({ name: 'image', data: { url: 'https://note.youdao/x', width: 288, height: 284 } }, ctx);
    expect(out[0].flavour).toBe('image');
    expect(out[0].props['src']).toBe('blob-local:image.png');
    expect(out[0].props['width']).toBe(288);
    expect(ctx.imageCursor.i).toBe(1);
  });

  it('image without data: uri falls back to youdao url', () => {
    const out = convertBulbBlock({ name: 'image', data: { url: 'https://note.youdao/x' } }, makeCtx());
    expect(out[0].props['src']).toBe('https://note.youdao/x');
  });

  it('attachment -> attachment block (not image) + deferred re-host', () => {
    const ctx = makeCtx();
    const out = convertBulbBlock({ name: 'attachment', data: { fileName: 'a.csv', fileLength: 3913, source: 'https://note.youdao/a' } }, ctx);
    expect(out[0].flavour).toBe('attachment');
    expect(out[0].props['url']).toBe('https://note.youdao/a');
    expect(out[0].props['type']).toBe('text/csv');
    const markers = collectAndStripRehostMarkers(out[0]);
    expect(markers.length).toBe(1);
    expect(markers[0].url).toBe('https://note.youdao/a');
  });

  it('throws on unknown block', () => {
    expect(() => convertBulbBlock({ name: 'mindmap' }, makeCtx())).toThrowError(/unknown block/);
  });
});

describe('bulb table grid reconstruction', () => {
  // 3 cols x 2 rows: A=colSpan2/rowSpan2 at (0,0), B at (0,2), C at (1,2)
  const table: BulbNode = {
    name: 'table',
    data: { colsWidth: [100, 100, 100], rowsHeight: [40, 40] },
    nodes: [
      { name: 'table-row', nodes: [
        { name: 'table-cell', data: { colSpan: 2, rowSpan: 2 }, nodes: [{ name: 'paragraph', nodes: [textNode([{ text: 'A' }])] }] },
        { name: 'table-cell', nodes: [{ name: 'paragraph', nodes: [textNode([{ text: 'B' }])] }] },
      ] },
      { name: 'table-row', nodes: [
        { name: 'table-cell', nodes: [{ name: 'paragraph', nodes: [textNode([{ text: 'C' }])] }] },
      ] },
    ],
  };

  it('builds colWidths + per-row heights', () => {
    const t = convertBulbBlock(table, makeCtx())[0];
    expect(t.flavour).toBe('table');
    expect(t.props['colWidths']).toEqual([100, 100, 100]);
    expect(t.children.length).toBe(2);
  });

  it('row0 = [anchor(2x2), hidden, B]', () => {
    const t = convertBulbBlock(table, makeCtx())[0];
    const row0 = (t.children[0] as any).children;
    expect(row0.length).toBe(3);
    expect(row0[0].props.colspan).toBe(2);
    expect(row0[0].props.rowspan).toBe(2);
    expect(row0[1].props.display).toBe('none');
    expect(row0[2].children[0].children).toEqual([{ insert: 'B' }]);
  });

  it('row1 = [hidden, hidden, C]', () => {
    const t = convertBulbBlock(table, makeCtx())[0];
    const row1 = (t.children[1] as any).children;
    expect(row1.length).toBe(3);
    expect(row1[0].props.display).toBe('none');
    expect(row1[1].props.display).toBe('none');
    expect(row1[2].children[0].children).toEqual([{ insert: 'C' }]);
  });
});
