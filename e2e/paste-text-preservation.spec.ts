import {expect, test} from '@playwright/test';

test('HTML paste preserves mixed wrapper, list and cell text in the model and DOM with one-step undo', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('block-craft-editor .paragraph-block').first()).toBeVisible();
  const [targetId, sentinelId] = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const blocks = ['前缀后缀', '原有后文'].map(text => doc.schemas.createSnapshot('paragraph', [text]));
    doc.crud.insertBlocks(doc.rootId, 0, blocks);
    doc.selection.setCursorAt(doc.getBlockById(blocks[0].id), 2);
    doc.crud.undoManager.clearHistory();
    return blocks.map((block: any) => block.id) as string[];
  });
  await page.locator(`[data-block-id="${targetId}"]`).evaluate(element => {
    const data = new DataTransfer();
    data.setData('text/html', '<article>开头<strong>加粗</strong>' +
      '<div style="display:flex"><p>中段</p><ul><li><span>父项</span><ul><li>子项</li></ul></li></ul><p>尾段</p></div>' +
      '<table><tr><td>格前<p>格中</p>格后</td></tr></table>' +
      '<p><a name="bookmark">锚点正文</a></p>结尾</article>');
    data.setData('text/plain', '开头加粗\n中段\n父项\n子项\n尾段\n格前\n格中\n格后\n锚点正文\n结尾');
    const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'clipboardData', {value: data});
    element.dispatchEvent(event);
  });

  const read = () => page.locator('block-craft-editor').evaluate((editor, endId) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const ids = doc.model.getChildrenIds(doc.rootId);
    const result: {id: string; flavour: string; text: string}[] = [];
    const collect = (block: any) => {
      if (block.nodeType === 'editable') result.push({
        id: block.id, flavour: block.flavour,
        text: block.children.map((delta: any) => typeof delta.insert === 'string' ? delta.insert : '').join(''),
      });
      else block.children.forEach(collect);
    };
    ids.slice(0, ids.indexOf(endId) + 1).forEach((id: string) => collect(doc.model.toSnapshot(id)));
    return result;
  }, sentinelId);
  const expected = ['前缀开头加粗', '中段', '父项', '子项', '尾段', '格前', '格中', '格后', '锚点正文', '结尾', '后缀', '原有后文'];
  await expect.poll(async () => (await read()).map(block => block.text)).toEqual(expected);
  const blocks = await read();
  expect(blocks.filter(block => block.flavour === 'bullet').map(block => block.text)).toEqual(['父项', '子项']);
  for (const block of blocks) {
    const element = page.locator(`[data-block-id="${block.id}"]`);
    await expect(element).toContainText(block.text);
  }
  await page.locator('block-craft-editor').evaluate(editor => {
    (window as any).ng.getComponent(editor).doc.crud.undoManager.undo();
  });
  await expect.poll(async () => (await read()).map(block => block.text)).toEqual(['前缀后缀', '原有后文']);
  await expect(page.locator(`[data-block-id="${targetId}"]`)).toContainText('前缀后缀');
  await expect(page.locator(`[data-block-id="${sentinelId}"]`)).toContainText('原有后文');
});
