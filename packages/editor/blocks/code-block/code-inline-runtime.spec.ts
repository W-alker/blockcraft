import {CodeInlineRuntime, flatShikiTokens} from "./code-inline-runtime";
import {shikiService} from './shiki-config';
import {createHighlighter, type Highlighter} from 'shiki';
import type {DeltaInsertText} from '../../framework/model/delta';
import {CursorBlot} from '../../framework/block-std/inline/blot/cursor-blot';
import {TextBlot} from '../../framework/block-std/inline/blot/text-blot';
import {STR_ZERO_WIDTH_SPACE} from '../../framework/block-std/inline/const';
import {getLogicalLineAccess} from '../../framework/block-std/inline/blot/logical-line-access';

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

  describe('native composition caret lease', () => {
    const placeCaret = (runtime: CodeInlineRuntime, container: HTMLElement, offset: number) => {
      const point = runtime.mapper.modelPointToDomPoint(container, offset);
      document.getSelection()!.setPosition(point.node, point.offset);
    };
    const cursors = (runtime: CodeInlineRuntime) => runtime.scrollBlot.children
      .filter((blot): blot is CursorBlot => blot instanceof CursorBlot);

    for (const source of ['first\nsecond', 'first\n\nlast', 'first\n', 'first\r\nsecond']) {
      it(`keeps repeated native candidates in their zero-length line prefix for ${JSON.stringify(source)}`, () => {
        const {runtime, container} = makeRuntime();
        runtime.render([{insert: source}]);
        const offset = source.indexOf('\n') + 1;
        const rows = Array.from(container.children);
        const leaves = runtime.scrollBlot.leaves.slice();
        const leafText = leaves.map(leaf => (leaf as TextBlot).text);
        placeCaret(runtime, container, offset);

        const release = runtime.acquireCompositionCaret(offset);
        expect(release).not.toBeNull();
        expect(cursors(runtime).length).toBe(1);
        const cursor = cursors(runtime)[0];
        const selection = document.getSelection()!;
        expect(cursor.domNode.parentNode).toBe(rows[1]);
        expect<Node | null>(rows[1].firstChild).toBe(cursor.domNode);
        expect(selection.anchorNode).toBe(cursor.anchorNode);
        expect(selection.anchorOffset).toBe(STR_ZERO_WIDTH_SPACE.length);
        expect(selection.isCollapsed).toBeTrue();

        for (const candidate of ['zhong', 'zhongwen', '中文🙂']) {
          cursor.anchorNode.data = STR_ZERO_WIDTH_SPACE + candidate;
          selection.setPosition(cursor.anchorNode, cursor.anchorNode.length);
          expect(runtime.domPointToModel(selection.focusNode!, selection.focusOffset)).toBe(offset);
          expect(runtime.scrollBlot.offsetOf(cursor)).toBe(offset);
          expect(runtime.textLength).toBe(source.length);
          expect(runtime.scrollBlot.leaves).toEqual(leaves);
          expect(leaves.map(leaf => (leaf as TextBlot).text)).toEqual(leafText);
          // The canonical text projection excludes preedit text and its sentinel.
          expect((runtime as any)._getPlainText()).toBe(source);
          expect(Array.from(container.children)).toEqual(rows);
          expect(cursor.domNode.parentNode).toBe(rows[1]);
        }

        release!();
        release!();
        expect(cursors(runtime)).toEqual([]);
        expect(cursor.domNode.isConnected).toBeFalse();
        expect(runtime.scrollBlot.leaves).toEqual(leaves);
        expect(Array.from(container.querySelectorAll('c-text')).map(node => node.textContent).join('')).toBe(source);
        expect(runtime.scrollBlot.hasCanonicalDomOrder()).toBeTrue();
      });
    }

    const skipped: Array<{
      name: string; deltas: DeltaInsertText[]; offset: number; withLineBreak?: boolean;
    }> = [
      {name: 'the first line', deltas: [{insert: 'first\nsecond'}], offset: 0},
      {name: 'the middle of a line', deltas: [{insert: 'first\nsecond'}], offset: 8},
      {name: 'flat code rendering', deltas: [{insert: 'first\nsecond'}], offset: 6, withLineBreak: false},
      {name: 'a hidden revision LF', deltas: [
        {insert: 'first'}, {insert: '\n', attributes: {'s:display': 'none'}}, {insert: 'second'},
      ], offset: 6},
    ];
    for (const entry of skipped) {
      it(`does not add a native prefix for ${entry.name}`, () => {
        const {runtime, container} = makeRuntime({lang: 'text', withLineBreak: entry.withLineBreak});
        runtime.render(entry.deltas);
        placeCaret(runtime, container, entry.offset);
        const selection = document.getSelection()!;
        const node = selection.anchorNode;
        const offset = selection.anchorOffset;
        const children = runtime.scrollBlot.children.slice();

        expect(runtime.acquireCompositionCaret(entry.offset)).toBeNull();
        expect(cursors(runtime)).toEqual([]);
        expect(runtime.scrollBlot.children).toEqual(children);
        expect(selection.anchorNode).toBe(node);
        expect(selection.anchorOffset).toBe(offset);
      });
    }

    it('does not let a stale release remove the replacement caret', () => {
      const {runtime, container} = makeRuntime();
      runtime.render([{insert: 'first\nsecond'}]);
      placeCaret(runtime, container, 6);
      const firstRelease = runtime.acquireCompositionCaret(6)!;
      const first = cursors(runtime)[0];
      placeCaret(runtime, container, 6);
      const secondRelease = runtime.acquireCompositionCaret(6)!;
      const second = cursors(runtime)[0];

      expect(second).not.toBe(first);
      expect(first.domNode.isConnected).toBeFalse();
      firstRelease();
      expect(cursors(runtime)).toEqual([second]);
      expect(second.domNode.isConnected).toBeTrue();
      secondRelease();
      expect(cursors(runtime)).toEqual([]);
    });

    it('releases on destroy without letting the old lease affect a remounted runtime', () => {
      const {runtime, container} = makeRuntime();
      runtime.render([{insert: 'first\nsecond'}]);
      placeCaret(runtime, container, 6);
      const oldRelease = runtime.acquireCompositionCaret(6)!;
      const oldCursor = cursors(runtime)[0];
      runtime.destroy();
      expect(oldCursor.domNode.isConnected).toBeFalse();
      expect(runtime.acquireCompositionCaret(6)).toBeNull();

      const replacement = new CodeInlineRuntime(container, new Map(), {lang: 'text'});
      runtimes.push(replacement);
      replacement.render([{insert: 'first\nsecond'}]);
      placeCaret(replacement, container, 6);
      const release = replacement.acquireCompositionCaret(6)!;
      const current = cursors(replacement)[0];
      oldRelease();
      runtime.destroy();
      expect(cursors(replacement)).toEqual([current]);
      expect(current.domNode.isConnected).toBeTrue();
      release();
    });

    it('removes an inserted prefix if native caret installation fails', () => {
      const {runtime, container} = makeRuntime();
      runtime.render([{insert: 'first\nsecond'}]);
      placeCaret(runtime, container, 6);
      spyOn(document.getSelection()!, 'setBaseAndExtent').and.throwError('native caret unavailable');

      expect(() => runtime.acquireCompositionCaret(6)).toThrowError('native caret unavailable');
      expect(cursors(runtime)).toEqual([]);
      expect((runtime as any)._getPlainText()).toBe('first\nsecond');
      expect(runtime.scrollBlot.hasCanonicalDomOrder()).toBeTrue();
    });
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

  for (const trailingLF of ['', '\n']) {
    it(`reuses indexed source lines for an ordinary highlight (tail ${JSON.stringify(trailingLF)})`, async () => {
      const {runtime, container} = makeRuntime({lang: 'text'});
      (runtime as any)._tokenize.and.callThrough();
      const source = Array.from({length: 200}, (_, i) => `line ${i}`).join('\n') + trailingLF;
      await runtime.renderCode(() => source);
      const first = container.firstElementChild;
      const last = container.lastElementChild;
      const regroup = spyOn<any>(runtime, '_groupBlotsByLine').and.callThrough();
      const offset = source.indexOf('line 100') + 5;
      const next = source.slice(0, offset) + '中文😀' + source.slice(offset);
      runtime.applyDelta([{retain: offset}, {insert: '中文😀'}]);

      await runtime.diffHighLight([], {
        block: {id: 'code', textContent: () => next, setInlineRange: () => undefined},
        selectionValue: null,
        normalizeRange: () => { throw new Error('no selection'); },
      });

      expect(regroup).not.toHaveBeenCalled();
      expect(Array.from(container.querySelectorAll('c-text'), node => node.textContent).join('')).toBe(next);
      expect(runtime.textLength).toBe(next.length);
      expect(container.firstElementChild).toBe(first);
      expect(container.lastElementChild).toBe(last);
    });
  }

  it('rejects cached source lines after same-length native pollution outside the edited line', async () => {
    const {runtime, container} = makeRuntime({lang: 'text'});
    (runtime as any)._tokenize.and.callThrough();
    const source = 'first\nmiddle\nlast';
    await runtime.renderCode(() => source);
    runtime.applyDelta([{retain: 8}, {insert: '!'}]);
    container.querySelector('c-text')!.firstChild!.textContent = 'wrong';
    const next = 'first\nmi!ddle\nlast';

    await runtime.diffHighLight([], {
      block: {id: 'code', textContent: () => next, setInlineRange: () => undefined},
      selectionValue: null,
      normalizeRange: () => { throw new Error('no selection'); },
    });

    expect(Array.from(container.querySelectorAll('c-text'), node => node.textContent).join('')).toBe(next);
  });

  it('keeps hidden-LF source lines distinct when they share one display row', async () => {
    const {runtime, container} = makeRuntime({lang: 'text'});
    (runtime as any)._tokenize.and.callThrough();
    let model: DeltaInsertText[] = [
      {insert: 'left'},
      {insert: '\n', attributes: {'s:display': 'none'}},
      {insert: 'middle\nlast'},
    ];
    await runtime.renderCode(() => 'left\nmiddle\nlast', () => model);
    const left = container.querySelector('c-text');
    const firstRow = container.firstElementChild;
    const lastRow = container.lastElementChild;
    runtime.applyDelta([{retain: 6}, {insert: '!'}]);
    model = [...model.slice(0, 2), {insert: 'm!iddle\nlast'}];

    await runtime.diffHighLight([], {
      block: {
        id: 'code', textContent: () => 'left\nm!iddle\nlast', textDeltas: () => model,
        setInlineRange: () => undefined,
      },
      selectionValue: null,
      normalizeRange: () => { throw new Error('no selection'); },
    });

    expect(container.children.length).toBe(2);
    expect(container.querySelector('c-text')).toBe(left);
    expect(container.firstElementChild).toBe(firstRow);
    expect(container.lastElementChild).toBe(lastRow);
    expect(Array.from(container.querySelectorAll('c-text'), node => node.textContent).join(''))
      .toBe('left\nm!iddle\nlast');
    expect(container.querySelector<HTMLElement>('c-element[style*="display"]')!.style.display).toBe('none');
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

    const collectDeepChecks = (runtime: CodeInlineRuntime) => {
      const integrity = (runtime as any)._lineIntegrity;
      const check = integrity._isTextIntact.bind(integrity);
      const rows = new Set<Node | null>();
      const deep = spyOn<any>(integrity, '_isTextIntact').and.callFake((leaf: TextBlot) => {
        rows.add(leaf.domNode.parentNode);
        return check(leaf);
      });
      return {rows, deep};
    };

    describe('line-start composition recovery', () => {
      async function caretHarness() {
        const initial = Array.from({length: 64}, (_, index) => `const row${index} = ${index};`).join('\n');
        const h = await createReadyHarness([{insert: initial}]);
        await h.runtime.renderCode();
        const rows = Array.from(h.container.children);
        const offset = initial.indexOf('const row16 =');
        const start = () => {
          const point = h.runtime.modelPointToDom(offset);
          document.getSelection()!.setPosition(point.node, point.offset);
          h.state.busy = true;
          const release = h.runtime.acquireCompositionCaret(offset)!;
          expect(release).not.toBeNull();
          const cursor = h.runtime.scrollBlot.children.find(blot => blot instanceof CursorBlot) as CursorBlot;
          expect(cursor).toBeDefined();
          return {release, cursor, anchor: cursor.anchorNode};
        };
        return {...h, initial, rows, offset, start};
      }

      for (const commit of [false, true]) {
        it(`preserves the current line through native caret ${commit ? 'commit' : 'cancel'}`, async () => {
          const h = await caretHarness();
          const checked = collectDeepChecks(h.runtime);
          const previousText = h.rows[15].textContent;
          const previousLF = h.rows[15].lastChild!;
          const {release, cursor, anchor} = h.start();
          const selection = document.getSelection()!;
          expect(selection.anchorNode).toBe(anchor);
          expect(selection.anchorOffset).toBe(STR_ZERO_WIDTH_SPACE.length);
          for (const candidate of ['zhong', 'zhongwen', '中文\n🙂']) {
            anchor.data = STR_ZERO_WIDTH_SPACE + candidate;
            selection.setPosition(anchor, anchor.length);
            if (commit) await Promise.resolve();
            expect(cursor.anchorNode).toBe(anchor);
            expect(cursor.domNode.parentNode).toBe(h.rows[16]);
            expect(h.runtime.domPointToModel(selection.focusNode!, selection.focusOffset)).toBe(h.offset);
            expect(h.rows[15].lastChild).toBe(previousLF);
            expect(h.rows[15].textContent).toBe(previousText);
            expect(h.runtime.textLength).toBe(h.initial.length);
          }

          release();
          release();
          const expected = commit ? h.initial.slice(0, h.offset) + '中文🙂' + h.initial.slice(h.offset) : h.initial;
          h.state.model = [{insert: expected}];
          h.runtime.render(h.state.model);

          // Structural Cursor insertion/removal conservatively invalidates the
          // integrity snapshot, including when cancellation leaves text intact.
          if (!commit) expect(checked.rows).toEqual(new Set(h.rows));
          expect(textOf(h.container)).toBe(expected);
          expect(h.container.querySelector('[data-cursor-blot]')).toBeNull();
          const point = h.runtime.modelPointToDom(h.offset + (commit ? '中文🙂'.length : 0));
          expect(h.rows[16].contains(point.node)).toBeTrue();
          expect(h.runtime.domPointToModel(point.node, point.offset)).toBe(h.offset + (commit ? '中文🙂'.length : 0));
          h.expectOuterIdentity();
          const count = checked.deep.calls.count();
          h.state.busy = false;
          await flushRecoveryFrame();
          expect(checked.deep.calls.count()).toBe(count);
          expect(textOf(h.container)).toBe(expected);
        });
      }

      for (const pollution of ['other-row text', 'other-row attributes', 'unknown child'] as const) {
        it(`repairs ${pollution} alongside line-start composition`, async () => {
          const h = await caretHarness();
          const foreign = h.rows[48].querySelector('c-element') as HTMLElement;
          const style = foreign.getAttribute('style');
          const {release, anchor} = h.start();
          anchor.data = STR_ZERO_WIDTH_SPACE + '候选';
          if (pollution === 'other-row text') {
            const text = foreign.querySelector('c-text')!.firstChild as Text;
            text.data = 'X'.repeat(text.length);
          } else if (pollution === 'other-row attributes') foreign.removeAttribute('style');
          else h.rows[48].appendChild(document.createTextNode('unmanaged-during-composition'));

          release();
          h.runtime.render(h.state.model);

          expect(textOf(h.container)).toBe(h.initial);
          expect(h.container.textContent).not.toContain('unmanaged-during-composition');
          expect(h.container.children[48].querySelector('c-element')!.getAttribute('style')).toBe(style);
          expect(h.container.querySelector('[data-cursor-blot]')).toBeNull();
          h.state.busy = false;
          await flushRecoveryFrame();
          expect(textOf(h.container)).toBe(h.initial);
        });
      }

      for (const pollution of ['replaced anchor', 'external cursor roundtrip'] as const) {
        it(`repairs ${pollution} during line-start composition`, async () => {
          const h = await caretHarness();
          const {release, cursor, anchor} = h.start();
          anchor.data = STR_ZERO_WIDTH_SPACE + '候选';
          if (pollution === 'replaced anchor') {
            anchor.replaceWith(document.createTextNode(STR_ZERO_WIDTH_SPACE + '新候选'));
            await Promise.resolve();
          } else {
            cursor.domNode.parentNode!.removeChild(cursor.domNode);
            h.rows[16].insertBefore(cursor.domNode, h.rows[16].firstChild);
          }

          release();
          h.runtime.render(h.state.model);

          expect(textOf(h.container)).toBe(h.initial);
          expect(h.container.querySelector('[data-cursor-blot]')).toBeNull();
          h.state.busy = false;
          await flushRecoveryFrame();
        });
      }

      for (const structural of [false, true]) {
        it(`detects late ${structural ? 'structure' : 'same-length text'} after an owned lease has ended`, async () => {
          const h = await caretHarness();
          const {release, anchor} = h.start();
          anchor.data = STR_ZERO_WIDTH_SPACE + '取消';
          release();
          h.runtime.render(h.state.model);
          const checked = collectDeepChecks(h.runtime);
          if (structural) h.rows[48].appendChild(document.createTextNode('late-native-node'));
          else {
            const text = h.rows[48].querySelector('c-text')!.firstChild as Text;
            text.data = 'X'.repeat(text.length);
          }
          h.state.busy = false;

          await flushRecoveryFrame();

          expect(checked.rows.has(h.rows[48])).toBeTrue();
          if (structural) expect(checked.rows.has(h.rows[0])).toBeTrue();
          else expect(checked.rows).toEqual(new Set([h.rows[48]]));
          expect(textOf(h.container)).toBe(h.initial);
          expect(h.container.textContent).not.toContain('late-native-node');
          expect(h.container.querySelector('[data-cursor-blot]')).toBeNull();
        });
      }

      it('recovers from failed native caret installation and accepts a later composition', async () => {
        const h = await caretHarness();
        const checked = collectDeepChecks(h.runtime);
        const selection = document.getSelection()!;
        const point = h.runtime.modelPointToDom(h.offset);
        selection.setPosition(point.node, point.offset);
        const install = spyOn(selection, 'setBaseAndExtent').and.throwError('native caret unavailable');
        h.state.busy = true;

        expect(() => h.runtime.acquireCompositionCaret(h.offset)).toThrowError('native caret unavailable');
        install.and.callThrough();
        expect(h.container.querySelector('[data-cursor-blot]')).toBeNull();
        h.runtime.render(h.state.model);
        expect(checked.rows.has(h.rows[0])).toBeTrue();
        expect(checked.rows.has(h.rows.at(-1)!)).toBeTrue();
        expect(textOf(h.container)).toBe(h.initial);
        h.state.busy = false;
        await flushRecoveryFrame();

        const {release, anchor} = h.start();
        anchor.data = STR_ZERO_WIDTH_SPACE + '再次候选';
        release();
        h.runtime.render(h.state.model);
        expect(h.container.querySelector('[data-cursor-blot]')).toBeNull();
        expect(textOf(h.container)).toBe(h.initial);
        h.state.busy = false;
        await flushRecoveryFrame();
      });

      for (const action of ['insert', 'remove'] as const) {
        it(`invalidates the integrity baseline when Scroll cursor ${action} throws after its DOM mutation`, async () => {
          const h = await caretHarness();
          const checked = collectDeepChecks(h.runtime);
          const scroll = h.runtime.scrollBlot;
          const message = `cursor ${action} failed`;
          if (action === 'insert') {
            const insert = scroll.insertCursorBlot.bind(scroll);
            const failing = spyOn(scroll, 'insertCursorBlot').and.callFake((offset, cursor) => {
              insert(offset, cursor);
              throw new Error(message);
            });
            expect(() => h.start()).toThrowError(message);
            failing.and.callThrough();
          } else {
            const {release, anchor} = h.start();
            anchor.data = STR_ZERO_WIDTH_SPACE + '候选';
            const remove = scroll.removeCursorBlot.bind(scroll);
            const failing = spyOn(scroll, 'removeCursorBlot').and.callFake(cursor => {
              remove(cursor);
              throw new Error(message);
            });
            expect(release).toThrowError(message);
            failing.and.callThrough();
          }

          h.runtime.render(h.state.model);

          expect(checked.rows.has(h.rows[0])).toBeTrue();
          expect(checked.rows.has(h.rows.at(-1)!)).toBeTrue();
          expect(textOf(h.container)).toBe(h.initial);
          expect(h.container.querySelector('[data-cursor-blot]')).toBeNull();
          h.state.busy = false;
          await flushRecoveryFrame();
        });
      }

      it('renders the complete deferred remote snapshot after releasing an owned caret', async () => {
        const h = await caretHarness();
        const {release, anchor} = h.start();
        anchor.data = STR_ZERO_WIDTH_SPACE + '中文';
        await Promise.resolve();
        const expected = (h.initial.slice(0, h.offset) + '中文' + h.initial.slice(h.offset))
          .replace('const row48 = 48;', 'const row48 = "remote";');
        h.state.model = [{insert: expected}];

        release();
        h.runtime.render(h.state.model);

        const expectedTokens = flatShikiTokens(highlighter.codeToTokens(expected, {
          lang: 'typescript', theme: 'github-light',
        }).tokens, expected);
        const expectedColors = expectedTokens.flatMap(delta => [...delta.insert].map(char => [char, delta.attributes?.['s:color']]));
        const actualColors = h.runtime.scrollBlot.leaves.flatMap(leaf => [...(leaf as TextBlot).text]
          .map(char => [char, (leaf as TextBlot).attrs?.['s:color']]));
        expect(actualColors).toEqual(expectedColors);
        expect(textOf(h.container)).toBe(expected);
        expect(h.runtime.textLength).toBe(expected.length);
        h.expectOuterIdentity();
        h.state.busy = false;
        await flushRecoveryFrame();
        expect(textOf(h.container)).toBe(expected);
      });
    });

    for (const scenario of [
      {name: 'pending cancellation', commit: false, delivered: false, dirty: [16]},
      {name: 'delivered multi-row cancellation', commit: false, delivered: true, dirty: [16, 48]},
      {name: 'pending commit', commit: true, delivered: false, dirty: [16]},
    ]) {
      it(`bounds native text integrity checks to dirty display rows during ${scenario.name}`, async () => {
        const initial = Array.from({length: 64}, (_, index) => `const row${index} = ${index};`).join('\n');
        const {runtime, container, state, expectOuterIdentity} = await createReadyHarness([{insert: initial}]);
        await runtime.renderCode(); // Establish a complete verified integrity baseline.
        const beforeRows = Array.from(container.children);
        const checked = collectDeepChecks(runtime);
        state.busy = true;
        for (const index of scenario.dirty) {
          const text = beforeRows[index].querySelector('c-text')!.firstChild as Text;
          text.data = text.data.toUpperCase(); // Same length must still mark this row dirty.
        }
        if (scenario.delivered) await Promise.resolve();
        const expected = scenario.commit ? initial.replace('row16', 'row16中文') : initial;
        state.model = [{insert: expected}];

        runtime.render(state.model);

        const dirtyRows = new Set(scenario.dirty.map(index => beforeRows[index]));
        expect([...checked.rows].every(row => dirtyRows.has(row as Element))).toBeTrue();
        if (!scenario.commit) expect(checked.rows).toEqual(dirtyRows);
        // A changed fingerprint can replace the committed row before its
        // predicate is needed; zero deep checks are valid in that case.
        expect(checked.rows.has(beforeRows[0])).toBeFalse();
        expect(checked.rows.has(beforeRows.at(-1)!)).toBeFalse();
        expect(textOf(container)).toBe(expected);
        expectOuterIdentity();
        const checksAfterCommit = checked.deep.calls.count();
        state.busy = false;
        await flushRecoveryFrame();
        expect(checked.deep.calls.count()).toBe(checksAfterCommit);
        expect(textOf(container)).toBe(expected);
      });
    }

    it('checks a late native text change arriving after synchronous recovery and before its queued frame', async () => {
      const {runtime, container, state} = await createReadyHarness();
      await runtime.renderCode();
      const firstRow = container.firstElementChild!;
      state.busy = true;
      state.model = [{insert: source.replace('middle', 'middle中文')}];
      (container.children[1].querySelector('c-text')!.firstChild as Text).data += '候选';
      runtime.render(state.model);
      const checked = collectDeepChecks(runtime);
      state.busy = false;
      const lateText = firstRow.querySelector('c-text')!.firstChild as Text;
      lateText.data = 'X'.repeat(lateText.length);

      await flushRecoveryFrame();

      expect(checked.rows).toEqual(new Set([firstRow]));
      expect(textOf(container)).toBe(state.model[0].insert);
      expect(runtime.textLength).toBe(state.model[0].insert.length);
    });

    it('invalidates native-row eligibility after a structural model delta and preserves the complete remote snapshot', async () => {
      const {runtime, container, state} = await createReadyHarness();
      await runtime.renderCode();
      const firstRow = container.firstElementChild!;
      const checked = collectDeepChecks(runtime);
      const offset = source.indexOf('const last');
      const remote = '// remote\n';
      runtime.applyDelta([{retain: offset}, {insert: remote}]);
      const complete = (source.slice(0, offset) + remote + source.slice(offset)).replace('middle', 'middle中文');
      state.model = [{insert: complete}];
      state.busy = true;
      const nativeText = container.children[1].querySelector('c-text')!.firstChild as Text;
      nativeText.data += '候选';

      runtime.render(state.model);

      expect(checked.rows.has(firstRow)).toBeTrue();
      expect(textOf(container)).toBe(complete);
      const expectedTokens = flatShikiTokens(highlighter.codeToTokens(complete, {
        lang: 'typescript', theme: 'github-light',
      }).tokens, complete);
      const expectedColors = expectedTokens.flatMap(delta => [...delta.insert].map(char => [char, delta.attributes?.['s:color']]));
      const actualColors = runtime.scrollBlot.leaves.flatMap(leaf => [...(leaf as TextBlot).text]
        .map(char => [char, (leaf as TextBlot).attrs?.['s:color']]));
      expect(actualColors).toEqual(expectedColors);
      state.busy = false;
      await flushRecoveryFrame();
      expect(textOf(container)).toBe(complete);
    });

    it('drops the previous row baseline after a native integrity check throws', async () => {
      const {runtime, container, state} = await createReadyHarness();
      await runtime.renderCode();
      const integrity = (runtime as any)._lineIntegrity;
      const deep = spyOn<any>(integrity, '_isTextIntact').and.throwError('native integrity failure');
      const error = spyOn(console, 'error');
      state.busy = true;
      const nativeText = container.children[1].querySelector('c-text')!.firstChild as Text;
      nativeText.data += '候选';

      runtime.render(state.model);

      expect(error).toHaveBeenCalled();
      expect(textOf(container)).toBe(source);
      deep.and.callThrough();
      state.busy = false;
      await flushRecoveryFrame();
      deep.calls.reset();
      await runtime.renderCode();
      expect(deep.calls.allArgs().some(args => (args[0] as TextBlot).domNode.parentNode === container.firstElementChild)).toBeTrue();
      expect(deep.calls.allArgs().some(args => (args[0] as TextBlot).domNode.parentNode === container.lastElementChild)).toBeTrue();
      expect(textOf(container)).toBe(source);
    });

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

    for (const commit of [false, true]) {
      it(`skips a second complete integrity pass after a clean IME ${commit ? 'commit' : 'cancel'}`, async () => {
        const {runtime, container, state, expectOuterIdentity} = await createReadyHarness();
        const inspect = spyOn((runtime as any)._lineIntegrity, 'inspect').and.callThrough();
        const repair = spyOn((runtime as any)._lineIntegrity, 'repair').and.callThrough();
        state.busy = true;
        const nativeText = container.children[1].querySelector('c-text')!.firstChild as Text;
        nativeText.data += '未提交候选';
        const expected = commit ? source.replace('middle', 'middle中文') : source;
        state.model = [{insert: expected}];

        runtime.render(state.model);

        expect(inspect).toHaveBeenCalledTimes(1);
        expect(repair).toHaveBeenCalledTimes(1);
        expect(textOf(container)).toBe(expected);
        expectOuterIdentity();
        state.busy = false;
        await flushRecoveryFrame();
        await runtime.renderCode();
        expect(inspect).toHaveBeenCalledTimes(1);
        expect(repair).toHaveBeenCalledTimes(1);
        expect(textOf(container)).toBe(expected);
        expectOuterIdentity();
      });
    }

    for (const pollution of ['same-length text in another line', 'style attribute', 'unknown child'] as const) {
      it(`invalidates a healthy recovery snapshot for new ${pollution}`, async () => {
        const {runtime, container, state} = await createReadyHarness();
        state.busy = true;
        const nativeText = container.children[1].querySelector('c-text')!.firstChild as Text;
        nativeText.data += '候选';
        runtime.render(state.model);
        state.busy = false;
        await flushRecoveryFrame();
        const inspect = spyOn((runtime as any)._lineIntegrity, 'inspect').and.callThrough();
        const repair = spyOn((runtime as any)._lineIntegrity, 'repair').and.callThrough();
        const lastRow = container.lastElementChild;
        const first = container.children[0].querySelector('c-element') as HTMLElement;
        const expectedStyle = first.getAttribute('style');
        if (pollution === 'same-length text in another line') {
          const text = first.querySelector('c-text')!.firstChild as Text;
          text.data = 'X'.repeat(text.length);
        } else if (pollution === 'style attribute') {
          expect(expectedStyle).not.toBeNull();
          first.removeAttribute('style');
          // Scroll can rebuild its text/topology index without repairing the
          // presentation attributes. Runtime integrity must retain its own dirtiness.
          runtime.scrollBlot.restoreCanonicalDomOrder();
          expect(getLogicalLineAccess(runtime.scrollBlot)).toBeDefined();
          expect(first.getAttribute('style')).toBeNull();
        } else container.children[0].appendChild(document.createTextNode('unmanaged tail'));

        await runtime.renderCode();

        expect(inspect).toHaveBeenCalledTimes(1);
        expect(repair).toHaveBeenCalledTimes(1);
        expect(textOf(container)).toBe(source);
        expect(container.textContent).not.toContain('unmanaged tail');
        expect(container.children[0].querySelector('c-element')!.getAttribute('style')).toBe(expectedStyle);
        expect(container.lastElementChild).toBe(lastRow);
        await runtime.renderCode();
        expect(inspect).toHaveBeenCalledTimes(1);
        expect(repair).toHaveBeenCalledTimes(1);
      });
    }

    it('restores LF row ownership even when native movement preserves flat leaf order and model text', async () => {
      const {runtime, container, state, expectOuterIdentity} = await createReadyHarness();
      const rows = Array.from(container.children);
      const newline = runtime.scrollBlot.leaves.find(leaf => leaf instanceof TextBlot && leaf.text === '\n')!;
      rows[1].insertBefore(newline.domNode, rows[1].firstChild);
      expect(textOf(container)).toBe(source);
      expect(runtime.scrollBlot.hasCanonicalDomOrder()).toBeFalse();
      state.busy = true;

      runtime.render(state.model);

      expect(newline.domNode.parentNode).toBe(rows[0]);
      expect(rows[0].textContent!.endsWith('\n')).toBeTrue();
      expect(rows[1].textContent).toBe('const middle = 2;\n');
      expect(runtime.scrollBlot.hasCanonicalDomOrder()).toBeTrue();
      expectOuterIdentity();
      state.busy = false;
      await flushRecoveryFrame();
      expect(newline.domNode.parentNode).toBe(rows[0]);
      expect(textOf(container)).toBe(source);
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
