import {fakeAsync, TestBed, tick} from '@angular/core/testing';
import {OverlayContainer} from '@angular/cdk/overlay';
import {DomSanitizer} from '@angular/platform-browser';
import {MatIconRegistry} from '@angular/material/icon';
import {BlockMenuComponent} from './block-menu';
import {BlockControllerPlugin} from '../index';

describe('BlockMenuComponent svg icons', () => {
  it('opens table width actions on hover and dispatches the existing commands', fakeAsync(() => {
    TestBed.configureTestingModule({imports: [BlockMenuComponent]});
    const table = {props: {}, isAutoColumnWidth: true,
      setEqualColumnWidths: jasmine.createSpy('equal'),
      optimizeColumnWidths: jasmine.createSpy('smart'),
    };
    const context = {findClosestBlock: () => table};
    const plugin = new BlockControllerPlugin();
    const items = (plugin as any).resolveTableMenu(context)[0].items;
    const fixture = TestBed.createComponent(BlockMenuComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentInstance.itemAction.subscribe(event => (plugin as any).handleTableMenuAction(event, context));
    fixture.detectChanges();
    tick();
    const host = fixture.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    overlay.style.setProperty('--bc-padding-sm', '4px');
    const trigger = Array.from(host.querySelectorAll('bc-float-toolbar-item'))
      .find(item => item.textContent?.trim() === '列宽调整')!;
    expect(trigger.querySelector('.bc_zidongliekuan')).not.toBeNull();
    expect(host.textContent).not.toContain('均分列宽');
    expect(host.textContent).not.toContain('智能调整列宽');
    expect(overlay.querySelector('bc-float-toolbar')).toBeNull();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    tick();
    fixture.detectChanges();
    const actions = Array.from(overlay.querySelectorAll('bc-float-toolbar-item'));
    expect(actions.map(item => item.textContent?.trim())).toEqual(['均分列宽', '智能调整列宽']);
    expect(overlay.querySelector('.bc_icon, mat-icon')).toBeNull();
    expect(getComputedStyle(actions[0]).display).not.toBe('none');
    expect(getComputedStyle(overlay.querySelector('.bc-float-toolbar__wrapper')!).width).toBe('200px');
    expect(getComputedStyle(overlay.querySelector('.bc-float-toolbar__wrapper')!).padding).toBe('4px');
    for (const action of actions) {
      const label = action.querySelector('span')!;
      expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    }
    actions[0].dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
    actions[1].dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
    expect(table.setEqualColumnWidths).toHaveBeenCalledTimes(1);
    expect(table.optimizeColumnWidths).toHaveBeenCalledTimes(1);
    fixture.destroy();
    tick();
  }));

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
        menuWidth: 240,
        items: [{type: 'custom', name: 'block-appearance-colors', label: '色板'}],
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
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    overlay.style.setProperty('--bc-padding-sm', '4px');
    host.querySelector('.appearance-menu-item')!.dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const panel = overlay.querySelector('.bc-float-toolbar__wrapper')!;
    expect(getComputedStyle(panel).width).toBe('240px');
    expect(getComputedStyle(panel).padding).toBe('0px');
    fixture.destroy();
  });
});
