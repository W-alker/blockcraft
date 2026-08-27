import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  storeObjectEffects,
  storeObjectPaint,
  type BlockObjectFormatCapability,
} from "../block-std/block/object-format";
import { BlockObjectFormatManager } from "./block-object-format.manager";

const capability: BlockObjectFormatCapability = {
  kind: "shape",
  features: {
    geometry: true,
    shape: true,
    pictureFill: true,
    lineArrows: true,
    textFrame: true,
    textStyle: "rich-default",
  },
  defaults: {
    width: 100,
    height: 50,
    rotation: 0,
    lockAspectRatio: false,
    shapeType: "rectangle",
    shapeFill: DEFAULT_OBJECT_PAINT,
    shapeOutline: DEFAULT_OBJECT_LINE,
    shapeEffects: DEFAULT_OBJECT_EFFECTS,
    textFrame: DEFAULT_OBJECT_TEXT_FRAME,
    textStyle: DEFAULT_OBJECT_TEXT_STYLE,
  },
  shapeTypes: ["rectangle", "line"],
  textlessShapeTypes: ["line"],
};

function makeHarness() {
  const props = new Map<string, Record<string, unknown>>([
    ["a", { width: 100, height: 50, shape: "rectangle" }],
    ["b", { width: 200, height: 50, shape: "rectangle" }],
  ]);
  let selectedIds: string[] | null = ["a", "b"];
  const selection = { value: {} as BlockCraft.Selection };
  const transact = jasmine
    .createSpy("transact")
    .and.callFake((fn: () => void) => fn());
  const updateBlockProps = jasmine
    .createSpy("updateBlockProps")
    .and.callFake((id: string, patch: Record<string, unknown>) => {
      Object.assign(props.get(id)!, patch);
    });
  const doc = {
    schemas: { get: () => ({ metadata: { objectFormat: capability } }) },
    model: {
      getFlavour: (id: string) => (props.has(id) ? "shape" : undefined),
      getProps: (id: string) => props.get(id),
      getChildrenIds: (id: string) => (id === "a" ? ["text-a"] : []),
      getTextLength: (id: string) => (id === "text-a" ? 1 : 0),
    },
    readonlyManager: { isReadonly: (id: string) => id === "b" },
    selection,
    placement: { getAbsoluteObjectSelectionIds: () => selectedIds },
    crud: { transact, updateBlockProps },
  };
  return {
    manager: new BlockObjectFormatManager(doc as never),
    props,
    transact,
    updateBlockProps,
    setSelection: (ids: string[] | null) => {
      selectedIds = ids;
    },
  };
}

describe("BlockObjectFormatManager", () => {
  it("reports mixed values and capability intersection model-first", () => {
    const { manager } = makeHarness();
    const state = manager.readSelection(["a", "b"])!;
    expect(state.values.width.mixed).toBeTrue();
    expect(state.values.height).toEqual({ mixed: false, value: 50 });
    expect(state.readonlyCount).toBe(1);
  });

  it("writes every writable target in one transaction and skips locks", () => {
    const { manager, transact, updateBlockProps } = makeHarness();
    const fill = { ...DEFAULT_OBJECT_PAINT, color: "#FF0000" };
    const result = manager.updateSelection(["a", "b"], { shapeFill: fill });
    expect(result.updatedIds).toEqual(["a"]);
    expect(result.skippedReadonlyIds).toEqual(["b"]);
    expect(transact).toHaveBeenCalledTimes(1);
    expect(updateBlockProps).toHaveBeenCalledOnceWith("a", {
      fill: storeObjectPaint(fill),
    });
  });

  it("writes shadow and glow together through one effects prop", () => {
    const { manager, transact, updateBlockProps } = makeHarness();
    const effects = {
      shadow: {
        ...DEFAULT_OBJECT_EFFECTS.shadow,
        enabled: true,
        blur: 18,
        distance: 7,
      },
      glow: {
        ...DEFAULT_OBJECT_EFFECTS.glow,
        enabled: true,
        radius: 12,
      },
    };
    manager.updateSelection(["a", "b"], { shapeEffects: effects });
    expect(transact).toHaveBeenCalledTimes(1);
    expect(updateBlockProps).toHaveBeenCalledOnceWith("a", {
      effects: storeObjectEffects(effects),
    });
    expect(typeof updateBlockProps.calls.mostRecent().args[1]["effects"]).toBe(
      "object",
    );
  });

  it("couples one edited dimension when aspect ratio is locked", () => {
    const { manager, updateBlockProps } = makeHarness();
    manager.updateSelection(["a", "b"], { lockAspectRatio: true, width: 300 });
    expect(updateBlockProps).toHaveBeenCalledWith(
      "a",
      jasmine.objectContaining({
        width: 300,
        height: 150,
        lockRatio: true,
      }),
    );
  });

  it("fails closed when selection drifts before commit", () => {
    const { manager, setSelection, transact } = makeHarness();
    setSelection(["a"]);
    expect(manager.updateSelection(["a", "b"], { rotation: 20 }).reason).toBe(
      "selection-changed",
    );
    expect(transact).not.toHaveBeenCalled();
  });

  it("allows only a detached toolbar-owned selection gap", () => {
    const { manager, setSelection, updateBlockProps } = makeHarness();
    setSelection(null);
    const result = manager.updateSelection(
      ["a", "b"],
      { rotation: 20 },
      { allowDetachedSelection: true },
    );
    expect(result.applied).toBeTrue();
    expect(updateBlockProps).toHaveBeenCalledWith("a", { rotation: 20 });

    setSelection(["a"]);
    expect(
      manager.updateSelection(
        ["a", "b"],
        { rotation: 30 },
        { allowDetachedSelection: true },
      ).reason,
    ).toBe("selection-changed");
  });

  it("rejects a text-losing shape target even through the public manager", () => {
    const { manager, setSelection, updateBlockProps } = makeHarness();
    setSelection(["a"]);
    expect(
      manager.updateSelection(["a"], { shapeType: "line" }).applied,
    ).toBeFalse();
    expect(updateBlockProps).not.toHaveBeenCalled();
  });

  it("emits null to delete a section when reset is requested", () => {
    const { manager, setSelection, updateBlockProps } = makeHarness();
    setSelection(["a"]);
    manager.updateSelection(["a"], { shapeFill: null });
    expect(updateBlockProps).toHaveBeenCalledOnceWith("a", { fill: null });
  });
});
