import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {CsTooltipDirective} from '@cses/ui';
import {InlineImageToolbar} from './inline-image.toolbar';

describe('InlineImageToolbar', () => {
  it('shows inline-only wrap plus the existing block layout actions', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [InlineImageToolbar],
    }).createComponent(InlineImageToolbar);
    fixture.componentRef.setInput('width', 120);
    fixture.componentRef.setInput('height', 60);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.bc-inline-image-toolbar__size').textContent.trim())
      .toBe('120 × 60');

    let action: string | undefined;
    let value: unknown;
    fixture.componentInstance.onItemClicked.subscribe(item => {
      action = item.name;
      value = item.value;
    });
    fixture.nativeElement
      .querySelectorAll('bc-float-toolbar-item[name="object-layout"]')[2]
      .dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));

    expect(action).toBe('object-layout');
    expect(value).toBe('top-bottom');
    expect(fixture.nativeElement.querySelectorAll(
      'bc-float-toolbar-item[name="object-layout"]',
    ).length).toBe(5);
    const items = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll(
        'bc-float-toolbar-item[name="object-layout"]',
      ),
    );
    expect(items.map(item =>
      Array.from(
        item.querySelector('i.bc_icon')?.classList ?? [],
      ).find(className => className !== 'bc_icon'),
    )).toEqual([
      'bc_tuwenraopaiqianrushi',
      'bc_tuwenraopai',
      'bc_tuwenraopaishangxiashi',
      'bc_cengji-xia',
      'bc_cengji-shang',
    ]);
  });

  it('shows typed wrap-side controls only for square wrapping', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [InlineImageToolbar],
    }).createComponent(InlineImageToolbar);
    fixture.componentRef.setInput('layout', 'wrap');
    fixture.componentRef.setInput('side', 'left');
    fixture.detectChanges();

    const sideItems = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll(
        'bc-float-toolbar-item[name="inline-wrap-side"]',
      ),
    );
    expect(sideItems.length).toBe(3);
    expect(fixture.debugElement.queryAll(
      By.directive(CsTooltipDirective),
    ).length).toBe(8);
    expect(sideItems[1].classList.contains('active')).toBeTrue();

    let value: unknown;
    fixture.componentInstance.onItemClicked.subscribe(item => value = item.value);
    sideItems[2].dispatchEvent(new MouseEvent(
      'mousedown',
      {bubbles: true, cancelable: true},
    ));
    expect(value).toBe('right');
  });
});
