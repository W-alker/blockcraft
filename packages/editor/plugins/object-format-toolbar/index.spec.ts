import { SelectionSelectedManager } from "../../framework/modules/selection/selected-manager";
import { BlockNodeType } from "../../framework/block-std";
import { ObjectFormatToolbarPlugin } from "./index";

describe("ObjectFormatToolbarPlugin object/edit interaction", () => {
  for (const [flavour, surfaceClass, handle] of [
    ["shape", "shape-block__shell", '<shape-resizer><span class="shape-resizer__move-edge"></span></shape-resizer>'],
    ["text-box", "text-box-block__surface", '<shape-resizer><span class="shape-resizer__move-edge"></span></shape-resizer>'],
    ["word-art", "word-art-block__surface", '<shape-resizer><span class="shape-resizer__move-edge"></span></shape-resizer>'],
    ["text-box", "text-box-block__surface", '<span class="text-box-block__object-handle"></span>'],
    ["word-art", "word-art-block__surface", '<span class="word-art-block__object-handle"></span>'],
  ]) {
    for (const mode of ["absolute", "relative"]) {
      for (const readonly of [false, true]) {
        it(`routes ${flavour} ${handle} through ${mode} dragging (readonly=${readonly})`, () => {
          const plugin = new ObjectFormatToolbarPlugin();
          const root = document.createElement("div");
          root.innerHTML = `<div class="${surfaceClass}">${handle}</div>`;
          document.body.appendChild(root);
          try {
            const shell = root.firstElementChild!;
            const block = {id: "object-1", flavour, hostElement: shell,
              shapeProps: {shapeType: "diamond"}};
            const selectBlock = jasmine.createSpy("selectBlock");
            const placementDrag = jasmine.createSpy("placementDrag");
            const flowDrag = jasmine.createSpy("flowDrag");
            (plugin as any).doc = {
              root: {hostElement: root}, selection: {selectBlock},
              readonlyManager: {isReadonly: () => readonly},
              placement: {getState: () => ({mode}), startDrag: placementDrag},
              dragController: {state: "idle", startDrag: flowDrag},
            };
            spyOn<any>(plugin, "resolveBlockFromSurface").and.returnValue(block);
            spyOn<any>(plugin, "confirmShapeClickSelection");
            const event = new PointerEvent("pointerdown", {button: 0, cancelable: true});
            Object.defineProperty(event, "target", {value: shell.querySelector("span")});
            (plugin as any).handleExistingObjectPointerDown(event);

            expect(selectBlock).toHaveBeenCalledOnceWith(block);
            expect(event.defaultPrevented).toBeTrue();
            expect(placementDrag).toHaveBeenCalledTimes(!readonly && mode === "absolute" ? 1 : 0);
            expect(flowDrag).toHaveBeenCalledTimes(!readonly && mode === "relative" ? 1 : 0);
            if (!readonly && mode === "absolute") {
              expect(placementDrag).toHaveBeenCalledWith(event, block);
            }
            if (!readonly && mode === "relative") {
              expect(flowDrag).toHaveBeenCalledWith(event,
                {kind: "origin-block", blockId: block.id}, {ghostLabel: jasmine.any(String)});
            }
          } finally {
            root.remove();
          }
        });
      }
    }
  }

  for (const control of [
    '<shape-resizer><button class="shape-resizer__handle"></button></shape-resizer>',
    '<shape-resizer><button class="shape-resizer__rotate"></button></shape-resizer>',
    '<shape-geometry-editor><button></button></shape-geometry-editor>',
    '<shape-adjustment-editor><button></button></shape-adjustment-editor>',
  ]) {
    it(`leaves Shape controls on their own gesture path: ${control}`, () => {
      const plugin = new ObjectFormatToolbarPlugin();
      const root = document.createElement("div");
      root.innerHTML = `<div class="shape-block__shell">${control}</div>`;
      document.body.appendChild(root);
      try {
        const selectBlock = jasmine.createSpy("selectBlock");
        (plugin as any).doc = {root: {hostElement: root}, selection: {selectBlock}};
        spyOn<any>(plugin, "resolveBlockFromSurface").and.returnValue({id: "shape-1"});
        const event = new PointerEvent("pointerdown", {button: 0, cancelable: true});
        Object.defineProperty(event, "target", {value: root.querySelector("button")});
        (plugin as any).handleExistingObjectPointerDown(event);
        expect(selectBlock).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBeFalse();
      } finally {
        root.remove();
      }
    });
  }

  it("focuses existing text from blank space but never creates text on a single press", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const shell = document.createElement("div");
    shell.className = "shape-block__shell";
    const frame = document.createElement("div");
    frame.className = "shape-block__text-frame";
    shell.appendChild(frame);
    root.appendChild(shell);
    document.body.appendChild(root);
    const onEditText = jasmine.createSpy("onEditText");
    const block = {
      id: "shape-1", flavour: "shape", hostElement: shell, onEditText,
      firstChildren: null as {id: string; flavour: string} | null,
    };
    const selection = {value: null as any, selectBlock: jasmine.createSpy("selectBlock")};
    const startDrag = jasmine.createSpy("startDrag");
    const readonlyManager = {isReadonly: () => false};
    (plugin as any).doc = {
      root: {hostElement: root}, selection, readonlyManager,
      placement: {getState: () => ({mode: "absolute"}), startDrag},
    };
    spyOn<any>(plugin, "resolveBlockFromSurface").and.returnValue(block);
    spyOn<any>(plugin, "confirmShapeClickSelection");
    const event = new PointerEvent("pointerdown", {button: 0, cancelable: true});
    Object.defineProperty(event, "target", {value: frame});

    (plugin as any).handleExistingObjectPointerDown(event);
    expect(onEditText).not.toHaveBeenCalled();
    expect(startDrag).toHaveBeenCalledTimes(1);

    selection.value = {isInSameBlock: true, anchor: {blockId: block.id}};
    (plugin as any).handleExistingObjectPointerDown(event);
    expect(onEditText).not.toHaveBeenCalled();
    expect(startDrag).toHaveBeenCalledTimes(2);

    block.firstChildren = {id: "shape-text-1", flavour: "shape-text"};
    (plugin as any).handleExistingObjectPointerDown(event);
    expect(onEditText).toHaveBeenCalledOnceWith(event);
    expect(startDrag).toHaveBeenCalledTimes(2);

    readonlyManager.isReadonly = () => true;
    (plugin as any).handleExistingObjectPointerDown(event);
    expect(onEditText).toHaveBeenCalledTimes(1);
    root.remove();
  });

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
      selection: {
        retainPresentation: jasmine.createSpy("retainPresentation").and.returnValue(() => {}),
        blur: jasmine.createSpy("blur"),
      },
    };
    (plugin as any).activeIds = ["shape-1"];
    (plugin as any).overlayRef = { overlayElement: overlay };
    const close = spyOn(plugin, "close");

    (plugin as any).handleFocusIn({ target: input } as unknown as FocusEvent);
    expect((plugin as any).toolbarFocusActive).toBeTrue();
    expect((plugin as any).doc.selection.retainPresentation).toHaveBeenCalledTimes(1);
    expect((plugin as any).doc.selection.blur).toHaveBeenCalledTimes(1);
    expect(host.classList.contains("selected")).toBeFalse();
    expect(close).not.toHaveBeenCalled();

    (plugin as any).handleFocusIn({ target: root } as unknown as FocusEvent);
    expect(close).not.toHaveBeenCalled();
    (plugin as any).handleFocusIn({ target: outside } as unknown as FocusEvent);
    expect(close).toHaveBeenCalledTimes(1);
    root.remove();
    overlay.remove();
    outside.remove();
  });

  for (const flavour of ["shape", "text-box", "word-art"]) {
    for (const destination of ["gap", "text"]) {
      it(`clears ${flavour} object presentation on ${destination} intent during toolbar focus`, async () => {
        const plugin = new ObjectFormatToolbarPlugin();
        const root = document.createElement("div");
        const host = document.createElement("div");
        const textHost = document.createElement("p");
        const overlay = document.createElement("div");
        host.append(textHost);
        root.append(host);
        document.body.append(root, overlay);
        const block = {id: "object", flavour, hostElement: host,
          nodeType: flavour === "word-art" ? BlockNodeType.editable : BlockNodeType.block};
        const text = {id: "text", nodeType: BlockNodeType.editable, hostElement: textHost};
        let current: any = {start: {blockId: "object", type: "selected"},
          end: {blockId: "object", type: "selected"}, collapsed: false,
          getBoundarySelectedChildIds: () => ["object"]};
        const doc: any = {
          root: {hostElement: root},
          getBlockById: (id: string) => id === "object" ? block : text,
          vm: {get: () => ({instance: block})},
          objectFormat: {readSelection: () => null, getSelectionIds: () => current?.collapsed === false ? ["object"] : null},
        };
        const manager = new SelectionSelectedManager(doc);
        doc.selection = {retainPresentation: () => manager.retainPresentation(current)};
        (plugin as any).doc = doc;
        (plugin as any).overlayRef = {overlayElement: overlay, dispose: () => overlay.remove()};
        (plugin as any).activeIds = ["object"];
        (plugin as any).toolbarFocusActive = true;
        (plugin as any).toolbarPointerGraceUntil = Date.now() + 100;
        spyOn<any>(plugin, "resolveGroupToolbarState").and.returnValue(null);
        spyOn<any>(plugin, "restorePreview");
        manager.setSelected(current);
        (plugin as any).retainObjectChrome();
        if (flavour === "word-art") {
          host.classList.add("word-art-block--object-selected");
          (plugin as any).activeWordArtHost = host;
        }
        // Real publication order: toolbar subscriber first, manager reconciliation second.
        current = null;
        (plugin as any).sync(current);
        manager.setSelected(current);
        await Promise.resolve();
        expect(host.classList.contains(flavour === "word-art" ? "focused" : "selected")).toBeTrue();
        const textId = flavour === "word-art" ? "object" : "text";
        current = {start: {blockId: textId, type: destination, offset: 0},
          end: {blockId: textId, type: destination, offset: 0}, collapsed: true,
          getBoundarySelectedChildIds: () => destination === "text" ? [textId] : []};
        (plugin as any).sync(current);
        manager.setSelected(current);
        await Promise.resolve();
        expect(host.classList.contains("selected")).toBeFalse();
        expect(host.classList.contains("focused")).toBe(flavour === "word-art" && destination === "text");
        expect(host.classList.contains("word-art-block--object-selected")).toBeFalse();
        expect(textHost.classList.contains("focused")).toBe(flavour !== "word-art" && destination === "text");
        expect((plugin as any).overlayRef).toBeUndefined();
        root.remove();
        overlay.remove();
      });
    }
  }

  for (const tag of ["button", "input"]) {
    it(`clears the native object range on toolbar ${tag} focus without clearing manager presentation`, () => {
      const plugin = new ObjectFormatToolbarPlugin();
      const root = document.createElement("div");
      root.contentEditable = "true";
      const host = document.createElement("div");
      host.contentEditable = "false";
      const overlay = document.createElement("div");
      const control = document.createElement(tag);
      root.append(host);
      overlay.append(control);
      document.body.append(root, overlay);
      const block = {id: "object", nodeType: BlockNodeType.block, hostElement: host};
      let current: any = {
        start: {blockId: "object", type: "selected"},
        end: {blockId: "object", type: "selected"},
        collapsed: false, getBoundarySelectedChildIds: () => ["object"],
      };
      const doc: any = {
        root: {hostElement: root},
        getBlockById: () => block,
        objectFormat: {readSelection: () => null},
      };
      const manager = new SelectionSelectedManager(doc);
      doc.selection = {
        retainPresentation: () => manager.retainPresentation(current),
        blur: () => {
          current = null;
          (plugin as any).sync(null);
          manager.setSelected(null);
          document.getSelection()!.removeAllRanges();
        },
      };
      (plugin as any).doc = doc;
      (plugin as any).overlayRef = {overlayElement: overlay};
      (plugin as any).activeIds = ["object"];
      const close = spyOn(plugin, "close");
      manager.setSelected(current);
      const range = document.createRange();
      range.selectNode(host);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      control.focus();

      (plugin as any).handleFocusIn({target: control} as unknown as FocusEvent);

      expect(current).toBeNull();
      expect(document.getSelection()!.rangeCount).toBe(0);
      expect(document.activeElement).toBe(control);
      expect(host.classList.contains("selected")).toBeTrue();
      expect(close).not.toHaveBeenCalled();
      root.remove();
      overlay.remove();
    });
  }

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

  it("shows the whole flow group's toolbar without treating it as an absolute selection", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const host = document.createElement("div");
    document.body.append(host);
    const getAbsoluteObjectSelectionIds = jasmine.createSpy().and.returnValue(null);
    const selection = {
      isInSameBlock: true,
      anchor: { blockId: "group", type: "selected" },
      head: { blockId: "group", type: "selected" },
    };
    (plugin as any).doc = {
      vm: { get: () => ({ instance: { hostElement: host } }) },
      placement: {
        getAbsoluteObjectSelectionIds,
        isObjectGroup: (id: string) => id === "group",
        getObjectLayout: () => "top-bottom",
        canUngroup: () => false,
        canMoveForward: () => false,
        canMoveBackward: () => false,
      },
    };
    try {
      expect((plugin as any).resolveGroupToolbarState(selection)).toEqual({
        mode: "ungroup", anchor: host, blockIds: ["group"],
        objectLayout: "top-bottom", canGroup: false, canUngroup: false,
        canDistribute: false, canMoveForward: false, canMoveBackward: false,
      });
      expect(getAbsoluteObjectSelectionIds).not.toHaveBeenCalled();
      for (const type of ["gap", "text"]) {
        expect((plugin as any).resolveGroupToolbarState({
          ...selection,
          anchor: { blockId: "group", type },
          head: { blockId: "group", type },
        })).toBeNull();
      }
      expect((plugin as any).resolveGroupToolbarState({
        ...selection,
        anchor: { blockId: "paragraph", type: "selected" },
        head: { blockId: "paragraph", type: "selected" },
      })).toBeNull();
    } finally {
      host.remove();
    }
  });

  it("retains the group toolbar on root focus only while the same group remains selected", () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const root = document.createElement("div");
    const host = document.createElement("div");
    root.append(host);
    const selection = { value: {
      isInSameBlock: true,
      anchor: { blockId: "group", type: "selected" },
      head: { blockId: "group", type: "selected" },
    } };
    (plugin as any).doc = {
      root: {hostElement: root}, selection,
      vm: {get: () => ({instance: {hostElement: host}})},
      objectFormat: {getSelectionIds: () => null},
      placement: {
        getAbsoluteObjectSelectionIds: () => null,
        isObjectGroup: (id: string) => id === "group",
      },
    };
    (plugin as any).overlayRef = {overlayElement: document.createElement("div")};
    (plugin as any).activeIds = ["group"];
    spyOn(plugin, "close");
    const event = new FocusEvent("focusin");
    Object.defineProperty(event, "target", {value: root});
    (plugin as any).handleFocusIn(event);
    expect(plugin.close).not.toHaveBeenCalled();
    selection.value.anchor.type = "gap";
    selection.value.head.type = "gap";
    (plugin as any).handleFocusIn(event);
    expect(plugin.close).toHaveBeenCalledTimes(1);
  });

  it("validates flow-group layout actions against the current whole-group selection", async () => {
    const plugin = new ObjectFormatToolbarPlugin();
    const setObjectLayout = jasmine.createSpy("setObjectLayout");
    const selection = { value: {
      isInSameBlock: true,
      anchor: { blockId: "group", type: "selected" },
      head: { blockId: "group", type: "selected" },
    } };
    (plugin as any).doc = {
      selection,
      placement: {
        getAbsoluteObjectSelectionIds: () => null,
        isObjectGroup: (id: string) => id === "group",
        setObjectLayout,
      },
    };
    spyOn(plugin, "close");
    spyOn<any>(plugin, "sync");
    (plugin as any).handleGroupAction({name: "object-layout", value: "over"}, ["group"]);
    expect(setObjectLayout).toHaveBeenCalledOnceWith("group", "over");
    setObjectLayout.calls.reset();
    (plugin as any).toolbarPointerActive = true;
    selection.value.anchor.type = "gap";
    selection.value.head.type = "gap";
    (plugin as any).handleGroupAction({name: "object-layout", value: "over"}, ["group"]);
    expect(setObjectLayout).not.toHaveBeenCalled();
    await Promise.resolve();
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

  it("executes a group command through an owned toolbar focus gap", async () => {
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
    await Promise.resolve();
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
