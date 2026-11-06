import {expect, test, type CDPSession, type Page} from '@playwright/test';

const source = Array.from({length: 1000}, (_, index) =>
  `const value${index} = {label: "row${index}", enabled: true};`,
).join('\n');
const editorSelector = 'block-craft-editor';
type Commit = {before: string; after: string; offset: number; inserted: string};

async function initialize(page: Page, revision = false): Promise<void> {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/', {waitUntil: 'domcontentloaded'});
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('div.code-block pre.edit-container').first()).toBeVisible();
  await page.locator(editorSelector).evaluate(async (editor, content) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('code', [content]);
    snapshot.props.lang = 'TypeScript';
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    const otherCount = doc.model.getChildrenIds(doc.rootId).length - 1;
    if (otherCount > 0) doc.crud.deleteBlocks(doc.rootId, 1, otherCount);
    await doc.navigateToBlock(id);
    const block = doc.getBlockById(id);
    const runtime = block.runtime;
    await runtime.renderCode();
    await runtime.renderCode();
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await frame();
    await frame();
    const state: any = {active: null, pending: 0, completed: 0, generation: runtime._renderToken};
    const read = () => {
      const native = getSelection();
      let caret: number | null = null;
      let anchor: number | null = null;
      if (native?.focusNode && block.containerElement.contains(native.focusNode)) {
        try { caret = runtime.domPointToModel(native.focusNode, native.focusOffset); } catch { /* Unmanaged native candidate. */ }
      }
      if (native?.anchorNode && block.containerElement.contains(native.anchorNode)) {
        try { anchor = runtime.domPointToModel(native.anchorNode, native.anchorOffset); } catch { /* Unmanaged native candidate. */ }
      }
      const selection = doc.selection.value;
      const lines = [...block.containerElement.querySelectorAll(':scope > c-line')];
      const active = state.active;
      return {
        model: block.textContent(), yText: block.yText.toString(),
        dom: [...block.containerElement.querySelectorAll('c-text')].map(node => node.textContent).join(''),
        length: runtime.textLength, caret, anchor, nativeCollapsed: native?.isCollapsed ?? false,
        modelCaret: selection?.collapsed && selection.head.type === 'text' && selection.head.blockId === id
          ? selection.head.offset : null,
        phase: doc.inputManger.compositionSession.phase,
        undoDepth: doc.crud.undoManager._yUndoManager.undoStack.length,
        redoDepth: doc.crud.undoManager._yUndoManager.redoStack.length,
        lineCount: lines.length,
        revisionText: [...block.containerElement.querySelectorAll(
          'c-element[data-bc-revision-kind="insert"][data-bc-revision-state="pending"]',
        )].map(node => node.textContent).join(''),
        identity: active ? {
          firstLine: lines[0] === active.nodes[0], lastLine: lines.at(-1) === active.nodes[1],
          firstLeaf: runtime.scrollBlot.leaves[0] === active.nodes[2],
          lastLeaf: runtime.scrollBlot.leaves.at(-1) === active.nodes[3],
          firstLeafInRoot: block.containerElement.contains(active.nodes[2].domNode),
          lastLeafInRoot: block.containerElement.contains(active.nodes[3].domNode), builds: active.builds,
        } : null,
      };
    };
    for (const name of ['renderCode', 'diffHighLight']) {
      const original = runtime[name];
      runtime[name] = async function(...args: unknown[]) {
        const generation = this._renderToken;
        state.pending++;
        try { return await original.apply(this, args); }
        finally {
          state.pending--;
          if (this._renderToken === generation + 1 && doc.inputManger.compositionSession.isIdle) {
            state.completed++;
            state.generation = this._renderToken;
          }
        }
      };
    }
    const build = runtime.scrollBlot.build;
    runtime.scrollBlot.build = function(...args: unknown[]) {
      if (state.active) state.active.builds++;
      return build.apply(this, args);
    };
    const run = doc.event.run;
    doc.event.run = function(name: string, ...args: unknown[]) {
      try { return run.call(this, name, ...args); }
      finally {
        // Capture in the same dispatch, before a recovery frame or CDP round trip.
        if (name === 'compositionEnd' && state.active) {
          state.active.endEvents++;
          state.active.synchronous = read();
        }
      }
    };
    const prepare = (offset: number) => {
      // Give these discrete test operations explicit history boundaries. Normal
      // collapsed IME commits retain the editor's 500 ms capture/merge policy.
      doc.crud.undoManager.stopCapturing();
      doc.selection.setCursorAt(block, offset);
      doc.root.hostElement.focus({preventScroll: true});
      const lines = [...block.containerElement.querySelectorAll(':scope > c-line')];
      state.active = {nodes: [lines[0], lines.at(-1), runtime.scrollBlot.leaves[0], runtime.scrollBlot.leaves.at(-1)],
        builds: 0, endEvents: 0, completionFloor: state.completed};
    };
    const simulate = (inserted: string, pollution: number) => {
      block.containerElement.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, cancelable: true}));
      const during = {phase: doc.inputManger.compositionSession.phase, model: block.yText.toString()};
      const native = getSelection()!;
      const node = native.focusNode!;
      const row = (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)!.closest('c-line')!;
      if (pollution % 3 === 0) row.appendChild(document.createTextNode('未提交候选🙂'));
      else if (pollution % 3 === 1) {
        const element = document.createElement('c-element');
        const text = document.createElement('c-text');
        text.textContent = '未提交候选🙂';
        element.appendChild(text);
        row.appendChild(element);
      } else {
        const text = row.querySelector('c-text')!.firstChild as Text;
        text.splitText(Math.min(1, text.length));
      }
      block.containerElement.dispatchEvent(new CompositionEvent('compositionend', {
        bubbles: true, cancelable: true, data: inserted,
      }));
      return {during, synchronous: state.active.synchronous, endEvents: state.active.endEvents};
    };
    const stable = async (completionFloor: number, history = false) => {
      const deadline = performance.now() + 30_000;
      // History also schedules the existing 200 ms text-highlight debounce.
      const earliest = performance.now() + (history ? 250 : 0);
      while (performance.now() < deadline) {
        await frame();
        if (performance.now() < earliest || state.completed <= completionFloor || state.pending ||
          runtime._canonicalRenderFrame !== null || state.generation !== runtime._renderToken ||
          !doc.inputManger.compositionSession.isIdle) continue;
        const generation = runtime._renderToken;
        await frame();
        await frame();
        if (state.pending || runtime._canonicalRenderFrame !== null || generation !== runtime._renderToken) continue;
        return read();
      }
      throw new Error('Code IME/history highlighting did not settle');
    };
    (window as any).__codeImeHistory = {
      read, prepare, simulate,
      readCommit: () => ({synchronous: state.active.synchronous, endEvents: state.active.endEvents}),
      finishComposition: () => stable(state.active.completionFloor),
      history(kind: 'undo' | 'redo') {
        state.active = null;
        const completionFloor = state.completed;
        const beforeCaret = read().caret;
        doc.crud.undoManager[kind]();
        return {beforeCaret, synchronous: read(), completionFloor};
      },
      stableHistory: (completionFloor: number) => stable(completionFloor, true),
      race(inserted: string) {
        const composition = simulate(inserted, 0);
        state.active = null;
        const completionFloor = state.completed;
        const replay = [];
        // Keep all history actions in this task, before the old IME recovery RAF.
        for (const kind of ['undo', 'redo', 'undo', 'redo']) {
          doc.crud.undoManager[kind]();
          replay.push(read());
        }
        return {composition, replay, completionFloor};
      },
      clearHistory: () => doc.crud.undoManager.clearHistory(),
    };
    doc.crud.undoManager.clearHistory();
  }, source);
  if (revision) {
    await page.getByRole('button', {name: '开启修订', exact: true}).click();
    await expect(page.getByRole('button', {name: '关闭修订', exact: true})).toBeVisible();
    await page.evaluate(() => (window as any).__codeImeHistory.clearHistory());
  }
  assertContent(await page.evaluate(() => (window as any).__codeImeHistory.read()), source);
}

