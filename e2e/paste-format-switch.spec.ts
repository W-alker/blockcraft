import {expect, test} from '@playwright/test';

test('Markdown format switches replace every pasted line and preserve surrounding content', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('block-craft-editor .paragraph-block').first()).toBeVisible();
  const source = '**第一行**\n\n- 第二行\n- 最后一行';
  const ids = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshots = ['前文', '', '后文一', '后文二', '后文三'].map(text =>
      doc.schemas.createSnapshot('paragraph', [text]));
    doc.crud.insertBlocks(doc.rootId, 0, snapshots);
    const block = doc.getBlockById(snapshots[1].id);
    doc.selection.setCursorAt(block, 0);
    return snapshots.map((s: any) => s.id) as string[];
  });
  await page.locator(`[data-block-id="${ids[1]}"]`).evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true});
    // Firefox ignores ClipboardEventInit.clipboardData for synthetic events.
    Object.defineProperty(event, 'clipboardData', {value: data});
    element.dispatchEvent(event);
  }, source);
  const selector = page.locator('bc-paste-format-selector');
  await expect(selector).toBeVisible();
  const readTexts = () => page.locator('block-craft-editor').evaluate((editor, beforeId) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const children = doc.model.getChildrenIds(doc.rootId);
    const end = children.indexOf(beforeId);
    return children.slice(0, end).map((id: string) => doc.model.toSnapshot(id)).map((s: any) => ({
      flavour: s.flavour,
      text: s.children.map((d: any) => d.insert ?? '').join(''),
    }));
  }, ids[2]);
  const original = await readTexts();
  expect(original.map((b: any) => b.text)).toEqual(['前文', ...source.split('\n')]);
  const switchTo = async (label: string) => {
    const option = page.locator('.cdk-overlay-container').getByText(label, {exact: true}).last();
    if (!await option.isVisible()) await selector.locator('bc-float-toolbar-item').click();
    await option.click();
    await expect(selector).toContainText(label);
  };
  await switchTo('Markdown');
  const formatted = [
    {flavour: 'paragraph', text: '前文'},
    {flavour: 'paragraph', text: '第一行'},
    {flavour: 'bullet', text: '第二行'},
    {flavour: 'bullet', text: '最后一行'},
  ];
  await expect.poll(readTexts).toEqual(formatted);
  await expect(page.locator(`[data-block-id="${ids[2]}"]`)).toHaveText(/^[\u200b-\u200d\ufeff]*后文一$/);
  await expect(page.locator(`[data-block-id="${ids[3]}"]`)).toHaveText(/^[\u200b-\u200d\ufeff]*后文二$/);
  await expect(page.locator(`[data-block-id="${ids[4]}"]`)).toHaveText(/^[\u200b-\u200d\ufeff]*后文三$/);
  await switchTo('纯文本');
  await expect.poll(readTexts).toEqual(original);
  await switchTo('Markdown');
  await expect.poll(readTexts).toEqual(formatted);
  await page.locator('block-craft-editor').evaluate(editor => {
    (window as any).ng.getComponent(editor).doc.crud.undoManager.undo();
  });
  await expect.poll(readTexts).toEqual(original);
  await expect(page.locator(`[data-block-id="${ids[4]}"]`)).toHaveText(/^[\u200b-\u200d\ufeff]*后文三$/);
});
