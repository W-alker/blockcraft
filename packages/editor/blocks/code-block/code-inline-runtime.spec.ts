import {CodeInlineRuntime, flatShikiTokens} from "./code-inline-runtime";
import {shikiService} from './shiki-config';
import {createHighlighter, type Highlighter} from 'shiki';
import type {DeltaInsertText} from '../../framework/model/delta';

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

  it("restores the current native caret after a highlight rebuild", async () => {
    const {runtime, container} = makeRuntime();
    runtime.render([{insert: 'a'}]);
    document.getSelection()!.setPosition(container.querySelector('c-text')!.firstChild, 1);
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

    const selection = document.getSelection()!;
    expect(runtime.domPointToModel(selection.focusNode!, selection.focusOffset)).toBe(1);
  });

  it("does not restore a stale native caret for a whole-block model selection", async () => {
    const {runtime, container} = makeRuntime({
      lang: 'text',
      canonicalHost: {
        readModel: () => ({text: 'a', deltas: [{insert: 'a'}]}),
        hasTextRevisions: () => false,
        isCompositionBusy: () => false,
        readSelection: () => null,
      },
    });
    runtime.scrollBlot.build([{insert: 'a'}]);
    document.getSelection()!.setPosition(container.querySelector('c-text')!.firstChild, 1);
    const restore = spyOn(runtime.mapper, 'modelPointToDomPoint').and.callThrough();
    await runtime.diffHighLight([]);
    expect(restore).not.toHaveBeenCalled();
  });

  it("does not disturb a native selection in another editing surface", async () => {
    const {runtime} = makeRuntime();
    const other = document.createElement('div');
    other.textContent = 'outside';
    document.body.appendChild(other);
    containers.push(other);
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(other.firstChild!, 5, other.firstChild!, 1);
    await runtime.diffHighLight([]);
    expect(selection.anchorNode).toBe(other.firstChild);
    expect(selection.anchorOffset).toBe(5);
    expect(selection.focusNode).toBe(other.firstChild);
    expect(selection.focusOffset).toBe(1);
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

    expect(nativeRead).toHaveBeenCalled();
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

  it("discards a highlight when input arrives before the next highlight request", async () => {
    const {runtime, container} = makeRuntime();
    runtime.render([{insert: "a"}]);
    let finish!: (value: Array<{insert: string}>) => void;
    (runtime as any)._tokenize.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const pending = runtime.renderCode(() => "a");
    runtime.applyDelta([{retain: 1}, {insert: "b"}]);
    finish([{insert: "a"}]);
    await pending;
    expect(container.querySelector('c-text')?.textContent).toBe("ab");
  });

  for (const change of ["render", "language", "theme", "destroy"] as const) {
    it(`discards an in-flight highlight after ${change}`, async () => {
      const {runtime, container} = makeRuntime();
      runtime.render([{insert: "current"}]);
      let finish!: (value: Array<{insert: string}>) => void;
      (runtime as any)._tokenize.and.returnValue(new Promise(resolve => { finish = resolve; }));
      const pending = runtime.renderCode(() => "stale");
      if (change === "render") runtime.render([{insert: "new model"}]);
      if (change === "language") runtime.setLang("typescript");
      if (change === "theme") runtime.setTheme("github-dark");
      if (change === "destroy") runtime.destroy();
      const before = container.innerHTML;
      finish([{insert: "stale"}]);
      await pending;
      expect(container.innerHTML).toBe(before);
    });
  }

  it("preserves the latest backward range when an asynchronous diff finishes", async () => {
    const {runtime, container} = makeRuntime();
    runtime.render([{insert: "abcd"}]);
    let finish!: (value: Array<{insert: string; attributes?: {'s:color': string}}>) => void;
    (runtime as any)._tokenize.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const pending = runtime.diffHighLight([], {
      block: {id: 'code-1', textContent: () => 'abcd', setInlineRange: () => undefined},
      selectionValue: {start: {blockId: 'code-1', type: 'text', offset: 0}},
      normalizeRange: () => { throw new Error('selection must be read at commit'); },
    });
    const node = container.querySelector('c-text')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, 3, node, 1);
    finish([{insert: 'ab', attributes: {'s:color': 'red'}}, {insert: 'cd'}]);
    await pending;
    const selection = document.getSelection()!;
    expect(runtime.domPointToModel(selection.anchorNode!, selection.anchorOffset)).toBe(3);
    expect(runtime.domPointToModel(selection.focusNode!, selection.focusOffset)).toBe(1);
  });

  it("does not apply a completed highlight while composition has become active", async () => {
    let busy = false;
    const {runtime, container} = makeRuntime({
      lang: 'text',
      canonicalHost: {
        readModel: () => ({text: 'a', deltas: [{insert: 'a'}]}),
        hasTextRevisions: () => false,
        isCompositionBusy: () => busy,
        readSelection: () => null,
      },
    });
    runtime.scrollBlot.build([{insert: 'a'}]);
    let finish!: (value: Array<{insert: string}>) => void;
    (runtime as any)._tokenize.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const pending = runtime.renderCode();
    const before = container.firstElementChild;
    busy = true;
    finish([{insert: 'a'}]);
    await pending;
    expect(container.firstElementChild).toBe(before);
  });

  it("prefers a newly moved native range over a model selectionchange still queued", async () => {
    const {runtime, container} = makeRuntime({
      lang: 'text',
      canonicalHost: {
        readModel: () => ({text: 'abcd', deltas: [{insert: 'abcd'}]}),
        hasTextRevisions: () => false,
        isCompositionBusy: () => false,
        readSelection: () => ({anchor: 0, head: 0}),
      },
    });
    runtime.scrollBlot.build([{insert: 'abcd'}]);
    let finish!: (value: Array<{insert: string}>) => void;
    (runtime as any)._tokenize.and.returnValue(new Promise(resolve => { finish = resolve; }));
    const pending = runtime.renderCode();
    const node = container.querySelector('c-text')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, 3, node, 1);
    finish([{insert: 'ab'}, {insert: 'cd'}]);
    await pending;
    const selection = document.getSelection()!;
    expect(runtime.domPointToModel(selection.anchorNode!, selection.anchorOffset)).toBe(3);
    expect(runtime.domPointToModel(selection.focusNode!, selection.focusOffset)).toBe(1);
  });

  it("reapplies identical highlighting after a synchronous model rebuild", async () => {
    const {runtime, container} = makeRuntime();
    (runtime as any)._tokenize.and.resolveTo([{insert: 'a', attributes: {'s:color': 'red'}}]);
    await runtime.renderCode(() => 'a');
    runtime.render([{insert: 'a'}]);
    await runtime.diffHighLight([]);
    expect(container.querySelector('c-element[style]')?.getAttribute('style')).toContain('color');
  });

  it("does not tokenize a destroyed runtime again", async () => {
    const {runtime} = makeRuntime();
    runtime.destroy();
    await runtime.diffHighLight([]);
    await runtime.renderCode();
    expect((runtime as any)._tokenize).not.toHaveBeenCalled();
  });

  it("renders plain text without loading the syntax highlighter", async () => {
    const {runtime, container} = makeRuntime({lang: 'text', withLineBreak: true});
    (runtime as any)._tokenize.and.callThrough();
    const load = spyOn(shikiService, 'getHighlighter').and.callThrough();
    await runtime.renderCode(() => 'one\rtwo\r\nthree\nfour');
    expect(load).not.toHaveBeenCalled();
    expect(Array.from(container.querySelectorAll('c-text')).map(node => node.textContent).join(''))
      .toBe('one\rtwo\r\nthree\nfour');
  });

  it("keeps bare CR text from consuming a later CRLF delimiter", () => {
    const deltas = flatShikiTokens([
      [{content: 'one\rtwo', offset: 0}],
      [{content: 'three', offset: 0}],
    ], 'one\rtwo\r\nthree');
    expect(deltas.map(delta => delta.insert).join('')).toBe('one\rtwo\r\nthree');
  });

  it("reuses syntax while adding and clearing user colors and revision presentation", async () => {
    let model: Array<{insert: string; attributes?: Record<string, string>}> = [{insert: 'abc'}];
    const {runtime, container} = makeRuntime({
      lang: 'text', withLineBreak: true,
      canonicalHost: {
        readModel: () => ({text: 'abc', deltas: model}),
        hasTextRevisions: () => !!model[0].attributes?.['a:data-bc-revision-state'],
        isCompositionBusy: () => false,
        readSelection: () => null,
      },
    });
    (runtime as any)._tokenize.and.callThrough();
    await runtime.renderCode();
    const plain = container.innerHTML;
    model = [{insert: 'abc', attributes: {'s:color': 'red'}}];
    await runtime.diffHighLight([]);
    expect(container.querySelector<HTMLElement>('c-element')!.style.color).toBe('red');
    model = [{insert: 'abc', attributes: {
      's:color': 'red',
      'a:data-bc-revision-kind': 'insert',
      'a:data-bc-revision-state': 'pending',
    }}];
    await runtime.diffHighLight([]);
    const marked = container.querySelector<HTMLElement>('[data-bc-revision-state="pending"]');
    expect(marked).not.toBeNull();
    expect(marked!.style.color).toBe('');
    model = [{insert: 'abc'}];
    await runtime.diffHighLight([]);
    expect(container.innerHTML).toBe(plain);
  });

  describe('canonical IME reconciliation', () => {
    let highlighter: Highlighter;
    const source = 'const first = 1;\nconst middle = 2;\nconst last = 3;';

    beforeAll(async () => {
      highlighter = await createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: ['typescript', 'javascript'],
      });
    });

    afterAll(() => highlighter.dispose());

    beforeEach(() => {
      spyOn(shikiService, 'getHighlighter').and.resolveTo(highlighter);
      spyOn(shikiService, 'ensureLanguageLoaded').and.resolveTo();
    });

    const textOf = (container: HTMLElement) => Array.from(container.querySelectorAll('c-text'))
      .map(node => node.textContent).join('');

    const flushRecoveryFrame = () => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    async function createReadyHarness(initial: DeltaInsertText[] = [{insert: source}]) {
      const state = {model: initial, busy: false, revisions: false};
      const {runtime, container} = makeRuntime({
        lang: 'typescript', withLineBreak: true, theme: 'github-light',
        canonicalHost: {
          readModel: () => ({text: state.model.map(delta => delta.insert).join(''), deltas: state.model}),
          hasTextRevisions: () => state.revisions,
          isCompositionBusy: () => state.busy,
          readSelection: () => null,
        },
      });
      (runtime as any)._tokenize.and.callThrough();
      await runtime.renderCode();
      const firstLine = container.firstElementChild!;
      const lastLine = container.lastElementChild!;
      const firstLeaf = runtime.scrollBlot.leaves[0];
      const lastLeaf = runtime.scrollBlot.leaves.at(-1)!;
      const build = spyOn(runtime.scrollBlot, 'build').and.callThrough();
      const expectOuterIdentity = () => {
        expect(container.firstElementChild).toBe(firstLine);
        expect(container.lastElementChild).toBe(lastLine);
        expect(runtime.scrollBlot.leaves[0]).toBe(firstLeaf);
        expect(runtime.scrollBlot.leaves.at(-1)!).toBe(lastLeaf);
        expect(firstLeaf.domNode.parentNode).toBe(firstLine);
        expect(lastLeaf.domNode.parentNode).toBe(lastLine);
        expect(build).not.toHaveBeenCalled();
      };
      return {runtime, container, state, build, expectOuterIdentity};
    }

    it('commits synchronously without rebuilding untouched lines or their leaves', async () => {
      const {runtime, container, state, expectOuterIdentity} = await createReadyHarness();
      state.busy = true;
      const next = source.replace('middle', 'middle中文');
      state.model = [{insert: next}];

      runtime.render(state.model);

      expect(textOf(container)).toBe(next);
      expect(runtime.textLength).toBe(next.length);
      expectOuterIdentity();
      state.busy = false;
      await flushRecoveryFrame();
      expect(textOf(container)).toBe(next);
      expectOuterIdentity();
    });

    for (const pollution of ['extra-text', 'extra-element', 'split-text'] as const) {
      it(`repairs cancelled IME ${pollution} while retaining untouched lines`, async () => {
        const {runtime, container, state, expectOuterIdentity} = await createReadyHarness();
        const middle = container.children[1] as HTMLElement;
        const canonicalMiddle = middle.textContent;
        const originalTexts = Array.from(middle.querySelectorAll('c-text')).map(node => node.textContent);
        state.busy = true;
        if (pollution === 'extra-text') {
          middle.appendChild(document.createTextNode('取消的组合输入'));
        } else if (pollution === 'extra-element') {
          const extra = document.createElement('c-element');
          const extraText = document.createElement('c-text');
          extraText.textContent = '取消的组合输入';
          extra.appendChild(extraText);
          middle.appendChild(extra);
        } else {
          const text = middle.querySelector('c-text')!.firstChild as Text;
          text.splitText(1);
        }

        runtime.render(state.model);

        const repaired = container.children[1];
        expect(repaired.textContent).toBe(canonicalMiddle);
        expect(Array.from(repaired.querySelectorAll('c-text')).map(node => node.textContent)).toEqual(originalTexts);
        for (const text of Array.from(repaired.querySelectorAll('c-text'))) {
          expect(text.childNodes.length).toBe(1);
          expect(text.firstChild!.nodeType).toBe(Node.TEXT_NODE);
        }
        expect(runtime.textLength).toBe(source.length);
        expectOuterIdentity();
        state.busy = false;
        await flushRecoveryFrame();
        expect(container.children[1].textContent).toBe(canonicalMiddle);
        expectOuterIdentity();
      });
    }

    for (const pollution of ['detached-gap', 'misplaced-gap'] as const) {
      it(`restores a cancelled IME ${pollution} without replacing canonical lines`, async () => {
        const {runtime, container, state, expectOuterIdentity} = await createReadyHarness();
        const gap = runtime.scrollBlot.leadingGapNode!;
        const gapText = gap.firstChild!;
        const lines = Array.from(container.children);
        const leaves = [...runtime.scrollBlot.leaves];
        state.busy = true;
        if (pollution === 'detached-gap') gap.remove();
        else container.lastElementChild!.appendChild(gap);

        runtime.render(state.model);

        const expectRestoredGap = () => {
          expect(runtime.scrollBlot.leadingGapNode).toBe(gap);
          expect(container.firstElementChild!.firstChild).toBe(gap);
          expect(gap.firstChild).toBe(gapText);
          const point = runtime.modelPointToDom(0);
          expect(point.node).toBe(gapText);
          expect(point.node.isConnected).toBeTrue();
          expect(container.contains(point.node)).toBeTrue();
          expect(textOf(container)).toBe(source);
          expect(runtime.textLength).toBe(source.length);
          expect(container.children.length).toBe(lines.length);
          lines.forEach((line, index) => expect(container.children[index]).toBe(line));
          expect(runtime.scrollBlot.leaves.length).toBe(leaves.length);
          leaves.forEach((leaf, index) => expect(runtime.scrollBlot.leaves[index]).toBe(leaf));
          expectOuterIdentity();
        };
        expectRestoredGap();
        state.busy = false;
        await flushRecoveryFrame();
        expectRestoredGap();
      });
    }

    it('uses the complete canonical snapshot including deferred remote changes', async () => {
      const initial = 'const first = 1;\nconst local = 2;\nconst remote = 3;\nconst last = 4;';
      const {runtime, container, state, expectOuterIdentity} = await createReadyHarness([{insert: initial}]);
      state.busy = true;
      // Both the local IME commit and a deferred remote update are already in
      // Y.Text when the composition owner requests its canonical projection.
      const next = initial.replace('local = 2', 'local中文 = 2').replace('remote = 3', 'remote = 99');
      state.model = [{insert: next}];

      runtime.render(state.model);

      expect(textOf(container)).toBe(next);
      expect(runtime.textLength).toBe(next.length);
      expectOuterIdentity();
      state.busy = false;
      await flushRecoveryFrame();
      expect(textOf(container)).toBe(next);
      expectOuterIdentity();
    });

    it('restores stripped revision attributes only in the dirty line', async () => {
      const attrs = {
        'a:data-bc-revision-ids': 'revision-ime',
        'a:data-bc-revision-kind': 'insert',
        'a:data-bc-revision-state': 'pending',
      };
      const {runtime, container, state, expectOuterIdentity} = await createReadyHarness([
        {insert: 'const first = 1;\n'},
        {insert: 'const middle = 2;', attributes: attrs},
        {insert: '\nconst last = 3;'},
      ]);
      state.revisions = true;
      state.busy = true;
      for (const marked of Array.from(container.children[1].querySelectorAll('[data-bc-revision-kind]'))) {
        marked.removeAttribute('data-bc-revision-ids');
        marked.removeAttribute('data-bc-revision-kind');
        marked.removeAttribute('data-bc-revision-state');
      }

      runtime.render(state.model);

      const marked = container.children[1].querySelectorAll(
        '[data-bc-revision-ids="revision-ime"][data-bc-revision-kind="insert"][data-bc-revision-state="pending"]',
      );
      expect(marked.length).toBeGreaterThan(0);
      expect(Array.from(marked).map(node => node.textContent).join('')).toBe('const middle = 2;');
      expectOuterIdentity();
      state.busy = false;
      await flushRecoveryFrame();
      expectOuterIdentity();
    });

    it('repairs a later native tail through renderCode without replacing outer lines', async () => {
      const {runtime, container, expectOuterIdentity} = await createReadyHarness();
      container.children[1].appendChild(document.createTextNode('late-native-tail'));

      await runtime.renderCode();

      expect(container.textContent).not.toContain('late-native-tail');
      expect(textOf(container)).toBe(source);
      expectOuterIdentity();
    });

    it('keeps a synchronous full fallback when no syntax engine has been prepared', async () => {
      const state = {busy: true};
      const {runtime, container} = makeRuntime({
        lang: 'typescript', withLineBreak: true,
        canonicalHost: {
          readModel: () => ({text: source, deltas: [{insert: source}]}),
          hasTextRevisions: () => false,
          isCompositionBusy: () => state.busy,
          readSelection: () => null,
        },
      });
      (runtime as any)._tokenize.and.callThrough();
      const build = spyOn(runtime.scrollBlot, 'build').and.callThrough();

      runtime.render([{insert: source}]);

      expect(build).toHaveBeenCalledTimes(1);
      expect(textOf(container)).toBe(source);
      expect(shikiService.getHighlighter).not.toHaveBeenCalled();
      state.busy = false;
      await flushRecoveryFrame();
      expect(textOf(container)).toBe(source);
    });

    for (const change of ['language', 'theme'] as const) {
      it(`does not reuse a ready engine after an unprepared ${change} change`, async () => {
        const {runtime, container, state, build} = await createReadyHarness();
        if (change === 'language') runtime.setLang('javascript');
        else runtime.setTheme('github-dark');
        const tokenize = spyOn(highlighter, 'codeToTokensBase').and.callThrough();
        state.busy = true;
        const next = source.replace('middle', 'middle中文');
        state.model = [{insert: next}];

        runtime.render(state.model);

        expect(build).toHaveBeenCalledTimes(1);
        expect(tokenize).not.toHaveBeenCalled();
        expect(textOf(container)).toBe(next);
        state.busy = false;
        await flushRecoveryFrame();
        expect(tokenize).toHaveBeenCalled();
        expect(textOf(container)).toBe(next);
      });
    }
  });
});
