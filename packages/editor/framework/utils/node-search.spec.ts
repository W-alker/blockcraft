import {closetBlockId, findNativeInputHost, isNativeInputTarget} from "./node-search";

describe("node search across DOM realms", () => {
  it("resolves block and native-input hosts inside an iframe", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const ownerDocument = iframe.contentDocument!;
    const blockHost = ownerDocument.createElement("div");
    const nativeInput = ownerDocument.createElement("textarea");
    const textHost = ownerDocument.createElement("span");
    const text = ownerDocument.createTextNode("text");
    blockHost.dataset["blockId"] = "p1";
    textHost.appendChild(text);
    blockHost.append(nativeInput, textHost);
    ownerDocument.body.appendChild(blockHost);

    try {
      expect(closetBlockId(text)).toBe("p1");
      expect(findNativeInputHost(nativeInput)).toBe(nativeInput);
      expect(isNativeInputTarget(nativeInput)).toBeTrue();
    } finally {
      iframe.remove();
    }
  });
});
