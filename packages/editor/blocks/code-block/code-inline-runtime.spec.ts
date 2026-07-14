import {CodeInlineRuntime} from "./code-inline-runtime";

describe("CodeInlineRuntime diffHighLight selection restore", () => {
  const containers: HTMLElement[] = [];

  const makeRuntime = () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    const runtime = new CodeInlineRuntime(container, new Map(), {lang: "text"});
    spyOn<any>(runtime, "_tokenize").and.resolveTo([{insert: "a"}]);
    return {runtime, container};
  };

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    for (const container of containers.splice(0)) {
      container.remove();
    }
  });

  it("restores the inline range when the current selection is a text point in this block", async () => {
    const {runtime} = makeRuntime();
    const block = {
      id: "code-1",
      textContent: () => "a",
      textDeltas: () => [{insert: "a"}],
      setInlineRange: jasmine.createSpy("setInlineRange"),
    };

    await runtime.diffHighLight([], {
      block,
      selectionValue: {
        start: {blockId: "code-1", type: "text", offset: 0},
      },
      normalizeRange: () => ({
        start: {blockId: "code-1", type: "text", offset: 0, block: block as any},
        end: {blockId: "code-1", type: "text", offset: 0, block: block as any},
      }),
    });

    expect(block.setInlineRange).toHaveBeenCalledOnceWith(0);
  });

  it("does not collapse a whole-block selected code block into an inline cursor", async () => {
    const {runtime} = makeRuntime();
    const block = {
      id: "code-1",
      textContent: () => "a",
      textDeltas: () => [{insert: "a"}],
      setInlineRange: jasmine.createSpy("setInlineRange"),
    };

    await runtime.diffHighLight([], {
      block,
      selectionValue: {
        start: {blockId: "code-1", type: "selected"},
      },
      normalizeRange: () => ({
        start: {blockId: "code-1", type: "selected", block: block as any},
        end: {blockId: "code-1", type: "selected", block: block as any},
      }),
    });

    expect(block.setInlineRange).not.toHaveBeenCalled();
  });

  it("does not restore an inline cursor from an endpoint owned by another block", async () => {
    const {runtime, container} = makeRuntime();
    const block = {
      id: "code-1",
      textContent: () => "a",
      textDeltas: () => [{insert: "a"}],
      setInlineRange: jasmine.createSpy("setInlineRange"),
    };
    const nativeRange = document.createRange();
    nativeRange.selectNodeContents(container);
    document.getSelection()?.addRange(nativeRange);

    await runtime.diffHighLight([], {
      block,
      selectionValue: {
        start: {blockId: "code-1", type: "text", offset: 0},
      },
      normalizeRange: () => ({
        start: {blockId: "code-2", type: "text", offset: 4, block: block as any},
        end: {blockId: "code-2", type: "text", offset: 4, block: block as any},
      }),
    });

    expect(block.setInlineRange).not.toHaveBeenCalled();
  });
});
