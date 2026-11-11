import {expect, test} from '@playwright/test';

for (const readonly of [false, true]) {
  test(`附件工具栏组件 Tooltip：${readonly ? '只读' : '编辑'}`, async ({page}, testInfo) => {
    await page.routeWebSocket('**', socket => socket.close());
    await page.goto('/');
    await page.getByRole('button', {name: '初始化', exact: true}).click();
    await page.waitForFunction(() => (window as any).ng?.getComponent(
      document.querySelector('block-craft-editor'))?.doc?.isInitialized);
    await page.evaluate(readonly => {
      const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
      const mount = document.createElement('section');
      mount.id = 'attachment-tooltip-fixture';
      mount.style.cssText = 'position:fixed;inset:40px;overflow:auto;background:white;z-index:999;padding:120px 40px';
      document.body.append(mount);
      const attachment = source.schemas.createSnapshot('attachment', [{
        name: 'report.pdf', url: 'https://example.com/report.pdf', type: 'application/pdf', size: 1024,
      }]);
      const snapshot = source.schemas.createSnapshot('root', ['attachment-tooltip', [attachment]]);
      const Plugin = source.config.plugins.find((plugin: any) => plugin.name === 'attachment-extension').constructor;
      const actions: string[] = [];
      const plugin = new Plugin({
        previewLabel: '打开文件预览',
        onPreview: () => actions.push('preview'),
        extraItems: [{name: 'web-view', icon: 'bc_wangluo', label: '转为网页块', editOnly: true}],
        onExtraItemClick: (name: string) => { actions.push(name); return true; },
      });
      const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
        plugins: [plugin], readonly, scrollContainer: mount, virtualization: {enabled: false}});
      doc.initBySnapshot(snapshot, mount);
      source.destroy();
      plugin.fileService = {downloadAttachment: () => actions.push('download')};
      (window as any).attachmentTooltipProbe = {doc, actions};
    }, readonly);
    await page.locator('#attachment-tooltip-fixture .attachment-block__name').hover();
    const toolbar = page.locator('.attachment-toolbar');
    const labels = readonly ? ['打开文件预览', '下载文件']
      : ['重命名', '打开文件预览', '下载文件', '转为网页块', '删除'];
    for (const label of labels) {
      const button = toolbar.getByLabel(label, {exact: true});
      await button.hover();
      await expect(button).not.toHaveAttribute('title');
      await expect(page.locator('cs-tooltip-overlay.cs-tooltip-visible').filter({hasText: label})).toBeVisible();
    }
    if (readonly) await expect(toolbar.locator('[name="rename"], [name="delete"], [name="web-view"]')).toHaveCount(0);
    // The existing toolbar coalesces mousedowns within 100ms.
    await toolbar.getByLabel('打开文件预览', {exact: true}).click({delay: 120});
    await toolbar.getByLabel('下载文件', {exact: true}).click({delay: 120});
    if (!readonly) await toolbar.getByLabel('转为网页块', {exact: true}).click();
    expect(await page.evaluate(() => (window as any).attachmentTooltipProbe.actions))
      .toEqual(readonly ? ['preview', 'download'] : ['preview', 'download', 'web-view']);
    await toolbar.getByLabel('下载文件', {exact: true}).hover();
    await expect(page.locator('cs-tooltip-overlay.cs-tooltip-visible').filter({hasText: '下载文件'})).toBeVisible();
    await page.screenshot({path: testInfo.outputPath('attachment-tooltip.png')});
    await page.evaluate(() => (window as any).attachmentTooltipProbe.doc.destroy());
    await expect(page.locator('cs-tooltip-overlay.cs-tooltip-visible')).toHaveCount(0);
  });
}
