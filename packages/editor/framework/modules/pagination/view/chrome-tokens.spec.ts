// packages/editor/framework/modules/pagination/view/chrome-tokens.spec.ts
import {chromeHeight, hasChromeText, resolveChromeSegments, substituteTokens, DEFAULT_CHROME_HEIGHT} from "./chrome-tokens";

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
});
