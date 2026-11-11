import {ChangeDetectorRef} from '@angular/core';
import {fakeAsync, tick} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {ObjectAnimationSettingsComponent} from './settings.component';
import {normalizeObjectAnimation} from '../../framework/modules/object/animation/config';

describe('object animation draft settings', () => {
  function harness() {
    const changes = new Subject<{blockIds: string[]}>();
    const animation = {
      read: jasmine.createSpy('read').and.returnValue(null),
      preview: jasmine.createSpy('preview'), stopPreview: jasmine.createSpy('stopPreview'),
      acquireEditingLease: () => () => {},
      update: jasmine.createSpy('update').and.returnValue(true), reducedMotion: false,
    };
    const component = new ObjectAnimationSettingsComponent({markForCheck() {}} as ChangeDetectorRef);
    component.doc = {
      isReadonly: false, objectAnimation: animation,
      model: {exists: () => true, contentChange$: changes},
      readonlyManager: {isReadonly: () => false},
      ngZone: {runOutsideAngular: (callback: () => void) => callback()},
    } as unknown as BlockCraft.Doc;
    component.blockIds = ['object'];
    component.ngOnInit();
    return {component, animation, changes};
  }

  it('coalesces quick edits into one preview and saves no draft props', fakeAsync(() => {
    const {component, animation} = harness();
    component.choose('fade');
    tick(100);
    component.patch({duration: 2000});
    tick(100);
    component.patch({delay: 300});
    tick(179);
    expect(animation.preview).not.toHaveBeenCalled();
    tick(1);
    expect(animation.preview).toHaveBeenCalledOnceWith(['object'], jasmine.objectContaining({duration: 2000, delay: 300}));
    expect(animation.update).not.toHaveBeenCalled();
    component.ngOnDestroy();
  }));

  it('cancels a scheduled preview on close without writing the draft', fakeAsync(() => {
    const {component, animation} = harness();
    component.choose('pulse');
    component.ngOnDestroy();
    tick(1000);
    expect(animation.preview).not.toHaveBeenCalled();
    expect(animation.update).not.toHaveBeenCalled();
  }));

  it('keeps a local draft during model refresh and confirms it once', fakeAsync(() => {
    const {component, animation, changes} = harness();
    component.choose('slide');
    component.patch({duration: 1800});
    animation.read.and.returnValue(normalizeObjectAnimation({effect: 'pulse'}));
    changes.next({blockIds: ['object']});
    expect(component.config?.effect).toBe('slide');
    const dismiss = jasmine.createSpy('dismiss');
    component.dismiss.subscribe(dismiss);
    component.confirm();
    tick(1000);
    expect(animation.update).toHaveBeenCalledOnceWith(['object'], jasmine.objectContaining({effect: 'slide', duration: 1800}));
    expect(animation.preview).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledOnceWith('confirm');
    component.ngOnDestroy();
  }));
  it('remembers a specified count across single and infinite playback without saving', fakeAsync(() => {
    const {component, animation} = harness();
    component.choose('heartbeat');
    expect(component.repeatMode).toBe('once');
    component.setRepeatMode('count');
    expect(component.config?.iterations).toBe(2);
    component.iterationsChange(4);
    component.setRepeatMode('infinite');
    expect(component.config?.iterations).toBe('infinite');
    component.setRepeatMode('once');
    expect(component.config?.iterations).toBe(1);
    component.setRepeatMode('count');
    expect(component.config?.iterations).toBe(4);
    expect(animation.update).not.toHaveBeenCalled();
    component.ngOnDestroy();
  }));

  it('opens the saved category and browsing another category does not edit the draft', () => {
    const {component, animation} = harness();
    animation.read.and.returnValue(normalizeObjectAnimation({effect: 'swing', iterations: 3}));
    component.refresh();
    expect(component.category).toBe('emphasis');
    expect(component.repeatMode).toBe('count');
    component.category = 'entrance';
    component.confirm();
    expect(animation.update).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

});
