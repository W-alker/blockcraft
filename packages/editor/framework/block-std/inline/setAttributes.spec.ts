import { setAttributes } from "./setAttributes";
import { IInlineNodeAttrs } from "../types";

describe('setAttributes', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('span');
  });

  it('renders camelCase s: style keys as hyphenated CSS properties', () => {
    // `setProperty('fontSize', …)` 会被静默忽略；必须转成 'font-size' 才生效。
    setAttributes(el, { 's:fontSize': '1.2em', 's:fontFamily': 'serif' } as IInlineNodeAttrs);
    expect(el.style.getPropertyValue('font-size')).toBe('1.2em');
    expect(el.style.getPropertyValue('font-family')).toBe('serif');
  });

  it('renders compact semantic typography keys and keeps their short ids in data attributes', () => {
    setAttributes(el, {
      't:ff': 'kai',
      't:fs': 1.2,
      't:ls': 0.1,
    } as IInlineNodeAttrs);

    expect(el.dataset['bcFf']).toBe('kai');
    expect(el.dataset['bcFs']).toBe('1.2');
    expect(el.dataset['bcLs']).toBe('0.1');
    expect(el.style.fontFamily).toContain('Kaiti SC');
    expect(el.style.fontSize).toBe('1.2em');
    expect(el.style.letterSpacing).toBe('0.1em');
  });

  it('rejects invalid compact typography values instead of applying arbitrary CSS', () => {
    setAttributes(el, {
      't:ff': 'url(javascript:bad)',
      't:fs': 99,
      't:ls': 3,
    } as unknown as IInlineNodeAttrs);

    expect(el.style.fontFamily).toBe('');
    expect(el.style.fontSize).toBe('');
    expect(el.style.letterSpacing).toBe('');
    expect(el.dataset['bcFf']).toBeUndefined();
  });

  it('lets compact typography win over legacy aliases in transition patches', () => {
    setAttributes(el, {
      't:fs': 1.5,
      's:fontSize': null,
      't:ls': 0.1,
      's:letterSpacing': null,
    } as IInlineNodeAttrs);

    expect(el.style.fontSize).toBe('1.5em');
    expect(el.style.letterSpacing).toBe('0.1em');
  });

  it('still applies single-word s: style keys (no regression)', () => {
    setAttributes(el, { 's:color': 'rgb(255, 0, 0)', 's:background': 'rgb(0, 0, 255)' } as IInlineNodeAttrs);
    expect(el.style.getPropertyValue('color')).toBe('rgb(255, 0, 0)');
    expect(el.style.getPropertyValue('background')).toBe('rgb(0, 0, 255)');
  });

  it('removes a style when the value is null', () => {
    setAttributes(el, { 's:fontSize': '1.2em' } as IInlineNodeAttrs);
    expect(el.style.getPropertyValue('font-size')).toBe('1.2em');

    setAttributes(el, { 's:fontSize': null } as IInlineNodeAttrs);
    expect(el.style.getPropertyValue('font-size')).toBe('');
  });

  it('preserves case for CSS custom properties (no kebab mangling)', () => {
    setAttributes(el, { 's:--myVar': '10px' } as unknown as IInlineNodeAttrs);
    expect(el.style.getPropertyValue('--myVar')).toBe('10px');
  });

  it('maps a: keys to attributes and d: keys to dataset', () => {
    setAttributes(el, { 'a:bold': true, 'd:foo': 'bar' } as unknown as IInlineNodeAttrs);
    expect(el.getAttribute('bold')).toBe('true');
    expect(el.dataset['foo']).toBe('bar');
  });
});
