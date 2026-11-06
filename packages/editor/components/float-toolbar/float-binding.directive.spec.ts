import {ElementRef, NgZone} from "@angular/core";
import {fakeAsync, tick} from "@angular/core/testing";
import {BcOverlayTriggerDirective} from "./float-binding.directive";

describe("BcOverlayTriggerDirective lifecycle", () => {
  const makeDirective = () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const directive = new BcOverlayTriggerDirective(
      {} as any,
      new ElementRef(host),
      {} as any,
      new NgZone({enableLongStackTrace: false}),
    );
    directive.contentTemplate = {} as any;
    return {directive, host};
  };

  it("cancels a delayed open when the trigger is disabled before being re-enabled", fakeAsync(() => {
    const {directive, host} = makeDirective();
    directive.delay = 50;
    const openOverlay = spyOn(directive, "openOverlay");

    directive.showOverlay();
    directive.overlayDisabled = true;
    directive.overlayDisabled = false;
    tick(50);

    expect(openOverlay).not.toHaveBeenCalled();
    host.remove();
  }));

  it("disposes an attached child overlay when its trigger is destroyed", () => {
    const {directive, host} = makeDirective();
    const overlayRef = {
      dispose: jasmine.createSpy("dispose"),
    };
    (directive as any).overlayRef = overlayRef;

    expect(typeof (directive as any).ngOnDestroy).toBe("function");
    (directive as any).ngOnDestroy();

    expect(overlayRef.dispose).toHaveBeenCalledTimes(1);
    host.remove();
  });

  it("does not attach a duplicate overlay when click follows hover", () => {
    const {directive, host} = makeDirective();
    const overlayRef = {
      dispose: jasmine.createSpy("dispose"),
    };
    (directive as any).overlayRef = overlayRef;

    expect(() => directive.openOverlay()).not.toThrow();
    expect((directive as any).overlayRef).toBe(overlayRef);
    host.remove();
  });

  const makeOpenDirective = () => {
    const {directive, host} = makeDirective();
    host.setAttribute('data-float-binding', 'true');
    host.setAttribute('data-float-id', (directive as any)._dataFloatBindingId);
    host.setAttribute('data-float-index', '0');
    const overlayRef = {dispose: jasmine.createSpy('dispose'), updatePosition: jasmine.createSpy('updatePosition')};
    (directive as any).overlayRef = overlayRef;
    return {directive, host, overlayRef};
  };

  it('promotes a hovered panel to persistent and cancels a pending leave', fakeAsync(() => {
    const {directive, host, overlayRef} = makeOpenDirective();
    directive.hideOverlay(new Event('pointerover'));
    directive.openOverlay(true);
    directive.hideOverlay(new Event('pointerover'));
    tick(30);
    expect(overlayRef.dispose).not.toHaveBeenCalled();
    directive.ngOnDestroy();
    host.remove();
  }));

  it('keeps ordinary hover panels closing after leave', fakeAsync(() => {
    const {directive, host, overlayRef} = makeOpenDirective();
    directive.hideOverlay(new Event('pointerover'));
    tick(30);
    expect(overlayRef.dispose).toHaveBeenCalledTimes(1);
    host.remove();
  }));

  it('keeps persistent menus open for their trigger and nested panes but closes outside', () => {
    const {directive, host, overlayRef} = makeOpenDirective();
    const child = document.createElement('div');
    child.setAttribute('data-float-binding', 'true');
    child.setAttribute('data-float-id', host.getAttribute('data-float-id')!);
    child.setAttribute('data-float-index', '2');
    document.body.appendChild(child);
    directive.openOverlay(true);
    host.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    child.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    expect(overlayRef.dispose).not.toHaveBeenCalled();
    document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    expect(overlayRef.dispose).toHaveBeenCalledTimes(1);
    expect((directive as any).persistentListeners).toBeUndefined();
    child.remove();
    host.remove();
  });

  for (const reason of ['escape', 'blur', 'disabled', 'destroy'] as const) {
    it(`releases the persistent panel on ${reason}`, () => {
      const {directive, host, overlayRef} = makeOpenDirective();
      directive.openOverlay(true);
      if (reason === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
      if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      if (reason === 'disabled') directive.overlayDisabled = true;
      if (reason === 'destroy') directive.ngOnDestroy();
      expect(overlayRef.dispose).toHaveBeenCalledTimes(1);
      expect((directive as any).persistentListeners).toBeUndefined();
      host.remove();
    });
  }

  it('follows unregistered scroll ancestors once per frame and ignores unrelated scrolls', fakeAsync(() => {
    const {directive, host, overlayRef} = makeOpenDirective();
    (directive as any).observeScroll();
    const unrelated = document.createElement('div');
    document.body.appendChild(unrelated);
    unrelated.dispatchEvent(new Event('scroll'));
    tick(20);
    expect(overlayRef.updatePosition).not.toHaveBeenCalled();
    document.body.dispatchEvent(new Event('scroll'));
    document.body.dispatchEvent(new Event('scroll'));
    tick(20);
    expect(overlayRef.updatePosition).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new Event('scroll'));
    directive.closePanel();
    tick(20);
    expect(overlayRef.updatePosition).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new Event('scroll'));
    tick(20);
    expect(overlayRef.updatePosition).toHaveBeenCalledTimes(1);
    unrelated.remove();
    host.remove();
  }));

  it('repositions a child pane when the root trigger ancestor scrolls', fakeAsync(() => {
    const {directive, host, overlayRef} = makeOpenDirective();
    const root = document.createElement('div');
    root.setAttribute('data-float-id', host.getAttribute('data-float-id')!);
    root.setAttribute('data-float-index', '0');
    host.setAttribute('data-float-index', '2');
    const scroller = document.createElement('div');
    scroller.appendChild(root);
    document.body.appendChild(scroller);
    (directive as any).observeScroll();
    scroller.dispatchEvent(new Event('scroll'));
    tick(20);
    expect(overlayRef.updatePosition).toHaveBeenCalledTimes(1);
    directive.ngOnDestroy();
    scroller.remove();
    host.remove();
  }));
});
