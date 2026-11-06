import {expect, test, type Page} from '@playwright/test';

type Flavour = 'code' | 'paragraph' | 'mermaid';
const start = 6;
const end = 28;
const toolbarSelector = '.text-marker-toolbar, .float-text-toolbar';
const errorsByPage = new WeakMap<Page, string[]>();

async function initialize(page: Page, flavour: Flavour): Promise<string> {
  // The initial demo starts an unrelated bookmark request before its blocks
  // are removed. Isolate that exact endpoint, keeping pageerror checks intact.
  await page.route('https://affine-worker.toeverything.workers.dev/api/worker/link-preview', route =>
    route.fulfill({status: 200, contentType: 'application/json', body: '{}', headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    }}));
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('div.code-block pre.edit-container c-text').first()).toBeVisible();
  const source = flavour === 'mermaid'
    ? 'graph TD\nAlpha[First] --> Beta[Second]\nBeta --> Gamma[Third]'
    : 'const alpha = 1;\nconst beta = 2;\nconst gamma = 3;';
  await page.locator('block-craft-editor').evaluate(async (editor, args) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshot = args.flavour === 'mermaid'
      ? doc.schemas.createSnapshot('mermaid', ['text', args.source])
      : doc.schemas.createSnapshot(args.flavour, [args.source]);
    if (args.flavour === 'code') snapshot.props.lang = 'TypeScript';
    const [rootId] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    const otherCount = doc.model.getChildrenIds(doc.rootId).length - 1;
    if (otherCount) doc.crud.deleteBlocks(doc.rootId, 1, otherCount);
    const id = args.flavour === 'mermaid' ? doc.model.getChildrenIds(rootId)[0] : rootId;
    await doc.navigateToBlock(id);
    const block = doc.getBlockById(id);
    if (typeof block.runtime.renderCode === 'function') {
      await block.runtime.renderCode();
      await block.runtime.renderCode();
    }
    const events: unknown[] = [];
    const summarizeSelection = () => ({collapsed: doc.selection.value?.collapsed,
      selection: doc.selection.value?.toJSON(),
      markers: document.querySelectorAll('.text-marker-toolbar').length,
      rich: document.querySelectorAll('.float-text-toolbar').length});
    for (const name of ['text-marker-toolbar', 'float-text-toolbar']) {
      const plugin = doc.config.plugins.find((candidate: any) => candidate.name === name);
      for (const method of ['openToolbar', 'closeToolbar']) {
        const original = plugin[method];
        plugin[method] = function(...values: unknown[]) {
          const result = original.apply(this, values);
          events.push({event: `${name}.${method}`, ...summarizeSelection()});
          return result;
        };
      }
    }
    doc.selection.changeObserve().subscribe(() => events.push({event: 'selection', ...summarizeSelection()}));
    (window as any).__toolbarLifecycle = {doc, block, events};
    doc.crud.undoManager.clearHistory();
  }, {flavour, source});
  await expectContent(page, source);
  return source;
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const state = (window as any).__toolbarLifecycle;
    const {doc, block} = state;
    const native = getSelection();
    const offset = (node: Node | null | undefined, value: number | undefined) => {
      if (!node || !block.containerElement.contains(node)) return null;
      return block.runtime.domPointToModel(node, value ?? 0);
    };
    return {
      model: block.textContent(),
      dom: Array.from(block.containerElement.querySelectorAll('c-element:not([data-cursor-blot]) > c-text'))
        .map((node: any) => node.textContent).join(''),
      phase: doc.inputManger.compositionSession.phase,
      collapsed: doc.selection.value?.collapsed,
      start: doc.selection.value?.start.offset,
      end: doc.selection.value?.end.offset,
      nativeCollapsed: native?.isCollapsed,
      nativeAnchor: offset(native?.anchorNode, native?.anchorOffset),
      nativeHead: offset(native?.focusNode, native?.focusOffset),
      markerCount: document.querySelectorAll('.text-marker-toolbar').length,
      richCount: document.querySelectorAll('.float-text-toolbar').length,
      backdrops: document.querySelectorAll('.cdk-overlay-backdrop').length,
      events: state.events,
    };
  });
}

