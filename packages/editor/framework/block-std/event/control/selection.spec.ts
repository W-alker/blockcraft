import {Subject} from "rxjs";
import {SelectionControl} from "./selection";

describe("SelectionControl exceptional termination", () => {
  const makeHarness = (ownerDocument: Document = document) => {
    const rootHost = ownerDocument.createElement("div");
    const blockHost = ownerDocument.createElement("p");
    rootHost.appendChild(blockHost);
    ownerDocument.body.appendChild(rootHost);
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

  it("finishes an embedded selection from its owner window", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument!;
    const ownerWindow = iframe.contentWindow!;
    const {dispatcher, startSelection, destroy} = makeHarness(ownerDocument);

    try {
      startSelection();
      ownerWindow.dispatchEvent(new (ownerWindow as any).PointerEvent("pointercancel"));

      expect(dispatcher.run.calls.allArgs().filter(([name]) => name === "selectEnd").length).toBe(1);
    } finally {
      destroy();
      iframe.remove();
    }
  });

  it("finishes an embedded keyboard selection from its owner window", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument!;
    const ownerWindow = iframe.contentWindow!;
    const {dispatcher, destroy} = makeHarness(ownerDocument);
    const KeyboardEventCtor = (ownerWindow as any).KeyboardEvent;

    try {
      ownerWindow.dispatchEvent(new KeyboardEventCtor("keydown", {key: "Shift", shiftKey: true}));
      dispatcher.rootElement.firstElementChild!.dispatchEvent(new Event("selectstart", {bubbles: true}));
      ownerWindow.dispatchEvent(new KeyboardEventCtor("keyup", {key: "Shift", shiftKey: false}));

      expect(dispatcher.run.calls.allArgs().filter(([name]) => name === "selectEnd").length).toBe(1);
    } finally {
      destroy();
      iframe.remove();
    }
  });
});
