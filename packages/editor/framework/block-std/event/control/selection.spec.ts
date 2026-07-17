import {Subject} from "rxjs";
import {SelectionControl} from "./selection";

describe("SelectionControl exceptional termination", () => {
  const makeHarness = () => {
    const rootHost = document.createElement("div");
    const blockHost = document.createElement("p");
    rootHost.appendChild(blockHost);
    document.body.appendChild(rootHost);
    const onDestroy$ = new Subject<void>();
    const dispatcher = {
      rootElement: rootHost,
      run: jasmine.createSpy("run"),
    };
    const control = new SelectionControl(dispatcher as any);
    control.listen({hostElement: rootHost, onDestroy$} as any);

    const startSelection = () => {
      blockHost.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}));
      blockHost.dispatchEvent(new Event("selectstart", {bubbles: true}));
      expect(dispatcher.run).toHaveBeenCalledWith("selectStart", jasmine.anything());
    };
    const destroy = () => {
      onDestroy$.next();
      onDestroy$.complete();
      control.dispose();
      rootHost.remove();
    };

    return {control, dispatcher, startSelection, destroy};
  };

  it("finishes an active selection when its pointer is cancelled", () => {
    const {dispatcher, startSelection, destroy} = makeHarness();
    startSelection();

    window.dispatchEvent(new PointerEvent("pointercancel"));

    expect(dispatcher.run.calls.allArgs().filter(([name]) => name === "selectEnd").length).toBe(1);
    destroy();
  });

  it("finishes an active selection when the window loses focus", () => {
    const {dispatcher, startSelection, destroy} = makeHarness();
    startSelection();

    window.dispatchEvent(new Event("blur"));

    expect(dispatcher.run.calls.allArgs().filter(([name]) => name === "selectEnd").length).toBe(1);
    destroy();
  });
});
