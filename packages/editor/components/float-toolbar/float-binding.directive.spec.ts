import {ElementRef} from "@angular/core";
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
});
