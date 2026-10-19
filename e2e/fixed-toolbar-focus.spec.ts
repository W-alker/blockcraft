import {test, expect, type Page} from '@playwright/test';

test.use({viewport: {width: 2200, height: 1000}});

async function setup(page: Page, collapsed = false) {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  const id = await page.locator('block-craft-editor').evaluate(async el => {
    const doc = (window as any).ng.getComponent(el).doc;
    const paragraph = doc.schemas.createSnapshot('paragraph', ['abcdef']);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph]);
    await doc.navigateToBlock(paragraph.id);

    const tracker = {created: 0, destroyed: 0};
    (window as any).__fakeTracker = tracker;
    const create = doc.selection.createFakeRange.bind(doc.selection);
    doc.selection.createFakeRange = (...args: any[]) => {
      const fake = create(...args);
      tracker.created++;
      const destroy = fake.destroy.bind(fake);
      fake.destroy = () => {
        tracker.destroyed++;
        return destroy();
      };
      return fake;
    };
    return paragraph.id;
  });
  await page.locator('block-craft-editor').evaluate((el, {id, collapsed}) => {
    const doc = (window as any).ng.getComponent(el).doc;
    doc.selection.setSelection(
      {blockId: id, type: 'text', offset: 2},
      {blockId: id, type: 'text', offset: collapsed ? 2 : 4},
    );
  }, {id, collapsed});
  await expect(button(page, '文本设置')).toBeEnabled();
  return id;
}

const button = (page: Page, name: string) => page.locator('bc-fixed-toolbar').getByRole('button', {name, exact: true});

const ghosts = (page: Page) => page.locator('block-craft-editor .blockcraft-cursor');
async function expectReleased(page: Page, nativeText?: string) {
  await expect(ghosts(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const tracker = (window as any).__fakeTracker;
    return tracker.created - tracker.destroyed;
  })).toBe(0);
  if (nativeText !== undefined) {
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(nativeText);
    await expect.poll(() => page.locator('block-craft-editor').evaluate(el =>
      (window as any).ng.getComponent(el).doc.root.hostElement.contains(document.activeElement))).toBe(true);
  }
}
async function read(page: Page, id: string) {
  return page.locator('block-craft-editor').evaluate((el, id) =>
    (window as any).ng.getComponent(el).doc.model.getTextDeltas(id), id);
}

for (const kind of ['文本设置', '段落设置']) for (const action of ['取消', '确定', 'Escape']) {
  test(`${kind}: ${action} preserves the selected text without changes`, async ({page}) => {
    const id = await setup(page);
    await button(page, kind).click();
    const modal = page.locator(kind === '文本设置' ? 'bc-font-settings-dialog' : 'bc-paragraph-settings-dialog');
    await modal.locator('input').first().focus();
    await expect(ghosts(page)).toHaveCount(1);
    await expect(ghosts(page).locator('span').first()).toBeVisible();
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', {name: action, exact: true}).click();
    await expect(modal).toBeHidden();
    await expectReleased(page, 'cd');
    expect(await read(page, id)).toEqual([{insert: 'abcdef'}]);
  });
}

test('font settings resolves the original text after an intervening document edit', async ({page}) => {
  const id = await setup(page);
  await button(page, '文本设置').click();
  await page.locator('bc-font-settings-dialog [data-setting-field="font-size"] input').fill('24');
  await page.locator('block-craft-editor').evaluate((el, id) => {
    (window as any).ng.getComponent(el).doc.crud.applyTextDelta(id, [{insert: 'XX'}]);
  }, id);
  await page.getByRole('button', {name: '确定', exact: true}).click();
  await expect.poll(() => read(page, id)).toEqual([{insert: 'XXab'}, {insert: 'cd', attributes: {'t:px': 24}}, {insert: 'ef'}]);
  await expectReleased(page);
});

test('reversed native selection retains the dialog but a new range releases it', async ({page}) => {
  const id = await setup(page);
  await button(page, '文本设置').click();
  const modal = page.locator('bc-font-settings-dialog');
  const input = modal.locator('[data-setting-field="font-size"] input');
  await input.focus();
  await page.locator('block-craft-editor').evaluate((el, id) => {
    const doc = (window as any).ng.getComponent(el).doc;
    doc.selection.setSelection(
      {blockId: id, type: 'text', offset: 4},
      {blockId: id, type: 'text', offset: 2},
    );
  }, id);
  await input.focus();
  await expect(modal).toBeVisible();
  await expect(ghosts(page)).toHaveCount(1);
  await page.locator('block-craft-editor').evaluate((el, id) => {
    (window as any).ng.getComponent(el).doc.selection.setSelection({blockId: id, type: 'text', offset: 1});
  }, id);
  await expect(modal).toBeHidden();
  await expectReleased(page);
  await expect.poll(() => page.locator('block-craft-editor').evaluate(el =>
    (window as any).ng.getComponent(el).doc.selection.value?.start.offset)).toBe(1);
});

