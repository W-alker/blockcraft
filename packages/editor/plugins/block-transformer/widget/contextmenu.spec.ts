import { ElementRef } from "@angular/core";
import {fakeAsync, flushMicrotasks} from "@angular/core/testing";
import * as Y from "yjs";
import {BlockNodeType, OneShotRangeAnchor} from "../../../framework";
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
      nodeType: BlockNodeType.editable,
      plainTextOnly: false,
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

  it("normalizes a legacy WebKit ArrowDown key before consuming it", () => {
    const { component } = createComponent({
      collapsed: true,
      start: { type: "text" },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");
    const preventDefault = jasmine.createSpy("preventDefault");

    (component as any).handleRootKeydown({
      key: "Unidentified",
      keyCode: 40,
      preventDefault,
      stopPropagation: jasmine.createSpy("stopPropagation"),
      stopImmediatePropagation: jasmine.createSpy("stopImmediatePropagation"),
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(component.selectDown).toHaveBeenCalledTimes(1);
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

  for (const flavour of ['paragraph', 'todo', 'ordered', 'bullet', 'blockquote', 'caption', 'shape-text']) {
    it(`keeps filtering in rich-text ${flavour} and rejects a plain-text target`, () => {
      const {component} = createComponent({
        collapsed: true, start: {type: 'text', offset: 5}, firstBlock: {id: 'block-1'},
      });
      (component.activeBlock as any).flavour = flavour;
      component.triggerIndex = 0;
      expect(component.currentQuery()).toBe('icon');
      component.activeBlock.plainTextOnly = true;
      expect(component.currentQuery()).toBeNull();
      component.activeBlock.plainTextOnly = false;
      (component.activeBlock as any).nodeType = BlockNodeType.block;
      expect(component.currentQuery()).toBeNull();
    });
  }

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

  it("tracks query input and collaborative prefix edits without consuming the existing suffix", () => {
    const selection = {
      collapsed: true,
      start: {type: "text", offset: 1},
      firstBlock: {id: "block-1"},
    };
    const {component} = createComponent(selection);
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("paragraph");
    yText.insert(0, "/原有正文");
    const block = component.activeBlock;
    Object.defineProperty(block, "textLength", {get: () => yText.length});
    (block as any).yText = yText;
    block.textDeltas = () => yText.toDelta();
    const doc = component.doc as any;
    doc.yDoc = yDoc;
    doc.getBlockById = () => block;
    doc.isEditable = (candidate: unknown) => candidate === block;
    const range = new OneShotRangeAnchor(doc);
    range.capture(block, 0, 1);
    component.queryRange = range;

    expect(component.currentQuery()).toBe("");
    yText.insert(1, "icon");
    // Query updates must not depend on selection projection catching up.
    expect(component.currentQuery()).toBe("icon");
    yText.insert(0, "前文");
    selection.start.offset = 7;
    expect(component.currentQuery()).toBe("icon");
    selection.start.offset = 8;
    expect(component.currentQuery()).toBeNull();
    selection.start.offset = 7;
    yText.delete(2, 1);
    expect(component.currentQuery()).toBeNull();
    range.reset();
    yDoc.destroy();
  });

  it("reads only the slash query in the middle of existing paragraph text", () => {
    const block = {id: "block-1"};
    const {component} = createComponent({
      collapsed: true,
      start: {type: "text", offset: 12},
      firstBlock: block,
    });
    component.triggerIndex = 7;
    (component.activeBlock as any).textLength = 18;
    component.activeBlock.textDeltas = () => [{insert: "before /icon after"}];

    expect(component.currentQuery()).toBe("icon");
  });

  function createQuerySession() {
    const selection = {
      collapsed: true,
      start: {type: "text", offset: 1},
      firstBlock: {id: "block-1"},
    };
    const {component, cdr} = createComponent(selection);
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("paragraph");
    yText.insert(0, "/原有正文withoutSpaces");
    const block = component.activeBlock;
    Object.defineProperty(block, "textLength", {get: () => yText.length});
    Object.assign(block, {yText, parentBlock: {id: "root"}});
    block.textDeltas = () => yText.toDelta();
    const doc = component.doc as any;
    Object.assign(doc, {
      yDoc,
      getBlockById: () => block,
      isEditable: (candidate: unknown) => candidate === block,
    });
    const range = new OneShotRangeAnchor(doc);
    range.capture(block, 0, 1);
    component.queryRange = range;
    component.items = [...component.list, {
      id: "inline:icon", kind: "command", group: "inline",
      groupLabel: "行内内容", label: "Icon",
    }];
    const destroyCallbacks: (() => void)[] = [];
    (component.destroyRef.onDestroy as jasmine.Spy).and.callFake(
      (callback: () => void) => destroyCallbacks.push(callback),
    );
    const closed = jasmine.createSpy("closed");
    component.close$.subscribe(closed);
    component.ngOnInit();
    flushMicrotasks();
    return {
      component, cdr, yText, selection, closed, doc,
      destroy: () => {
        destroyCallbacks.forEach(callback => callback());
        range.reset();
        yDoc.destroy();
      },
    };
  }

  it("checks deletion after the resulting caret and keeps an empty query open", fakeAsync(() => {
    const h = createQuerySession();
    h.yText.insert(1, "icon");
    h.selection.start.offset = 5;
    flushMicrotasks();
    expect(h.component.list.map(item => item.id)).toEqual(["inline:icon"]);

    h.yText.delete(4, 1);
    // Y.Text observers see the shortened token before the caret moves left.
    expect(h.closed).not.toHaveBeenCalled();
    h.selection.start.offset = 4;
    flushMicrotasks();
    expect(h.closed).not.toHaveBeenCalled();
    expect(h.component.currentQuery()).toBe("ico");

    h.yText.delete(1, 3);
    h.selection.start.offset = 1;
    flushMicrotasks();
    expect(h.closed).not.toHaveBeenCalled();
    expect(h.component.list.length).toBe(2);
    expect(h.yText.toString()).toBe("/原有正文withoutSpaces");

    h.yText.delete(0, 1);
    h.selection.start.offset = 0;
    flushMicrotasks();
    expect(h.closed).toHaveBeenCalledTimes(1);
    h.destroy();
  }));

  it("checks committed composition length and cancels queued refreshes on destruction", fakeAsync(() => {
    const h = createQuerySession();
    h.doc.event.status.isComposing = true;
    h.yText.insert(1, "一二三四五六七八");
    h.selection.start.offset = 9;
    flushMicrotasks();
    expect(h.closed).not.toHaveBeenCalled();

    h.doc.event.status.isComposing = false;
    h.component.refreshQuery();
    flushMicrotasks();
    expect(h.closed).toHaveBeenCalledTimes(1);
    expect(h.yText.toString()).toBe("/一二三四五六七八原有正文withoutSpaces");

    h.component.refreshQuery();
    h.destroy();
    flushMicrotasks();
    expect(h.closed).toHaveBeenCalledTimes(1);
  }));

  it("preserves the active item when a selection refresh keeps the same query", fakeAsync(() => {
    const h = createQuerySession();
    h.component.selectDown();
    expect((h.component as any).activeIdx).toBe(1);
    h.component.refreshQuery();
    flushMicrotasks();
    expect((h.component as any).activeIdx).toBe(1);
    expect(h.closed).not.toHaveBeenCalled();
    h.destroy();
  }));

  it("rejects a middle slash query after the caret leaves its token", () => {
    const block = {id: "block-1"};
    const {component} = createComponent({
      collapsed: true,
      start: {type: "text", offset: 18},
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
