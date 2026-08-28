// Clipboard-owned Youdao Note inline converter tests.
import { richTextToDelta, styleToAttributes } from "./inline-converter";

describe('inline-converter', () => {
  it('coalesces consecutive chars with identical styles into one run', () => {
    const delta = richTextToDelta({
      data: [
        { char: 'a', styles: { bold: true } },
        { char: 'b', styles: { bold: true } },
        { char: 'c' },
      ],
    });
    expect(delta).toEqual([
      { insert: 'ab', attributes: { 'a:bold': true } },
      { insert: 'c' },
    ]);
  });

  it('maps all six style keys to delta attributes', () => {
    expect(styleToAttributes({ bold: true, italic: true, strike: true, color: '#F33232', 'back-color': '#FFF2CC', 'font-size': 20 }))
      .toEqual({ 'a:bold': true, 'a:italic': true, 'a:strike': true, 's:color': '#F33232', 's:background': '#FFF2CC', 's:fontSize': '20px' });
  });

  it('drops font-size when dropFontSize is set (heading case)', () => {
    expect(styleToAttributes({ bold: true, 'font-size': 20 }, { dropFontSize: true }))
      .toEqual({ 'a:bold': true });
  });

  it('returns empty delta for empty richText', () => {
    expect(richTextToDelta(undefined)).toEqual([]);
    expect(richTextToDelta({ data: [] })).toEqual([]);
  });

  it('returns null attributes for unstyled char', () => {
    expect(styleToAttributes(undefined)).toBeNull();
    expect(styleToAttributes({})).toBeNull();
  });
});
