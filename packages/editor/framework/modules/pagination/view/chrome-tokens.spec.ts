// packages/editor/framework/modules/pagination/view/chrome-tokens.spec.ts
import {
  chromeHeight,
  DEFAULT_CHROME_HEIGHT,
  formatPageNumber,
  hasChromeText,
  resolveChromeInlineContent,
  resolveChromeSegments,
  substituteTokens,
} from "./chrome-tokens";

describe('chrome-tokens', () => {
  describe('substituteTokens', () => {
    it('替换 {page} 与 {total}（多处）', () => {
      expect(substituteTokens('第 {page}/{total} 页', 2, 5)).toBe('第 2/5 页');
      expect(substituteTokens('{page} {page} {total}', 3, 9)).toBe('3 3 9');
    });
    it('无占位符原样返回', () => {
      expect(substituteTokens('产品文档', 1, 1)).toBe('产品文档');
    });
    it('undefined / 空串返回空串', () => {
      expect(substituteTokens(undefined, 1, 1)).toBe('');
      expect(substituteTokens('', 1, 1)).toBe('');
    });
    it('支持 Word 风格的罗马数字与中文数字 token', () => {
      expect(substituteTokens('{page:roman-upper} / {total:roman-lower}', 14, 20)).toBe('XIV / xx');
      expect(substituteTokens('第 {page:chinese} 页 共 {total:chinese} 页', 12, 105))
        .toBe('第 十二 页 共 一百零五 页');
    });
    it('格式化越界罗马数字时安全回退十进制', () => {
      expect(formatPageNumber(4000, 'roman-upper')).toBe('4000');
      expect(formatPageNumber(0, 'chinese')).toBe('零');
    });
  });

  describe('hasChromeText / chromeHeight', () => {
    it('无任何段文本 → 无文本、高度 0', () => {
      expect(hasChromeText(undefined)).toBe(false);
      expect(hasChromeText({})).toBe(false);
      expect(hasChromeText({left: '', center: '', right: ''})).toBe(false);
      expect(chromeHeight(undefined)).toBe(0);
      expect(chromeHeight({})).toBe(0);
    });
    it('有任一段文本 → 有文本、默认高度', () => {
      expect(hasChromeText({center: '{page}'})).toBe(true);
      expect(chromeHeight({center: '{page}'})).toBe(DEFAULT_CHROME_HEIGHT);
    });
    it('只有结构化内容时也占用页眉页脚高度', () => {
      const chrome = {
        content: {
          left: {items: [{kind: 'image' as const, src: 'data:image/png;base64,AA=='}]},
        },
      };
      expect(hasChromeText(chrome)).toBe(true);
      expect(chromeHeight(chrome)).toBe(DEFAULT_CHROME_HEIGHT);
    });
    it('显式 height 覆盖默认', () => {
      expect(chromeHeight({left: 'x', height: 40})).toBe(40);
    });
    it('有 height 但无文本仍为 0（不占高度）', () => {
      expect(chromeHeight({height: 40})).toBe(0);
    });
  });

  describe('resolveChromeSegments', () => {
    it('三段都替换占位符', () => {
      expect(resolveChromeSegments({left: '文档', center: '{page}', right: '{page}/{total}'}, 2, 7))
        .toEqual({left: '文档', center: '2', right: '2/7'});
    });
    it('undefined chrome → 三段空串', () => {
      expect(resolveChromeSegments(undefined, 1, 1)).toEqual({left: '', center: '', right: ''});
    });
  });

  describe('resolveChromeInlineContent', () => {
    it('只替换结构化文本 token，并保留图片项', () => {
      const image = {kind: 'image' as const, src: 'data:image/png;base64,AA=='};
      expect(resolveChromeInlineContent({
        gap: 8,
        items: [image, {kind: 'text', text: '第 {page}/{total} 页', tone: 'muted'}],
      }, 2, 7)).toEqual({
        gap: 8,
        items: [image, {kind: 'text', text: '第 2/7 页', tone: 'muted'}],
      });
    });
  });
});
