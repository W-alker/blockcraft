import {ClipboardManager} from "./index";

describe("ClipboardManager copyText document ownership", () => {
  it("uses the editor owner window clipboard", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const ownerWindow = iframe.contentWindow!;
    const ownerDocument = iframe.contentDocument!;
    const rootHost = ownerDocument.createElement("div");
    ownerDocument.body.appendChild(rootHost);
    const ownerWriteText = jasmine.createSpy("ownerWriteText").and.resolveTo();
    const globalWriteText = jasmine.createSpy("globalWriteText").and.resolveTo();
    const originalOwnerClipboard = ownerWindow.navigator.clipboard;
    const originalGlobalClipboard = navigator.clipboard;
    Object.defineProperty(ownerWindow.navigator, "clipboard", {
      configurable: true,
      value: {writeText: ownerWriteText},
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {writeText: globalWriteText},
    });

    try {
      await ClipboardManager.prototype.copyText.call({
        doc: {root: {hostElement: rootHost}},
      } as any, "hello");

      expect(ownerWriteText).toHaveBeenCalledOnceWith("hello");
      expect(globalWriteText).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(ownerWindow.navigator, "clipboard", {
        configurable: true,
        value: originalOwnerClipboard,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalGlobalClipboard,
      });
      iframe.remove();
    }
  });
});
