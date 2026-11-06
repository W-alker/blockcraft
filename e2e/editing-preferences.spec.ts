import {expect, test, type Page} from '@playwright/test';

async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  return page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const snapshot = doc.schemas.createSnapshot('paragraph', [[]]);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    doc.selection.setCursorAt(doc.getBlockById(snapshot.id), 0);
    return snapshot.id as string;
  });
}

test('personal colon preference preserves text and slash Emoji remains available', async ({page}) => {
  const id = await setup(page);
  await page.keyboard.type(':');
  await expect(page.locator('.cs-emoji-picker__panel')).toBeVisible();
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.plugins.find((plugin: any) => plugin.name === 'block-transformer').setColonEmojiEnabled(false);
  });
  await expect(page.locator('.cs-emoji-picker__panel')).toHaveCount(0);
  await page.keyboard.type(':abc');
  await expect(page.locator(`[data-block-id="${id}"]`)).toContainText('::abc');
  await expect(page.locator('.cs-emoji-picker__panel')).toHaveCount(0);
  await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const block = doc.getBlockById(id);
    block.deleteText(0, block.textLength);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    doc.selection.setCursorAt(block, 0);
  }, id);
  await page.keyboard.type('/');
  await expect(page.locator('block-transformer-contextmenu')).toBeVisible();
  await page.keyboard.type('emoji');
  await page.locator('block-transformer-contextmenu').getByRole('option', {name: /^emoji/i}).click();
  await expect(page.locator('.cs-emoji-picker__panel')).toBeVisible();
});

test('floating toolbar can close live while keyboard formatting still works', async ({page}) => {
  const id = await setup(page);
  await page.keyboard.type('toolbar preference');
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const block = doc.getBlockById(id);
    doc.selection.setSelection({blockId: id, type: 'text', index: 0, length: block.textLength});
  }, id);
  await expect(page.locator('.float-text-toolbar')).toBeVisible();
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.plugins.find((plugin: any) => plugin.name === 'float-text-toolbar').setEnabled(false);
  });
  await expect(page.locator('.float-text-toolbar')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+b');
  await expect.poll(() => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    return doc.getBlockById(id).textDeltas()[0]?.attributes?.['a:bold'];
  }, id)).toBe(true);
  await expect(page.locator('.float-text-toolbar')).toHaveCount(0);
});

test('fixed toolbar accepts a host mode and emits a user switch', async ({page}) => {
  await setup(page);
  await page.locator('bc-fixed-toolbar').evaluate(element => {
    const toolbar = (window as any).ng.getComponent(element);
    toolbar.toolbarMode = 'simple';
    toolbar.toolbarModeChange.subscribe((mode: string) => (window as any).changedToolbarMode = mode);
    (window as any).ng.applyChanges(toolbar);
  });
  const button = page.locator('bc-fixed-toolbar .toolbar-mode-switch');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await page.waitForFunction(() => {
    const toolbar = (window as any).ng.getComponent(document.querySelector('bc-fixed-toolbar'));
    return toolbar._layoutFitFrame === null;
  });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => (window as any).changedToolbarMode)).toBe('full');
});
