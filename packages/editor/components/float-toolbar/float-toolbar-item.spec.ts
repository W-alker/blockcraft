import {TestBed} from '@angular/core/testing';
import {DomSanitizer} from '@angular/platform-browser';
import {MatIconRegistry} from '@angular/material/icon';
import {BcFloatToolbarItemComponent} from './float-toolbar-item';

describe('BcFloatToolbarItemComponent', () => {
  it('renders svgIcon through MatIconRegistry without a global symbol sprite', async () => {
    await TestBed.configureTestingModule({
      imports: [BcFloatToolbarItemComponent],
    }).compileComponents();

    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    registry.addSvgIconLiteral(
      'bc_test_toolbar_icon',
      sanitizer.bypassSecurityTrustHtml('<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>'),
    );

    const fixture = TestBed.createComponent(BcFloatToolbarItemComponent);
    fixture.componentRef.setInput('svgIcon', 'bc_test_toolbar_icon');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-icon[data-mat-icon-name="bc_test_toolbar_icon"] svg')).not.toBeNull();
    expect(host.querySelector('use')).toBeNull();
  });
});
