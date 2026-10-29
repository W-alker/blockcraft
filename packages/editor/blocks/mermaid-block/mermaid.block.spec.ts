import {MermaidBlockComponent} from "./mermaid.block";
import {MermaidBlockSchema} from "./index";
import type {IBlockSnapshot} from "../../framework";
import mermaid from "mermaid";

describe("MermaidBlockComponent preview errors", () => {
  let block: any;
  let source: string;
  let render: jasmine.Spy;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>valid graph</text></svg>';

  beforeEach(() => {
    source = 'flowchart TD\nA-->B';
    block = Object.create(MermaidBlockComponent.prototype);
    spyOnProperty(block, 'props', 'get').and.returnValue({mode: 'graph'});
    block.graphContainer = document.createElement('div');
    block.cdr = {markForCheck: jasmine.createSpy('markForCheck')};
    block.previewGeneration = 0;
    block.graphScale = 1;
    block._renderedTextContent = '';
    block.previewRenderFailed = false;
    spyOn(block, 'getGraphDefinition').and.callFake(() => source);
    render = spyOn(mermaid, 'render').and.resolveTo({svg, diagramType: 'flowchart'});
  });

  it('reports the first failure and clears it when valid source renders', async () => {
    render.and.rejectWith(new Error('Parse error'));
    await block.renderGraph(true);
    expect(block.previewRenderFailed).toBeTrue();
    expect(block.cdr.markForCheck).toHaveBeenCalled();

    render.and.resolveTo({svg, diagramType: 'flowchart'});
    await block.renderGraph(true);
    expect(block.previewRenderFailed).toBeFalse();
    expect(block.graphContainer.textContent).toBe('valid graph');
  });

  it('preserves the previous SVG and clears the error when restoring its source without rerendering', async () => {
    await block.renderGraph(true);
    const previousSvg = block.graphContainer.firstElementChild;
    source = 'flowchart TD\nA[broken';
    render.and.rejectWith(new Error('Parse error'));
    await block.renderGraph(true);
    expect(block.previewRenderFailed).toBeTrue();
    expect(block.graphContainer.firstElementChild).toBe(previousSvg);

    source = 'flowchart TD\nA-->B';
    await block.renderGraph(true);
    expect(block.previewRenderFailed).toBeFalse();
    expect(render).toHaveBeenCalledTimes(2);
    expect(block.graphContainer.firstElementChild).toBe(previousSvg);
  });

  it('clears the error and previous SVG for empty source', async () => {
    await block.renderGraph(true);
    block.previewRenderFailed = true;
    source = '  \n';
    await block.renderGraph(true);
    expect(block.previewRenderFailed).toBeFalse();
    expect(block.graphContainer.childElementCount).toBe(0);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('ignores an older failure after a newer render succeeds for the same source', async () => {
    let reject!: (reason: Error) => void;
    render.and.returnValue(new Promise((_, fail) => { reject = fail; }));
    const pending = block.renderGraph(true);
    render.and.resolveTo({svg, diagramType: 'flowchart'});
    await block.renderGraph(true);
    reject(new Error('old failure'));
    await pending;
    expect(block.previewRenderFailed).toBeFalse();
    expect(block.graphContainer.textContent).toBe('valid graph');
  });

  for (const change of ['source', 'fullscreen', 'destroy']) {
    it(`ignores a pending failure after ${change} changes`, async () => {
      let reject!: (reason: Error) => void;
      render.and.returnValue(new Promise((_, fail) => { reject = fail; }));
      const pending = block.renderGraph(true);
      if (change === 'source') source = 'flowchart TD\nA-->C';
      if (change === 'fullscreen') block.visualSession = {};
      if (change === 'destroy') block.destroyed = true;
      reject(new Error('stale failure'));
      await pending;
      expect(block.previewRenderFailed).toBeFalse();
      expect(block.cdr.markForCheck).not.toHaveBeenCalled();
    });
  }
});

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
