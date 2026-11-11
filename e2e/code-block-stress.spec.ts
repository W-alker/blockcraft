import {expect, test, type Page} from '@playwright/test';

interface Edit {
  at: number;
  remove: number;
  insert: string;
  grammarChange: boolean;
}

interface Scenario {
  edits: Edit[];
  texts: string[];
}

function createSource(lines: number): string {
  return Array.from({length: lines}, (_, index) =>
    `const value${index} = {label: "row${index}", enabled: true};`,
  ).join('\n');
}

/** 独立字符串 oracle；位置以公开模型的 UTF-16 坐标计，不拆 surrogate pair。 */
function createScenario(source: string, count: number, seed: number): Scenario {
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  const boundary = (text: string, index: number) => {
    const at = Math.min(text.length, Math.max(0, index));
    return at > 0 && at < text.length && /[\uDC00-\uDFFF]/.test(text[at]) &&
      /[\uD800-\uDBFF]/.test(text[at - 1]) ? at - 1 : at;
  };
  const lineStart = (text: string, fraction: number) =>
    text.lastIndexOf('\n', Math.floor(text.length * fraction)) + 1;
  const texts = [source];
  const edits: Edit[] = [];
  for (let index = 0; index < count; index++) {
    const text = texts[index];
    const edit: Edit = {
      at: boundary(text, Math.floor(random() * (text.length + 1))),
      remove: 0, insert: '', grammarChange: false,
    };
    switch (index % 10) {
      case 0:
        if (index === 0) edit.at = 0;
        edit.insert = `edit_${index}`;
        break;
      case 1:
        edit.insert = `中文🙂👩‍💻_${index}`;
        break;
      case 2:
      case 3: {
        edit.at = boundary(text, Math.min(edit.at, text.length - 2));
        const end = boundary(text, Math.min(text.length, edit.at + 2 + Math.floor(random() * 11)));
        edit.remove = end - edit.at;
        edit.insert = index % 10 === 3 ? `替换_${index}` : '';
        break;
      }
      case 4:
        edit.at = index === 4 ? text.length : index === 14 ? 0 : edit.at;
        edit.insert = '\n\n';
        break;
      case 5:
        edit.insert = `// CRLF 中文🙂\r\nconst pasted${index} = true;\r\n`;
        break;
      case 6:
        edit.at = lineStart(text, 0.2 + random() * 0.1);
        edit.insert = `/* stress ${index}\n`;
        edit.grammarChange = true;
        break;
      case 7:
        edit.at = lineStart(text, 0.7 + random() * 0.1);
        edit.insert = '\n*/\n';
        edit.grammarChange = true;
        break;
      case 8:
        edit.at = lineStart(text, 0.35 + random() * 0.1);
        edit.insert = '`';
        edit.grammarChange = true;
        break;
      case 9:
        edit.at = lineStart(text, 0.8 + random() * 0.1);
        edit.insert = '`';
        edit.grammarChange = true;
        break;
    }
    edits.push(edit);
    texts.push(text.slice(0, edit.at) + edit.insert + text.slice(edit.at + edit.remove));
  }
  return {edits, texts};
}

