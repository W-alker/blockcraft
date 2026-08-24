import {Component, ViewEncapsulation} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {BlockNodeType} from '../../../block-std/types/block.type';
import {LiveHeightSource} from './live-height-source';

@Component({
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../../themes/base.scss',
  template: `
    <div class="bc-pagination-surface" style="width: 360px; --bc-page-width: 400px">
      <div class="bc-pagination-backdrop">
        <div class="bc-page-sheet" style="top: 0; width: 400px; height: 200px"></div>
      </div>
      <div data-blockcraft-root="true"
           class="bc-paginated"
           style="--bc-page-content-height: 200px; --bc-page-width: 400px;
                  --bc-page-margin-top: 0; --bc-page-margin-right: 72px;
                  --bc-page-margin-bottom: 0; --bc-page-margin-left: 72px">
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

      <div class="image-block" data-block-id="image-fitted" data-node-type="block">
        <figure class="image-block__container">
          <div class="img-wrapper" data-bc-page-media-fitted
               style="width: 400px; height: 400px; max-width: 200px; max-height: 200px">
            fitted image
          </div>
        </figure>
      </div>

      <div class="table-block">
        <table><tbody><tr class="table-row-block"><td class="table-cell-block">
          <div class="table-cell__children-wrapper">
            <div class="code-block bc-page-nested-height-locked"
                 data-block-id="nested-code" data-node-type="editable">
              <div class="code-block__head">nested header</div>
              <div class="edit-container-wrapper">
                <pre class="edit-container" style="height: 600px">nested code</pre>
              </div>
              <div class="resize-bar-btm"><div class="bar-drag"></div></div>
            </div>
            <div class="image-block bc-page-nested-height-locked"
                 data-block-id="nested-image" data-node-type="block">
              <div style="height: 600px">nested image</div>
            </div>
          </div>
        </td></tr></tbody></table>
      </div>

      <div class="divider-block" data-block-id="divider-1" data-node-type="void">divider</div>
      <div class="divider-block bc-page-height-locked" data-block-id="divider-2" data-node-type="void">
        <span data-zero-space="true" data-block-zero-space="true" data-block-gap-side="before">&#8203;</span>
        locked
        <span data-zero-space="true" data-block-zero-space="true" data-block-gap-side="after">&#8203;</span>
      </div>
      <div class="object-group-block root-flow-fixed-object"
           style="height: 600px; padding: 8px; box-sizing: border-box;
                  overflow: visible; --bc-object-group-padding: 8px">
        <div class="object-group-block__children" style="height: 100%">
          <div class="image-block nested-flow-group-member"
               data-bc-placement="absolute" style="overflow: visible">
            <figure class="image-block__container">
              <div class="img-wrapper nested-flow-group-member-surface"
                   style="position: relative; height: 600px; overflow: visible">
                <span class="object-control-probe"
                      style="position: absolute; top: -20px"></span>
              </div>
            </figure>
          </div>
          <div class="text-box-block nested-flow-group-member"
               data-bc-placement="absolute" style="overflow: visible">
            <div class="text-box-block__surface nested-flow-group-member-surface"
                 style="position: relative; height: 600px; overflow: visible">
              <span class="object-control-probe"
                    style="position: absolute; top: -20px"></span>
            </div>
          </div>
          <div class="word-art-block nested-flow-group-member"
               data-bc-placement="absolute" style="overflow: visible">
            <div class="word-art-block__surface nested-flow-group-member-surface"
                 style="position: relative; height: 600px; overflow: visible">
              <span class="object-control-probe"
                    style="position: absolute; top: -20px"></span>
            </div>
          </div>
          <div class="shape-block nested-flow-group-member"
               data-bc-placement="absolute" style="overflow: visible">
            <div class="shape-block__shell nested-flow-group-member-surface"
                 style="position: relative; height: 600px; overflow: visible">
              <span class="object-control-probe"
                    style="position: absolute; top: -20px"></span>
            </div>
          </div>
        </div>
      </div>
      <div class="text-box-block root-flow-fixed-object">
        <div class="text-box-block__surface root-flow-fixed-object-surface"
             style="position: relative; height: 600px; overflow: visible">
          <span class="object-control-probe" style="position: absolute; top: -20px"></span>
        </div>
      </div>
      <div class="word-art-block root-flow-fixed-object">
        <div class="word-art-block__surface root-flow-fixed-object-surface"
             style="position: relative; height: 600px; overflow: visible">
          <span class="object-control-probe" style="position: absolute; top: -20px"></span>
        </div>
      </div>
      <div class="shape-block root-flow-fixed-object">
        <div class="shape-block__shell root-flow-fixed-object-surface"
             style="position: relative; height: 600px; overflow: visible">
          <span class="object-control-probe" style="position: absolute; top: -20px"></span>
        </div>
      </div>
      <div data-bc-placement-layout
           style="position: absolute; inset: 0 0 auto; width: auto; height: 0;
                  box-sizing: border-box; padding: inherit">
        <div class="children-render-container"
             style="position: relative; box-sizing: border-box; width: 100%; height: 0">
          <div class="object-group-block nested-absolute-fixed-object"
               data-bc-placement="absolute" style="height: 600px; overflow: visible"></div>
        </div>
      </div>
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

  it('keeps the paginated root and physical sheet on the same centerline', () => {
    const host = fixture.nativeElement as HTMLElement;
    const surface = host.querySelector<HTMLElement>('.bc-pagination-surface')!;
    const root = host.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!;
    const sheet = host.querySelector<HTMLElement>('.bc-page-sheet')!;

    expect(getComputedStyle(surface).minWidth).toBe('400px');
    expect(root.getBoundingClientRect().left).toBeCloseTo(
      sheet.getBoundingClientRect().left,
      1,
    );
    expect(root.getBoundingClientRect().width).toBeCloseTo(
      sheet.getBoundingClientRect().width,
      1,
    );

    const placementContent = root.querySelector<HTMLElement>(
      '[data-bc-placement-layout] > .children-render-container',
    )!;
    expect(
      placementContent.getBoundingClientRect().left
        - sheet.getBoundingClientRect().left,
    ).toBeCloseTo(72, 1);
    expect(placementContent.getBoundingClientRect().width).toBeCloseTo(256, 1);
  });

  it('lets a fullscreen table escape the paginated root while keeping its editable child focusable', () => {
    const host = fixture.nativeElement as HTMLElement;
    const root = host.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!;
    const table = host.querySelector<HTMLElement>('.table-block')!;
    const cell = table.querySelector<HTMLTableCellElement>('.table-cell-block')!;
    const editable = document.createElement('p');
    editable.className = 'paragraph-block edit-container';
    editable.contentEditable = 'true';
    editable.textContent = 'editable';
    cell.appendChild(editable);
    const dynamicSibling = document.createElement('aside');
    root.appendChild(dynamicSibling);

    const normalTransform = getComputedStyle(root).transform;
    const normalLeft = getComputedStyle(root).left;
    expect(normalTransform).not.toBe('none');

    document.body.classList.add('bc-table-fullscreen-lock');
    root.classList.add('bc-table-fullscreen-isolation-container');
    table.classList.add('bc-table-fullscreen-isolation-branch');
    table.classList.add('is-fullscreen');
    const resizePreview = document.createElement('div');
    resizePreview.setAttribute('data-bc-table-col-resize-preview', '');
    document.body.appendChild(resizePreview);
    try {
      expect(getComputedStyle(root).transform).toBe('none');
      expect(getComputedStyle(root).left).toBe('0px');
      expect(root.parentElement!.scrollWidth).toBeLessThanOrEqual(root.parentElement!.clientWidth + 1);
      expect(getComputedStyle(dynamicSibling).visibility).toBe('hidden');
      expect(getComputedStyle(dynamicSibling).pointerEvents).toBe('none');
      expect(getComputedStyle(resizePreview).visibility).toBe('visible');
      const rect = table.getBoundingClientRect();
      expect(rect.left).toBeCloseTo(0, 0);
      expect(rect.top).toBeCloseTo(0, 0);
      expect(rect.width).toBeCloseTo(document.documentElement.clientWidth, 0);
      expect(rect.height).toBeCloseTo(document.documentElement.clientHeight, 0);

      editable.focus();
      expect(document.activeElement).toBe(editable);
      expect(editable.isContentEditable).toBeTrue();
    } finally {
      table.classList.remove('is-fullscreen');
      table.classList.remove('bc-table-fullscreen-isolation-branch');
      root.classList.remove('bc-table-fullscreen-isolation-container');
      document.body.classList.remove('bc-table-fullscreen-lock');
      resizePreview.remove();
      editable.remove();
    }

    expect(getComputedStyle(root).transform).toBe(normalTransform);
    expect(getComputedStyle(root).left).toBe(normalLeft);
    expect(getComputedStyle(dynamicSibling).visibility).toBe('visible');
    dynamicSibling.remove();
  });

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
    const nestedCode = host.querySelector<HTMLElement>('[data-block-id="nested-code"]')!;
    const nestedCodeBody = nestedCode.querySelector<HTMLElement>('.edit-container-wrapper')!;
    const nestedImage = host.querySelector<HTMLElement>('[data-block-id="nested-image"]')!;

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
    expect(getComputedStyle(nestedCode).display).toBe('flex');
    expect(getComputedStyle(nestedCode).maxHeight).toBe('200px');
    expect(getComputedStyle(nestedCode).overflow).toBe('visible');
    expect(getComputedStyle(nestedCodeBody).overflowY).toBe('auto');
    expect(getComputedStyle(nestedImage).maxHeight).toBe('200px');
    expect(getComputedStyle(nestedImage).overflow).toBe('hidden');
  });

  it('caps root-flow object frames without clipping their interaction chrome', () => {
    const host = fixture.nativeElement as HTMLElement;
    const flowObjects = Array.from(host.querySelectorAll<HTMLElement>(
      '.root-flow-fixed-object',
    ));
    const flowSurfaces = Array.from(host.querySelectorAll<HTMLElement>(
      '.root-flow-fixed-object-surface',
    ));
    const groupedMembers = Array.from(host.querySelectorAll<HTMLElement>(
      '.nested-flow-group-member',
    ));
    const groupedSurfaces = Array.from(host.querySelectorAll<HTMLElement>(
      '.nested-flow-group-member-surface',
    ));
    const absoluteObject = host.querySelector<HTMLElement>(
      '.nested-absolute-fixed-object',
    )!;

    expect(flowObjects.map(element => getComputedStyle(element).maxHeight))
      .toEqual(['200px', '200px', '200px', '200px']);
    expect(flowObjects.map(element => getComputedStyle(element).overflow))
      .toEqual(['visible', 'visible', 'visible', 'visible']);
    expect(flowSurfaces.map(element => getComputedStyle(element).maxHeight))
      .toEqual(['200px', '200px', '200px']);
    expect(flowSurfaces.map(element => getComputedStyle(element).overflow))
      .toEqual(['visible', 'visible', 'visible']);
    expect(flowSurfaces.map(element => element.getBoundingClientRect().height))
      .toEqual([200, 200, 200]);
    for (const surface of flowSurfaces) {
      const probe = surface.querySelector<HTMLElement>('.object-control-probe')!;
      expect(probe.getBoundingClientRect().top)
        .toBeLessThan(surface.getBoundingClientRect().top);
    }
    expect(groupedMembers.map(element => getComputedStyle(element).maxHeight))
      .toEqual(['184px', '184px', '184px', '184px']);
    expect(groupedMembers.map(element => getComputedStyle(element).overflow))
      .toEqual(['visible', 'visible', 'visible', 'visible']);
    expect(groupedSurfaces.map(element => getComputedStyle(element).maxHeight))
      .toEqual(['184px', '184px', '184px', '184px']);
    expect(groupedSurfaces.map(element => element.getBoundingClientRect().height))
      .toEqual([184, 184, 184, 184]);
    for (const surface of groupedSurfaces) {
      const probe = surface.querySelector<HTMLElement>('.object-control-probe')!;
      expect(probe.getBoundingClientRect().top)
        .toBeLessThan(surface.getBoundingClientRect().top);
    }
    expect(getComputedStyle(absoluteObject).maxHeight).toBe('none');
    expect(getComputedStyle(absoluteObject).overflow).toBe('visible');
  });

  it('constrains the media wrapper without zooming the block coordinate system', () => {
    const fitted = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('[data-block-id="image-fitted"]')!;
    const wrapper = fitted.querySelector<HTMLElement>('.img-wrapper')!;

    expect(getComputedStyle(fitted).zoom).toBe('1');
    expect(getComputedStyle(wrapper).maxWidth).toBe('200px');
    expect(getComputedStyle(wrapper).maxHeight).toBe('200px');
    expect(wrapper.getBoundingClientRect().width).toBeCloseTo(200, 1);
    expect(wrapper.getBoundingClientRect().height).toBeCloseTo(200, 1);
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
