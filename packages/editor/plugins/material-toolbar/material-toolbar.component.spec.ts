import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {MaterialToolbarComponent} from './material-toolbar.component';

describe('MaterialToolbarComponent', () => {
  function setup() {
    const updates = new Subject<void>();
    const placement = {
      isInObjectGroup: () => false,
      getObjectLayout: () => 'over',
      supportsObjectLayout: () => true,
      getState: () => ({mode: 'absolute'}),
      canMoveForward: () => true,
      canMoveBackward: () => true,
      moveForward: jasmine.createSpy('moveForward'),
      moveBackward: jasmine.createSpy('moveBackward'),
    };
    const doc = {
      isReadonly: false, model: {exists: () => true},
      vm: {get: () => ({instance: block})}, placement,
      onChildrenUpdate$: updates, onPropsUpdate$: new Subject(),
      readonlyManager: {stateChange$: new Subject()},
      crud: {undoManager: {stopCapturing: jasmine.createSpy('stopCapturing')}},
    };
    const block = {id: 'material', flavour: 'person-card', isReadonly: false, doc};
    const fixture = TestBed.createComponent(MaterialToolbarComponent);
    fixture.componentRef.setInput('block', block);
    fixture.detectChanges();
    return {fixture, doc, block, placement, updates};
  }

  beforeEach(() => TestBed.configureTestingModule({imports: [MaterialToolbarComponent]}));

  it('shows one horizontal toolbar without inventing person settings', () => {
    const {fixture} = setup();
    expect(getComputedStyle(fixture.nativeElement.querySelector('nav')).display).toBe('flex');
    expect(fixture.nativeElement.querySelector('[aria-label="上移一层"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="日期设置"]')).toBeNull();
  });

  it('refreshes limits after sibling reorder and releases subscriptions on destroy', fakeAsync(() => {
    const {fixture, placement, updates} = setup();
    const button = fixture.nativeElement.querySelector('[aria-label="上移一层"]') as HTMLButtonElement;
    expect(button.disabled).toBeFalse();
    placement.canMoveForward = () => false;
    updates.next();
    tick();
    fixture.detectChanges();
    expect(button.disabled).toBeTrue();
    fixture.destroy();
    expect(updates.observed).toBeFalse();
  }));

  for (const boundary of ['readonly', 'locked', 'deleted', 'replaced', 'grouped', 'flow', 'edge']) {
    it(`rejects a stale action after target becomes ${boundary}`, () => {
      const {fixture, doc, block, placement} = setup();
      if (boundary === 'readonly') doc.isReadonly = true;
      if (boundary === 'locked') block.isReadonly = true;
      if (boundary === 'deleted') doc.model.exists = () => false;
      if (boundary === 'replaced') doc.vm.get = () => ({instance: {} as typeof block});
      if (boundary === 'grouped') placement.isInObjectGroup = () => true;
      if (boundary === 'flow') placement.getState = () => ({mode: 'relative'});
      if (boundary === 'edge') placement.canMoveForward = () => false;
      (fixture.componentInstance as any).move('forward');
      expect(placement.moveForward).not.toHaveBeenCalled();
      expect(doc.crud.undoManager.stopCapturing).not.toHaveBeenCalled();
    });
  }
});
