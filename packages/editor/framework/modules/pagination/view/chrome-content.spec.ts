import {applyChromeAppearance, createChromeSegmentElement} from './chrome-content';

describe('chrome-content', () => {
  it('renders serializable image and styled text content', () => {
    const element = createChromeSegmentElement({
      className: 'bc-page-chrome-left',
      align: 'left',
      content: {
        gap: 8,
        items: [
          {kind: 'image', src: 'data:image/png;base64,AA==', height: 20, maxWidth: 28, borderRadius: 4},
          {kind: 'text', text: '品牌'},
          {kind: 'text', text: '@CSES', tone: 'muted'},
        ],
      },
    });

    const image = element.querySelector('img')!;
    expect(element.classList).toContain('bc-page-chrome-rich');
    expect(element.style.gap).toBe('8px');
    expect(image.style.height).toBe('20px');
    expect(image.style.maxWidth).toBe('28px');
    expect(element.textContent).toBe('品牌@CSES');
    expect(element.querySelector<HTMLElement>('.bc-page-chrome-text--muted')!.style.color)
      .toContain('--bc-page-chrome-muted-color');
  });

  it('applies the same separator box styling used by live and print chrome', () => {
    const element = document.createElement('div');
    applyChromeAppearance(element, {separator: 'top', left: 'footer'});
    expect(element.classList).toContain('bc-page-chrome--separator-top');
    expect(element.style.borderTop).toContain('1px solid');
    expect(element.style.paddingTop).toBe('6px');
  });
});
