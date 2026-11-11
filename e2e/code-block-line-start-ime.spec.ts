import {expect, test, type Page} from '@playwright/test';

const firstLine = 'type EditorSurface = "flow" | "grid" | "nested-editor";';
const secondLine = 'const boot = async () => {}';
const candidates = ['z', 'zhong', 'zhongwen', 'zh'];
type Scenario = {name: string; source: string; language: string; within?: number; replace?: number};
const scenarios: Scenario[] = [
  {name: 'TypeScript 第二行行首', source: `${firstLine}\n${secondLine}`, language: 'TypeScript'},
  {name: 'Plain Text 第二行行首', source: `${firstLine}\n${secondLine}`, language: 'Plain Text'},
  {name: '替换第二行前三字', source: `${firstLine}\n${secondLine}`, language: 'TypeScript', replace: 3},
  {name: '中间空行', source: `${firstLine}\n\n${secondLine}`, language: 'TypeScript'},
  {name: '末尾空行', source: `${firstLine}\n`, language: 'TypeScript'},
  {name: '第二行 offset 3 对照', source: `${firstLine}\n${secondLine}`, language: 'TypeScript', within: 3},
];
const errorsByPage = new WeakMap<Page, string[]>();

async function initialize(page: Page, scenario: Scenario): Promise<void> {
  await page.route('https://affine-worker.toeverything.workers.dev/api/worker/link-preview', route =>
    route.fulfill({status: 200, contentType: 'application/json', body: '{}', headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    }}));
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('div.code-block pre.edit-container c-text').first()).toBeVisible();
  await page.locator('block-craft-editor').evaluate(async (editor, scenario) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot('code', [scenario.source]);
    snapshot.props.lang = scenario.language;
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    const otherCount = doc.model.getChildrenIds(doc.rootId).length - 1;
    if (otherCount) doc.crud.deleteBlocks(doc.rootId, 1, otherCount);
    await doc.navigateToBlock(id);
    const block = doc.getBlockById(id);
    await block.runtime.renderCode();
    await block.runtime.renderCode();
    const rows = Array.from(block.containerElement.querySelectorAll(':scope > c-line')) as HTMLElement[];
    const offset = scenario.source.indexOf('\n') + 1 + (scenario.within ?? 0);
    (window as any).__lineStartIme = {doc, block, rows, offset, checkpoints: [],
      previousHTML: rows[0].innerHTML, previousLeaves: Array.from(rows[0].children)};
    block.setInlineRange(offset, scenario.replace ?? 0);
    doc.root.hostElement.focus({preventScroll: true});
    doc.crud.undoManager.clearHistory();
  }, scenario);
  await expectSettled(page, scenario.source, firstLine.length + 1 + (scenario.within ?? 0), scenario.replace ?? 0);
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const state = (window as any).__lineStartIme;
    const {doc, block} = state;
    const container: HTMLElement = block.containerElement;
    const rows = Array.from(container.querySelectorAll<HTMLElement>(':scope > c-line'));
    const native = getSelection();
    const modelOffset = (node: Node | null | undefined, offset: number | undefined) => {
      if (!node || !container.contains(node)) return null;
      try {return block.runtime.domPointToModel(node, offset ?? 0);} catch {return null;}
    };
    const bounds = (rect: DOMRect) => ({x: rect.x, y: rect.y, right: rect.right,
      bottom: rect.bottom, width: rect.width, height: rect.height});
    const focus = native?.focusNode?.nodeType === Node.ELEMENT_NODE
      ? native.focusNode as Element : native?.focusNode?.parentElement;
    const selection = doc.selection.value;
    return {
      model: block.textContent(),
      dom: Array.from(container.querySelectorAll('c-element:not([data-cursor-blot]) > c-text'))
        .map(node => node.textContent).join(''),
      phase: doc.inputManger.compositionSession.phase,
      insertionIndex: doc.inputManger.compositionSession.resolveInsertionPoint()?.index ?? null,
      cursorCount: container.querySelectorAll('[data-cursor-blot]').length,
      nativeAnchor: modelOffset(native?.anchorNode, native?.anchorOffset),
      nativeHead: modelOffset(native?.focusNode, native?.focusOffset),
      nativeCollapsed: native?.isCollapsed,
      nativeRow: rows.indexOf(focus?.closest('c-line') as HTMLElement),
      nativeRect: native?.rangeCount ? bounds(native.getRangeAt(0).getBoundingClientRect()) : null,
      selection: selection ? {start: selection.start.offset, end: selection.end.offset,
        collapsed: selection.collapsed} : null,
      previousHTMLUnchanged: rows[0]?.innerHTML === state.previousHTML,
      previousLeavesUnchanged: state.previousLeaves.every((leaf: Element, index: number) => rows[0]?.children[index] === leaf),
      rows: rows.map((row, index) => ({
        // Fixtures contain neither marker: STR_ZERO_WIDTH_SPACE uses U+200C
        // on Safari and U+200B elsewhere. Neither is document/preedit text.
        text: row.textContent!.replace(/[\u200b\u200c]/g, ''),
        same: row === state.rows[index], rect: bounds(row.getBoundingClientRect()), html: row.outerHTML,
      })),
    };
  });
}