async function initialize(page: Page, source: string): Promise<void> {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/', {waitUntil: 'domcontentloaded'});
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  await page.locator('block-craft-editor').evaluate(async (editor, text) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('code', [text]);
    snapshot.props.lang = 'TypeScript';
    snapshot.props.h = 400;
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    const others = doc.model.getChildrenIds(doc.rootId).length - 1;
    if (others > 0) doc.crud.deleteBlocks(doc.rootId, 1, others);
    await doc.navigateToBlock(id);
    const block = doc.getBlockById(id);
    const state: any = {
      id, requested: 0, completed: 0, pending: 0, lastHighlighted: '',
    };
    (window as any).__codeStressTest = state;
    for (const name of ['renderCode', 'diffHighLight']) {
      const original = block.runtime[name].bind(block.runtime);
      block.runtime[name] = async (...args: unknown[]) => {
        const request = ++state.requested;
        const startedText = block.textContent();
        state.pending++;
        try {
          await original(...args);
          if (request === state.requested && startedText === block.textContent()) {
            state.lastHighlighted = startedText;
            state.completed++;
          }
        } finally {
          state.pending--;
        }
      };
    }
    const mismatch = (label: string, actual: string, expected: string) => {
      if (actual === expected) return;
      let at = 0;
      while (at < Math.min(actual.length, expected.length) && actual[at] === expected[at]) at++;
      throw new Error(`${label}: mismatch at ${at}; length ${actual.length}/${expected.length}; ` +
        `${JSON.stringify(actual.slice(at, at + 48))} / ${JSON.stringify(expected.slice(at, at + 48))}`);
    };
    state.assertView = (expected: string, caret?: number) => {
      const current = doc.getBlockById(id);
      const container: HTMLElement = current.containerElement;
      mismatch('model', current.textContent(), expected);
      const lines = Array.from(container.children);
      const expectedLines = expected.split('\n').map((line, index, all) =>
        line + (index < all.length - 1 ? '\n' : ''));
      if (container.childNodes.length !== expectedLines.length || lines.length !== expectedLines.length ||
        lines.some(line => line.localName !== 'c-line')) {
        throw new Error(`canonical rows: ${container.childNodes.length}/${expectedLines.length}`);
      }
      const actualLines = lines.map(line => Array.from(line.querySelectorAll('c-text'))
        .filter(node => !node.closest('[data-cursor-blot]'))
        .map(node => node.textContent ?? '').join(''));
      mismatch('DOM', actualLines.join(''), expected);
      for (let index = 0; index < expectedLines.length; index++) {
        mismatch(`row ${index}`, actualLines[index], expectedLines[index]);
      }
      const scroll = current.runtime.scrollBlot;
      if (scroll.leadingGapNode?.parentNode !== lines[0] ||
        lines[0].firstChild !== scroll.leadingGapNode ||
        !lines.at(-1)?.querySelector('.bc-end-break > br')) {
        throw new Error('leading gap or terminal break left its canonical row');
      }
      if (container.querySelector('[data-line-break], [data-bc-line-break]')) {
        throw new Error('legacy line markers returned');
      }
      if (caret !== undefined) {
        const model = doc.selection.value;
        const native = document.getSelection();
        if (model?.anchor?.blockId !== id || model?.head?.blockId !== id ||
          model.anchor.offset !== caret || model.head.offset !== caret) {
          throw new Error(`model caret: ${model?.anchor?.offset}/${model?.head?.offset}, expected ${caret}`);
        }
        if (!native?.anchorNode || !native.focusNode ||
          !container.contains(native.anchorNode) || !container.contains(native.focusNode)) {
          throw new Error('native caret left the code container');
        }
        const anchor = current.runtime.domPointToModel(native.anchorNode, native.anchorOffset);
        const head = current.runtime.domPointToModel(native.focusNode, native.focusOffset);
        if (anchor !== caret || head !== caret) {
          throw new Error(`native caret: ${anchor}/${head}, expected ${caret}`);
        }
      }
    };
    // 每个逻辑动作单独捕获，替换仍通过同一笔 DocCRUD/Yjs transaction 同步到视图。
    state.edit = (operation: Edit, expected: string) => {
      block.setInlineRange(operation.at);
      doc.crud.undoManager.stopCapturing();
      doc.crud.undoManager.captureSelectionBeforeChange();
      doc.crud.transact(() => block.replaceText(operation.at, operation.remove, operation.insert));
      block.setInlineRange(operation.at + operation.insert.length);
      doc.crud.undoManager.stopCapturing();
      state.assertView(expected);
    };
    await block.runtime.renderCode();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    editor.querySelector<HTMLElement>('[data-blockcraft-root="true"]')?.focus({preventScroll: true});
    block.setInlineRange(0);
    doc.crud.undoManager.clearHistory();
    state.assertView(text);
  }, source);
  await waitForStable(page, source, 0, -1);
  await expectFullHighlight(page);
}

