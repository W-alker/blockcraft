import * as Y from "yjs";
import {BlockReadonlyError, BlockReadonlyOperation} from "../../../doc";
import {BlockNodeType} from "../../types";
import {NativeBlockModel, native2YBlock, yBlock2Native} from "../../reactive";
import {EditableBlockComponent} from "./editable-block";

function createEditableHarness() {
  const yDoc = new Y.Doc();
  const yBlocks = yDoc.getMap<any>("blocks");
  yBlocks.set("p", native2YBlock({
    id: "p",
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    props: {depth: 0, textAlign: "right"},
    meta: {},
    children: [{insert: "original"}],
  } as unknown as NativeBlockModel));
  const yBlock = yBlocks.get("p")!;
  let source: any = null;
  let lockKind: "user" | "template" | null = null;
  const readonlyManager = {
    resolve: jasmine.createSpy("resolve").and.callFake(() => ({
      readonly: source !== null,
      source,
      lockUserId: source ? "user-1" : null,
      lockKind: source ? lockKind ?? "user" : null,
    })),
    isReadonly: jasmine.createSpy("isReadonly").and.callFake(() => source !== null),
    isExplicitReadonly: jasmine.createSpy("isExplicitReadonly").and.callFake(
      () => source?.kind === "self",
    ),
    assertTextWritable: jasmine.createSpy("assertTextWritable").and.callFake(
      (_block: unknown, operation: BlockReadonlyOperation) => {
        if (source) throw new BlockReadonlyError({operation, blockIds: ["p"], source});
      },
    ),
    assertPropsWritable: jasmine.createSpy("assertPropsWritable").and.callFake(
      (_block: unknown, operation: BlockReadonlyOperation) => {
        if (source) throw new BlockReadonlyError({operation, blockIds: ["p"], source});
      },
    ),
  };
  const doc = {
    readonlyManager,
    crud: {transact: (fn: () => void) => yDoc.transact(fn)},
  };
  const host = document.createElement("p");
  host.classList.add("edit-container");
  const block = Object.create(EditableBlockComponent.prototype) as any;
  block.model = yBlock2Native(yBlock);
  block.yBlock = yBlock;
  block.doc = doc;
  block.hostElement = host;
  block.changeDetectorRef = {
    markForCheck: jasmine.createSpy("markForCheck"),
  };
  block._containerElement = host;
  block._init();

  return {
    block: block as EditableBlockComponent,
    doc,
    host,
    readonlyManager,
    setSource(value: any) { source = value; },
    setLockKind(value: "user" | "template" | null) { lockKind = value; },
  };
}

describe("Block readonly API", () => {
  it("blocks public mutations while keeping text readable and selectable", () => {
    const h = createEditableHarness();
    h.setSource({kind: "self", blockId: "p"});

    h.block.applyReadonlyViewState();

    expect(h.block.isReadonly).toBeTrue();
    expect(h.block.isExplicitReadonly).toBeTrue();
    expect(h.block.readonlySource).toEqual({kind: "self", blockId: "p"});
    expect(h.host.dataset["bcReadonly"]).toBe("self");
    expect(h.host.dataset["bcLockKind"]).toBe("user");
    expect(h.block.containerElement.getAttribute("contenteditable")).toBe("false");
    expect(() => h.block.insertText(0, "x")).toThrowError(BlockReadonlyError);
    expect(() => h.block.updateProps({textAlign: "center"})).toThrowError(BlockReadonlyError);
    expect(() => (h.block as any).setInitProps({textAlign: "center"})).toThrowError(BlockReadonlyError);
    expect(h.block.textContent()).toBe("original");
    expect(h.host.style.pointerEvents).toBe("");
  });

  it("marks the OnPush block view after applying readonly state", () => {
    const h = createEditableHarness();

    h.setSource({kind: "self", blockId: "p"});
    h.block.applyReadonlyViewState();
    h.setSource(null);
    h.block.applyReadonlyViewState();

    expect(h.block.changeDetectorRef.markForCheck).toHaveBeenCalledTimes(2);
  });

  it("restores only the contenteditable attribute owned by readonly state", () => {
    const h = createEditableHarness();
    h.setSource({kind: "ancestor", blockId: "container"});
    h.block.applyReadonlyViewState();
    expect(h.host.dataset["bcReadonly"]).toBe("inherited");
    expect(h.host.dataset["bcReadonlyEditable"]).toBe("true");

    h.setSource(null);
    h.block.applyReadonlyViewState();
    expect(h.host.hasAttribute("contenteditable")).toBeFalse();
    expect(h.host.hasAttribute("data-bc-readonly")).toBeFalse();

    h.host.setAttribute("contenteditable", "false");
    h.setSource({kind: "self", blockId: "p"});
    h.block.applyReadonlyViewState();
    h.setSource(null);
    h.block.applyReadonlyViewState();
    expect(h.host.getAttribute("contenteditable")).toBe("false");
  });

  it("projects template lock kind and clears it with readonly state", () => {
    const h = createEditableHarness();
    h.setSource({kind: "self", blockId: "p"});
    h.setLockKind("template");

    h.block.applyReadonlyViewState();
    expect(h.host.dataset["bcReadonly"]).toBe("self");
    expect(h.host.dataset["bcLockKind"]).toBe("template");

    h.setSource(null);
    h.setLockKind(null);
    h.block.applyReadonlyViewState();
    expect(h.host.hasAttribute("data-bc-readonly")).toBeFalse();
    expect(h.host.hasAttribute("data-bc-lock-kind")).toBeFalse();
  });

  it("does not reject no-op text or props calls", () => {
    const h = createEditableHarness();
    h.setSource({kind: "self", blockId: "p"});

    h.block.insertText(0, "");
    h.block.deleteText(0, 0);
    h.block.replaceText(0, 0, "");
    h.block.formatText(0, 0, {"a:bold": true});
    h.block.applyDeltaOperations([]);
    h.block.updateProps({textAlign: "right"});
    (h.block as any).setInitProps({textAlign: "right"});

    expect(h.readonlyManager.assertTextWritable).not.toHaveBeenCalled();
    expect(h.readonlyManager.assertPropsWritable).not.toHaveBeenCalled();
  });

  it("keeps unsupported props and text formatting available during revision tracking", () => {
    const h = createEditableHarness();
    const applyDelta = jasmine.createSpy("applyDelta").and.callFake(
      (_blockId: string, delta: unknown[]) => (h.block as any).yText.applyDelta(delta),
    );
    (h.doc as any).revisions = {isTracking: true, applyDelta};

    h.block.updateProps({textAlign: "center"});
    h.block.formatText(0, 2, {"a:bold": true});

    expect((h.block as any).yBlock.get("props").get("textAlign")).toBe("center");
    expect(h.block.textDeltas()).toEqual([
      {insert: "or", attributes: {"a:bold": true}},
      {insert: "iginal"},
    ]);
    expect(applyDelta).toHaveBeenCalledOnceWith("p", [
      {retain: 2, attributes: {"a:bold": true}},
    ]);
  });
});
