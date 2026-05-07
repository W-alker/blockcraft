import { ElementRef } from "@angular/core";
import { BlockTransformContextMenu } from "./contextmenu";

describe("BlockTransformContextMenu keyboard navigation", () => {
  function createComponent(
    selection: any,
    recalculatedSelection = selection,
    hostElement = document.createElement("div"),
  ) {
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
        flavour: "paragraph",
        type: "block",
        metadata: { label: "Paragraph" },
      },
    ] as any;
    component.activeBlock = { id: "block-1" } as any;
    component.doc = {
      event: {
        status: { isComposing: false },
      },
      selection: {
        value: selection,
        recalculate: jasmine
          .createSpy("recalculate")
          .and.callFake(() => ({ value: recalculatedSelection })),
      },
    } as any;

    return { component, cdr };
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

  it("handles ArrowDown through the hotkey fallback path", () => {
    const { component } = createComponent({
      collapsed: true,
      start: { type: "text" },
      firstBlock: { id: "block-1" },
    });
    spyOn(component, "selectDown");

    const preventDefault = jasmine.createSpy("preventDefault");
    const stopPropagation = jasmine.createSpy("stopPropagation");

    const handled = (component as any).handleHotkeyEvent(
      {
        preventDefault,
        getDefaultEvent: () =>
          ({
            key: "ArrowDown",
            stopPropagation,
          }) as KeyboardEvent,
      },
      "ArrowDown",
    );

    expect(handled).toBeTrue();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(component.selectDown).toHaveBeenCalled();
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
});