async function waitForStable(page: Page, expected: string, caret: number, after: number): Promise<void> {
  await expect.poll(() => page.evaluate(({text, offset, baseline}) => {
    const state = (window as any).__codeStressTest;
    if (state.pending || state.completed <= baseline || state.lastHighlighted !== text) return 'highlight pending';
    try {
      state.assertView(text, offset);
      return '';
    } catch (error) {
      return String(error);
    }
  }, {text: expected, offset: caret, baseline: after}), {timeout: 20_000, intervals: [25, 50, 100]}).toBe('');
}

/** 直接全文 Shiki 结果为 oracle；不读取增量 tokenizer/projection 的缓存。 */
async function expectFullHighlight(page: Page): Promise<void> {
  const result = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const block = doc.getBlockById((window as any).__codeStressTest.id);
    const ready = block.runtime._readySyntax;
    if (!ready) return 'full Shiki oracle unavailable';
    const text: string = block.textContent();
    const full = ready.highlighter.codeToTokens(text, {lang: ready.lang, theme: ready.theme}).tokens;
    const scratch = document.createElement('span');
    const colors = new Map<string, string>();
    const normalize = (color?: string) => {
      if (!color) return '';
      const cached = colors.get(color);
      if (cached !== undefined) return cached;
      scratch.style.color = color;
      const value = scratch.style.color;
      colors.set(color, value);
      return value;
    };
    type Run = {text: string; color: string};
    const append = (runs: Run[], content: string, color: string) => {
      if (!content) return;
      const last = runs.at(-1);
      if (last?.color === color) last.text += content;
      else runs.push({text: content, color});
    };
    const expected: Run[] = [];
    const endings = text.match(/\r?\n/g) ?? [];
    for (let index = 0; index < full.length; index++) {
      for (const token of full[index]) append(expected, token.content, normalize(token.color));
      if (index < full.length - 1) append(expected, endings[index] ?? '\n', '');
    }
    const actual: Run[] = [];
    for (const node of block.containerElement.querySelectorAll('c-text') as NodeListOf<HTMLElement>) {
      if (node.closest('[data-cursor-blot]')) continue;
      append(actual, node.textContent ?? '', node.parentElement!.style.color);
    }
    for (let index = 0; index < Math.max(actual.length, expected.length); index++) {
      const left = actual[index];
      const right = expected[index];
      if (left?.text !== right?.text || left?.color !== right?.color) {
        return `color run ${index}/${actual.length}/${expected.length}: ` +
          `${JSON.stringify({text: left?.text.slice(0, 64), color: left?.color})} / ` +
          `${JSON.stringify({text: right?.text.slice(0, 64), color: right?.color})}`;
      }
    }
    return '';
  });
  expect(result).toBe('');
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('[CodeInlineRuntime]')) errors.push(message.text());
  });
  return errors;
}

async function exerciseHistory(page: Page, scenario: Scenario): Promise<void> {
  const {edits, texts} = scenario;
  for (let index = 0; index < edits.length; index++) {
    await test.step(`edit ${index + 1}`, async () => {
      const completed = await page.evaluate(({operation, expected}) => {
        const state = (window as any).__codeStressTest;
        const before = state.completed;
        state.edit(operation, expected);
        return before as number;
      }, {operation: edits[index], expected: texts[index + 1]});
      await waitForStable(page, texts[index + 1], edits[index].at + edits[index].insert.length, completed);
      if (edits[index].grammarChange) await expectFullHighlight(page);
    });
  }
  await expectFullHighlight(page);
  for (let index = edits.length - 1; index >= 0; index--) {
    await test.step(`undo ${index + 1}`, async () => {
      const completed = await page.locator('block-craft-editor').evaluate((editor, expected) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        const state = (window as any).__codeStressTest;
        const before = state.completed;
        if (!doc.crud.undoManager.isCanUndo()) throw new Error('undo history ended early');
        doc.crud.undoManager.undo();
        state.assertView(expected);
        return before as number;
      }, texts[index]);
      await waitForStable(page, texts[index], edits[index].at, completed);
    });
  }
  await expectFullHighlight(page);
  expect(await page.locator('block-craft-editor').evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.crud.undoManager.isCanUndo())).toBe(false);
  for (let index = 0; index < edits.length; index++) {
    await test.step(`redo ${index + 1}`, async () => {
      const completed = await page.locator('block-craft-editor').evaluate((editor, expected) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        const state = (window as any).__codeStressTest;
        const before = state.completed;
        if (!doc.crud.undoManager.isCanRedo()) throw new Error('redo history ended early');
        doc.crud.undoManager.redo();
        state.assertView(expected);
        return before as number;
      }, texts[index + 1]);
      // Redo restores the selection captured immediately before its Undo.
      const caret = index + 1 < edits.length ? edits[index + 1].at : edits[index].at + edits[index].insert.length;
      await waitForStable(page, texts[index + 1], caret, completed);
    });
  }
  await expectFullHighlight(page);
  expect(await page.locator('block-craft-editor').evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.crud.undoManager.isCanRedo())).toBe(false);
}

