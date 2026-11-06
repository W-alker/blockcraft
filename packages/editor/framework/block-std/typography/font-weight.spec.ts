import {normalizeInlineFontWeight, normalizeInlineFontWeightPatch, readInlineFontWeight} from './font-weight';
import {normalizeParagraphTextDefaults} from './paragraph-style';

describe('inline font weight', () => {
  it('normalizes numeric and legacy weights, rejects unsafe values', () => {
    for (const value of [0, 1001, NaN, '600; color:red', 'inherit', '']) expect(normalizeInlineFontWeight(value)).toBeNull();
    expect(normalizeInlineFontWeight('550')).toBe(550);
    expect(readInlineFontWeight({'a:bold': true})).toBe(700);
    expect(readInlineFontWeight({'a:bold': true, 's:fontWeight': '400'})).toBe(400);
  });
  it('makes weight and bold patches idempotent, including a pending caret patch', () => {
    for (const input of [{'a:bold': true}, {'a:bold': null}, {'s:fontWeight': '500'}, {'s:fontWeight': '900'}, {'s:fontWeight': null, 'a:bold': null}] as const) {
      const patch = normalizeInlineFontWeightPatch(input);
      expect(normalizeInlineFontWeightPatch(patch)).toEqual(patch);
    }
    expect(normalizeInlineFontWeightPatch({'a:bold': true})).toEqual({'a:bold': true, 's:fontWeight': null, 's:font-weight': null});
    expect(normalizeInlineFontWeightPatch({'s:fontWeight': '500', 'a:bold': true})['a:bold']).toBeNull();
  });
  it('retains numeric weight in paragraph defaults without unrelated styles', () => {
    expect(normalizeParagraphTextDefaults({'s:fontWeight': '600', 's:position': 'fixed'})).toEqual({'s:fontWeight': '600'});
  });
});
