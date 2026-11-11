import { expect, test, type Page } from '@playwright/test';

const editorSelector = 'block-craft-editor';
const fatalPattern = /Block not found|Cannot read properties|virtualization(?:Reconcile|Fallback|FullMount)Error|unhandled|\bERROR\b/i;
const externalNoise = /figma\.com|juejin\.cn|zijieapi\.com|youtube\.com|unsplash\.com|Failed to fetch/i;

interface SimulatorState {
  phase: string;
  hasActiveComposition: boolean;
  pendingScenario: string | null;
  lastScenario: string | null;
  nextScenario: string;
  appliedCount: number;
  skippedCount: number;
  errorCount: number;
  message: string;
}

interface FixtureIds {
  firstId: string;
  secondId: string;
  thirdId: string;
  calloutId: string;
  calloutParagraphId: string;
}

interface NestedFixtureIds {
  columnsId: string;
  columnParagraphId: string;
  tableId: string;
  tableParagraphId: string;
}

async function initialize(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '初始化', exact: true }).click();
  await page.waitForFunction((selector) => {
    const editor = document.querySelector(selector);
    const debug = (window as unknown as {
      ng?: { getComponent: (target: Element) => { doc?: { isInitialized?: boolean } } };
    }).ng;
    return !!editor && debug?.getComponent(editor)?.doc?.isInitialized === true;
  }, editorSelector);
}

async function prepareFixture(page: Page): Promise<FixtureIds> {
  return page.evaluate((selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const first = doc.schemas.createSnapshot('paragraph', ['sim-alpha']);
    const second = doc.schemas.createSnapshot('paragraph', ['sim-beta']);
    const third = doc.schemas.createSnapshot('paragraph', ['sim-gamma']);
    const callout = doc.schemas.createSnapshot('callout', []);
    const calloutParagraph = callout.children[0];
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [first, second, third, callout]);
    doc.crud.undoManager.clearHistory();
    return {
      firstId: first.id,
      secondId: second.id,
      thirdId: third.id,
      calloutId: callout.id,
      calloutParagraphId: calloutParagraph.id,
    };
  }, editorSelector);
}

async function prepareNestedFixture(page: Page): Promise<NestedFixtureIds> {
  return page.evaluate((selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const columns = doc.schemas.createSnapshot('columns', [2]);
    const table = doc.schemas.createSnapshot('table', [2, 2]);
    const columnParagraph = columns.children[0].children[0];
    const tableParagraph = table.children[0].children[0].children[0];
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [columns, table]);
    doc.crud.undoManager.clearHistory();
    return {
      columnsId: columns.id,
      columnParagraphId: columnParagraph.id,
      tableId: table.id,
      tableParagraphId: tableParagraph.id,
    };
  }, editorSelector);
}

async function prepareVirtualParagraphFixture(page: Page, count = 80): Promise<string[]> {
  return page.evaluate(({ selector, paragraphCount }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const snapshots = Array.from({ length: paragraphCount }, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [`virtual-ime-${index}`]));
    const rootLength = (doc.model.getChildrenIds(doc.rootId) as string[]).length;
    doc.crud.insertBlockSnapshots(doc.rootId, rootLength, snapshots);
    doc.crud.undoManager.clearHistory();
    return snapshots.map((snapshot: { id: string }) => snapshot.id);
  }, { selector: editorSelector, paragraphCount: count });
}

async function setCaret(page: Page, blockId: string, offset: number): Promise<void> {
  await page.evaluate(async ({ selector, id, index }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    if (!doc.vm.get(id)) await doc.virtualization?.scrollToBlock?.(id, { align: 'nearest' });
    doc.selection.setCursorAt(doc.getBlockById(id), index);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { selector: editorSelector, id: blockId, index: offset });
}

async function dispatchComposition(
  page: Page,
  blockId: string,
  type: 'compositionstart' | 'compositionend',
  data = '',
): Promise<string> {
  return page.evaluate(({ selector, id, eventType, eventData }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const target = doc.model.exists(id)
      ? doc.getBlockById(id).containerElement
      : doc.root.hostElement;
    target.dispatchEvent(new CompositionEvent(eventType, {
      bubbles: true,
      cancelable: true,
      data: eventData,
    }));
    return doc.inputManger.compositionSession.phase;
  }, { selector: editorSelector, id: blockId, eventType: type, eventData: data });
}

async function simulatorState(page: Page): Promise<SimulatorState> {
  return page.evaluate(() => {
    const root = document.querySelector('bc-root')!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { imeRunnerState: SimulatorState } };
    }).ng;
    return { ...debug.getComponent(root).imeRunnerState };
  });
}