async function expectSettled(page: Page, text: string, offset: number, length = 0): Promise<void> {
  await expect.poll(async () => {
    const state = await readState(page);
    return {model: state.model, dom: state.dom, phase: state.phase, cursorCount: state.cursorCount,
      selection: state.selection, nativeAnchor: state.nativeAnchor, nativeHead: state.nativeHead,
      nativeCollapsed: state.nativeCollapsed};
  }).toEqual({model: text, dom: text, phase: 'idle', cursorCount: 0,
    selection: {start: offset, end: offset + length, collapsed: length === 0},
    nativeAnchor: offset, nativeHead: offset + length, nativeCollapsed: length === 0});
}

async function expectPreedit(page: Page, scenario: Scenario, candidate: string): Promise<void> {
  const offset = firstLine.length + 1 + (scenario.within ?? 0);
  const model = scenario.source.slice(0, offset) + scenario.source.slice(offset + (scenario.replace ?? 0));
  const visible = model.slice(0, offset) + candidate + model.slice(offset);
  const expectedRows = visible.split('\n').map((line, index, rows) => line + (index < rows.length - 1 ? '\n' : ''));
  const state = await readState(page);
  await page.evaluate(checkpoint => (window as any).__lineStartIme.checkpoints.push(checkpoint), {candidate, ...state});
  expect(state.model).toBe(model);
  expect(state.phase).toBe('active');
  expect(state.insertionIndex).toBe(offset);
  expect(state.rows.map(row => row.text)).toEqual(expectedRows);
  expect(state.rows.every(row => row.same)).toBe(true);
  expect(state.previousHTMLUnchanged).toBe(true);
  expect(state.previousLeavesUnchanged).toBe(true);
  expect(state.cursorCount).toBe(scenario.within ? 0 : 1);
  expect(state.nativeRow).toBe(1);
  expect(state.nativeRect).not.toBeNull();
  const caret = state.nativeRect!;
  const row = state.rows[1].rect;
  expect(caret.height).toBeGreaterThan(0);
  expect(caret.y).toBeGreaterThanOrEqual(row.y - 1);
  expect(caret.bottom).toBeLessThanOrEqual(row.bottom + 1);
  expect(caret.x).toBeGreaterThanOrEqual(row.x - 1);
  expect(caret.right).toBeLessThanOrEqual(row.right + 1);
}

async function simulatedStart(page: Page, scenario: Scenario): Promise<void> {
  const result = await page.evaluate(() => {
    const state = (window as any).__lineStartIme;
    const {block} = state;
    block.containerElement.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}));
    const native = getSelection()!;
    state.simulated = {node: native.anchorNode, offset: native.anchorOffset,
      original: native.anchorNode?.textContent, previous: ''};
    const element = native.anchorNode?.parentElement;
    return {isText: native.anchorNode?.nodeType === Node.TEXT_NODE,
      hasCursor: !!element?.closest('[data-cursor-blot]'), offset: native.anchorOffset};
  });
  expect(result.isText).toBe(true);
  expect(result.hasCursor).toBe(!scenario.within);
  if (!scenario.within) expect(result.offset).toBe(1);
}

