import {MermaidBlockComponent} from "./mermaid.block";

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
});
