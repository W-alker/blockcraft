import {TestBed} from '@angular/core/testing';
import {FloatingToolbarComponent, FloatingToolbarState} from './index';

describe('FloatingToolbarState and shell', () => {
  it('supports construction, live switching and idempotent updates', () => {
    const state = new FloatingToolbarState({collapsed: true});
    const changes: boolean[] = [];
    state.changes$.subscribe(value => changes.push(value));
    expect(state.collapsed()).toBeTrue();
    state.setCollapsed(true);
    state.toggle();
    state.setCollapsed(true);
    expect(changes).toEqual([false, true]);
  });

  it('keeps programmatic changes, buttons and aria state in sync and unsubscribes on destruction', () => {
    const fixture = TestBed.createComponent(FloatingToolbarComponent);
    const state = new FloatingToolbarState({collapsed: true});
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const content = fixture.nativeElement.querySelector('.floating-toolbar__content') as HTMLElement;
    expect(content.hidden).toBeTrue();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(state.collapsed()).toBeFalse();
    expect(content.hidden).toBeFalse();
    const output = spyOn(fixture.componentInstance.collapsedChange, 'emit');
    state.setCollapsed(true);
    fixture.detectChanges();
    expect(content.hidden).toBeTrue();
    expect(output).toHaveBeenCalledOnceWith(true);
    fixture.destroy();
    state.setCollapsed(false);
    expect(output).toHaveBeenCalledTimes(1);
  });
});

it('projects the overlay height budget without adding an outer scroll owner and releases its observer', async () => {
  const fixture = TestBed.createComponent(FloatingToolbarComponent);
  const pane = document.createElement('div');
  pane.className = 'cdk-overlay-pane';
  pane.style.maxHeight = '200px';
  document.body.append(pane);
  pane.append(fixture.nativeElement);
  fixture.componentRef.setInput('constrainHeight', true);
  fixture.detectChanges();
  const content = fixture.nativeElement.querySelector('.floating-toolbar__content') as HTMLElement;
  const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  try {
    await frames();
    expect(content.style.getPropertyValue('--bc-floating-toolbar-content-height')).toBe('175px');
    expect(getComputedStyle(content).overflowY).toBe('visible');
    pane.style.maxHeight = '100px';
    await frames();
    expect(content.style.getPropertyValue('--bc-floating-toolbar-content-height')).toBe('75px');
    fixture.destroy();
    pane.style.maxHeight = '300px';
    await frames();
    expect(content.style.getPropertyValue('--bc-floating-toolbar-content-height')).toBe('');
  } finally {
    if (!fixture.componentRef.hostView.destroyed) fixture.destroy();
    pane.remove();
  }
});
