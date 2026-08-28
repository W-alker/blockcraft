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

  it("resolves mixed absolute object selections to the dedicated group toolbar", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const selection = {} as BlockCraft.Selection;
    const host = document.createElement("div");
    document.body.append(host);
    (plugin as any).doc = {
      vm: { get: () => ({ instance: { hostElement: host } }) },
      placement: {
        getAbsoluteObjectSelectionIds: () => ["image-1", "text-box-1"],
        isObjectGroup: () => false,
        canAlignObjects: (_ids: string[], action?: string) =>
          action !== "horizontal-distribute",
        canGroup: () => true,
      },
    };

    const result = (plugin as any).resolveGroupToolbarState(selection);

    expect(result.mode).toBe("group");
    expect(result.blockIds).toEqual(["image-1", "text-box-1"]);
    expect(result.canGroup).toBeTrue();
    expect(result.canDistribute).toBeFalse();
    host.remove();
  });

  it("uses the selected objects' layout capability intersection and rejects partial writes", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const supportsObjectLayout = jasmine
      .createSpy("supportsObjectLayout")
      .and.callFake(
        (id: string, layout: string) =>
          !(id === "text-box-1" && layout === "inline"),
      );
    const setObjectLayout = jasmine.createSpy("setObjectLayout");
    (plugin as any).doc = {
      placement: { supportsObjectLayout, setObjectLayout },
    };
    (plugin as any).activeIds = ["shape-1", "text-box-1"];

    expect(
      (plugin as any).resolveSupportedObjectLayouts((plugin as any).activeIds),
    ).toEqual(["top-bottom", "under", "over"]);
    (plugin as any).handleLayout("wrap");

    expect(setObjectLayout).not.toHaveBeenCalled();
  });

  it("rejects absolute-only arrangement commands while the object is in flow", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const alignObjectsToPlane = jasmine.createSpy("alignObjectsToPlane");
    const moveForward = jasmine.createSpy("moveForward");
    const moveBackward = jasmine.createSpy("moveBackward");
    const getObjectLayout = jasmine.createSpy("getObjectLayout");
    (plugin as any).doc = {
      placement: {
        getObjectLayout,
        alignObjectsToPlane,
        moveForward,
        moveBackward,
      },
    };
    (plugin as any).activeIds = ["shape-1"];

    getObjectLayout.and.returnValue("top-bottom");
    (plugin as any).handleLayout("page-left");
    (plugin as any).handleLayout("forward");
    expect(alignObjectsToPlane).not.toHaveBeenCalled();
    expect(moveForward).not.toHaveBeenCalled();

    getObjectLayout.and.returnValue("over");
    (plugin as any).handleLayout("page-left");
    (plugin as any).handleLayout("backward");
    expect(alignObjectsToPlane).toHaveBeenCalledOnceWith(["shape-1"], "left");
    expect(moveBackward).toHaveBeenCalledOnceWith("shape-1");
  });

  it("extends Shift selection across absolute objects without requiring format capability", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const target = document.createElement("div");
    target.dataset["blockId"] = "image-1";
    root.append(target);
    document.body.append(root);
    const replay = jasmine.createSpy("replay");
    (plugin as any).doc = {
      isReadonly: false,
      root: { hostElement: root },
      model: {
        getParentId: (id: string) =>
          id === "shape-1" || id === "image-1" ? "layout" : null,
        getChildrenIds: () => ["shape-1", "image-1"],
      },
      placement: { isPlacementLayout: (id: string) => id === "layout" },
      selection: {
        value: {
          anchor: { blockId: "shape-1", type: "selected" },
          head: { blockId: "shape-1", type: "selected" },
        },
        replay,
      },
    };
    const event = new PointerEvent("pointerdown", {
      button: 0,
      shiftKey: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: target });

    expect((plugin as any).extendAbsoluteSelection(event)).toBeTrue();
    expect(replay).toHaveBeenCalledOnceWith({
      anchor: { blockId: "layout", type: "boundary", index: 0 },
      head: { blockId: "layout", type: "boundary", index: 2 },
      commonParent: "layout",
    });
    root.remove();
  });

  it("selects a group on first click and releases the second click to its member", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const groupHost = document.createElement("div");
    groupHost.dataset["blockId"] = "group";
    groupHost.setAttribute("data-bc-object-group", "");
    const child = document.createElement("div");
    child.dataset["blockId"] = "shape";
    groupHost.append(child);
    root.append(groupHost);
    document.body.append(root);
    const selectBlock = jasmine.createSpy("selectBlock");
    const selection: { value: any } = { value: null };
    (plugin as any).doc = {
      isReadonly: false,
      root: { hostElement: root },
      model: {
        getParentId: (id: string) =>
          id === "shape" ? "group" : id === "group" ? "layout" : null,
      },
      placement: { isObjectGroup: (id: string) => id === "group" },
      selection: {
        get value() {
          return selection.value;
        },
        selectBlock,
      },
      readonlyManager: { isReadonly: () => false },
      getBlockById: () => ({ id: "group", hostElement: groupHost }),
    };

    const first = pointerEventOn(child);
    expect((plugin as any).handleObjectGroupPointerDown(first)).toBeTrue();
    expect(selectBlock).toHaveBeenCalledOnceWith("group");
    expect(first.defaultPrevented).toBeTrue();

    selection.value = {
      anchor: { blockId: "group", type: "selected" },
      head: { blockId: "group", type: "selected" },
    };
    const second = pointerEventOn(child);
    expect((plugin as any).handleObjectGroupPointerDown(second)).toBeFalse();
    expect(selectBlock).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBeFalse();
    root.remove();
  });

  it("keeps the group frame visible while a nested member owns selection", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const groupHost = document.createElement("div");
    document.body.append(groupHost);
    const parents: Record<string, string> = {
      "shape-text": "shape",
      shape: "group",
      group: "layout",
      outside: "root",
    };
    (plugin as any).doc = {
      model: { getParentId: (id: string) => parents[id] ?? null },
      placement: { isObjectGroup: (id: string) => id === "group" },
      getBlockById: (id: string) => {
        if (id !== "group") throw new Error("missing block");
        return { id, hostElement: groupHost };
      },
    };

    (plugin as any).syncSelectionWithinGroupFrames({
      anchor: { blockId: "shape-text", type: "text", offset: 0 },
      head: { blockId: "shape-text", type: "text", offset: 2 },
    });
    expect(groupHost.classList).toContain("bc-object-group--selection-within");

    (plugin as any).syncSelectionWithinGroupFrames({
      anchor: { blockId: "outside", type: "selected" },
      head: { blockId: "outside", type: "selected" },
    });
    expect(groupHost.classList).not.toContain(
      "bc-object-group--selection-within",
    );
    groupHost.remove();
  });

  it("executes a group command through an owned toolbar focus gap", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const alignObjects = jasmine.createSpy("alignObjects");
    (plugin as any).doc = {
      placement: {
        getAbsoluteObjectSelectionIds: () => null,
        alignObjects,
      },
      selection: { value: null },
    };
    (plugin as any).toolbarPointerActive = true;
    spyOn(plugin, "close");
    spyOn<any>(plugin, "sync");

    (plugin as any).handleGroupAction("left", ["shape-1", "image-1"]);

    expect(alignObjects).toHaveBeenCalledOnceWith(
      ["shape-1", "image-1"],
      "left",
    );
  });
});

function pointerEventOn(target: HTMLElement): PointerEvent {
  const event = new PointerEvent("pointerdown", {
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "target", { value: target });
  return event;
}