async function startSimulator(page: Page, auto: boolean, delayMs = 500): Promise<void> {
  await page.getByRole('button', { name: 'IME 竞态', exact: true }).click();
  const autoInput = page.locator('.sim-toggle input');
  if (auto) await autoInput.check({ force: true });
  else await autoInput.uncheck({ force: true });
  await page.locator('.sim-row input[type="range"]').last().evaluate((input, value) => {
    const range = input as HTMLInputElement;
    range.value = String(value);
    range.dispatchEvent(new Event('input', { bubbles: true }));
  }, delayMs);
  await page.getByRole('button', { name: '模拟协同', exact: true }).click();
  await expect.poll(() => simulatorState(page)).toMatchObject({ phase: 'ready' });
}

async function waitForCompositionCapture(page: Page): Promise<void> {
  await expect.poll(() => simulatorState(page)).toMatchObject({
    hasActiveComposition: true,
  });
}

async function runManualScenario(page: Page, label: string): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true });
  await expect(button).toBeEnabled();
  await button.dispatchEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerType: 'mouse',
    button: 0,
    isPrimary: true,
  });
}

async function inspectDocument(page: Page, ids: FixtureIds) {
  return page.evaluate(({ selector, fixture }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const children = doc.model.getChildrenIds(doc.rootId) as string[];
    const text = (id: string) => doc.model.exists(id) ? doc.model.getText(id) : null;
    return {
      children,
      firstText: text(fixture.firstId),
      secondText: text(fixture.secondId),
      thirdText: text(fixture.thirdId),
      calloutExists: doc.model.exists(fixture.calloutId),
      calloutParagraphExists: doc.model.exists(fixture.calloutParagraphId),
      sessionPhase: doc.inputManger.compositionSession.phase,
      insertedBeforeSecondText: text(children[children.indexOf(fixture.secondId) - 1] ?? ''),
    };
  }, { selector: editorSelector, fixture: ids });
}

test('manual IME race scenarios converge through the shadow document and clean up', async ({ page }) => {
  const fatalErrors: string[] = [];
  page.on('pageerror', error => {
    if (fatalPattern.test(error.message) && !externalNoise.test(error.message)) fatalErrors.push(error.message);
  });
  page.on('console', message => {
    const text = message.text();
    if (fatalPattern.test(text) && !externalNoise.test(text)) fatalErrors.push(text);
  });

  await initialize(page);
  const ids = await prepareFixture(page);
  await startSimulator(page, false);

  await setCaret(page, ids.firstId, 3);
  expect(await dispatchComposition(page, ids.firstId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '远端文本');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 1,
    lastScenario: 'remote-text-near-caret',
  });
  expect((await inspectDocument(page, ids)).firstText?.match(/R1/g)).toHaveLength(1);
  await dispatchComposition(page, ids.firstId, 'compositionend', '中');

  await setCaret(page, ids.secondId, 3);
  expect(await dispatchComposition(page, ids.secondId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '上方插入');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 2,
    lastScenario: 'insert-root-before',
  });
  expect((await inspectDocument(page, ids)).insertedBeforeSecondText).toBe('remote 2');
  await dispatchComposition(page, ids.secondId, 'compositionend', '插');

  await setCaret(page, ids.firstId, 2);
  expect(await dispatchComposition(page, ids.firstId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '移到末尾');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 3,
    lastScenario: 'move-root-to-end',
  });
  expect((await inspectDocument(page, ids)).children.at(-1)).toBe(ids.firstId);
  await dispatchComposition(page, ids.firstId, 'compositionend', '移');

  await setCaret(page, ids.calloutParagraphId, 0);
  expect(await dispatchComposition(page, ids.calloutParagraphId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '删除 scope');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 4,
    lastScenario: 'delete-selection-scope',
    hasActiveComposition: false,
  });
  expect(await inspectDocument(page, ids)).toMatchObject({
    calloutExists: false,
    calloutParagraphExists: false,
    sessionPhase: 'idle',
  });

  await page.getByRole('button', { name: '停止模拟', exact: true }).click();
  await expect.poll(() => simulatorState(page)).toMatchObject({
    phase: 'stopped',
    appliedCount: 4,
  });

  await setCaret(page, ids.secondId, 1);
  expect(await dispatchComposition(page, ids.secondId, 'compositionstart')).toBe('active');
  await page.waitForTimeout(650);
  expect(await simulatorState(page)).toMatchObject({ phase: 'stopped', appliedCount: 4 });
  await dispatchComposition(page, ids.secondId, 'compositionend', '停');
  expect(fatalErrors).toEqual([]);
});

