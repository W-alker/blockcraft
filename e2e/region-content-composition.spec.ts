import {writeFile} from 'node:fs/promises';
import {expect, test, type Browser, type BrowserContext, type Page, type TestInfo} from '@playwright/test';

type Snapshot = {id: string; flavour: string; props?: Record<string, unknown>; children: (Snapshot | {insert?: unknown; attributes?: Record<string, unknown>})[]};
type Evidence = {
  rootId: string; regionId: string; sharedTextId: string; tailTextId: string;
  sharedVector: number[]; sharedSnapshot: Snapshot; sharedBlocks: unknown;
  personal: {formatVersion: 1; regions: Record<string, {children: Snapshot[]}>};
  snapshot: Snapshot; selection: {anchor: {blockId: string; type: string; offset?: number; index?: number}; head: {blockId: string; type: string; offset?: number; index?: number}} | null;
  selectionSettled: boolean; nativeBlockId: string | null; focused: boolean; saved: string | null; initialized: boolean;
};
const fixture = 'bc-region-content-composition-test';
const origin = 'http://127.0.0.1:8081';

async function inspect(page: Page): Promise<Evidence> {
  return page.locator(fixture).evaluate(element => (window as any).ng.getComponent(element).inspect());
}
function text(snapshot: Snapshot): string {
  return snapshot.children.map(child => 'flavour' in child ? text(child as Snapshot)
    : typeof child.insert === 'string' ? child.insert : '').join('');
}
function personalText(state: Evidence): string {
  return state.personal.regions['notes'].children.map(text).join('\n');
}
function block(page: Page, id: string) { return page.locator(`${fixture} [data-block-id="${id}"]`); }
async function expectCaret(page: Page, id: string, offset?: number): Promise<void> {
  await expect.poll(async () => {
    const state = await inspect(page);
    return {native: state.nativeBlockId, point: state.selection?.head};
  }).toMatchObject({native: id, point: {blockId: id, ...(offset === undefined ? {} : {offset})}});
}
function findSnapshot(root: Snapshot, id: string): Snapshot | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    if ('flavour' in child) {
      const found = findSnapshot(child as Snapshot, id);
      if (found) return found;
    }
  }
  return undefined;
}
// Ordinary Doc has an existing 80 ms projection suppression window that can
// drop rapid native selection changes. These composition cases wait for that
// read-only settled diagnostic; they do not certify rapid consecutive navigation.
async function press(page: Page, key: string): Promise<void> {
  await expect.poll(async () => (await inspect(page)).selectionSettled).toBe(true);
  await page.keyboard.press(key);
}
async function focusEnd(page: Page, id: string): Promise<void> {
  await page.bringToFront();
  await block(page, id).locator('c-text').first().click();
  await expectCaret(page, id);
  await press(page, 'End');
  const snapshot = findSnapshot((await inspect(page)).snapshot, id);
  await expectCaret(page, id, snapshot ? text(snapshot).length : undefined);
}