async function simulatedUpdate(page: Page, candidate: string): Promise<void> {
  // Synthetic events do not ask the OS/browser to edit. Mutate only the text
  // in the real session-owned CursorBlot (or offset-3 control text) to emulate
  // a native preedit update; the model is written only by compositionend.
  await page.evaluate(candidate => {
    const state = (window as any).__lineStartIme;
    const {block, simulated} = state;
    const node: Text = simulated.node;
    const offset: number = simulated.offset;
    block.containerElement.dispatchEvent(new CompositionEvent('compositionupdate', {bubbles: true, data: candidate}));
    const event = new InputEvent('beforeinput', {bubbles: true, cancelable: true,
      inputType: 'insertCompositionText', data: candidate, isComposing: true});
    Object.defineProperty(event, 'getTargetRanges', {value: () => [new StaticRange({
      startContainer: node, startOffset: offset, endContainer: node, endOffset: offset + simulated.previous.length,
    })]});
    block.containerElement.dispatchEvent(event);
    if (event.defaultPrevented) throw new Error('Simulated composition update was unexpectedly prevented');
    node.textContent = simulated.original.slice(0, offset) + candidate + simulated.original.slice(offset);
    getSelection()!.setBaseAndExtent(node, offset + candidate.length, node, offset + candidate.length);
    block.containerElement.dispatchEvent(new InputEvent('input', {bubbles: true,
      inputType: 'insertCompositionText', data: candidate, isComposing: true}));
    simulated.previous = candidate;
  }, candidate);
}

async function finishAndHistory(page: Page, scenario: Scenario, action: 'commit' | 'cancel'): Promise<void> {
  const offset = firstLine.length + 1 + (scenario.within ?? 0);
  const inserted = action === 'commit' ? '中文' : '';
  const text = scenario.source.slice(0, offset) + inserted + scenario.source.slice(offset + (scenario.replace ?? 0));
  await expectSettled(page, text, offset + inserted.length);
  const stable = await readState(page);
  expect(stable.rows.every(row => row.same)).toBe(true);
  expect(stable.previousHTMLUnchanged).toBe(true);
  expect(stable.previousLeavesUnchanged).toBe(true);
  if (action === 'cancel' && !scenario.replace) {
    // A cancelled collapsed composition creates no history entry. Verify the
    // next actual input's undo caret is here, not a stale composition anchor.
    await page.keyboard.type('X');
    await expectSettled(page, text.slice(0, offset) + 'X' + text.slice(offset), offset + 1);
    await page.keyboard.press('ControlOrMeta+z');
    await expectSettled(page, scenario.source, offset);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expectSettled(page, text.slice(0, offset) + 'X' + text.slice(offset), offset + 1);
  } else {
    await page.keyboard.press('ControlOrMeta+z');
    await expectSettled(page, scenario.source, offset, scenario.replace ?? 0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expectSettled(page, text, offset + inserted.length);
  }
}

test.beforeEach(async ({page}) => {
  const errors: string[] = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(async ({page}, testInfo) => {
  const checkpoints = await page.evaluate(() => (window as any).__lineStartIme?.checkpoints).catch(() => undefined);
  if (checkpoints) await testInfo.attach('line-start-preedit.json', {
    body: Buffer.from(JSON.stringify(checkpoints, null, 2)), contentType: 'application/json',
  });
  expect(errorsByPage.get(page) ?? []).toEqual([]);
});

for (const scenario of scenarios) {
  for (const action of ['commit', 'cancel'] as const) {
    test(`原生 CDP 预编辑：${scenario.name} / ${action}`, async ({page, browserName}) => {
      test.skip(browserName !== 'chromium', '原生 CDP IME 仅 Chromium 可用');
      await initialize(page, scenario);
      const cdp = await page.context().newCDPSession(page);
      try {
        for (const candidate of candidates) {
          await cdp.send('Input.imeSetComposition', {text: candidate,
            selectionStart: candidate.length, selectionEnd: candidate.length});
          await expectPreedit(page, scenario, candidate);
        }
        if (action === 'commit') await cdp.send('Input.insertText', {text: '中文'});
        else await cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
        await finishAndHistory(page, scenario, action);
      } finally {await cdp.detach();}
    });

    test(`模拟事件与正式 Cursor 租约（非原生 IME）：${scenario.name} / ${action}`, async ({page, browserName}) => {
      test.skip(browserName === 'chromium', 'Chromium 由原生 CDP 用例覆盖');
      await initialize(page, scenario);
      await simulatedStart(page, scenario);
      for (const candidate of candidates) {
        await simulatedUpdate(page, candidate);
        await expectPreedit(page, scenario, candidate);
      }
      await page.evaluate(action => {
        const {block} = (window as any).__lineStartIme;
        block.containerElement.dispatchEvent(new CompositionEvent('compositionend', {
          bubbles: true, data: action === 'commit' ? '中文' : '',
        }));
      }, action);
      await finishAndHistory(page, scenario, action);
    });
  }
}
