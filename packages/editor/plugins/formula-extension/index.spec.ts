import {fakeAsync} from "@angular/core/testing";
import {Subject} from "rxjs";
import {INLINE_ELEMENT_TAG} from "../../framework";
import {FormulaBlockExtensionPlugin} from "./index";

describe("FormulaBlockExtensionPlugin inline range handling", () => {
  const createInlineFormula = () => {
    const blockHost = document.createElement("p");
    blockHost.setAttribute("data-block-id", "p1");
    blockHost.setAttribute("data-formula-extension-test", "true");
    const cElement = document.createElement(INLINE_ELEMENT_TAG);
    const formula = document.createElement("span");
    formula.className = "inline-formula";
    formula.setAttribute("data-latex", "x");
    cElement.appendChild(formula);
    blockHost.appendChild(cElement);
    document.body.appendChild(blockHost);
    return {blockHost, formula};
  };

  afterEach(() => {
    document.body.querySelectorAll("[data-formula-extension-test]").forEach(el => el.remove());
  });

  it("closes inline editing without mutating data when the embed range cannot normalize", () => {
    const {formula} = createInlineFormula();
    const confirm = new Subject<string>();
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {confirm},
    };
    const block = {
      id: "p1",
      applyDeltaOperations: jasmine.createSpy("applyDeltaOperations"),
    };
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      selection: {
        normalizeRange: jasmine.createSpy("normalizeRange").and.throwError("stale formula node"),
        setCursorAt: jasmine.createSpy("setCursorAt"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay")
          .and.returnValue({componentRef}),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange"),
    };
    const plugin = new FormulaBlockExtensionPlugin();
    (plugin as any).doc = doc;

    const consumed = plugin.onInlineClick({
      getDefaultEvent: () => ({target: formula}),
    } as any);
    expect(consumed).toBeTrue();
    expect(formula.classList.contains("editing")).toBeTrue();

    confirm.next("y");

    expect(block.applyDeltaOperations).not.toHaveBeenCalled();
    expect(doc.selection.setCursorAt).not.toHaveBeenCalled();
    expect(formula.classList.contains("editing")).toBeFalse();
  });

  it("does not start inline editing when the formula block is stale", () => {
    const {formula} = createInlineFormula();
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay"),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange"),
    };
    const plugin = new FormulaBlockExtensionPlugin();
    (plugin as any).doc = doc;

    expect(() => plugin.onInlineClick({
      getDefaultEvent: () => ({target: formula}),
    } as any)).not.toThrow();

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  });

  it("does not mutate inline formula data when the block is stale before confirm", () => {
    const {formula} = createInlineFormula();
    const confirm = new Subject<string>();
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {confirm},
    };
    const block = {
      id: "p1",
      applyDeltaOperations: jasmine.createSpy("applyDeltaOperations"),
    };
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      selection: {
        normalizeRange: jasmine.createSpy("normalizeRange").and.returnValue({
          from: {type: "text", index: 0},
        }),
        setCursorAt: jasmine.createSpy("setCursorAt"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay")
          .and.returnValue({componentRef}),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange"),
    };
    const plugin = new FormulaBlockExtensionPlugin();
    (plugin as any).doc = doc;

    plugin.onInlineClick({
      getDefaultEvent: () => ({target: formula}),
    } as any);
    doc.getBlockById.and.throwError("missing");
    confirm.next("y");

    expect(block.applyDeltaOperations).not.toHaveBeenCalled();
    expect(doc.selection.setCursorAt).not.toHaveBeenCalled();
    expect(formula.classList.contains("editing")).toBeFalse();
  });

  it("tears down readonly observer on destroy", () => {
    const readonlySub = {
      unsubscribe: jasmine.createSpy("unsubscribe"),
    };
    const plugin = new FormulaBlockExtensionPlugin();
    (plugin as any).doc = {
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue(readonlySub),
    };

    plugin.init();
    plugin.destroy();

    expect(readonlySub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not restore cursor when the inline formula block is deleted before animation frame", fakeAsync(() => {
    const {formula} = createInlineFormula();
    const confirm = new Subject<string>();
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {confirm},
    };
    const block = {
      id: "p1",
      applyDeltaOperations: jasmine.createSpy("applyDeltaOperations"),
    };
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      selection: {
        normalizeRange: jasmine.createSpy("normalizeRange").and.returnValue({
          from: {type: "text", index: 0},
        }),
        setCursorAt: jasmine.createSpy("setCursorAt"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay")
          .and.returnValue({componentRef}),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange"),
    };
    spyOn(window, "requestAnimationFrame").and.callFake((callback: FrameRequestCallback) => {
      doc.getBlockById.and.throwError("Block not found: p1");
      callback(0);
      return 0;
    });
    const plugin = new FormulaBlockExtensionPlugin();
    (plugin as any).doc = doc;

    plugin.onInlineClick({
      getDefaultEvent: () => ({target: formula}),
    } as any);
    confirm.next("y");

    expect(block.applyDeltaOperations).toHaveBeenCalled();
    expect(doc.selection.setCursorAt).not.toHaveBeenCalled();
  }));
});