async function expectContent(page: Page, text: string): Promise<void> {
  await expect.poll(async () => {
    const state = await readState(page);
    return {model: state.model, dom: state.dom, phase: state.phase};
  }).toEqual({model: text, dom: text, phase: 'idle'});
}

async function selectWithMouse(page: Page): Promise<void> {
  const points = await page.evaluate(({start, end}) => {
    const {doc, block} = (window as any).__toolbarLifecycle;
    doc.root.hostElement.focus({preventScroll: true});
    const point = (offset: number) => {
      const p = block.runtime.modelPointToDom(offset);
      const range = document.createRange();
      range.setStart(p.node, p.offset);
      range.collapse(true);
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      return {x: rect.x + 0.5, y: rect.y + rect.height / 2};
    };
    return [point(start), point(end)];
  }, {start, end});
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, {steps: 10});
  await page.mouse.up();
  await expect.poll(async () => {
    const state = await readState(page);
    return {start: state.start, end: state.end, anchor: state.nativeAnchor, head: state.nativeHead};
  }).toEqual({start, end, anchor: start, head: end});
  await expect(page.locator(toolbarSelector)).toHaveCount(1);
  await expect(page.locator(toolbarSelector)).toBeVisible();
}

async function expectCollapsedWithoutToolbar(page: Page): Promise<void> {
  await expect.poll(async () => {
    const state = await readState(page);
    return {model: state.collapsed, native: state.nativeCollapsed};
  }).toEqual({model: true, native: true});
  await expect(page.locator(toolbarSelector)).toHaveCount(0);
  await expect(page.locator('.cdk-overlay-pane').filter({has: page.locator(toolbarSelector)})).toHaveCount(0);
  await expect(page.locator('.cdk-overlay-backdrop')).toHaveCount(0);
}

async function historyRoundTrip(page: Page, source: string, edited: string): Promise<void> {
  for (let round = 0; round < 2; round++) {
    // Real keyup/selectEnd is essential: calling undoManager.undo() directly
    // misses the duplicate-marker regression after a restored range.
    await page.keyboard.press('ControlOrMeta+z');
    await expectContent(page, source);
    await expect.poll(async () => {
      const state = await readState(page);
      return {start: state.start, end: state.end, anchor: state.nativeAnchor, head: state.nativeHead};
    }).toEqual({start, end, anchor: start, head: end});
    await expect(page.locator(toolbarSelector)).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expectContent(page, edited);
    await expectCollapsedWithoutToolbar(page);
  }
}

test.beforeEach(async ({page}) => {
  const errors: string[] = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(async ({page}, testInfo) => {
  try {
    await testInfo.attach('toolbar-lifecycle.json', {body: JSON.stringify(await readState(page), null, 2), contentType: 'application/json'});
  } catch {
    // Initialization failures already retain the Playwright trace.
  }
  expect(errorsByPage.get(page)).toEqual([]);
});

for (const flavour of ['code', 'paragraph', 'mermaid'] as const) {
  test(`${flavour} closes the selection toolbar after deletion and keeps keyboard history singleton`, async ({page}) => {
    const source = await initialize(page, flavour);
    await selectWithMouse(page);
    const originalToolbar = await page.locator(toolbarSelector).elementHandle();
    await page.keyboard.press('Backspace');
    const edited = source.slice(0, start) + source.slice(end);
    await expectContent(page, edited);
    await expectCollapsedWithoutToolbar(page);
    expect(await originalToolbar!.evaluate(element => element.isConnected)).toBe(false);
    await historyRoundTrip(page, source, edited);
  });

  for (const cancel of [false, true]) {
    test(`${flavour} closes the toolbar during simulated IME ${cancel ? 'cancel' : 'commit'} and keyboard history`, async ({page}) => {
      const source = await initialize(page, flavour);
      await selectWithMouse(page);
      await page.evaluate(() => {
        const {block} = (window as any).__toolbarLifecycle;
        block.containerElement.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, cancelable: true}));
      });
      await expect.poll(async () => (await readState(page)).phase).toBe('active');
      await expect(page.locator(toolbarSelector)).toHaveCount(0);
      await page.evaluate(data => {
        const {block} = (window as any).__toolbarLifecycle;
        block.containerElement.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, cancelable: true, data}));
      }, cancel ? '' : '中文');
      // Replacing a selected range deletes it at compositionstart; cancellation
      // preserves that existing editor behavior and inserts no candidate text.
      const edited = source.slice(0, start) + (cancel ? '' : '中文') + source.slice(end);
      await expectContent(page, edited);
      await expectCollapsedWithoutToolbar(page);
      await historyRoundTrip(page, source, edited);
    });
  }
}