test('automatic IME mode rotates exactly one deterministic scenario per composition', async ({ page }) => {
  await initialize(page);
  const ids = await prepareFixture(page);
  await startSimulator(page, true, 0);

  const expected = [
    'remote-text-near-caret',
    'insert-root-before',
    'move-root-to-end',
  ];
  for (let index = 0; index < expected.length; index += 1) {
    await setCaret(page, ids.thirdId, 2);
    expect(await dispatchComposition(page, ids.thirdId, 'compositionstart')).toBe('active');
    await expect.poll(() => simulatorState(page)).toMatchObject({
      appliedCount: index + 1,
      lastScenario: expected[index],
    });
    await page.waitForTimeout(80);
    expect((await simulatorState(page)).appliedCount).toBe(index + 1);
    await dispatchComposition(page, ids.thirdId, 'compositionend', String(index + 1));
  }

  await page.locator('.sim-row input[type="range"]').last().evaluate(input => {
    const range = input as HTMLInputElement;
    range.value = '500';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await setCaret(page, ids.thirdId, 1);
  expect(await dispatchComposition(page, ids.thirdId, 'compositionstart')).toBe('active');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    pendingScenario: 'remote-text-near-caret',
    hasActiveComposition: true,
  });
  await dispatchComposition(page, ids.thirdId, 'compositionend', '早');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 3,
    skippedCount: 1,
    lastScenario: 'remote-text-near-caret',
    nextScenario: 'insert-root-before',
  });
  await page.waitForTimeout(550);

  const finalState = await simulatorState(page);
  expect(finalState).toMatchObject({
    nextScenario: 'insert-root-before',
    appliedCount: 3,
    skippedCount: 1,
    errorCount: 0,
  });
  const documentState = await inspectDocument(page, ids);
  expect(documentState.thirdText).toContain('R1');
  expect(documentState.children.at(-1)).toBe(ids.thirdId);
  await page.getByRole('button', { name: '停止模拟', exact: true }).click();
});

test('native IME cancellation releases deferred root order before scrolling into a spacer', async ({ page }) => {
  const fatalErrors: string[] = [];
  page.on('pageerror', error => {
    if (fatalPattern.test(error.message) && !externalNoise.test(error.message)) fatalErrors.push(error.message);
  });
  page.on('console', message => {
    const text = message.text();
    if (fatalPattern.test(text) && !externalNoise.test(text)) fatalErrors.push(text);
  });

  await initialize(page);
  const ids = await prepareVirtualParagraphFixture(page);
  const targetId = ids[Math.floor(ids.length / 2)];
  await startSimulator(page, false);
  await setCaret(page, targetId, 2);
  expect(await dispatchComposition(page, targetId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '移到末尾');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 1,
    lastScenario: 'move-root-to-end',
  });

  await page.evaluate(({ selector, id }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    doc.getBlockById(id).containerElement.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: document.body,
    }));
  }, { selector: editorSelector, id: targetId });
  await page.waitForTimeout(20);

  const cancelledState = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    return {
      eventComposing: doc.event.status.isComposing,
      sessionPhase: doc.inputManger.compositionSession.phase,
      deferred: doc.vm.hasDeferredSparseRootOrder,
    };
  }, editorSelector);
  expect(cancelledState).toEqual({
    eventComposing: false,
    sessionPhase: 'active',
    deferred: true,
  });

  const viewportState = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const scrollContainer = doc.scrollContainer as HTMLElement;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    scrollContainer.dispatchEvent(new Event('scroll'));
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const viewport = scrollContainer.getBoundingClientRect();
    const rootContainer = doc.root.childrenRenderRef.containerElement as HTMLElement;
    const intersection = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top));
    };
    const rootChildren = Array.from(rootContainer.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement &&
      (element.dataset['blockId'] !== undefined || element.dataset['bcVirtualSpacer'] !== undefined));

    return {
      deferred: doc.vm.hasDeferredSparseRootOrder,
      visibleBlockPixels: rootChildren
        .filter(element => element.dataset['blockId'] !== undefined)
        .reduce((total, element) => total + intersection(element), 0),
      visibleSpacerPixels: rootChildren
        .filter(element => element.dataset['bcVirtualSpacer'] !== undefined)
        .reduce((total, element) => total + intersection(element), 0),
    };
  }, editorSelector);

  expect(viewportState.deferred).toBe(false);
  expect(viewportState.visibleBlockPixels).toBeGreaterThan(0);
  expect(viewportState.visibleSpacerPixels).toBeLessThanOrEqual(1);
  expect(fatalErrors).toEqual([]);
});

