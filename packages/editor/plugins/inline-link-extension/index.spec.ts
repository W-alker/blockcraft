import {fakeAsync, flushMicrotasks} from "@angular/core/testing";
import {
  BlockNodeType,
  EditableBlockComponent,
  INLINE_ELEMENT_TAG,
  INLINE_TEXT_NODE_TAG,
} from "../../framework";
import {InlineLinkExtension} from "./index";
import * as Y from "yjs";
import {Subject} from "rxjs";

describe("InlineLinkExtension range handling", () => {
  const createLinkRun = (texts: string[], link = "https://example.com") => {
    const host = document.createElement("div");
    const elements = texts.map(text => {
      const cElement = document.createElement(INLINE_ELEMENT_TAG);
      cElement.setAttribute("link", link);
      const cText = document.createElement(INLINE_TEXT_NODE_TAG);
      cText.textContent = text;
      cElement.appendChild(cText);
      host.appendChild(cElement);
      return {cElement, cText};
    });
    document.body.appendChild(host);
    return {host, elements, link};
  };

  afterEach(() => {
    document.body.querySelectorAll("[data-inline-link-extension-test]").forEach(el => el.remove());
  });

  it("expands adjacent text nodes that share the same link", () => {
    const {host, elements, link} = createLinkRun(["foo", "bar"]);
    host.setAttribute("data-inline-link-extension-test", "true");
    host.setAttribute("data-block-id", "p1");
    const block = Object.create(EditableBlockComponent.prototype) as EditableBlockComponent;
    Object.assign(block as any, {
      _native: {id: "p1", flavour: "paragraph", nodeType: BlockNodeType.editable},
      _containerElement: host,
      _runtime: {
        mapper: {
          domPointToModelPoint: jasmine.createSpy("domPointToModelPoint")
            .and.callFake((_root: Node, node: Node, offset: number) =>
              node === elements[0].cText.firstChild ? offset : 3 + offset),
        },
      },
      hostElement: host,
    });
    const legacyNormalize = jasmine.createSpy("normalizeRange").and.throwError("legacy facade used");
    const plugin = new InlineLinkExtension();
    (plugin as any).doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      selection: {normalizeRange: legacyNormalize},
    };

    const info = plugin.getLinkInfo(elements[1].cText);

    expect(info.text).toBe("foobar");
    expect(info.textRange.block).toBe(block);
    expect(info.textRange.blockId).toBe("p1");
    expect(info.textRange.index).toBe(0);
    expect(info.textRange.length).toBe(6);
    expect(legacyNormalize).not.toHaveBeenCalled();
    expect(plugin.tryGetLink(elements[0].cText)).toBe(link);
  });

  it("does not open the edit dialog when the link DOM range cannot normalize", () => {
    const {host, elements} = createLinkRun(["foo"]);
    host.setAttribute("data-inline-link-extension-test", "true");
    const block = {
      id: "p1",
      yText: {
        observe: jasmine.createSpy("observe"),
        unobserve: jasmine.createSpy("unobserve"),
      },
    };
    const plugin = new InlineLinkExtension();
    (plugin as any).doc = {
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      selection: {
        createFakeRange: jasmine.createSpy("createFakeRange"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay"),
      },
    };
    spyOn(plugin, "getLinkInfo").and.throwError("stale inline node");

    plugin.onEditLink(elements[0].cText, block as any);

    expect((plugin as any).doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(block.yText.observe).not.toHaveBeenCalled();
  });

  it("does not open toolbar when the clicked link block is stale", () => {
    const {host, elements} = createLinkRun(["foo"]);
    host.setAttribute("data-inline-link-extension-test", "true");
    host.setAttribute("data-block-id", "p1");
    const plugin = new InlineLinkExtension();
    (plugin as any).doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
    };
    const openToolbar = spyOn(plugin, "openToolbar");
    const ctx = {
      getDefaultEvent: () => ({
        target: elements[0].cText,
      }),
    };

    expect(() => plugin.onClick(ctx as any)).not.toThrow();

    expect(openToolbar).not.toHaveBeenCalled();
  });

  it("does not create a queued fake range after the edit dialog closes", fakeAsync(() => {
    const {host, elements} = createLinkRun(["foo"]);
    host.setAttribute("data-inline-link-extension-test", "true");
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("p1");
    yText.insert(0, "foo");
    let textObserver: (() => void) | null = null;
    spyOn(yText, "observe").and.callFake((fn: any) => {
      textObserver = fn;
    });
    spyOn(yText, "unobserve");
    const block = {
      id: "p1",
      yText,
      textLength: 3,
      textContent: () => "foo",
    };
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {
        focus: jasmine.createSpy("focus"),
        close: new Subject<void>(),
        update: new Subject<{text: string; href: string}>(),
      },
    };
    let overlayClose: (() => void) | null = null;
    const doc = {
      yDoc,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      selection: {
        createFakeRange: jasmine.createSpy("createFakeRange"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay")
          .and.callFake((_config: unknown, _close$: Subject<void>, close: () => void) => {
            overlayClose = close;
            return {componentRef};
          }),
      },
    };
    spyOn(window, "requestAnimationFrame").and.returnValue(0);
    const plugin = new InlineLinkExtension();
    (plugin as any).doc = doc;
    spyOn(plugin, "getLinkInfo").and.returnValue({
      textRange: {block: block as any, blockId: "p1", index: 0, length: 3},
      text: "foo",
    });

    plugin.onEditLink(elements[0].cText, block as any);
    expect(textObserver).toBeTruthy();

    textObserver!();
    overlayClose!();
    flushMicrotasks();

    expect(doc.selection.createFakeRange).not.toHaveBeenCalled();
    expect(yText.unobserve).toHaveBeenCalled();
  }));

  it("does not update a link when the anchored block became stale", () => {
    const {host, elements} = createLinkRun(["foo"]);
    host.setAttribute("data-inline-link-extension-test", "true");
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("p1");
    yText.insert(0, "foo");
    spyOn(yText, "observe");
    spyOn(yText, "unobserve");
    const block = {
      id: "p1",
      yText,
      textLength: 3,
      textContent: jasmine.createSpy("textContent").and.returnValue("foo"),
      replaceText: jasmine.createSpy("replaceText"),
      formatText: jasmine.createSpy("formatText"),
      setInlineRange: jasmine.createSpy("setInlineRange"),
    };
    const update = new Subject<{text: string; href: string}>();
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {
        focus: jasmine.createSpy("focus"),
        close: new Subject<void>(),
        update,
      },
    };
    const doc = {
      yDoc,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      selection: {
        createFakeRange: jasmine.createSpy("createFakeRange"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay").and.returnValue({componentRef}),
      },
    };
    spyOn(window, "requestAnimationFrame").and.returnValue(0);
    const plugin = new InlineLinkExtension();
    (plugin as any).doc = doc;
    spyOn(plugin, "getLinkInfo").and.returnValue({
      textRange: {block: block as any, blockId: "p1", index: 0, length: 3},
      text: "foo",
    });

    plugin.onEditLink(elements[0].cText, block as any);
    doc.getBlockById.and.throwError("missing");
    update.next({text: "bar", href: "https://next.example"});

    expect(block.replaceText).not.toHaveBeenCalled();
    expect(block.formatText).not.toHaveBeenCalled();
    expect(block.setInlineRange).not.toHaveBeenCalled();
  });

  it("does not switch to bookmark view when the link DOM range cannot normalize", () => {
    const {host, elements} = createLinkRun(["foo"]);
    host.setAttribute("data-inline-link-extension-test", "true");
    const plugin = new InlineLinkExtension();
    (plugin as any)._linkNode = elements[0].cText;
    (plugin as any).doc = {
      schemas: {
        createSnapshot: jasmine.createSpy("createSnapshot"),
      },
      chain: jasmine.createSpy("chain"),
    };
    spyOn(plugin, "getLinkInfo").and.throwError("stale inline node");

    plugin.switchView();

    expect((plugin as any).doc.schemas.createSnapshot).not.toHaveBeenCalled();
    expect((plugin as any).doc.chain).not.toHaveBeenCalled();
  });

  it("tears down readonly observer on destroy", () => {
    const readonlySub = {
      unsubscribe: jasmine.createSpy("unsubscribe"),
    };
    const plugin = new InlineLinkExtension();
    (plugin as any).doc = {
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue(readonlySub),
    };

    plugin.init();
    plugin.destroy();

    expect(readonlySub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("closes the toolbar before querying readonly state for a removed link block", () => {
    const readonlyStateChange$ = new Subject<void>();
    const block = {id: "p1"};
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
    };
    const readonlyManager = {
      stateChange$: readonlyStateChange$,
      isReadonly: jasmine.createSpy("isReadonly").and.returnValue(false),
    };
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      readonlyManager,
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange"),
    };
    const plugin = new InlineLinkExtension();
    (plugin as any).doc = doc;
    (plugin as any)._activeBlock = block;
    (plugin as any)._cpr = componentRef;
    plugin.init();

    doc.getBlockById.and.throwError("Block not found: p1");
    readonlyManager.isReadonly.and.throwError(
      new Error("readonly lookup received a removed block"),
    );

    expect(() => readonlyStateChange$.next()).not.toThrow();
    expect(readonlyManager.isReadonly).not.toHaveBeenCalled();
    expect((plugin as any)._cpr).toBeNull();
    plugin.destroy();
  });
});
