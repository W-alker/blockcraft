// packages/editor/adapters/yne-adapter/block-converters.spec.ts
import { convertBlock } from "./block-converters";
import { YneBlock, YneConvertContext } from "./types";

const ctx = (): YneConvertContext => ({
  imageMap: new Map(),
  fileService: {} as any,
  deferredAttachments: [],
});

const rich = (text: string) => ({ data: text.split('').map(char => ({ char })) });

describe('block-converters (non-resource)', () => {
  it('maps heading with clamped level and drops font-size', () => {
    const out = convertBlock(
      { blockType: 'heading', level: '2', styles: { align: 'left' }, richText: { data: [{ char: 'a', styles: { bold: true, 'font-size': 20 } }] } },
      ctx()
    );
    expect(out.length).toBe(1);
    expect(out[0].flavour).toBe('paragraph');
    expect(out[0].props['heading']).toBe(2);
    expect(out[0].children).toEqual([{ insert: 'a', attributes: { 'a:bold': true } }]);
  });

  it('maps paragraph with non-left align to textAlign', () => {
    const out = convertBlock({ blockType: 'paragraph', styles: { align: 'center' }, richText: rich('hi') }, ctx());
    expect(out[0].flavour).toBe('paragraph');
    expect(out[0].props['textAlign']).toBe('center');
  });

  it('maps ordered list-item to ordered with depth + order', () => {
    const out = convertBlock({ blockType: 'list-item', listType: 'ordered', level: 1, index: 3, richText: rich('x') }, ctx());
    expect(out[0].flavour).toBe('ordered');
    expect(out[0].props['depth']).toBe(1);
    expect(out[0].props['order']).toBe(3);
  });

  it('maps non-ordered list-item to bullet', () => {
    const out = convertBlock({ blockType: 'list-item', listType: 'unordered', level: 0, richText: rich('x') }, ctx());
    expect(out[0].flavour).toBe('bullet');
  });

  it('maps todo checked to a timestamp, unchecked to 0', () => {
    expect(convertBlock({ blockType: 'todo', checked: false, richText: rich('a') }, ctx())[0].props['checked']).toBe(0);
    expect(convertBlock({ blockType: 'todo', checked: true, richText: rich('a') }, ctx())[0].props['checked']).toBeGreaterThan(0);
  });

  it('maps horizontal-line to divider with color', () => {
    const out = convertBlock({ blockType: 'horizontal-line', styles: { color: '#999999' } }, ctx());
    expect(out[0].flavour).toBe('divider');
    expect(out[0].props['color']).toBe('#999999');
  });

  it('maps code joining all chars (incl newline) and resolving language key', () => {
    const out = convertBlock({ blockType: 'code', language: 'typescript', richText: { data: [{ char: 'a' }, { char: '\n' }, { char: 'b' }] } }, ctx());
    expect(out[0].flavour).toBe('code');
    expect(out[0].props['lang']).toBe('TypeScript');
    expect(out[0].children).toEqual([{ insert: 'a\nb' }]);
  });

  it('throws on unknown blockType', () => {
    expect(() => convertBlock({ blockType: 'mindmap' }, ctx())).toThrowError(/unknown blockType/);
  });
});