function assertContent(state: any, expected: string, caret?: number) {
  expect(state.model).toBe(expected);
  expect(state.yText).toBe(expected);
  expect(state.dom).toBe(expected);
  expect(state.length).toBe(expected.length);
  expect(state.lineCount).toBe(1000);
  if (caret !== undefined) {
    expect(state.caret).toBe(caret);
    expect(state.anchor).toBe(caret);
    expect(state.nativeCollapsed).toBe(true);
    expect(state.modelCaret).toBe(caret);
  }
}

function assertIdentity(state: any) {
  expect(state.identity).toEqual({firstLine: true, lastLine: true, firstLeaf: true, lastLeaf: true,
    firstLeafInRoot: true, lastLeafInRoot: true, builds: 0});
  expect(state.phase).toBe('idle');
}

function assertRevision(state: any, expected: string, commits: Commit[], revision: boolean) {
  const inserted = revision ? [...commits].sort((left, right) =>
    expected.indexOf(left.inserted) - expected.indexOf(right.inserted)).map(commit => commit.inserted).join('') : '';
  expect(state.revisionText).toBe(inserted);
}

async function replayHistory(page: Page, commits: Commit[], revision: boolean) {
  const redoCarets: number[] = [];
  for (let index = commits.length - 1; index >= 0; index--) {
    const step = await page.evaluate(() => (window as any).__codeImeHistory.history('undo'));
    redoCarets[index] = step.beforeCaret;
    assertContent(step.synchronous, commits[index].before);
    const stable = await page.evaluate(floor => (window as any).__codeImeHistory.stableHistory(floor), step.completionFloor);
    assertContent(stable, commits[index].before, commits[index].offset);
    expect(stable.undoDepth).toBe(index);
    expect(stable.redoDepth).toBe(commits.length - index);
    assertRevision(stable, commits[index].before, commits.slice(0, index), revision);
  }
  for (let index = 0; index < commits.length; index++) {
    const step = await page.evaluate(() => (window as any).__codeImeHistory.history('redo'));
    assertContent(step.synchronous, commits[index].after);
    const stable = await page.evaluate(floor => (window as any).__codeImeHistory.stableHistory(floor), step.completionFloor);
    assertContent(stable, commits[index].after, redoCarets[index]);
    expect(stable.undoDepth).toBe(index + 1);
    expect(stable.redoDepth).toBe(commits.length - index - 1);
    assertRevision(stable, commits[index].after, commits.slice(0, index + 1), revision);
  }
}