for (const kind of ['文字颜色', '背景颜色']) test(`${kind}: untouched HEX does not commit on Escape`, async ({page}) => {
  const id = await setup(page);
  await button(page, kind).click();
  const panel = page.locator('.toolbar-color-menu');
  await panel.getByRole('button', {name: '更多颜色', exact: true}).click();
  await panel.getByRole('textbox', {name: 'Hex', exact: true}).focus();
  await expect(ghosts(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expectReleased(page, 'cd');
  expect(await read(page, id)).toEqual([{insert: 'abcdef'}]);
});

test('editing colours and switching panels keeps the same range and one ghost', async ({page}) => {
  const id = await setup(page);
  await button(page, '文字颜色').click();
  const panel = page.locator('.toolbar-color-menu');
  await panel.getByRole('button', {name: '更多颜色', exact: true}).click();
  await panel.getByRole('textbox', {name: 'Hex', exact: true}).fill('123456');
  await button(page, '背景颜色').click();
  await expect.poll(async () => (await read(page, id))[1]?.attributes?.['s:color']).toBe('#123456');
  await expect(ghosts(page)).toHaveCount(1);
  await panel.getByRole('button', {name: '更多颜色', exact: true}).click();
  await panel.getByRole('textbox', {name: 'Hex', exact: true}).fill('FFEEDD');
  await panel.getByRole('textbox', {name: 'Hex', exact: true}).press('Enter');
  await page.keyboard.press('Escape');
  await expectReleased(page, 'cd');
  expect((await read(page, id))[1]).toEqual({insert: 'cd', attributes: {'s:color': '#123456', 's:background': '#FFEEDD'}});
});

for (const kind of ['链接', '行内公式']) test(`${kind}: collapsed caret has a ghost and releases it`, async ({page}) => {
  await setup(page, true);
  await button(page, kind).click();
  const input = kind === '链接' ? page.locator('link-input-pad').getByLabel('链接地址') : page.locator('.formula-toolbar').getByRole('textbox');
  await input.focus();
  await expect(ghosts(page)).toHaveCount(1);
  await expect(ghosts(page).locator('span').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expectReleased(page, '');
});

for (const reason of ['readonly', 'unmount']) test(`link releases its ghost on ${reason}`, async ({page}) => {
  await setup(page);
  await button(page, '链接').click();
  await expect(ghosts(page)).toHaveCount(1);
  await page.locator('block-craft-editor').evaluate((el, reason) => {
    const doc = (window as any).ng.getComponent(el).doc;
    if (reason === 'readonly') doc.readonlySwitch$.next(true);
    else doc.root.hostElement.remove();
  }, reason);
  await expect(page.locator('link-input-pad')).toBeHidden();
  await expectReleased(page);
});

test('colour outside click respects a new editor selection', async ({page}) => {
  const id = await setup(page);
  await button(page, '文字颜色').click();
  await page.locator('.toolbar-color-menu').getByRole('button', {name: '更多颜色', exact: true}).click();
  await page.locator('.toolbar-color-menu').getByRole('textbox', {name: 'Hex', exact: true}).focus();
  await page.locator(`[data-block-id="${id}"] c-text`).click({position: {x: 1, y: 3}});
  await expect(page.locator('.toolbar-color-menu')).toBeHidden();
  await expectReleased(page, '');
  expect(await read(page, id)).toEqual([{insert: 'abcdef'}]);
});

for (const reason of ['readonly', 'delete-source', 'unmount']) test(`font dialog releases on ${reason}`, async ({page}) => {
  const id = await setup(page);
  await button(page, '文本设置').click();
  await expect(ghosts(page)).toHaveCount(1);
  await page.locator('block-craft-editor').evaluate((el, {id, reason}) => {
    const doc = (window as any).ng.getComponent(el).doc;
    if (reason === 'readonly') doc.readonlySwitch$.next(true);
    else if (reason === 'unmount') doc.root.hostElement.remove();
    else doc.crud.deleteBlocks(doc.rootId, doc.model.getChildrenIds(doc.rootId).indexOf(id), 1);
  }, {id, reason});
  await expect(page.locator('bc-font-settings-dialog')).toBeHidden();
  await expectReleased(page);
});
