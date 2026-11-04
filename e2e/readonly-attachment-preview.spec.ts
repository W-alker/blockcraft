import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto('/');
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForFunction(() => (window as any).ng?.getComponent(
    document.querySelector('block-craft-editor'))?.doc?.isInitialized);
  await page.evaluate(() => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const viewport = document.createElement('section');
    viewport.id = 'readonly-attachment-fixture';
    viewport.style.cssText = 'position:fixed;inset:40px;overflow:auto;background:white;z-index:999;padding:80px 40px';
    const mount = document.createElement('div');
    viewport.append(mount);
    document.body.append(viewport);
    const attachment = source.schemas.createSnapshot('attachment', [{
      name: 'report.pdf', url: 'https://example.com/report.pdf', type: 'application/pdf', size: 1024,
    }]);
    const snapshot = source.schemas.createSnapshot('root', ['readonly-attachment', [attachment]]);
    const Plugin = source.config.plugins.find((plugin: any) => plugin.name === 'attachment-extension').constructor;
    const probe: any = {previews: [], downloads: []};
    const plugin = new Plugin({onPreview: (block: any) => probe.previews.push(block.id)});
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [plugin], readonly: true, scrollContainer: viewport, virtualization: {enabled: false}});
    doc.initBySnapshot(snapshot, mount);
    source.destroy();
    // 在宿主文件服务边界记录下载，避免测试真正访问远端文件。
    plugin.fileService = {downloadAttachment: (props: any) => probe.downloads.push(props.url)};
    Object.assign(probe, {doc, attachmentId: attachment.id, before: JSON.stringify(doc.exportSnapshot())});
    (window as any).readonlyAttachmentProbe = probe;
  });
});

test('只读附件可预览和下载，且不允许编辑正文或附件', async ({page}, testInfo) => {
  await page.locator('#readonly-attachment-fixture .attachment-block__name').click();
  const toolbar = page.locator('.attachment-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('[name="rename"], [name="delete"]')).toHaveCount(0);
  await page.screenshot({path: testInfo.outputPath('readonly-attachment-toolbar.png')});
  await toolbar.locator('[name="preview"]').click({delay: 120});
  await toolbar.locator('[name="download"]').click();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  const result = await page.evaluate(() => {
    const probe = (window as any).readonlyAttachmentProbe;
    return {previews: probe.previews, downloads: probe.downloads, attachmentId: probe.attachmentId,
      unchanged: probe.before === JSON.stringify(probe.doc.exportSnapshot())};
  });
  expect(result.previews).toEqual([result.attachmentId]);
  expect(result.downloads).toEqual(['https://example.com/report.pdf']);
  expect(result.unchanged).toBe(true);
});

test('编辑工具栏切入只读时关闭，重新点击后恢复预览', async ({page}) => {
  await page.evaluate(() => {
    const {doc, attachmentId} = (window as any).readonlyAttachmentProbe;
    doc.toggleReadonly(false);
    doc.selection.selectBlock(attachmentId);
  });
  const toolbar = page.locator('.attachment-toolbar');
  await expect(toolbar.locator('[name="rename"]')).toBeVisible();
  await expect(toolbar.locator('[name="delete"]')).toBeVisible();
  await toolbar.locator('[name="rename"]').click();
  const input = page.getByPlaceholder('输入文件名');
  await expect(input).toBeVisible();
  await input.fill('renamed');
  await input.press('Enter');
  await expect(page.locator('#readonly-attachment-fixture .attachment-block__name')).toHaveText('renamed.pdf');
  await expect(toolbar).toBeVisible();
  await page.evaluate(() => (window as any).readonlyAttachmentProbe.doc.toggleReadonly(true));
  await expect(toolbar).toHaveCount(0);
  await page.locator('#readonly-attachment-fixture .attachment-block__name').click();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('[name="rename"], [name="delete"]')).toHaveCount(0);
  await toolbar.locator('[name="preview"]').click();
  expect(await page.evaluate(() => (window as any).readonlyAttachmentProbe.previews.length)).toBe(1);
  await page.evaluate(() => (window as any).readonlyAttachmentProbe.doc.destroy());
  await expect(toolbar).toHaveCount(0);
});
