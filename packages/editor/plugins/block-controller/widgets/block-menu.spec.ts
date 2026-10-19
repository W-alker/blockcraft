import {TestBed} from '@angular/core/testing';
import {DomSanitizer} from '@angular/platform-browser';
import {MatIconRegistry} from '@angular/material/icon';
import {BlockMenuComponent} from './block-menu';

describe('BlockMenuComponent svg icons', () => {
  it('renders sort action svgIcon through MatIconRegistry', async () => {
    await TestBed.configureTestingModule({
      imports: [BlockMenuComponent],
    }).compileComponents();

    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    registry.addSvgIconLiteral(
      'bc_test_sort_icon',
      sanitizer.bypassSecurityTrustHtml('<svg viewBox="0 0 24 24"><path d="M4 7h16v2H4z"/></svg>'),
    );

    const fixture = TestBed.createComponent(BlockMenuComponent);
    fixture.componentRef.setInput('items', [{
      type: 'sort',
      name: 'sort',
      label: '排序',
      actions: [{key: 'asc', svgIcon: 'bc_test_sort_icon'}],
    }]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-icon[data-mat-icon-name="bc_test_sort_icon"] svg')).not.toBeNull();
    expect(host.querySelector('.sort-action use')).toBeNull();
  });

  it('marks appearance dropdown and picker items for neutral hover styling', async () => {
    await TestBed.configureTestingModule({
      imports: [BlockMenuComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(BlockMenuComponent);
    fixture.componentRef.setInput('items', [
      {
        type: 'dropdown',
        name: 'block-appearance',
        label: '颜色',
        items: [],
      },
      {
        type: 'custom',
        name: 'block-appearance-colors',
        label: '色板',
      },
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('bc-float-toolbar-item.appearance-menu-item'))
      .not.toBeNull();
    expect(host.querySelector('bc-float-toolbar-item.appearance-picker-item'))
      .not.toBeNull();
  });
});
