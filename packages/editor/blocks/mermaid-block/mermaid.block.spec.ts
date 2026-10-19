import {MermaidBlockComponent} from "./mermaid.block";
import {MermaidBlockSchema} from "./index";
import type {IBlockSnapshot} from "../../framework";

describe("MermaidBlockSchema", () => {
  it("declares the generated source child for model-first validation", () => {
    const snapshot = MermaidBlockSchema.createSnapshot(
      "text",
      "flowchart LR\n  A --> B",
    );

    expect(MermaidBlockSchema.metadata.includeChildren).toEqual([
      "mermaid-textarea",
    ]);
    expect(snapshot.children).toHaveSize(1);
    const source = snapshot.children[0] as IBlockSnapshot;
    expect(source.flavour).toBe("mermaid-textarea");
    expect(source.children).toEqual([
      {insert: "flowchart LR\n  A --> B"},
    ]);
  });
});

describe("MermaidBlockComponent preview selection gate", () => {
  const makeBlock = (selection: any) => {
    const block = Object.create(MermaidBlockComponent.prototype) as MermaidBlockComponent;
    (block as any)._native = {
      id: "mermaid-1",
      flavour: "mermaid",
      nodeType: 0,
      props: {},
      children: [],
    };
    (block as any).doc = {
      selection: {
        value: selection,
      },
    };
    (block as any).graphContainer = document.createElement("div");
    return block;
  };

  const makeEvent = () => ({
    stopPropagation: jasmine.createSpy("stopPropagation"),
    preventDefault: jasmine.createSpy("preventDefault"),
  } as unknown as MouseEvent);

  it("does not consume preview clicks while the mermaid block only has a gap cursor", async () => {
    const block = makeBlock({
      isInSameBlock: true,
      start: {blockId: "mermaid-1", type: "gap", side: "after"},
      anchor: {blockId: "mermaid-1", type: "gap", side: "after"},
      head: {blockId: "mermaid-1", type: "gap", side: "after"},
    });
    const event = makeEvent();

    await block.onPreviewGraph(event);

    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("consumes preview clicks only for an explicitly selected mermaid block", async () => {
    const block = makeBlock({
      isInSameBlock: true,
      start: {blockId: "mermaid-1", type: "selected"},
      anchor: {blockId: "mermaid-1", type: "selected"},
      head: {blockId: "mermaid-1", type: "selected"},
    });
    const event = makeEvent();

    await block.onPreviewGraph(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does not open or consume the separate graph preview while already fullscreen", async () => {
    const block = makeBlock({
      isInSameBlock: true,
      start: {blockId: "mermaid-1", type: "selected"},
      anchor: {blockId: "mermaid-1", type: "selected"},
      head: {blockId: "mermaid-1", type: "selected"},
    }) as MermaidBlockComponent & any;
    block.fullscreenController = {isFullscreen: true};
    const event = makeEvent();

    await block.onPreviewGraph(event);

    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("MermaidBlockComponent fullscreen delegation", () => {
  it("reflects and toggles the shared in-place fullscreen controller", () => {
    const block = Object.create(MermaidBlockComponent.prototype) as MermaidBlockComponent & any;
    block.fullscreenController = {
      isFullscreen: true,
      toggle: jasmine.createSpy("toggle"),
    };

    expect(block.isFullscreen).toBe(true);
    block.toggleFullscreen();
    expect(block.fullscreenController.toggle).toHaveBeenCalledTimes(1);
  });
});
