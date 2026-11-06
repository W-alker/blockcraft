import {CodeInlineRuntime} from "./code-inline-runtime";

describe("CodeInlineRuntime", () => {
  const containers: HTMLElement[] = [];
  const runtimes: CodeInlineRuntime[] = [];

  const makeRuntime = (
    options: ConstructorParameters<typeof CodeInlineRuntime>[2] = {lang: "text"},
  ) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    const runtime = new CodeInlineRuntime(container, new Map(), options);
    runtimes.push(runtime);
    spyOn<any>(runtime, "_tokenize").and.resolveTo([{insert: "a"}]);
    return {runtime, container};
  };

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    for (const runtime of runtimes.splice(0)) {
      runtime.destroy();
    }
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

  it("does not move the cursor to zero when a native DOM tail cannot be mapped", async () => {
    const {runtime, container} = makeRuntime();
    const unmanagedText = document.createTextNode("native-ime-tail");
    container.appendChild(unmanagedText);
    document.getSelection()?.setPosition(unmanagedText, unmanagedText.length);
    spyOn(runtime.mapper, "domPointToModelPoint").and.throwError("unmanaged DOM");
    const restore = spyOn(runtime.mapper, "modelPointToDomPoint").and.callThrough();

    await runtime.renderCode(
      () => "a",
      () => [{insert: "a"}],
    );

    expect(restore).not.toHaveBeenCalled();
  });

  it("restores the canonical model caret when the native IME tail is unmanaged", async () => {
    const model = [{insert: "a"}];
    const {runtime, container} = makeRuntime({
      lang: "text",
      canonicalHost: {
        readModel: () => ({text: "a", deltas: model}),
        hasTextRevisions: () => true,
        isCompositionBusy: () => false,
        readSelection: () => ({anchor: 1, head: 1}),
      },
    });
    runtime.scrollBlot.build(model);
    const unmanagedText = document.createTextNode("native-ime-tail");
    container.appendChild(unmanagedText);
    document.getSelection()?.setPosition(unmanagedText, unmanagedText.length);
    const nativeRead = spyOn(runtime.mapper, "domPointToModelPoint")
      .and.throwError("unmanaged DOM");
    const restore = spyOn(runtime.mapper, "modelPointToDomPoint").and.callThrough();

    await runtime.renderCode();

    expect(nativeRead).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledWith(container, 1);
    expect(document.getSelection()?.focusOffset).toBe(1);
  });

  it("repairs revision attributes from the canonical host after a native input tail", async () => {
    const attrs = {
      "a:data-bc-revision-ids": "revision-1",
      "a:data-bc-revision-kind": "insert",
      "a:data-bc-revision-state": "pending",
    };
    const model = [{insert: "a", attributes: attrs}];
    const {runtime, container} = makeRuntime({
      lang: "text",
      canonicalHost: {
        readModel: () => ({text: "a", deltas: model}),
        hasTextRevisions: () => true,
        isCompositionBusy: () => false,
        readSelection: () => null,
      },
    });
    (runtime as any)._tokenize.and.callFake(
      async (_text: string, deltas: typeof model) => deltas,
    );
    runtime.render(model);
    await Promise.resolve();
    await Promise.resolve();

    const marked = container.querySelector<HTMLElement>(
      'c-element[data-bc-revision-kind="insert"]',
    )!;
    expect(marked).not.toBeNull();
    marked.removeAttribute("data-bc-revision-ids");
    marked.removeAttribute("data-bc-revision-kind");
    marked.removeAttribute("data-bc-revision-state");

    container.dispatchEvent(new InputEvent("input", {bubbles: true}));
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    expect(container.querySelectorAll(
      'c-element[data-bc-revision-kind="insert"]' +
      '[data-bc-revision-state="pending"]',
    ).length).toBe(1);
  });

  it("does not rebuild during composition and repairs after the idle tail", async () => {
    let busy = true;
    const model = [{insert: "a"}];
    const {runtime, container} = makeRuntime({
      lang: "text",
      canonicalHost: {
        readModel: () => ({text: "a", deltas: model}),
        hasTextRevisions: () => true,
        isCompositionBusy: () => busy,
        readSelection: () => null,
      },
    });
    const tokenize = (runtime as any)._tokenize as jasmine.Spy;
    runtime.render(model);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(tokenize).not.toHaveBeenCalled();

    busy = false;
    container.dispatchEvent(new InputEvent("input", {bubbles: true}));
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(tokenize).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending canonical render when destroyed", async () => {
    const model = [{insert: "a"}];
    const {runtime} = makeRuntime({
      lang: "text",
      canonicalHost: {
        readModel: () => ({text: "a", deltas: model}),
        hasTextRevisions: () => true,
        isCompositionBusy: () => false,
        readSelection: () => null,
      },
    });
    const tokenize = (runtime as any)._tokenize as jasmine.Spy;
    runtime.render(model);
    runtime.destroy();
    await Promise.resolve();
    expect(tokenize).not.toHaveBeenCalled();
  });
});