async function exerciseSequence(page: Page, revision: boolean, cdp?: CDPSession) {
  let expected = source;
  const commits: Commit[] = [];
  for (let round = 0; round < 12; round++) {
    await test.step(`IME ${round + 1}: ${round % 4 === 2 ? 'cancel' : 'commit'}`, async () => {
      const targetLine = 37 + round * 73;
      const marker = expected.indexOf(`"row${targetLine}"`);
      expect(marker).toBeGreaterThan(0);
      const offset = marker + 4;
      const inserted = round % 4 === 2 ? '' : `第${round}轮中文${round % 2 ? '👩‍💻' : '🙂'}`;
      const before = expected;
      expected = before.slice(0, offset) + inserted + before.slice(offset);
      await page.evaluate(at => (window as any).__codeImeHistory.prepare(at), offset);
      let captured: any;
      if (cdp) {
        const candidate = 'zhongwen🙂';
        await cdp.send('Input.imeSetComposition', {text: candidate, selectionStart: candidate.length, selectionEnd: candidate.length});
        const during = await page.evaluate(() => (window as any).__codeImeHistory.read());
        expect(during.phase).toBe('active');
        expect(during.yText).toBe(before);
        if (inserted) await cdp.send('Input.insertText', {text: inserted});
        else await cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
        captured = await page.evaluate(() => (window as any).__codeImeHistory.readCommit());
      } else {
        captured = await page.evaluate(args => (window as any).__codeImeHistory.simulate(args.inserted, args.round), {inserted, round});
        expect(captured.during).toEqual({phase: 'active', model: before});
      }
      expect(captured.endEvents).toBe(1);
      assertContent(captured.synchronous, expected, offset + inserted.length);
      assertIdentity(captured.synchronous);
      if (inserted) commits.push({before, after: expected, offset, inserted});
      expect(captured.synchronous.undoDepth).toBe(commits.length);
      expect(captured.synchronous.redoDepth).toBe(0);
      const stable = await page.evaluate(() => (window as any).__codeImeHistory.finishComposition());
      assertContent(stable, expected, offset + inserted.length);
      assertIdentity(stable);
      assertRevision(stable, expected, commits, revision);
    });
  }
  if (!cdp) {
    await test.step('undo and redo before the previous IME highlight can finish', async () => {
      const before = expected;
      const offset = before.indexOf('"row950"') + 4;
      const inserted = '竞态中文🧪';
      expected = before.slice(0, offset) + inserted + before.slice(offset);
      await page.evaluate(at => (window as any).__codeImeHistory.prepare(at), offset);
      const result = await page.evaluate(text => (window as any).__codeImeHistory.race(text), inserted);
      expect(result.composition.endEvents).toBe(1);
      expect(result.composition.during).toEqual({phase: 'active', model: before});
      assertContent(result.composition.synchronous, expected, offset + inserted.length);
      assertIdentity(result.composition.synchronous);
      for (let index = 0; index < result.replay.length; index++) {
        assertContent(result.replay[index], index % 2 ? expected : before);
      }
      commits.push({before, after: expected, offset, inserted});
      const stable = await page.evaluate(floor => (window as any).__codeImeHistory.stableHistory(floor), result.completionFloor);
      assertContent(stable, expected, offset + inserted.length);
      expect(stable.undoDepth).toBe(commits.length);
      expect(stable.redoDepth).toBe(0);
      assertRevision(stable, expected, commits, revision);
    });
  }
  await replayHistory(page, commits, revision);
}

test.describe('1000-line code IME history stress', () => {
  test.describe.configure({mode: 'serial'});
  test.setTimeout(180_000);

  for (const revision of [false, true]) {
    test(`12 simulated compositions and complete undo/redo${revision ? ' with revisions' : ''}`, async ({page}) => {
      await initialize(page, revision);
      await exerciseSequence(page, revision);
    });
  }

  test('12 native Chromium IME compositions and complete undo/redo', async ({page, context, browserName}) => {
    test.skip(browserName !== 'chromium', 'Native CDP IME is Chromium-only; simulated histories cover all engines');
    await initialize(page);
    const cdp = await context.newCDPSession(page);
    try { await exerciseSequence(page, false, cdp); }
    finally { await cdp.detach(); }
  });
});
