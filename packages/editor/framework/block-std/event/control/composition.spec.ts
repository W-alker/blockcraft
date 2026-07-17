import {Subject} from "rxjs";
import {CompositionControl} from "./composition";

describe("CompositionControl stale session recovery", () => {
  function createHarness() {
    const root = document.createElement("div");
    const blockA = document.createElement("p");
    const blockB = document.createElement("p");
    const editA = document.createElement("span");
    const editB = document.createElement("span");
    const nativeInput = document.createElement("input");
    const outside = document.createElement("button");
    const onDestroy$ = new Subject<void>();

    blockA.dataset["blockId"] = "a";
    blockB.dataset["blockId"] = "b";
    editA.textContent = "alpha";
    editB.textContent = "beta";
    blockA.append(editA, nativeInput);
    blockB.append(editB);
    root.append(blockA, blockB);
    document.body.append(root, outside);

    const dispatcher = {
      doc: {},
      run: jasmine.createSpy("run"),
    };
    const control = new CompositionControl(dispatcher as any);
    control.listen({hostElement: root, onDestroy$} as any);

    const setNativeCursor = (element: HTMLElement, offset = 0) => {
      const text = element.firstChild!;
      const range = document.createRange();
      range.setStart(text, offset);
      range.collapse(true);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    };
    const start = () => {
      editA.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true}));
      expect(control.isComposing).toBeTrue();
    };
    const destroy = () => {
      onDestroy$.next();
      onDestroy$.complete();
      document.getSelection()?.removeAllRanges();
      root.remove();
      outside.remove();
    };

    return {
      root,
      blockA,
      editA,
      editB,
      nativeInput,
      outside,
      control,
      dispatcher,
      setNativeCursor,
      start,
      destroy,
    };
  }

  it("keeps composition active while the native cursor stays in the source block", () => {
    const h = createHarness();
    h.start();

    h.setNativeCursor(h.editA, 2);
    document.dispatchEvent(new Event("selectionchange"));

    expect(h.control.isComposing).toBeTrue();
    h.destroy();
  });

  it("recovers after every listener observes the composing state for the selectionchange", async () => {
    const h = createHarness();
    h.start();
    const observedStates: boolean[] = [];
    const observeState = () => observedStates.push(h.control.isComposing);
    document.addEventListener("selectionchange", observeState);

    h.setNativeCursor(h.editB, 1);
    document.dispatchEvent(new Event("selectionchange"));

    expect(observedStates).toEqual([true]);
    expect(h.control.isComposing).toBeTrue();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(h.control.isComposing).toBeFalse();
    document.removeEventListener("selectionchange", observeState);
    h.destroy();
  });

  it("recovers on a new primary pointer intent", () => {
    const h = createHarness();
    h.start();

    h.editB.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      isPrimary: true,
      pointerId: 2,
    }));

    expect(h.control.isComposing).toBeFalse();
    h.destroy();
  });

  it("clears the old state when compositionend lands in a native input", () => {
    const h = createHarness();
    h.start();

    h.nativeInput.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true}));

    expect(h.control.isComposing).toBeFalse();
    expect(h.dispatcher.run).toHaveBeenCalledTimes(1);
    h.destroy();
  });

  it("recovers when focus leaves the editor root", () => {
    const h = createHarness();
    h.start();

    h.editA.dispatchEvent(new FocusEvent("focusout", {
      bubbles: true,
      relatedTarget: h.outside,
    }));

    expect(h.control.isComposing).toBeFalse();
    h.destroy();
  });
});