describe("FormulaBlockExtensionPlugin block hit area", () => {
  const makeHarness = () => {
    const hostElement = document.createElement("div");
    hostElement.setAttribute("data-block-id", "formula-1");
    hostElement.setAttribute("data-formula-block-click-test", "true");
    const content = document.createElement("div");
    content.className = "formula-block-container";
    const display = document.createElement("div");
    display.className = "formula-display";
    content.appendChild(display);
    hostElement.appendChild(content);
    document.body.appendChild(hostElement);

    const confirm = new Subject<string>();
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {confirm},
    };
    const block = {
      id: "formula-1",
      flavour: "formula",
      hostElement,
      updateProps: jasmine.createSpy("updateProps"),
    };
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay")
          .and.returnValue({componentRef}),
      },
    };
    const plugin = new FormulaBlockExtensionPlugin();
    (plugin as any).doc = doc;
    return {plugin, doc, block, hostElement, display};
  };

  afterEach(() => {
    document.body.querySelectorAll("[data-formula-block-click-test]").forEach(el => el.remove());
  });

  it("opens formula block editing from the rendered formula content", () => {
    const {plugin, doc, block, display} = makeHarness();

    const consumed = plugin.onBlockClick({
      getDefaultEvent: () => ({target: display}),
    } as any);

    expect(consumed).toBeTrue();
    expect(block.hostElement.classList.contains("editing")).toBeTrue();
    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
  });

  it("does not open formula block editing when the block is stale", () => {
    const {plugin, doc, block, display} = makeHarness();
    doc.getBlockById.and.throwError("missing");

    expect(() => plugin.onBlockClick({
      getDefaultEvent: () => ({target: display}),
    } as any)).not.toThrow();

    expect(block.hostElement.classList.contains("editing")).toBeFalse();
    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  });

  it("does not update formula block props when the block is stale before confirm", () => {
    const {plugin, doc, block, display} = makeHarness();
    plugin.onBlockClick({
      getDefaultEvent: () => ({target: display}),
    } as any);
    doc.getBlockById.and.throwError("missing");

    const confirm = doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue.componentRef.instance.confirm;
    confirm.next("y");

    expect(block.updateProps).not.toHaveBeenCalled();
    expect(block.hostElement.classList.contains("editing")).toBeFalse();
  });

  it("ignores formula block host whitespace so gap selection can handle it", () => {
    const {plugin, doc, block, hostElement} = makeHarness();

    const consumed = plugin.onBlockClick({
      getDefaultEvent: () => ({target: hostElement}),
    } as any);

    expect(consumed).toBeUndefined();
    expect(block.hostElement.classList.contains("editing")).toBeFalse();
    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  });
});