async function openPair(browser: Browser, shell = 'render-unit') {
  const room = `composition-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const errors: string[] = [];
  try {
    // Serial first initialization avoids two clients independently seeding a room.
    for (const user of ['A', 'B']) {
      const context = await browser.newContext({baseURL: origin, viewport: {width: 1280, height: 800}});
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      page.on('pageerror', error => errors.push(`${user}: ${error.message}`));
      await page.goto(`/tests/region-content-composition?room=${room}&user=${user}&shell=${shell}`);
      await expect(page.locator('[role="status"]')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('[role="status"]')).toContainText('协同已连接');
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    return {a: pages[0], b: pages[1], errors, close: () => Promise.all(contexts.map(context => context.close()))};
  } catch (error) {
    await Promise.all(contexts.map(context => context.close()));
    throw error;
  }
}
async function attachEvidence(page: Page, info: TestInfo, name: string): Promise<void> {
  const jsonPath = info.outputPath(`${name}.json`);
  const screenshotPath = info.outputPath(`${name}.png`);
  await writeFile(jsonPath, JSON.stringify(await inspect(page), null, 2));
  await page.screenshot({path: screenshotPath});
  await info.attach(`${name}.json`, {path: jsonPath, contentType: 'application/json'});
  await info.attach(`${name}.png`, {path: screenshotPath, contentType: 'image/png'});
}

test('two users share only common content, keep personal JSON across reopen and reconnect', async ({browser}, info) => {
  test.setTimeout(90_000);
  const pair = await openPair(browser);
  const {a, b} = pair;
  try {
    const initialA = await inspect(a);
    const initialB = await inspect(b);
    expect(initialA.rootId).toBe(initialB.rootId);
    expect(personalText(initialA)).toBe('A 的记录');
    expect(personalText(initialB)).toBe('B 的记录');
    const privateId = initialA.personal.regions['notes'].children[0].id;
    await focusEnd(a, privateId);
    await a.keyboard.type(' private-A');
    await expect.poll(async () => personalText(await inspect(a))).toBe('A 的记录 private-A');
    expect((await inspect(a)).sharedVector).toEqual(initialA.sharedVector);
    expect((await inspect(b)).sharedVector).toEqual(initialB.sharedVector);
    expect(personalText(await inspect(b))).toBe('B 的记录');
    expect(JSON.stringify((await inspect(a)).sharedBlocks)).not.toContain('private-A');
    expect(JSON.stringify((await inspect(a)).sharedBlocks)).not.toContain(privateId);
    const privateBId = initialB.personal.regions['notes'].children[0].id;
    await focusEnd(b, privateBId);
    await b.keyboard.type(' private-B');
    await expect.poll(async () => personalText(await inspect(b))).toBe('B 的记录 private-B');
    expect((await inspect(b)).sharedVector).toEqual(initialB.sharedVector);
    expect(personalText(await inspect(a))).toBe('A 的记录 private-A');
    await b.getByRole('button', {name: '保存个人数据', exact: true}).click();

    await focusEnd(a, initialA.sharedTextId);
    await a.keyboard.type(' from-A');
    await expect(block(b, initialB.sharedTextId)).toContainText('共享正文 from-A');
    await focusEnd(b, initialB.tailTextId);
    await b.keyboard.type(' from-B');
    await expect(block(a, initialA.tailTextId)).toContainText('共享尾部 from-B');
    expect(personalText(await inspect(a))).toBe('A 的记录 private-A');
    expect(personalText(await inspect(b))).toBe('B 的记录 private-B');

    await a.getByRole('button', {name: '保存个人数据', exact: true}).click();
    await expect(a.locator('[role="status"]')).toHaveAttribute('data-saved-count', '1');
    const saved = (await inspect(a)).personal;
    await a.getByRole('button', {name: '重新打开', exact: true}).click();
    await expect(a.locator('[role="status"]')).toHaveAttribute('data-open-count', '2');
    expect((await inspect(a)).personal).toEqual(saved);
    await expect(block(a, privateId)).toContainText('A 的记录 private-A');

    await a.getByRole('button', {name: '断开协同', exact: true}).click();
    await expect(a.locator('[role="status"]')).toContainText('协同未连接');
    await a.getByRole('button', {name: '重新连接', exact: true}).click();
    await expect(a.locator('[role="status"]')).toContainText('协同已连接');
    await b.reload();
    await expect(b.locator('[role="status"]')).toHaveAttribute('data-ready', 'true');
    expect(personalText(await inspect(b))).toBe('B 的记录 private-B');
    expect(JSON.stringify((await inspect(b)).sharedBlocks)).not.toContain('private-A');
    await attachEvidence(a, info, 'user-a');
    await attachEvidence(b, info, 'user-b');
    expect(pair.errors).toEqual([]);
  } finally { await pair.close(); }
});

test('personal rich text supports native caret, multiline input, deletion, selection, slash and history', async ({browser}, info) => {
  test.setTimeout(90_000);
  const pair = await openPair(browser);
  const {a, b} = pair;
  try {
    const initial = await inspect(a);
    const firstId = initial.personal.regions['notes'].children[0].id;
    await focusEnd(a, firstId);
    await press(a, 'Enter');
    await a.keyboard.type('abcdef');
    await expect.poll(async () => personalText(await inspect(a))).toBe('A 的记录\nabcdef');
    const secondId = (await inspect(a)).personal.regions['notes'].children[1].id;
    await press(a, 'ArrowLeft');
    await press(a, 'Backspace');
    await press(a, 'Delete');
    await expect.poll(async () => personalText(await inspect(a))).toBe('A 的记录\nabcd');
    await press(a, 'ArrowUp');
    await expectCaret(a, firstId);
    await press(a, 'ArrowDown');
    await expectCaret(a, secondId);
    await press(a, 'Home');
    await expectCaret(a, secondId, 0);
    await press(a, 'ArrowRight');
    await expectCaret(a, secondId, 1);
    await press(a, 'Shift+ArrowRight');
    await expectCaret(a, secondId, 2);
    await press(a, 'Shift+ArrowRight');
    await expectCaret(a, secondId, 3);
    await a.keyboard.type('XY');
    await expect.poll(async () => personalText(await inspect(a))).toBe('A 的记录\naXYd');
    expect((await inspect(a)).nativeBlockId).toBe(secondId);

    // Formatting and replacement use the same visible keyboard path as normal editing.
    await press(a, 'Home');
    await expectCaret(a, secondId, 0);
    await press(a, 'Shift+End');
    await expectCaret(a, secondId, 4);
    await press(a, 'ControlOrMeta+b');
    await press(a, 'ArrowRight');
    await expectCaret(a, secondId, 4);
    await press(a, 'End');
    await press(a, 'Enter');
    await a.keyboard.type('/');
    await expect(a.locator('block-transformer-contextmenu')).toBeVisible();
    await press(a, 'Escape');
    await expect(a.locator('block-transformer-contextmenu')).toBeHidden();
    await press(a, 'Backspace');
    await a.keyboard.type('history');
    const edited = await inspect(a);
    expect(personalText(edited)).toContain('history');
    await press(a, 'ControlOrMeta+z');
    await expect.poll(async () => personalText(await inspect(a))).not.toContain('history');
    await press(a, 'ControlOrMeta+Shift+z');
    await expect.poll(async () => personalText(await inspect(a))).toContain('history');
    expect((await inspect(a)).sharedVector).toEqual(initial.sharedVector);
    expect(personalText(await inspect(b))).toBe('B 的记录');

    await a.getByRole('button', {name: '保存个人数据', exact: true}).click();
    const beforeReopen = (await inspect(a)).personal;
    await a.getByRole('button', {name: '重新打开', exact: true}).click();
    expect((await inspect(a)).personal).toEqual(beforeReopen);
    expect(JSON.stringify(beforeReopen)).toContain('bold');
    await attachEvidence(a, info, 'personal-rich-text');
    expect(pair.errors).toEqual([]);
  } finally { await pair.close(); }
});

test('a visible whole-document selection cannot partially delete across a personal boundary', async ({browser}, info) => {
  const pair = await openPair(browser);
  const {a} = pair;
  try {
    const initial = await inspect(a);
    await focusEnd(a, initial.sharedTextId);
    await press(a, 'ControlOrMeta+a');
    await expect.poll(async () => (await inspect(a)).selection).toMatchObject({
      anchor: {blockId: initial.sharedTextId, type: 'text', offset: 0},
      head: {blockId: initial.sharedTextId, type: 'text', offset: 4},
    });
    await press(a, 'ControlOrMeta+a');
    await expect.poll(async () => (await inspect(a)).selection).toMatchObject({
      anchor: {blockId: initial.rootId, type: 'boundary', index: 0},
      head: {blockId: initial.rootId, type: 'boundary', index: 3},
    });
    await press(a, 'Backspace');
    expect((await inspect(a)).snapshot).toEqual(initial.snapshot);
    expect((await inspect(a)).sharedVector).toEqual(initial.sharedVector);
    expect((await inspect(a)).personal).toEqual(initial.personal);
    await attachEvidence(a, info, 'cross-boundary-rejected');
    // A rejected edit may surface a controlled error; it must not corrupt either source.
    expect(pair.errors.filter(error => !/scope|boundary|跨|区域|composition/i.test(error))).toEqual([]);
  } finally { await pair.close(); }
});


test('text-box personal auto-fit stays local and survives JSON reopen', async ({browser}, info) => {
  const pair = await openPair(browser, 'text-box');
  const {a, b} = pair;
  try {
    const initial = await inspect(a);
    const privateId = initial.personal.regions['notes'].children[0].id;
    const initialHeight = (await block(a, initial.regionId).boundingBox())!.height;
    await focusEnd(a, privateId);
    for (const line of ['line one', 'line two', 'line three', 'line four', 'line five']) {
      await press(a, 'End');
      await press(a, 'Enter');
      await a.keyboard.type(line);
    }
    await expect.poll(async () => (await block(a, initial.regionId).boundingBox())!.height).toBeGreaterThan(initialHeight);
    expect((await inspect(a)).sharedVector).toEqual(initial.sharedVector);
    expect(personalText(await inspect(b))).toBe('B 的记录');
    expect(JSON.stringify((await inspect(b)).sharedBlocks)).not.toContain('line five');
    await a.getByRole('button', {name: '保存个人数据', exact: true}).click();
    const saved = (await inspect(a)).personal;
    await a.getByRole('button', {name: '重新打开', exact: true}).click();
    expect((await inspect(a)).personal).toEqual(saved);
    await expect.poll(async () => (await block(a, initial.regionId).boundingBox())!.height).toBeGreaterThan(initialHeight);
    expect((await inspect(a)).sharedVector).toEqual(initial.sharedVector);
    await attachEvidence(a, info, 'personal-text-box');
    expect(pair.errors).toEqual([]);
  } finally { await pair.close(); }
});
