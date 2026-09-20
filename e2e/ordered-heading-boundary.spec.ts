import {expect, test} from '@playwright/test';

test('plain headings preserve continuation while ordered headings reset lower-level numbering', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('block-craft-editor .ordered-block').first()).toBeVisible();
  const ids = await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshots = [
      doc.schemas.createSnapshot('ordered', ['有序标题一', {heading: 2, ms: 'n1'}]),
      doc.schemas.createSnapshot('paragraph', ['普通一级标题', {heading: 1}]),
      doc.schemas.createSnapshot('ordered', ['有序标题二', {heading: 2, ms: 'n1'}]),
      doc.schemas.createSnapshot('ordered', ['有序一级标题', {heading: 1, ms: 'n1'}]),
      doc.schemas.createSnapshot('ordered', ['下级重新编号', {heading: 2, ms: 'n1'}]),
      doc.schemas.createSnapshot('paragraph', ['普通列表分隔']),
      doc.schemas.createSnapshot('ordered', ['普通列表一', {ms: 'n1'}]),
      doc.schemas.createSnapshot('paragraph', ['普通一级标题', {heading: 1}]),
      doc.schemas.createSnapshot('ordered', ['普通列表二', {ms: 'n1'}]),
    ];
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots);
    return snapshots.map((snapshot: any) => snapshot.id) as string[];
  });
  const marker = (index: number) => page.locator(
    `block-craft-editor [data-block-id="${ids[index]}"] .ordered-block-prefix`,
  );
  await expect(marker(0)).toHaveText('1.');
  await expect(marker(2)).toHaveText('2.');
  await expect(marker(4)).toHaveText('1.');
  await expect(marker(8)).toHaveText('1.');

  await marker(8).click();
  const continueItem = page.getByText('继续编号', {exact: true});
  await expect(continueItem).toBeVisible();
  // The popup is already in view; avoid scrolling the virtualized editor's anchor.
  const bounds = await continueItem.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await expect(marker(8)).toHaveText('2.');

  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    doc.crud.updateBlockProps(id, {start: 5});
  }, ids[6]);
  await expect(marker(6)).toHaveText('5.');
  await expect(marker(8)).toHaveText('6.');
});
