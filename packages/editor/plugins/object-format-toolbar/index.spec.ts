import { ObjectFormatToolbarPlugin } from "./index";

describe("ObjectFormatToolbarPlugin object/edit interaction", () => {
  it("keeps the established Shape shell click as a whole-object selection", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const host = document.createElement("div");
    const shell = document.createElement("div");
    shell.className = "shape-block__shell";
    host.appendChild(shell);
    root.appendChild(host);
    document.body.appendChild(root);
    const block = { id: "shape-1", flavour: "shape", hostElement: host };
    const selectBlock = jasmine.createSpy("selectBlock");
    const startDrag = jasmine.createSpy("startDrag");
    (plugin as any).doc = {
      root: { hostElement: root },
      selection: { selectBlock },
      readonlyManager: { isReadonly: () => false },
      placement: { getState: () => ({ mode: "absolute" }), startDrag },
    };
    spyOn<any>(plugin, "resolveBlockFromSurface").and.returnValue(block);
    spyOn<any>(plugin, "confirmShapeClickSelection");
    const event = new PointerEvent("pointerdown", {
      button: 0,
      pointerId: 7,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: shell });
    (plugin as any).handleExistingObjectPointerDown(event);

    expect(selectBlock).toHaveBeenCalledOnceWith(block);
    expect(startDrag).toHaveBeenCalledOnceWith(event, block);
    host.remove();
    root.remove();
  });

  it("leaves Shape text clicks on the existing text-editing path", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const shell = document.createElement("div");
    shell.className = "shape-block__shell";
    const text = document.createElement("div");
    text.className = "shape-text-block";
    shell.appendChild(text);
    root.appendChild(shell);
    document.body.appendChild(root);
    const selectBlock = jasmine.createSpy("selectBlock");
    (plugin as any).doc = {
      root: { hostElement: root },
      selection: { selectBlock },
    };
    const event = new PointerEvent("pointerdown", { button: 0 });
    Object.defineProperty(event, "target", { value: text });
    (plugin as any).handleExistingObjectPointerDown(event);

    expect(selectBlock).not.toHaveBeenCalled();
    root.remove();
  });

  it("leaves ordinary TextBox frame clicks to the Schema selection contract", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const surface = document.createElement("div");
    surface.className = "text-box-block__surface";
    root.appendChild(surface);
    document.body.appendChild(root);
    const block = {
      id: "text-box-1",
      flavour: "text-box",
      hostElement: surface,
    };
    const selectBlock = jasmine.createSpy("selectBlock");
    (plugin as any).doc = {
      root: { hostElement: root },
      selection: { selectBlock },
    };
    spyOn<any>(plugin, "resolveBlockFromSurface").and.returnValue(block);
    const event = new PointerEvent("pointerdown", {
      button: 0,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: surface });
    (plugin as any).handleExistingObjectPointerDown(event);

    expect(selectBlock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeFalse();
    root.remove();
  });

  it("keeps WordArt surface clicks on its real plain-text editor", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const surface = document.createElement("div");
    surface.className = "word-art-block__surface";
    const editor = document.createElement("div");
    editor.className = "word-art-block__editor";
    surface.appendChild(editor);
    root.appendChild(surface);
    document.body.appendChild(root);
    const enterEditing = jasmine.createSpy("enterEditing");
    const block = {
      id: "word-art-1",
      flavour: "word-art",
      hostElement: surface,
      enterEditing,
    };
    const selectBlock = jasmine.createSpy("selectBlock");
    (plugin as any).doc = {
      root: { hostElement: root },
      selection: { selectBlock, value: null },
      readonlyManager: { isReadonly: () => false },
    };
    spyOn<any>(plugin, "resolveBlockFromSurface").and.returnValue(block);
    const event = new PointerEvent("pointerdown", {
      button: 0,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: editor });
    (plugin as any).handleExistingObjectPointerDown(event);

    expect(enterEditing).toHaveBeenCalledTimes(1);
    expect(selectBlock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeFalse();
    root.remove();
  });

  it("keeps Escape from Shape text returning to the whole Shape", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const selectBlock = jasmine.createSpy("selectBlock");
    (plugin as any).doc = {
      model: {
        getParentId: () => "shape-1",
        getFlavour: () => "shape",
      },
      selection: { selectBlock },
    };
    const preventDefault = jasmine.createSpy("preventDefault");
    const context = {
      get: () => ({
        selection: {
          isInSameBlock: true,
          anchor: { blockId: "shape-text-1" },
        },
      }),
      preventDefault,
    } as any;

    expect(plugin.onShapeTextEscape(context)).toBeTrue();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(selectBlock).toHaveBeenCalledOnceWith("shape-1");
  });

  it("keeps the original secondary-toolbar focus handoff at the editor root", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const host = document.createElement("div");
    const overlay = document.createElement("div");
    const input = document.createElement("input");
    const outside = document.createElement("button");
    root.appendChild(host);
    overlay.appendChild(input);
    document.body.append(root, overlay, outside);
    (plugin as any).doc = {
      root: { hostElement: root },
      vm: { get: () => ({ instance: { hostElement: host } }) },
      objectFormat: { getSelectionIds: () => ["shape-1"] },
    };
    (plugin as any).activeIds = ["shape-1"];
    (plugin as any).overlayRef = { overlayElement: overlay };
    const close = spyOn(plugin, "close");

    (plugin as any).handleFocusIn({ target: input } as unknown as FocusEvent);
    expect((plugin as any).toolbarFocusActive).toBeTrue();
    expect(host.classList.contains("selected")).toBeTrue();
    expect(close).not.toHaveBeenCalled();

    (plugin as any).handleFocusIn({ target: root } as unknown as FocusEvent);
    expect(close).not.toHaveBeenCalled();
    (plugin as any).handleFocusIn({ target: outside } as unknown as FocusEvent);
    expect(close).toHaveBeenCalledTimes(1);
    root.remove();
    overlay.remove();
    outside.remove();
  });

  it("repaints whole-object chrome after the first rail click clears native selection", async () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const host = document.createElement("div");
    const overlay = document.createElement("div");
    host.classList.add("selected");
    root.appendChild(host);
    document.body.append(root, overlay);
    (plugin as any).doc = {
      root: { hostElement: root },
      vm: { get: () => ({ instance: { hostElement: host } }) },
      objectFormat: { getSelectionIds: () => null },
    };
    (plugin as any).activeIds = ["shape-1"];
    (plugin as any).overlayRef = { overlayElement: overlay };
    (plugin as any).toolbarPointerActive = true;

    (plugin as any).retainObjectChrome();
    (plugin as any).scheduleRetainObjectChrome();
    host.classList.remove("selected");
    await Promise.resolve();

    expect(host.classList.contains("selected")).toBeTrue();
    expect((plugin as any).retainedObjectChrome.get("shape-1")).toBe(host);
    root.remove();
    overlay.remove();
  });

  it("commits a focused CSES input without treating its selection gap as drift", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const updateSelection = jasmine
      .createSpy("updateSelection")
      .and.returnValue({
        applied: true,
        updatedIds: ["shape-1"],
        skippedReadonlyIds: [],
      });
    (plugin as any).doc = {
      objectFormat: {
        getSelectionIds: () => null,
        updateSelection,
        readSelection: () => null,
      },
      messageService: { warn: jasmine.createSpy("warn") },
    };
    (plugin as any).activeIds = ["shape-1"];
    (plugin as any).toolbarFocusActive = true;

    (plugin as any).applyPatch({ rotation: 15 });

    expect(updateSelection).toHaveBeenCalledOnceWith(
      ["shape-1"],
      { rotation: 15 },
      { allowDetachedSelection: true },
    );
  });
});
