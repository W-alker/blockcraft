import { ElementRef } from "@angular/core";
import { BlockTransformContextMenu } from "./contextmenu";

describe("BlockTransformContextMenu keyboard navigation", () => {
  function createComponent(
    selection: any,
    recalculatedSelection = selection,
    hostElement = document.createElement("div"),
  ) {
    // A detached <div> clamps scrollTop/scrollLeft to 0, so back them with
    // plain in-memory accessors to test scrollToActive's math deterministically.
    let scrollTop = 0;
    let scrollLeft = 0;
    Object.defineProperty(hostElement, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => (scrollTop = v),
    });
    Object.defineProperty(hostElement, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (v: number) => (scrollLeft = v),
    });

    const cdr = {
      detectChanges: jasmine.createSpy("detectChanges"),
      markForCheck: jasmine.createSpy("markForCheck"),
    };
    const component = new BlockTransformContextMenu(
      cdr as any,
      new ElementRef(hostElement),
      {
        onDestroy: jasmine.createSpy("onDestroy"),
      } as any,
    );

    component.list = [
      {
        id: "block:paragraph",
        kind: "block",
        group: "basic",
        groupLabel: "基础内容",
        flavour: "paragraph",
        label: "Paragraph",
      },
    ] as any;
    const activeBlockContainer = document.createElement("div");
    component.activeBlock = {
      id: "block-1",
      flavour: "paragraph",
      textLength: 5,
      textDeltas: () => [{insert: "/icon"}],
      containerElement: activeBlockContainer,
      runtime: {
        domPointToModel: jasmine
          .createSpy("domPointToModel")
          .and.returnValue(-1),
      },
      setInlineRange: jasmine.createSpy("setInlineRange"),
    } as any;
    component.doc = {
      event: {
        status: { isComposing: false },
      },
      selection: {
        value: selection,
        recalculate: jasmine
          .createSpy("recalculate")
          .and.callFake(() => ({ value: recalculatedSelection })),
        setSuppressRecalculate: jasmine.createSpy("setSuppressRecalculate"),
      },
    } as any;

    return { component, cdr, activeBlockContainer };
  }

  function createRect(top: number, bottom: number): DOMRect {
    return {
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  it("handles ArrowDown while the selection stays on the active block", () => {
    const { component } = createComponent({
      collapsed: true,
      start: { type: "text" },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");

    const preventDefault = jasmine.createSpy("preventDefault");
    const stopPropagation = jasmine.createSpy("stopPropagation");

    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault,
      stopPropagation,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(component.selectDown).toHaveBeenCalled();
  });

  it("keeps ArrowDown navigation when Safari recalculation drifts off the active block", () => {
    const { component } = createComponent(
      {
        collapsed: true,
        start: { type: "text" },
        firstBlock: { id: "block-1" },
      },
      {
        collapsed: true,
        start: { type: "text" },
        firstBlock: { id: "block-2" },
      },
    );
    spyOn(component, "selectDown");

    const preventDefault = jasmine.createSpy("preventDefault");
    const stopPropagation = jasmine.createSpy("stopPropagation");

    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault,
      stopPropagation,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(component.selectDown).toHaveBeenCalled();
  });

  it("ignores immediate selection drift right after keyboard navigation", () => {
    const { component } = createComponent({
      collapsed: true,
      start: { type: "text" },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");

    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault: jasmine.createSpy("preventDefault"),
      stopPropagation: jasmine.createSpy("stopPropagation"),
    } as unknown as KeyboardEvent);

    expect(component.selectDown).toHaveBeenCalled();
    expect(component.shouldIgnoreSelectionChange()).toBeTrue();
  });

  it("suppresses native selectionchange recalculate during arrow navigation", () => {
    const { component } = createComponent({
      collapsed: true,
      start: { type: "text" },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");

    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault: jasmine.createSpy("preventDefault"),
      stopPropagation: jasmine.createSpy("stopPropagation"),
    } as unknown as KeyboardEvent);

    expect(
      component.doc.selection.setSuppressRecalculate,
    ).toHaveBeenCalledWith(true);
  });

  it("scrolls vertically without changing horizontal offset", () => {
    const hostElement = document.createElement("div");
    const { component } = createComponent(
      {
        collapsed: true,
        start: { type: "text" },
        firstBlock: { id: "block-1" },
      },
      undefined,
      hostElement,
    );
    const activeItem = document.createElement("li");

    hostElement.scrollTop = 20;
    hostElement.scrollLeft = 18;
    spyOn(hostElement, "querySelector").and.returnValue(activeItem);
    spyOn(hostElement, "getBoundingClientRect").and.returnValue(
      createRect(100, 220),
    );
    spyOn(activeItem, "getBoundingClientRect").and.returnValue(
      createRect(200, 244),
    );

    component.scrollToActive();

    expect(hostElement.scrollTop).toBe(44);
    expect(hostElement.scrollLeft).toBe(18);
  });

  it("does not scroll when active item is already visible", () => {
    const hostElement = document.createElement("div");
    const { component } = createComponent(
      {
        collapsed: true,
        start: { type: "text" },
        firstBlock: { id: "block-1" },
      },
      undefined,
      hostElement,
    );
    const activeItem = document.createElement("li");

    hostElement.scrollTop = 20;
    hostElement.scrollLeft = 18;
    spyOn(hostElement, "querySelector").and.returnValue(activeItem);
    spyOn(hostElement, "getBoundingClientRect").and.returnValue(
      createRect(100, 220),
    );
    spyOn(activeItem, "getBoundingClientRect").and.returnValue(
      createRect(140, 176),
    );

    component.scrollToActive();

    expect(hostElement.scrollTop).toBe(20);
    expect(hostElement.scrollLeft).toBe(18);
  });

  it("exposes ArrowDown routing for the editor event fallback path", () => {
    const { component } = createComponent({
      collapsed: true,
      start: { type: "text" },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");

    const handled = component.handleEditorKey("ArrowDown");

    expect(handled).toBeTrue();
    expect(component.selectDown).toHaveBeenCalled();
  });

  it("starts keyboard navigation from the first result after an empty filter", () => {
    const {component} = createComponent(null, null);
    (component as any).activeIdx = -1;

    component.selectDown();

    expect((component as any).activeIdx).toBe(0);
  });

  it("still handles ArrowDown when the native selection snapshot is lost", () => {
    const { component } = createComponent(null, null);
    spyOn(component, "selectDown");

    const preventDefault = jasmine.createSpy("preventDefault");
    const stopPropagation = jasmine.createSpy("stopPropagation");

    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault,
      stopPropagation,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(component.selectDown).toHaveBeenCalled();
  });

  it("ignores ArrowDown while composing", () => {
    const { component } = createComponent(null, null);
    component.doc.event.status.isComposing = true;
    spyOn(component, "selectDown");

    const preventDefault = jasmine.createSpy("preventDefault");
    const stopPropagation = jasmine.createSpy("stopPropagation");

    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault,
      stopPropagation,
    } as unknown as KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(component.selectDown).not.toHaveBeenCalled();
  });

  it("re-pins the caret on a delayed selectionchange that drifts off the block (Tauri/WKWebView)", () => {
    const { component, activeBlockContainer } = createComponent({
      collapsed: true,
      start: { type: "text", offset: 3 },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");

    // Arrow press arms the caret guard and runs the immediate (pre-move)
    // restore. activeBlockContainer is intentionally empty.
    void activeBlockContainer;
    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault: jasmine.createSpy("preventDefault"),
      stopPropagation: jasmine.createSpy("stopPropagation"),
    } as unknown as KeyboardEvent);

    // Ignore the synchronous restore; we are testing the *delayed* native move
    // that lands after every old sync/microtask/rAF shot would have fired.
    (component.activeBlock.setInlineRange as jasmine.Spy).calls.reset();

    // Simulate WKWebView moving the DOM caret into a sibling block.
    const drift = document.createElement("div");
    const driftText = document.createTextNode("next block");
    drift.appendChild(driftText);
    document.body.appendChild(drift);
    const domSel = document.getSelection()!;
    domSel.removeAllRanges();
    const range = document.createRange();
    range.setStart(driftText, 2);
    range.collapse(true);
    domSel.addRange(range);

    document.dispatchEvent(new Event("selectionchange"));

    expect(component.activeBlock.setInlineRange).toHaveBeenCalledWith(3);

    (component as any)._disarmCaretGuard();
    domSel.removeAllRanges();
    document.body.removeChild(drift);
  });

  it("stops re-pinning once the user types a filter character", () => {
    const { component } = createComponent({
      collapsed: true,
      start: { type: "text", offset: 3 },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");

    (component as any).handleRootKeydown({
      key: "ArrowDown",
      preventDefault: jasmine.createSpy("preventDefault"),
      stopPropagation: jasmine.createSpy("stopPropagation"),
    } as unknown as KeyboardEvent);

    (component.activeBlock.setInlineRange as jasmine.Spy).calls.reset();

    // User typed → block text grew. A subsequent drift event must NOT yank the
    // caret back (that would eat the just-typed character's advance).
    (component.activeBlock as any).textLength = 6;
    document.dispatchEvent(new Event("selectionchange"));

    expect(component.activeBlock.setInlineRange).not.toHaveBeenCalled();

    (component as any)._disarmCaretGuard();
  });

  it("reads the filter query when slash command text occupies the whole paragraph", () => {
    const block = {id: "block-1"};
    const {component} = createComponent({
      collapsed: true,
      start: {type: "text", offset: 5},
      firstBlock: block,
    });
    component.triggerIndex = 0;
    component.activeBlock.textDeltas = () => [{insert: "/icon"}];

    expect(component.currentQuery()).toBe("icon");
  });

  it("keeps filtering when Y.Text updates before the canonical selection offset", () => {
    const block = {id: "block-1"};
    const {component} = createComponent({
      collapsed: true,
      // InputTransformer has committed `/icon`, but selection projection may
      // still report the offset immediately after the original slash.
      start: {type: "text", offset: 1},
      firstBlock: block,
    });
    component.triggerIndex = 0;
    (component.activeBlock as any).textLength = 5;
    component.activeBlock.textDeltas = () => [{insert: "/icon"}];

    expect(component.currentQuery()).toBe("icon");
  });

  it("rejects a slash query in the middle of existing paragraph text", () => {
    const block = {id: "block-1"};
    const {component} = createComponent({
      collapsed: true,
      start: {type: "text", offset: 12},
      firstBlock: block,
    });
    component.triggerIndex = 7;
    (component.activeBlock as any).textLength = 18;
    component.activeBlock.textDeltas = () => [{insert: "before /icon after"}];

    expect(component.currentQuery()).toBeNull();
  });

  it("emits the selected unified slash item", () => {
    const {component} = createComponent(null, null);
    const item = component.list[0];
    const selected = jasmine.createSpy("selected");
    component.commandSelected.subscribe(selected);

    component.select();

    expect(selected).toHaveBeenCalledOnceWith(item);
  });

  it("selects the item directly pressed by pointer instead of a stale hover index", () => {
    const {component} = createComponent(null, null);
    component.list.push({
      id: "inline:icon",
      kind: "command",
      group: "inline",
      groupLabel: "行内内容",
      label: "Icon",
    } as any);
    const itemElement = document.createElement("li");
    itemElement.className = "list__item";
    itemElement.dataset["index"] = "1";
    const child = document.createElement("span");
    itemElement.appendChild(child);
    const selected = jasmine.createSpy("selected");
    component.commandSelected.subscribe(selected);

    component.onMouseDown({
      target: child,
      preventDefault: jasmine.createSpy("preventDefault"),
    } as unknown as MouseEvent);

    expect(selected).toHaveBeenCalledOnceWith(component.list[1]);
  });
});
