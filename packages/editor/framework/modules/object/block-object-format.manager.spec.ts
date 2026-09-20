import * as Y from "yjs";
import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  storeObjectEffects,
  storeObjectPaint,
  storeObjectFormatSection,
  type BlockObjectFormatCapability,
} from "../../block-std/block/object-format";
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
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete props.get(id)![key];
        else props.get(id)![key] = value;
      }
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
  it("quantizes only the requested groups and skips locked targets", () => {
    const {manager, props, transact} = makeHarness();
    const shadow = "60.9453959deg 4.9419024px 2.4px #000000 / 0.25";
    props.get("a")!["shadow"] = shadow;
    props.get("b")!["shadow"] = shadow;
    props.get("a")!["textSpacing"] = "0.123456789em 1.2";
    const read = manager.readSelection(["a", "b"])!;
    expect(read.values.shapeEffects.value!.shadow.angle).toBe(60.9453959);
    expect(transact).not.toHaveBeenCalled();
    manager.updateSelection(["a", "b"], {shapeEffects: read.values.shapeEffects.value});
    expect(transact).toHaveBeenCalledTimes(1);
    expect(props.get("a")!["shadow"]).toBe("61deg 5px 2px #000000 / 0.25");
    expect(props.get("a")!["textSpacing"]).toBe("0.123456789em 1.2");
    expect(props.get("b")!["shadow"]).toBe(shadow);
  });

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
      ...storeObjectFormatSection('shapeFill', fill),
    });
  });

  it("writes independent shadow and glow groups in one transaction", () => {
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
      ...storeObjectEffects(effects),
    });
    expect(typeof updateBlockProps.calls.mostRecent().args[1]["shadow"]).toBe("string");
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
    const { manager, props, setSelection, updateBlockProps } = makeHarness();
    props.get("a")!["fill"] = "#FF0000";
    setSelection(["a"]);
    manager.updateSelection(["a"], { shapeFill: null });
    expect(updateBlockProps).toHaveBeenCalledOnceWith("a", { fill: null });
  });
  it("deletes disabled groups and defaults without rewriting unrelated text settings", () => {
    const {manager, props, updateBlockProps} = makeHarness();
    props.get('a')!['shadow'] = '45deg 2px 4px #000000 / 0.25';
    props.get('a')!['textFamily'] = 'serif';
    manager.updateSelection(['a', 'b'], {shapeEffects: DEFAULT_OBJECT_EFFECTS});
    expect(updateBlockProps).toHaveBeenCalledOnceWith('a', {shadow: null});
    expect(props.get('a')!['shadow']).toBeUndefined();
    updateBlockProps.calls.reset();
    manager.updateSelection(['a', 'b'], {textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, fontFamily: 'serif', fontSize: 24}});
    expect(updateBlockProps).toHaveBeenCalledOnceWith('a', {textFont: '24px 400 normal'});
    updateBlockProps.calls.reset();
    manager.updateSelection(['a', 'b'], {textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, fontFamily: 'serif'}});
    expect(updateBlockProps).toHaveBeenCalledOnceWith('a', {textFont: null});
    expect(props.get('a')!['textFamily']).toBe('serif');
  });

});


describe('grouped object-format collaboration', () => {
  const makeReplica = (ydoc: Y.Doc) => {
    const props = ydoc.getMap<unknown>('object-props');
    const doc = {
      schemas: {get: () => ({metadata: {objectFormat: capability}})},
      model: {getFlavour: () => 'shape', getProps: () => props.toJSON(), getChildrenIds: () => []},
      readonlyManager: {isReadonly: () => false}, selection: {value: {}},
      placement: {getAbsoluteObjectSelectionIds: () => ['a']},
      crud: {
        transact: (fn: () => void, origin: unknown) => ydoc.transact(fn, origin),
        updateBlockProps: (_id: string, patch: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) props.delete(key); else props.set(key, value);
          }
        },
      },
    };
    return {props, manager: new BlockObjectFormatManager(doc as never)};
  };

  it('merges offline font and shadow edits and supports undo/redo of group deletion', () => {
    const a = new Y.Doc(), b = new Y.Doc();
    const left = makeReplica(a), right = makeReplica(b);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const undo = new Y.UndoManager(left.props, {trackedOrigins: new Set([left.manager])});
    left.manager.updateSelection(['a'], {textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, fontSize: 24}});
    right.manager.updateSelection(['a'], {textStyle: {...DEFAULT_OBJECT_TEXT_STYLE, effects: {
      ...DEFAULT_OBJECT_EFFECTS, shadow: {...DEFAULT_OBJECT_EFFECTS.shadow, enabled: true},
    }}});
    const fromA = Y.encodeStateAsUpdate(a), fromB = Y.encodeStateAsUpdate(b);
    Y.applyUpdate(a, fromB); Y.applyUpdate(b, fromA);
    expect(left.props.toJSON()).toEqual(right.props.toJSON());
    expect(left.props.get('textFont')).toBe('24px 400 normal');
    expect(left.props.get('textShadow')).toBe('45deg 2px 4px #000000 / 0.25');
    undo.stopCapturing();
    left.manager.updateSelection(['a'], {textStyle: {...left.manager.resolve('a')!.textStyle!, effects: DEFAULT_OBJECT_EFFECTS}});
    expect(left.props.has('textShadow')).toBeFalse();
    undo.undo();
    expect(left.props.get('textShadow')).toBe('45deg 2px 4px #000000 / 0.25');
    expect(left.props.get('textFont')).toBe('24px 400 normal');
    undo.redo();
    expect(left.props.has('textShadow')).toBeFalse();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(left.props.toJSON()).toEqual(right.props.toJSON());
    undo.destroy(); a.destroy(); b.destroy();
  });
});
