import {ChangeDetectionStrategy, Component, ViewEncapsulation} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {applyParagraphDecoration} from './decoration';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../themes/base.scss',
})
class ParagraphFloatTheme {}

describe('paragraph wrapped-object theme ownership', () => {
  function createParagraph(position?: string) {
    const fixture = TestBed.createComponent(ParagraphFloatTheme);
    fixture.detectChanges();
    const root = document.createElement('div');
    root.dataset['blockcraftRoot'] = 'true';
    root.style.cssText = 'width:600px;font-size:16px;line-height:24px';
    const paragraph = document.createElement('p');
    paragraph.className = 'paragraph-block';
    paragraph.dataset['blockId'] = 'owner';
    const container = document.createElement('span');
    container.className = 'bc-paragraph-text edit-container';
    const object = document.createElement('span');
    object.style.cssText = 'float:left;width:120px;height:149px';
    container.append(object, '图片说明');
    paragraph.append(container);
    if (position) applyParagraphDecoration(paragraph, {
      position, before: '20px', after: '20px', gap: 8,
    } as any);
    const following = document.createElement('div');
    following.className = 'bullet-block';
    following.textContent = '后续正文必须从完整段落之后开始';
    root.append(paragraph, following);
    fixture.nativeElement.append(root);
    return {fixture, paragraph, container, object, following};
  }

  beforeEach(() => TestBed.configureTestingModule({imports: [ParagraphFloatTheme]}));

  for (const position of [undefined, 'before', 'after', 'both', 'above', 'below']) {
    it(`contains wrapped objects with ${position ?? 'no'} paragraph decoration`, () => {
      const {fixture, paragraph, container, object, following} = createParagraph(position);
      try {
        container.setAttribute('data-bc-inline-float-owner', '');
        expect(getComputedStyle(container).display).toBe('flow-root');
        expect(container.getBoundingClientRect().height).toBeGreaterThanOrEqual(149);
        expect(paragraph.getBoundingClientRect().bottom)
          .toBeGreaterThanOrEqual(object.getBoundingClientRect().bottom);
        expect(following.getBoundingClientRect().top)
          .toBeGreaterThanOrEqual(object.getBoundingClientRect().bottom);
        if (position === 'before' || position === 'after' || position === 'both') {
          expect(getComputedStyle(paragraph).display).toBe('flex');
        } else if (position) {
          expect(getComputedStyle(paragraph).display).toBe('grid');
        }
      } finally {
        fixture.destroy();
      }
    });
  }

  it('restores the ordinary block text layout when wrap ownership is removed', () => {
    const {fixture, container, object} = createParagraph();
    try {
      container.setAttribute('data-bc-inline-float-owner', '');
      expect(getComputedStyle(container).display).toBe('flow-root');
      object.remove();
      container.removeAttribute('data-bc-inline-float-owner');
      expect(getComputedStyle(container).display).toBe('block');
      expect(container.getBoundingClientRect().height).toBeLessThan(149);
    } finally {
      fixture.destroy();
    }
  });
});