test('nested IME targets resolve direct-root units and nearest selection scopes', async ({ page }) => {
  const fatalErrors: string[] = [];
  page.on('pageerror', error => {
    if (fatalPattern.test(error.message) && !externalNoise.test(error.message)) fatalErrors.push(error.message);
  });
  page.on('console', message => {
    const text = message.text();
    if (fatalPattern.test(text) && !externalNoise.test(text)) fatalErrors.push(text);
  });

  await initialize(page);
  const ids = await prepareNestedFixture(page);
  await startSimulator(page, false);

  await setCaret(page, ids.tableParagraphId, 0);
  expect(await dispatchComposition(page, ids.tableParagraphId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '远端文本');
  await expect.poll(() => simulatorState(page)).toMatchObject({ appliedCount: 1 });
  const tableText = await page.evaluate(({ selector, id }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    return debug.getComponent(editor).doc.model.getText(id) as string;
  }, { selector: editorSelector, id: ids.tableParagraphId });
  expect(tableText).toBe('R1');
  await dispatchComposition(page, ids.tableParagraphId, 'compositionend', '表');

  await setCaret(page, ids.columnParagraphId, 0);
  expect(await dispatchComposition(page, ids.columnParagraphId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '上方插入');
  await expect.poll(() => simulatorState(page)).toMatchObject({ appliedCount: 2 });
  const beforeColumns = await page.evaluate(({ selector, id }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const children = doc.model.getChildrenIds(doc.rootId) as string[];
    const index = children.indexOf(id);
    return {
      predecessorText: doc.model.getText(children[index - 1]),
      parentId: doc.model.getParentId(id),
    };
  }, { selector: editorSelector, id: ids.columnsId });
  expect(beforeColumns).toEqual({ predecessorText: 'remote 2', parentId: expect.any(String) });
  await dispatchComposition(page, ids.columnParagraphId, 'compositionend', '栏');

  await setCaret(page, ids.columnParagraphId, 1);
  expect(await dispatchComposition(page, ids.columnParagraphId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '移到末尾');
  await expect.poll(() => simulatorState(page)).toMatchObject({ appliedCount: 3 });
  const lastRootId = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const doc = debug.getComponent(editor).doc;
    return (doc.model.getChildrenIds(doc.rootId) as string[]).at(-1);
  }, editorSelector);
  expect(lastRootId).toBe(ids.columnsId);
  await dispatchComposition(page, ids.columnParagraphId, 'compositionend', '移');

  await setCaret(page, ids.columnParagraphId, 1);
  expect(await dispatchComposition(page, ids.columnParagraphId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '删除 scope');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 4,
    hasActiveComposition: false,
  });
  const columnsExistence = await page.evaluate(({ selector, ids: blockIds }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const model = debug.getComponent(editor).doc.model;
    return blockIds.map((id: string) => model.exists(id));
  }, { selector: editorSelector, ids: [ids.columnsId, ids.columnParagraphId] });
  expect(columnsExistence).toEqual([false, false]);

  await setCaret(page, ids.tableParagraphId, 1);
  expect(await dispatchComposition(page, ids.tableParagraphId, 'compositionstart')).toBe('active');
  await waitForCompositionCapture(page);
  await runManualScenario(page, '删除 scope');
  await expect.poll(() => simulatorState(page)).toMatchObject({
    appliedCount: 5,
    hasActiveComposition: false,
  });
  const tableExistence = await page.evaluate(({ selector, ids: blockIds }) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: { getComponent: (target: Element) => { doc: any } };
    }).ng;
    const model = debug.getComponent(editor).doc.model;
    return blockIds.map((id: string) => model.exists(id));
  }, { selector: editorSelector, ids: [ids.tableId, ids.tableParagraphId] });
  expect(tableExistence).toEqual([false, false]);
  expect(fatalErrors).toEqual([]);
  await page.getByRole('button', { name: '停止模拟', exact: true }).click();
});
