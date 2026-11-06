import {expect, test, type Page} from '@playwright/test';

test.use({viewport: {width: 1500, height: 1000}});

async function select(page: Page, id: string) {
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    doc.selection.selectBlock(id);
  }, id);
}

for (const flavour of ['date-card', 'weather', 'person-card']) {
  test(`${flavour} 层级入口改变实际叠放，支持撤销和正文层边界`, async ({page}) => {
    await page.routeWebSocket('**', socket => socket.close());
    await page.goto('/');
    await page.getByRole('button', {name: '初始化', exact: true}).click();
    const ids = await page.evaluate(async flavour => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      const insert = (kind: string) => {
        const snapshot = doc.schemas.createSnapshot(kind, kind === 'shape' ? ['rectangle'] : []);
        snapshot.props = {...snapshot.props, width: 220, height: 100};
        const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null, layer: 'over'});
        doc.crud.updateBlockProps(id, {position: '120 140'});
        return id as string;
      };
      const material = insert(flavour);
      const shape = insert('shape');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      doc.crud.undoManager.stopCapturing();
      doc.selection.selectBlock(material);
      return {material, shape};
    }, flavour);
    const toolbar = page.locator('bc-material-toolbar');
    const forward = toolbar.locator('[aria-label="上移一层"]');
    const backward = toolbar.locator('[aria-label="下移一层"]');
    const state = () => page.evaluate(({material, shape}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      const block = doc.getBlockById(material);
      const host = block.hostElement as HTMLElement;
      const rect = host.getBoundingClientRect();
      const painted = document.elementsFromPoint(rect.left + 40, rect.top + 35)
        .map(element => element.closest('[data-block-id]')?.getAttribute('data-block-id'))
        .find(id => id === material || id === shape);
      return {painted, layer: doc.placement.getObjectLayout(material),
        position: block.props.position, width: block.props.width, height: block.props.height};
    }, ids);
    await expect(toolbar).toBeVisible();
    const materialBox = (await page.locator(`[data-block-id="${ids.material}"]`).boundingBox())!;
    const toolbarBox = (await toolbar.locator('nav').boundingBox())!;
    expect(toolbarBox.y + toolbarBox.height <= materialBox.y || toolbarBox.y >= materialBox.y + materialBox.height).toBe(true);
    await expect.poll(async () => (await state()).painted).toBe(ids.shape);
    const original = await state();
    await forward.click();
    await expect.poll(async () => (await state()).painted).toBe(ids.material);
    await expect(forward).toBeDisabled();
    expect(await state()).toEqual({...original, painted: ids.material});
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo());
    await expect.poll(state).toEqual(original);
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo());
    await expect.poll(async () => (await state()).painted).toBe(ids.material);
    await select(page, ids.material);
    await backward.click();
    await expect.poll(async () => (await state()).painted).toBe(ids.shape);
    await backward.click();
    await expect.poll(async () => (await state()).layer).toBe('under');
    await expect(backward).toBeDisabled();
    await forward.focus();
    await forward.press('Enter');
    await expect.poll(async () => (await state()).layer).toBe('over');
    await page.screenshot({path: `/tmp/material-layer-${flavour}.png`});

    // 其他对象仍走自己的格式工具栏。
    await select(page, ids.shape);
    await expect(toolbar).toHaveCount(0);
    await expect(page.locator('bc-object-format-toolbar')).toBeVisible();
    await select(page, ids.material);
    await expect(toolbar).toBeVisible();
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true));
    await expect(toolbar).toHaveCount(0);
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(false));
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      doc.placement.setObjectLayout(id, 'top-bottom');
      doc.selection.selectBlock(id);
    }, ids.material);
    await expect(forward).toHaveCount(0);
    await toolbar.getByRole('button', {name: '浮于文字上方', exact: true}).click();
    await expect.poll(async () => (await state()).layer).toBe('over');
    await expect(forward).toBeVisible();
    await page.evaluate(({material, shape}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      doc.placement.setObjectLayout(material, 'over');
      doc.placement.group([material, shape]);
    }, ids);
    // 组合命令会异步选中组合整体，待该操作完成后再选择成员。
    await select(page, ids.material);
    await expect(forward).toHaveCount(0);
    await expect(toolbar.getByRole('button', {name: '浮于文字上方', exact: true})).toHaveCount(0);
    if (flavour === 'person-card') await expect(toolbar).toHaveCount(0);
    else await expect(toolbar.getByRole('button', {name: flavour === 'date-card' ? '日期设置' : '天气样式与配色', exact: true})).toBeVisible();
  });
}
