import {Subject} from "rxjs";
import {ClipboardControl} from "./clipboard";

describe("ClipboardControl document ownership", () => {
  it("handles clipboard events from the editor ownerDocument", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument!;
    const ownerWindow = iframe.contentWindow!;
    const rootHost = ownerDocument.createElement("div");
    rootHost.contentEditable = "true";
    ownerDocument.body.appendChild(rootHost);
    rootHost.focus();

    const onDestroy$ = new Subject<void>();
    const selection = {
      start: {blockId: "p1", type: "text", offset: 0},
      end: {blockId: "p1", type: "text", offset: 0},
    };
    const dispatcher = {
      currentSelection: selection,
      status: {isReadOnly: false},
      doc: {},
      run: jasmine.createSpy("run"),
    };
    const control = new ClipboardControl(dispatcher as any);
    control.listen({hostElement: rootHost, onDestroy$} as any);

    try {
      ownerDocument.dispatchEvent(new (ownerWindow as any).ClipboardEvent("copy"));

      expect(dispatcher.run).toHaveBeenCalledWith("copy", jasmine.anything());
    } finally {
      onDestroy$.next();
      onDestroy$.complete();
      iframe.remove();
    }
  });
});
