import {fakeAsync, tick} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {FloatTextToolbarPlugin} from './rich-text-toolbar';

describe('floating toolbar keyboard formatting', () => {
  for (const attr of ['bold', 'italic', 'underline']) {
    it(`reads the current ${attr} state before the toolbar debounce completes`, () => {
      const plugin = new FloatTextToolbarPlugin({enabled: false}) as any;
      const selection = {};
      const current = new Map<string, boolean>();
      plugin.doc = {selection: {value: selection}, isReadonly: false};
      plugin.activeCommonAttrs = {attrs: new Map([[attr, true]])};
      plugin.utils = {
        getCurrentCommonAttrs: jasmine.createSpy().and.callFake(() => ({attrs: current})),
        formatText: jasmine.createSpy(),
      };
      const context = {preventDefault: jasmine.createSpy()};
      plugin.toggleFormatAttr(context, attr);
      expect(plugin.utils.getCurrentCommonAttrs).toHaveBeenCalledWith(selection);
      expect(plugin.utils.formatText).toHaveBeenCalledWith({[`a:${attr}`]: true});
      current.set(attr, true);
      plugin.toggleFormatAttr(context, attr);
      expect(plugin.utils.formatText.calls.mostRecent().args).toEqual([{[`a:${attr}`]: null}]);
    });
  }
});

describe('floating toolbar preference', () => {
  it('closes a live toolbar and does not touch selection or retain its destroyed component', () => {
    const plugin = new FloatTextToolbarPlugin() as any;
    const overlay = {dispose: jasmine.createSpy('dispose')};
    plugin.toolbarOvr = overlay;
    plugin._cpr = {};
    plugin.setEnabled(false);
    expect(overlay.dispose).toHaveBeenCalledTimes(1);
    expect(plugin._cpr).toBeUndefined();
    expect(plugin.toolbarOvr).toBeUndefined();
    // Must return before consulting doc or creating an overlay.
    expect(() => plugin.openToolbar()).not.toThrow();
  });
});


