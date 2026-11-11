import {expect, test, type Page} from '@playwright/test';

test.use({viewport: {width: 1800, height: 1000}});
async function start(page: Page, deltas: any[] = [{insert: 'AB'}]) {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  return page.locator('block-craft-editor').evaluate(async (editor, deltas) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const paragraph = doc.schemas.createSnapshot('paragraph', [deltas]);
    const target = doc.schemas.createSnapshot('paragraph', ['target']);
    const gap = Array.from({length: 3}, () => doc.schemas.createSnapshot('paragraph', ['']));
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph, ...gap, target]);
    await doc.navigateToBlock(paragraph.id);
    doc.crud.undoManager.clearHistory();
    return {id: paragraph.id as string, target: target.id as string};
  }, deltas);
}
async function range(page: Page, id: string, start: number, end = start) {
  await page.locator('block-craft-editor').evaluate((editor, r) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.selection.setSelection({blockId: r.id, type: 'text', offset: r.start}, {blockId: r.id, type: 'text', offset: r.end});
  }, {id, start, end});
}
const toolbar = (page: Page) => page.locator('bc-fixed-toolbar');
const dialog = (page: Page) => page.locator('bc-font-settings-dialog');
const weightField = (page: Page) => dialog(page).locator('[data-setting-field="font-weight"]');
async function open(page: Page) {
  await toolbar(page).getByRole('button', {name: '文本设置', exact: true}).click();
  await expect(dialog(page)).toBeVisible();
}
async function chooseWeight(page: Page, label: string) {
  await weightField(page).locator('cs-select').click();
  const option = page.getByRole('option', {name: label, exact: true});
  await option.click();
  await expect(option).toBeHidden();
}
async function confirm(page: Page) {
  await page.getByRole('button', {name: '确定', exact: true}).click();
  await expect(dialog(page)).toBeHidden();
}
async function read(page: Page, id: string) {
  return page.locator('block-craft-editor').evaluate((editor, id) => (window as any).ng.getComponent(editor).doc.model.getTextDeltas(id), id);
}
const text = (page: Page, id: string) => page.locator(`block-craft-editor [data-block-id="${id}"] c-text`);

test('numeric weight previews, cancels, undoes, copies and cooperates with bold and clear', async ({page}, testInfo) => {
  const {id, target} = await start(page);
  await range(page, id, 0, 2);
  await open(page);
  await chooseWeight(page, '半粗 600');
  await expect(dialog(page).locator('.bc-settings-preview > div')).toHaveCSS('font-weight', '600');
  await dialog(page).screenshot({path: testInfo.outputPath('font-weight.png'), animations: 'disabled'});
  await page.getByRole('button', {name: '取消', exact: true}).click();
  expect(await read(page, id)).toEqual([{insert: 'AB'}]);
  await open(page);
  await chooseWeight(page, '半粗 600');
  await confirm(page);
  await expect(text(page, id)).toHaveCSS('font-weight', '600');
  await expect(toolbar(page).getByRole('button', {name: '加粗', exact: true})).toHaveClass(/active/);
  await toolbar(page).getByRole('button', {name: '撤销', exact: true}).click();
  await expect.poll(() => read(page, id)).toEqual([{insert: 'AB'}]);
  await toolbar(page).getByRole('button', {name: '重做', exact: true}).click();
  await expect(text(page, id)).toHaveCSS('font-weight', '600');
  await range(page, id, 0, 2);
  await open(page);
  await expect(weightField(page)).toContainText('半粗 600');
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await toolbar(page).getByRole('button', {name: /^格式刷/}).click();
  await expect(toolbar(page).getByRole('button', {name: /^格式刷/})).toHaveClass(/active/);
  const targetBox = (await text(page, target).boundingBox())!;
  await page.mouse.move(targetBox.x + 1, targetBox.y + targetBox.height / 2);
  await page.mouse.down();
  // Move past the final glyph so browser-specific edge rounding still selects it.
  await page.mouse.move(targetBox.x + targetBox.width + 8, targetBox.y + targetBox.height / 2, {steps: 10});
  await page.mouse.up();
  await expect(text(page, target)).toHaveCSS('font-weight', '600');
  await range(page, target, 0, 6);
  await toolbar(page).getByRole('button', {name: '清除格式', exact: true}).click();
  await expect(text(page, target)).toHaveCSS('font-weight', '400');
  await range(page, id, 0, 2);
  await toolbar(page).getByRole('button', {name: '加粗', exact: true}).click();
  await expect(text(page, id)).toHaveCSS('font-weight', '400');
  await text(page, id).click();
  await range(page, id, 0, 2);
  await page.keyboard.press('ControlOrMeta+b');
  await expect(text(page, id)).toHaveCSS('font-weight', '700');
  expect((await read(page, id))[0].attributes?.['s:fontWeight']).toBeUndefined();
});

test('mixed weights remain untouched when another font field changes', async ({page}) => {
  const {id} = await start(page, [{insert: 'A', attributes: {'s:fontWeight': '500'}}, {insert: 'B', attributes: {'s:fontWeight': '800', 'a:bold': true}}]);
  await range(page, id, 0, 2);
  await open(page);
  await expect(weightField(page)).toContainText('多种字重');
  await dialog(page).locator('[data-setting-field="font-size"] input').fill('24');
  await dialog(page).locator('[data-setting-field="font-size"] input').press('Tab');
  await confirm(page);
  expect((await read(page, id)).map((d: any) => d.attributes?.['s:fontWeight'])).toEqual(['500', '800']);
  await range(page, id, 0, 2);
  await open(page);
  await chooseWeight(page, '常规 400');
  await confirm(page);
  await expect(text(page, id)).toHaveCSS('font-weight', '400');
  await open(page);
  await chooseWeight(page, '文档默认');
  await confirm(page);
  expect((await read(page, id))[0].attributes?.['s:fontWeight']).toBeUndefined();
});

test('caret weight continues across typing and survives snapshot save and reopen', async ({page}) => {
  const {id} = await start(page);
  await range(page, id, 2);
  await open(page);
  await chooseWeight(page, '中等 500');
  await confirm(page);
  expect(await read(page, id)).toEqual([{insert: 'AB'}]);
  await page.keyboard.type('X');
  await expect.poll(async () => (await read(page, id)).at(-1)?.attributes?.['s:fontWeight']).toBe('500');
  await expect(text(page, id).last()).toHaveCSS('font-weight', '500');
  await range(page, id, 0, 3);
  await open(page);
  await chooseWeight(page, '中等 500');
  await confirm(page);
  const snapshot = await page.locator('block-craft-editor').evaluate(editor => JSON.parse(JSON.stringify((window as any).ng.getComponent(editor).doc.exportSnapshot())));
  expect(snapshot.children.find((b: any) => b.id === id).props.textDefaults['s:fontWeight']).toBe('500');
  await page.reload();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc);
  await page.locator('block-craft-editor').evaluate(async (editor, snapshot) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const container = document.createElement('div');
    editor.appendChild(container);
    doc.initBySnapshot(snapshot, container);
    await doc.navigateToBlock(snapshot.children[0].id);
  }, snapshot);
  await expect(text(page, id)).toHaveCSS('font-weight', '500');
  await range(page, id, 3);
  await open(page);
  await expect(weightField(page)).toContainText('中等 500');
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await text(page, id).click();
  await range(page, id, 3);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Y');
  await expect.poll(() => page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    return doc.model.getTextDeltas(doc.selection.value.start.blockId);
  })).toEqual([{insert: 'Y', attributes: {'s:fontWeight': '500'}}]);
});
