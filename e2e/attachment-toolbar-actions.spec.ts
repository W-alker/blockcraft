import {expect, test} from '@playwright/test';

async function setup(page: import('@playwright/test').Page, embed = true) {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  await page.evaluate(embed => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const mount = document.createElement('section');
    mount.id = 'attachment-action-fixture';
    mount.style.cssText = 'position:fixed;inset:40px;overflow:auto;background:white;z-index:999;padding:120px 40px';
    document.body.append(mount);
    const schemas = new source.schemas.constructor(source.schemas.getSchemaList().filter((s: any) => embed || s.flavour !== 'embed'));
    const attachment = schemas.createSnapshot('attachment', [{name: 'report.pdf', url: 'https://example.com/report.pdf', type: 'application/pdf', size: 1024}]);
    const snapshot = schemas.createSnapshot('root', ['actions', [attachment]]);
    const Plugin = source.config.plugins.find((p: any) => p.name === 'attachment-extension').constructor;
    const actions: string[] = [];
    const plugin = new Plugin({onPreview: () => actions.push('preview'), extraItems: [
      {name: 'web', icon: 'bc_wangluo', label: '转为网页块', editOnly: true,
        visible: (_b: any, doc: any) => doc.schemas.has('embed'), onClick: () => actions.push('web')},
      {name: 'legacy', icon: 'bc_eye-open', label: '旧动作'},
    ], onExtraItemClick: (name: string) => {actions.push(name); return true;}});
    const doc = new source.constructor({...source.config, schemas, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [plugin], readonly: false, scrollContainer: mount, virtualization: {enabled: false}});
    doc.initBySnapshot(snapshot, mount); source.destroy();
    plugin.fileService = {downloadAttachment: () => actions.push('download')};
    (window as any).attachmentActionProbe = {doc, plugin, actions, block: doc.getBlockById(attachment.id)};
  }, embed);
}

for (const embed of [false, true]) {
  test(`附件动作按已注册网页块显示：${embed}`, async ({page}) => {
    await setup(page, embed);
    await page.locator('#attachment-action-fixture .attachment-block__name').hover();
    const toolbar = page.locator('.attachment-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByLabel('转为网页块', {exact: true})).toHaveCount(embed ? 1 : 0);
    if (embed) await toolbar.getByLabel('转为网页块', {exact: true}).click({delay: 120});
    await toolbar.getByLabel('旧动作', {exact: true}).click({delay: 120});
    expect(await page.evaluate(() => (window as any).attachmentActionProbe.actions)).toEqual(embed ? ['web', 'legacy'] : ['legacy']);
    await page.evaluate(() => (window as any).attachmentActionProbe.doc.toggleReadonly(true));
    await page.mouse.move(0, 0);
    await page.locator('#attachment-action-fixture .attachment-block__name').hover();
    await expect(toolbar.locator('[aria-label="转为网页块"], [name="delete"]')).toHaveCount(0);
    await expect(toolbar.getByLabel('旧动作', {exact: true})).toBeVisible();
  });
}

test('附件上传完成原位刷新工具栏且不抢选区', async ({page}) => {
  await setup(page);
  await page.evaluate(() => {
    const p = (window as any).attachmentActionProbe;
    p.block.updateProps({url: 'blob:uploading'});
    p.selection = p.doc.selection.value;
  });
  await page.locator('#attachment-action-fixture .attachment-block__name').hover();
  const toolbar = page.locator('.attachment-toolbar');
  await expect(toolbar.locator('[name="delete"]')).toBeVisible();
  await expect(toolbar.locator('[name="preview"], [aria-label="转为网页块"]')).toHaveCount(0);
  await page.evaluate(() => {
    const p = (window as any).attachmentActionProbe;
    p.toolbar = document.querySelector('.attachment-toolbar');
    p.block.updateProps({url: 'https://example.com/complete.pdf'});
  });
  await expect(toolbar.locator('[name="preview"]')).toBeVisible();
  await expect(toolbar.getByLabel('转为网页块', {exact: true})).toBeVisible();
  expect(await page.evaluate(() => {
    const p = (window as any).attachmentActionProbe;
    return p.toolbar === document.querySelector('.attachment-toolbar') && p.selection === p.doc.selection.value;
  })).toBe(true);
  await toolbar.locator('[name="preview"]').click();
  expect(await page.evaluate(() => (window as any).attachmentActionProbe.actions)).toEqual(['preview']);
});

test('附件真实点击保留选中入口，无宿主捕获监听', async ({page}) => {
  await setup(page);
  await page.locator('#attachment-action-fixture .attachment-block__name').click();
  await page.mouse.move(0, 0);
  await expect.poll(() => page.evaluate(() => {
    const p = (window as any).attachmentActionProbe;
    return p.doc.selection.value?.firstBlock.id === p.block.id && p.doc.selection.value.anchor.type === 'selected';
  })).toBe(true);
  await expect(page.locator('.attachment-toolbar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.attachment-toolbar')).toHaveCount(0);
});