for (const cancel of [false, true]) {
  test(`code closes the toolbar for native Chromium IME ${cancel ? 'cancel' : 'commit'}`, async ({page, context, browserName}) => {
    test.skip(browserName !== 'chromium', 'Native CDP IME is Chromium-only; simulated events cover all engines');
    const source = await initialize(page, 'code');
    await selectWithMouse(page);
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.imeSetComposition', {text: 'zhongwen', selectionStart: 8, selectionEnd: 8});
      await expect.poll(async () => (await readState(page)).phase).toBe('active');
      await expect(page.locator(toolbarSelector)).toHaveCount(0);
      if (cancel) await cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
      else await cdp.send('Input.insertText', {text: '中文'});
      const edited = source.slice(0, start) + (cancel ? '' : '中文') + source.slice(end);
      await expectContent(page, edited);
      await expectCollapsedWithoutToolbar(page);
      await historyRoundTrip(page, source, edited);
    } finally {
      await cdp.detach();
    }
  });
}

test('code keeps one marker while keyboard selection repeatedly emits selectEnd', async ({page}) => {
  await initialize(page, 'code');
  await selectWithMouse(page);
  for (const key of ['Shift+ArrowRight', 'Shift+ArrowLeft', 'Shift+ArrowRight']) {
    await page.keyboard.press(key);
    await expect(page.locator('.text-marker-toolbar')).toHaveCount(1);
    await expect(page.locator('.cdk-overlay-backdrop')).toHaveCount(1);
  }
});

for (const flavour of ['code', 'mermaid'] as const) {
  test(`${flavour} retains the same marker while applying and clearing colors on the same range`, async ({page}) => {
    const source = await initialize(page, flavour);
    await selectWithMouse(page);
    const originalToolbar = await page.locator('.text-marker-toolbar').elementHandle();
    for (const color of ['#d93025', '#188038', null]) {
      // Exercise the color-picker output handler on its real mounted component;
      // formatting still goes through Block.formatText and Yjs transactions.
      await page.locator('.text-marker-toolbar').evaluate((element, color) => {
        (window as any).ng.getComponent(element).onColorPicked({type: 'color', color, group: 'custom'});
      }, color);
      await expectContent(page, source);
      await expect.poll(async () => page.evaluate(({start, end}) => {
        const {block} = (window as any).__toolbarLifecycle;
        const attrs: Array<string | null> = [];
        let offset = 0;
        for (const delta of block.yText.toDelta()) {
          for (let i = 0; i < delta.insert.length; i++, offset++) {
            if (offset >= start && offset < end) attrs.push(delta.attributes?.['s:color'] ?? null);
          }
        }
        return Array.from(new Set(attrs));
      }, {start, end})).toEqual([color]);
      await expect(page.locator('.text-marker-toolbar')).toHaveCount(1);
      expect(await originalToolbar!.evaluate(element => element.isConnected)).toBe(true);
      const selection = await readState(page);
      expect({start: selection.start, end: selection.end, collapsed: selection.collapsed})
        .toEqual({start, end, collapsed: false});
    }
  });
}