test('1000 code lines survive 40 mixed edits and complete Undo/Redo history', async ({page}) => {
  test.setTimeout(180_000);
  const scenario = createScenario(createSource(1000), 40, 0x5eed1234);
  await initialize(page, scenario.texts[0]);
  const errors = captureErrors(page);
  await exerciseHistory(page, scenario);
  expect(errors).toEqual([]);
});

test('rapid code edits and history bursts reject stale asynchronous highlights', async ({page}) => {
  test.setTimeout(180_000);
  const scenario = createScenario(createSource(1000), 24, 0xc0deface);
  await initialize(page, scenario.texts[0]);
  const errors = captureErrors(page);
  const result = await page.locator('block-craft-editor').evaluate(async (editor, plan) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const state = (window as any).__codeStressTest;
    const block = doc.getBlockById(state.id);
    const flights: Promise<unknown>[] = [];
    const launch = () => { flights.push(block.runtime.renderCode(), block.runtime.diffHighLight([])); };
    for (let index = 0; index < plan.edits.length; index++) {
      state.edit(plan.edits[index], plan.texts[index + 1]);
      if (index % 3 === 0) launch();
    }
    for (let index = plan.edits.length - 1; index >= 0; index--) {
      if (!doc.crud.undoManager.isCanUndo()) throw new Error('burst undo ended early');
      doc.crud.undoManager.undo();
      state.assertView(plan.texts[index]);
      if (index % 3 === 0) launch();
    }
    for (let index = 0; index < plan.edits.length; index++) {
      if (!doc.crud.undoManager.isCanRedo()) throw new Error('burst redo ended early');
      doc.crud.undoManager.redo();
      state.assertView(plan.texts[index + 1]);
      if (index % 3 === 0) launch();
    }
    let current = plan.edits.length;
    for (let count = 0; count < 7; count++) {
      doc.crud.undoManager.undo();
      state.assertView(plan.texts[--current]);
      launch();
    }
    for (let count = 0; count < 4; count++) {
      doc.crud.undoManager.redo();
      state.assertView(plan.texts[++current]);
      launch();
    }
    const caret = Math.min(17, plan.texts[current].length);
    block.setInlineRange(caret);
    flights.push(block.runtime.renderCode());
    const before = state.completed;
    const lastExplicitRequest = state.requested;
    await Promise.all(flights);
    return {current, caret, before, lastExplicitRequest};
  }, scenario);
  // Also drain the ordinary 200ms debounce after the explicitly overlapped work.
  await expect.poll(() => page.evaluate(() => (window as any).__codeStressTest.requested))
    .toBeGreaterThan(result.lastExplicitRequest);
  await waitForStable(page, scenario.texts[result.current], result.caret, result.before);
  await expectFullHighlight(page);
  expect(errors).toEqual([]);
});

test('5000 code lines retain text, syntax and selection throughout a long history', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', '大型序列由 Chromium 承担；1000 行完整覆盖三个浏览器。');
  test.setTimeout(180_000);
  const scenario = createScenario(createSource(5000), 24, 0x50005eed);
  await initialize(page, scenario.texts[0]);
  const errors = captureErrors(page);
  await exerciseHistory(page, scenario);
  expect(errors).toEqual([]);
});