describe('floating toolbar readonly actions', () => {
  function setup(options: any = {}) {
    const changes = new Subject<any>();
    const readonlyChanges = new Subject<boolean>();
    const lockChanges = new Subject<void>();
    const drags = new Subject<string>();
    const clicks = new Subject<any>();
    const block = {id: 'p', plainTextOnly: false};
    const selection: any = {isInSameBlock: true, start: {type: 'text', blockId: 'p', offset: 0},
      end: {type: 'text', blockId: 'p', offset: 4}, firstBlock: block, lastBlock: block};
    const componentRef = {setInput: jasmine.createSpy('setInput'), instance: {onExtraItemClick: clicks}};
    const overlayRef = {dispose: jasmine.createSpy('dispose'), overlayElement: document.createElement('div')};
    const doc: any = {isReadonly: true, scrollContainer: document.createElement('div'),
      selection: {value: selection, changeObserve: () => changes, nextChangeObserve: () => changes},
      subscribeReadonlyChange: (cb: any) => readonlyChanges.subscribe(cb),
      readonlyManager: {isSelectionReadonly: () => false, stateChange$: lockChanges},
      dragController: {state$: drags}, onDestroy$: new Subject<void>(),
      getBlockById: () => block,
      overlayService: {createConnectedOverlay: jasmine.createSpy('overlay').and.returnValue({componentRef, overlayRef})}};
    const handler = jasmine.createSpy('action').and.returnValue(true);
    const plugin = new FloatTextToolbarPlugin({onExtraItemClick: handler, ...options}) as any;
    plugin.doc = doc;
    plugin.init();
    spyOn(plugin, '_calcPosition').and.returnValue({connectElement: document.createElement('div'), connectPositions: []});
    spyOn(plugin.utils, 'getCurrentCommonAttrs').and.returnValue({attrs: new Map(), colors: {}, props: {}});
    return {plugin, doc, selection, changes, readonlyChanges, lockChanges, drags, clicks, componentRef, overlayRef, handler};
  }
  const comment = {name: 'comment', value: 'comment', label: '添加评论'};

  it('keeps readonly closed without explicit actions, even with editable extras', () => {
    const t = setup({extraItems: [comment]});
    t.plugin.openToolbar();
    expect(t.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    t.plugin.destroy();
  });

  it('renders only explicit readonly actions and never reads formatting state', () => {
    const t = setup({extraItems: [{name: 'task', value: 'task'}], readonlyExtraItems: [comment]});
    t.plugin.openToolbar();
    expect(t.doc.overlayService.createConnectedOverlay.calls.mostRecent().args[0].allowReadonly).toBeTrue();
    expect(t.componentRef.setInput).toHaveBeenCalledWith('readonly', true);
    expect(t.componentRef.setInput).toHaveBeenCalledWith('extraItems', [comment]);
    expect(t.plugin.utils.getCurrentCommonAttrs).not.toHaveBeenCalled();
    t.clicks.next(comment);
    expect(t.handler).toHaveBeenCalledOnceWith(comment, t.doc);
    expect(t.overlayRef.dispose).toHaveBeenCalled();
    t.plugin.destroy();
  });

  it('rechecks permission at display and click', () => {
    let allowed = false;
    const t = setup({readonlyExtraItems: [{...comment, visible: () => allowed}]});
    t.plugin.openToolbar();
    expect(t.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    allowed = true;
    t.plugin.openToolbar();
    allowed = false;
    t.clicks.next(comment);
    expect(t.handler).not.toHaveBeenCalled();
    expect(t.overlayRef.dispose).toHaveBeenCalled();
    t.plugin.destroy();
  });

  it('does not dispatch stale or hidden actions', () => {
    const t = setup({readonlyExtraItems: [comment]});
    t.plugin.openToolbar();
    t.selection.collapsed = true;
    t.clicks.next(comment);
    expect(t.handler).not.toHaveBeenCalled();
    t.plugin.destroy();
  });

  it('retains editable extras and format controls', () => {
    const t = setup({extraItems: [{name: 'task', value: 'task'}], readonlyExtraItems: [comment]});
    t.doc.isReadonly = false;
    t.plugin.openToolbar();
    expect(t.componentRef.setInput).toHaveBeenCalledWith('readonly', false);
    expect(t.componentRef.setInput).toHaveBeenCalledWith('extraItems', [{name: 'task', value: 'task'}]);
    expect(t.plugin.utils.getCurrentCommonAttrs).toHaveBeenCalledWith(t.selection);
    t.plugin.destroy();
  });

  it('allows actions on a locked selection but still blocks formatting shortcuts', () => {
    const t = setup({readonlyExtraItems: [comment]});
    t.doc.isReadonly = false;
    t.doc.readonlyManager.isSelectionReadonly = () => true;
    spyOn(t.plugin.utils, 'formatText');
    t.plugin.openToolbar();
    t.plugin.toggleFormatAttr({preventDefault: () => {}}, 'bold');
    expect(t.componentRef.setInput).toHaveBeenCalledWith('readonly', true);
    expect(t.plugin.utils.formatText).not.toHaveBeenCalled();
    t.plugin.destroy();
  });

  for (const flag of ['collapsed', 'isEmpty', 'isAllSelected']) it(`rejects ${flag} selection`, () => {
    const t = setup({readonlyExtraItems: [comment]});
    t.selection[flag] = true;
    t.plugin.openToolbar();
    expect(t.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    t.plugin.destroy();
  });

  for (const close of ['escape', 'outside', 'blur', 'selection', 'readonly', 'drag', 'disabled', 'destroy']) {
    it(`closes readonly actions on ${close} and releases click listeners`, () => {
      const t = setup({readonlyExtraItems: [comment]});
      t.plugin.openToolbar();
      if (close === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
      if (close === 'outside') document.dispatchEvent(new PointerEvent('pointerdown'));
      if (close === 'blur') window.dispatchEvent(new Event('blur'));
      if (close === 'selection') t.changes.next(null);
      if (close === 'readonly') t.readonlyChanges.next(false);
      if (close === 'drag') t.drags.next('dragging');
      if (close === 'disabled') t.plugin.setEnabled(false);
      if (close === 'destroy') t.plugin.destroy();
      expect(t.overlayRef.dispose).toHaveBeenCalled();
      t.clicks.next(comment);
      expect(t.handler).not.toHaveBeenCalled();
      t.plugin.destroy();
    });
  }

  it('cancels debounced selection work on destroy', fakeAsync(() => {
    const t = setup({readonlyExtraItems: [comment]});
    t.changes.next(t.selection);
    t.plugin.destroy();
    tick(400);
    expect(t.doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  }));
});
