import {applyInlineTypographyAttribute} from './index';

describe('typography DOM application', () => {
  let parent: HTMLDivElement;
  let element: HTMLSpanElement;

  beforeEach(() => {
    parent = document.createElement('div');
    parent.style.fontSize = '16px';
    element = document.createElement('span');
    parent.append(element);
    document.body.append(parent);
  });

  afterEach(() => parent.remove());

  it('applies semantic typography to styles and data attributes', () => {
    expect(applyInlineTypographyAttribute(element, 't:fs', 1.25)).toBeTrue();
    applyInlineTypographyAttribute(element, 't:ff', 'mono');
    applyInlineTypographyAttribute(element, 't:ls', 0.1);
    expect(getComputedStyle(element).fontSize).toBe('20px');
    expect(getComputedStyle(element).fontFamily).toContain('monospace');
    expect(getComputedStyle(element).letterSpacing).toBe('2px');
    expect({...element.dataset}).toEqual({bcFs: '1.25', bcFf: 'mono', bcLs: '0.1'});
  });

  it('clears invalid or removed values and restores inherited typography', () => {
    applyInlineTypographyAttribute(element, 't:fs', 1.25);
    applyInlineTypographyAttribute(element, 't:ff', 'mono');
    applyInlineTypographyAttribute(element, 't:ls', 0.1);
    applyInlineTypographyAttribute(element, 't:fs', null);
    applyInlineTypographyAttribute(element, 't:ff', 'unknown-font');
    applyInlineTypographyAttribute(element, 't:ls', 0.6);
    expect(getComputedStyle(element).fontSize).toBe('16px');
    expect(element.style.fontFamily).toBe('');
    expect(element.style.letterSpacing).toBe('');
    expect(Object.keys(element.dataset)).toEqual([]);
  });

  it('composes fixed pixels with both scales in either attribute order', () => {
    parent.style.setProperty('--bc-block-fs-scale', '1.5');
    applyInlineTypographyAttribute(element, 't:fs', 1.25);
    applyInlineTypographyAttribute(element, 't:px', 16);
    expect(getComputedStyle(element).fontSize).toBe('30px');
    applyInlineTypographyAttribute(element, 't:fs', 2);
    expect(getComputedStyle(element).fontSize).toBe('48px');
    applyInlineTypographyAttribute(element, 't:fs', null);
    expect(getComputedStyle(element).fontSize).toBe('24px');
    applyInlineTypographyAttribute(element, 't:px', null);
    expect(getComputedStyle(element).fontSize).toBe('16px');
    applyInlineTypographyAttribute(element, 't:px', 16);
    applyInlineTypographyAttribute(element, 't:fs', 1.25);
    expect(getComputedStyle(element).fontSize).toBe('30px');
  });

  it('leaves unrelated attributes untouched', () => {
    element.style.color = 'red';
    element.dataset['custom'] = 'keep';
    const before = element.outerHTML;
    expect(applyInlineTypographyAttribute(element, 'unknown', 1)).toBeFalse();
    expect(element.outerHTML).toBe(before);
  });
});
