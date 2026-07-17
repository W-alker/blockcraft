import {Component, ViewEncapsulation} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {BlockNodeType} from '../../../block-std/types/block.type';
import {LiveHeightSource} from './live-height-source';

@Component({
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../../themes/base.scss',
  template: `
    <div data-blockcraft-root="true"
         class="bc-paginated"
         style="--bc-page-content-height: 200px; --bc-page-width: 400px;
                --bc-page-margin-top: 0; --bc-page-margin-right: 0;
                --bc-page-margin-bottom: 0; --bc-page-margin-left: 0">
      <div class="code-block focused bc-page-height-locked" data-block-id="code-1" data-node-type="editable">
        <div class="code-block__head">header</div>
        <div class="edit-container-wrapper">
          <pre class="edit-container" style="height: 600px">code</pre>
        </div>
        <div class="resize-bar-btm"><div class="bar-drag"></div></div>
      </div>

      <div class="code-block code-resized" data-block-id="code-resized" data-node-type="editable">
        <div class="code-block__head">header</div>
        <div class="edit-container-wrapper" style="height: 200px">
          <pre class="edit-container">short code</pre>
        </div>
        <div class="resize-bar-btm"><div class="bar-drag"></div></div>
      </div>

      <div class="image-block bc-page-height-locked" data-block-id="image-1" data-node-type="block">
        <figure class="image-block__container">
          <div class="img-wrapper">
            <div style="height: 600px"></div>
            <div class="block-resizer__bar block-resizer__bar--left"></div>
            <div class="block-resizer__bar block-resizer__bar--right"></div>
          </div>
        </figure>
      </div>

      <div class="divider-block" data-block-id="divider-1" data-node-type="void">divider</div>
      <div class="divider-block bc-page-height-locked" data-block-id="divider-2" data-node-type="void">
        <span data-zero-space="true" data-block-zero-space="true" data-block-gap-side="before">&#8203;</span>
        locked
        <span data-zero-space="true" data-block-zero-space="true" data-block-gap-side="after">&#8203;</span>
      </div>
    </div>
  `,
})
class PaginationThemeTestHost {}

describe('pagination theme block constraints', () => {
  let fixture: ComponentFixture<PaginationThemeTestHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [PaginationThemeTestHost]}).compileComponents();
    fixture = TestBed.createComponent(PaginationThemeTestHost);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('keeps interactive hosts visible and constrains their inner content surfaces', () => {
    const host = fixture.nativeElement as HTMLElement;
    const code = host.querySelector<HTMLElement>('.code-block')!;
    const codeBody = host.querySelector<HTMLElement>('.edit-container-wrapper')!;
    const image = host.querySelector<HTMLElement>('.image-block')!;
    const imageFigure = host.querySelector<HTMLElement>('.image-block__container')!;
    const imageWrapper = host.querySelector<HTMLElement>('.img-wrapper')!;
    const leftImageHandle = host.querySelector<HTMLElement>('.block-resizer__bar--left')!;
    const rightImageHandle = host.querySelector<HTMLElement>('.block-resizer__bar--right')!;
    const unlockedDivider = host.querySelector<HTMLElement>('[data-block-id="divider-1"]')!;
    const lockedDivider = host.querySelector<HTMLElement>('[data-block-id="divider-2"]')!;
    const lockedGapBefore = lockedDivider.querySelector<HTMLElement>('[data-block-gap-side="before"]')!;
    const lockedGapAfter = lockedDivider.querySelector<HTMLElement>('[data-block-gap-side="after"]')!;

    expect(getComputedStyle(code).overflow).toBe('visible');
    expect(getComputedStyle(code).display).toBe('flex');
    expect(getComputedStyle(code).maxHeight).toBe('200px');
    expect(getComputedStyle(codeBody).overflowY).toBe('auto');
    expect(getComputedStyle(image).overflow).toBe('hidden');
    expect(getComputedStyle(image).maxHeight).toBe('200px');
    expect(getComputedStyle(imageFigure).overflow).toBe('visible');
    expect(getComputedStyle(imageFigure).maxHeight).toBe('none');
    expect(getComputedStyle(imageFigure).clipPath).toBe('none');
    expect(getComputedStyle(imageWrapper).overflow).toBe('visible');
    expect(getComputedStyle(imageWrapper).maxHeight).toBe('none');
    expect(getComputedStyle(leftImageHandle).left).toBe('0px');
    expect(getComputedStyle(rightImageHandle).right).toBe('0px');
    expect(code.scrollHeight).toBeGreaterThan(200);
    expect(image.scrollHeight).toBeGreaterThan(200);
    expect(getComputedStyle(unlockedDivider).overflow).toBe('visible');
    expect(getComputedStyle(unlockedDivider).maxHeight).toBe('none');
    expect(getComputedStyle(lockedDivider).overflow).toBe('hidden');
    expect(getComputedStyle(lockedDivider).maxHeight).toBe('200px');
    expect(getComputedStyle(lockedGapBefore).left).toBe('1px');
    expect(getComputedStyle(lockedGapAfter).right).toBe('1px');
  });

  it('keeps the resized code block locked after flex layout collapses its scroll height', () => {
    const host = fixture.nativeElement as HTMLElement;
    const code = host.querySelector<HTMLElement>('.code-resized')!;
    const block = {
      id: 'code-resized',
      flavour: 'code',
      nodeType: BlockNodeType.editable,
      hostElement: code,
    };
    const doc = {
      root: {childrenIds: ['code-resized']},
      getBlockById: (id: string) => id === 'code-resized' ? block : null,
    } as unknown as BlockCraft.Doc;
    const source = new LiveHeightSource(doc);

    try {
      const uncappedHeight = Math.max(code.offsetHeight, code.scrollHeight);
      const [beforeLock] = source.measure({contentHeight: 200, widowOrphanLines: 2});
      expect(beforeLock?.lockHeight).toBe(200);

      code.classList.add('bc-page-height-locked');
      expect(Math.max(code.offsetHeight, code.scrollHeight)).toBeLessThan(uncappedHeight);

      const [whileLocked] = source.measure({contentHeight: 200, widowOrphanLines: 2});
      expect(whileLocked?.height).toBe(200);
      expect(whileLocked?.lockHeight).toBe(200);
    } finally {
      source.destroy();
    }
  });
});
