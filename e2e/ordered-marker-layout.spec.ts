import {expect, test} from '@playwright/test';

test('ordered markers align to the first line and use Chinese paired parentheses', async ({page}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await expect(page.locator('block-craft-editor .ordered-block').first()).toBeVisible();
  const ids = await page.locator('block-craft-editor').evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const snapshots = [0.75, 1, 1.5].flatMap(pfs => [1.2, 1.5, 2].map(lh =>
      doc.schemas.createSnapshot('ordered', ['先稳定架构，再重构复杂交互。'.repeat(12), {ms: 'o1', pfs, lh}]),
    ));
    snapshots.push(doc.schemas.createSnapshot('ordered', ['中文双括号', {ms: 'n3'}]));
    snapshots.push(doc.schemas.createSnapshot('ordered', ['普通编号', {ms: 'n1'}]));
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots);
    await doc.navigateToBlock(snapshots[0].id);
    return snapshots.map((snapshot: any) => snapshot.id) as string[];
  });

  for (const surface of ['block-craft-editor', 'bc-snapshot-viewer']) {
    if (surface === 'bc-snapshot-viewer') {
      // Capture before switching tabs destroys the playground's editor instance.
      await page.locator('playground-home').evaluate(app => {
        (window as any).ng.getComponent(app).syncSnapshotViewerFromEditor();
      });
    }
    for (const id of ids.slice(0, 9)) {
      const block = page.locator(`${surface} [data-block-id="${id}"]`);
      await expect(block).toBeAttached();
      const geometry = await block.evaluate(element => {
        const prefix = element.querySelector('.ordered-block-prefix')!;
        const text = element.querySelector('.edit-container')!;
        const markerRect = prefix.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
        return {
          centerError: Math.abs(markerRect.top + markerRect.height / 2 - textRect.top - lineHeight / 2),
          lines: textRect.height / lineHeight,
          circleError: Math.abs(markerRect.width - markerRect.height),
        };
      });
      expect(geometry.centerError).toBeLessThan(1);
      expect(geometry.lines).toBeGreaterThan(1);
      expect(geometry.circleError).toBeLessThan(1);
    }
    await expect(page.locator(`${surface} [data-block-id="${ids[9]}"] .ordered-block-prefix`)).toHaveText('（10）');
    await expect(page.locator(`${surface} [data-block-id="${ids[10]}"] .ordered-block-prefix`)).toHaveText('11.');
    await page.locator(`${surface} [data-block-id="${ids[4]}"]`).screenshot({path: testInfo.outputPath(`${surface}.png`)});
  }
});
